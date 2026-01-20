"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChunkUploadManager,
  ChunkTranscriptResult,
} from "@/lib/services/chunk-upload-manager";

// 청크 설정
const CHUNK_DURATION_SECONDS = 20; // 20초로 변경 (스마트 재개 시스템)
const AUDIO_BITRATE = 64000; // 64kbps

// 로컬 스토리지 키
const SESSION_STORAGE_KEY = "archy_recording_session";

export interface RecordingSession {
  sessionId: string;
  duration: number;
  pausedAt: number;
  chunkIndex: number;
}

export interface ChunkedRecordingResult {
  transcripts: ChunkTranscriptResult[];
  totalDuration: number;
  totalChunks: number;
  sessionId?: string;
}

export interface UseChunkedRecorderReturn {
  // 기본 녹음 상태
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  isWakeLockActive: boolean;
  analyserNode: AnalyserNode | null;

  // 청킹 상태
  chunksTranscribed: number;
  chunksTotal: number;
  pendingChunks: number;
  isUploadingChunk: boolean;
  isOnline: boolean;

  // 세션 상태
  sessionId: string | null;
  pausedSession: RecordingSession | null;
  isBackgroundPaused: boolean;

  // 녹음 제어
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<ChunkedRecordingResult | null>;

  // 세션 제어
  resumeSession: (session: RecordingSession) => Promise<void>;
  discardSession: () => void;
  finalizeCurrentSession: () => Promise<ChunkedRecordingResult | null>;
}

// MIME 타입 지원 확인
function getSupportedMimeType(): string {
  const mimeTypes = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "audio/webm";
}

export function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function useChunkedRecorder(): UseChunkedRecorderReturn {
  // 기본 상태
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // 청킹 상태
  const [chunksTranscribed, setChunksTranscribed] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [isUploadingChunk, setIsUploadingChunk] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // 세션 상태
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pausedSession, setPausedSession] = useState<RecordingSession | null>(null);
  const [isBackgroundPaused, setIsBackgroundPaused] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mimeTypeRef = useRef<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Silent Audio Keep-Alive for iOS background (attempt to keep app active)
  const keepAliveContextRef = useRef<AudioContext | null>(null);
  const keepAliveOscillatorRef = useRef<OscillatorNode | null>(null);
  const keepAliveGainRef = useRef<GainNode | null>(null);

  // 청킹 관련 Refs
  const chunkManagerRef = useRef<ChunkUploadManager | null>(null);
  const currentChunkDataRef = useRef<Blob[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  const chunkStartTimeRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(0);

  // Wake Lock 관리
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setIsWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          setIsWakeLockActive(false);
        });
      } catch (err) {
        console.warn("[WakeLock] Failed to acquire:", err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsWakeLockActive(false);
      } catch (err) {
        console.warn("[WakeLock] Failed to release:", err);
      }
    }
  }, []);

  /**
   * Silent Audio Keep-Alive for iOS
   * Plays a very low volume tone to attempt keeping the app active in background
   */
  const startKeepAliveAudio = useCallback(() => {
    // Only attempt on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS) {
      console.log("[KeepAlive] Not iOS, skipping silent audio");
      return;
    }

    try {
      // Create a separate AudioContext for keep-alive
      const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
      keepAliveContextRef.current = ctx;

      // Create oscillator with low audible frequency (iOS may require audible audio)
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(200, ctx.currentTime); // 200Hz - low audible tone

      // Create gain node with low volume (still audible but quiet)
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.02, ctx.currentTime); // Slightly louder for iOS detection

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();

      keepAliveOscillatorRef.current = oscillator;
      keepAliveGainRef.current = gainNode;

      console.log("[KeepAlive] Silent audio started for iOS background");
    } catch (err) {
      console.warn("[KeepAlive] Failed to start:", err);
    }
  }, []);

  const stopKeepAliveAudio = useCallback(() => {
    if (keepAliveOscillatorRef.current) {
      try {
        keepAliveOscillatorRef.current.stop();
        keepAliveOscillatorRef.current.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
      keepAliveOscillatorRef.current = null;
    }
    if (keepAliveGainRef.current) {
      keepAliveGainRef.current.disconnect();
      keepAliveGainRef.current = null;
    }
    if (keepAliveContextRef.current) {
      keepAliveContextRef.current.close();
      keepAliveContextRef.current = null;
    }
    console.log("[KeepAlive] Silent audio stopped");
  }, []);

  // 세션 저장 함수
  const saveSessionToStorage = useCallback((session: RecordingSession) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      console.log("[ChunkedRecorder] Session saved to storage:", session);
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to save session:", e);
    }
  }, []);

  // 세션 로드 함수
  const loadSessionFromStorage = useCallback((): RecordingSession | null => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as RecordingSession;
      }
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to load session:", e);
    }
    return null;
  }, []);

  // 세션 삭제 함수
  const clearSessionFromStorage = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to clear session:", e);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      releaseWakeLock();
      stopKeepAliveAudio();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (chunkManagerRef.current) {
        chunkManagerRef.current.cleanup();
      }
    };
  }, [releaseWakeLock, stopKeepAliveAudio]);

  /**
   * 현재 청크 추출 및 업로드
   */
  const extractAndUploadChunk = useCallback(async () => {
    if (currentChunkDataRef.current.length === 0) return;

    const chunkIndex = currentChunkIndexRef.current;
    const mimeType = mimeTypeRef.current || "audio/webm";
    const chunkBlob = new Blob(currentChunkDataRef.current, { type: mimeType });
    const chunkDuration = Date.now() - chunkStartTimeRef.current;
    const durationSeconds = Math.floor(chunkDuration / 1000);

    // 현재까지 총 녹음 시간 계산
    const currentTotalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    console.log(
      `[ChunkedRecorder] Extracting chunk ${chunkIndex}, size: ${chunkBlob.size}, duration: ${durationSeconds}s, totalDuration: ${currentTotalDuration}s`
    );

    // 현재 청크 데이터 초기화
    currentChunkDataRef.current = [];
    currentChunkIndexRef.current++;
    chunkStartTimeRef.current = Date.now();

    // 총 청크 수 업데이트
    setChunksTotal((prev) => Math.max(prev, chunkIndex + 1));
    setIsUploadingChunk(true);

    // 업로드 (totalDuration 설정)
    if (chunkManagerRef.current) {
      chunkManagerRef.current.setTotalDuration(currentTotalDuration);
      await chunkManagerRef.current.uploadChunk(
        chunkIndex,
        chunkBlob,
        durationSeconds
      );
    }

    setIsUploadingChunk(false);
    setPendingChunks(chunkManagerRef.current?.getPendingCount() || 0);
  }, []);

  // 백그라운드 전환 시 즉시 청크 추출 및 세션 저장
  const handleBackgroundTransition = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording || isPaused) return;

    console.log("[ChunkedRecorder] Background transition detected, extracting chunk...");

    // 현재까지 데이터 즉시 추출
    try {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.requestData();
      }
    } catch (e) {
      console.warn("[ChunkedRecorder] requestData not supported:", e);
    }

    // 약간의 딜레이 후 청크 업로드
    await new Promise(resolve => setTimeout(resolve, 100));
    await extractAndUploadChunk();

    // 녹음 일시정지
    if (mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
    }

    // 타이머 정지
    if (timerRef.current) {
      clearInterval(timerRef.current);
      pausedTimeRef.current = Date.now() - startTimeRef.current;
    }

    // 세션 정보 저장
    const session: RecordingSession = {
      sessionId: sessionIdRef.current || "",
      duration: Math.floor(pausedTimeRef.current / 1000),
      pausedAt: Date.now(),
      chunkIndex: currentChunkIndexRef.current,
    };
    saveSessionToStorage(session);
    setPausedSession(session);
    setIsBackgroundPaused(true);
    setIsPaused(true);

    // Wake Lock 해제
    releaseWakeLock();

    // Keep-alive 오디오 일시정지
    if (keepAliveContextRef.current?.state === 'running') {
      keepAliveContextRef.current.suspend();
    }

    console.log("[ChunkedRecorder] Session paused and saved:", session);

    // 푸시알림 발송 (백그라운드에서)
    try {
      fetch("/api/recordings/pause-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          duration: session.duration,
        }),
      }).catch((e) => console.warn("[ChunkedRecorder] Failed to send pause notify:", e));
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to send pause notify:", e);
    }
  }, [isRecording, isPaused, extractAndUploadChunk, saveSessionToStorage, releaseWakeLock]);

  // Wake Lock 재획득 및 백그라운드 복귀 처리 (visibility change)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        // 백그라운드로 전환됨
        if (isRecording && !isPaused) {
          handleBackgroundTransition();
        }
      } else if (document.visibilityState === "visible") {
        // 포그라운드로 복귀
        if (isRecording && !isPaused) {
          await requestWakeLock();
          // Resume keep-alive audio context if suspended
          if (keepAliveContextRef.current?.state === 'suspended') {
            keepAliveContextRef.current.resume();
          }
        }

        // 저장된 세션이 있는지 확인
        const storedSession = loadSessionFromStorage();
        if (storedSession && !isRecording) {
          console.log("[ChunkedRecorder] Found paused session:", storedSession);
          setPausedSession(storedSession);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording, isPaused, requestWakeLock, handleBackgroundTransition, loadSessionFromStorage]);

  /**
   * 녹음 시작
   */
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setIsBackgroundPaused(false);
      setPausedSession(null);
      clearSessionFromStorage();

      console.log("[ChunkedRecorder] Starting recording...");

      // 마이크 권한 요청과 서버 세션 시작을 병렬로 실행
      // 마이크 권한 다이얼로그가 즉시 표시되고, 서버 요청도 동시에 진행됨
      const [stream, sessionResponse] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        }),
        fetch("/api/recordings/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "meeting" }),
        }),
      ]);

      streamRef.current = stream;

      if (!sessionResponse.ok) {
        // 마이크 스트림 정리
        stream.getTracks().forEach((track) => track.stop());
        const errorData = await sessionResponse.json();
        throw new Error(errorData.error || "Failed to start session");
      }

      const sessionData = await sessionResponse.json();
      const newSessionId = sessionData.data.sessionId;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      console.log(`[ChunkedRecorder] Session started: ${newSessionId}`);

      // ChunkUploadManager 초기화 (세션 ID 포함)
      chunkManagerRef.current = new ChunkUploadManager({
        sessionId: newSessionId,
        callbacks: {
          onChunkUploaded: (result) => {
            console.log(`[ChunkedRecorder] Chunk ${result.chunkIndex} transcribed`);
            setChunksTranscribed((prev) => prev + 1);
            setPendingChunks(chunkManagerRef.current?.getPendingCount() || 0);
          },
          onChunkFailed: (chunkIndex, error) => {
            console.error(
              `[ChunkedRecorder] Chunk ${chunkIndex} failed:`,
              error
            );
            setError(`청크 ${chunkIndex} 업로드 실패`);
          },
          onRetrying: (chunkIndex, retryCount) => {
            console.log(
              `[ChunkedRecorder] Retrying chunk ${chunkIndex} (${retryCount})`
            );
          },
          onNetworkStatusChange: (online) => {
            setIsOnline(online);
            if (!online) {
              console.warn("[ChunkedRecorder] Network offline");
            }
          },
        },
      });

      // 청킹 상태 초기화
      currentChunkDataRef.current = [];
      currentChunkIndexRef.current = 0;
      chunkStartTimeRef.current = Date.now();
      lastChunkTimeRef.current = 0;
      setChunksTranscribed(0);
      setChunksTotal(0);
      setPendingChunks(0);

      // AudioContext 및 AnalyserNode 생성
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      setAnalyserNode(analyser);

      // MediaRecorder 설정
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      console.log("[ChunkedRecorder] Using MIME type:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITRATE, // 64kbps
      });

      mediaRecorderRef.current = mediaRecorder;

      // 데이터 수집
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          currentChunkDataRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("[ChunkedRecorder] MediaRecorder error:", event);
        setError("녹음 중 오류가 발생했습니다.");
      };

      // 녹음 먼저 시작 (지연 없이 즉시)
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // Wake Lock과 keep-alive는 백그라운드에서 실행 (non-blocking)
      requestWakeLock().catch((err) => {
        console.warn("[ChunkedRecorder] WakeLock request failed:", err);
      });
      startKeepAliveAudio();

      // 타이머 시작
      startTimeRef.current = Date.now() - pausedTimeRef.current;
      chunkStartTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startTimeRef.current) / 1000
        );
        setDuration(elapsed);

        // 20초마다 청크 추출 및 업로드
        const elapsedSinceLastChunk = Math.floor(
          (Date.now() - chunkStartTimeRef.current) / 1000
        );
        if (elapsedSinceLastChunk >= CHUNK_DURATION_SECONDS) {
          extractAndUploadChunk();
        }

        // 120분 제한
        if (elapsed >= 7200) {
          console.log("[ChunkedRecorder] Max duration reached, stopping...");
          // stopRecording은 외부에서 호출해야 함
        }
      }, 1000);

      console.log("[ChunkedRecorder] Recording started with session:", newSessionId);
    } catch (err) {
      console.error("[ChunkedRecorder] Error starting:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("마이크 접근 권한이 필요합니다.");
      } else {
        setError("녹음을 시작할 수 없습니다.");
      }
    }
  }, [requestWakeLock, startKeepAliveAudio, extractAndUploadChunk, clearSessionFromStorage]);

  /**
   * 녹음 일시정지
   */
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
      }

      releaseWakeLock();
      // Suspend keep-alive audio to save battery during pause
      if (keepAliveContextRef.current?.state === 'running') {
        keepAliveContextRef.current.suspend();
      }
      console.log("[ChunkedRecorder] Recording paused");
    }
  }, [isRecording, isPaused, releaseWakeLock]);

  /**
   * 녹음 재개
   */
  const resumeRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      await requestWakeLock();
      // Resume keep-alive audio
      if (keepAliveContextRef.current?.state === 'suspended') {
        keepAliveContextRef.current.resume();
      }

      mediaRecorderRef.current.resume();
      setIsPaused(false);
      setIsBackgroundPaused(false);

      startTimeRef.current = Date.now() - pausedTimeRef.current;
      chunkStartTimeRef.current = Date.now(); // 청크 타이머 리셋
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startTimeRef.current) / 1000
        );
        setDuration(elapsed);

        // 20초마다 청크 추출
        const elapsedSinceLastChunk = Math.floor(
          (Date.now() - chunkStartTimeRef.current) / 1000
        );
        if (elapsedSinceLastChunk >= CHUNK_DURATION_SECONDS) {
          extractAndUploadChunk();
        }
      }, 1000);

      console.log("[ChunkedRecorder] Recording resumed");
    }
  }, [isRecording, isPaused, requestWakeLock, extractAndUploadChunk]);

  /**
   * 녹음 중지 및 결과 반환
   */
  const stopRecording = useCallback(async (): Promise<ChunkedRecordingResult | null> => {
    if (!mediaRecorderRef.current || !isRecording) {
      return null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    const currentSessionId = sessionIdRef.current;

    // 타이머 정지
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    releaseWakeLock();
    stopKeepAliveAudio();
    clearSessionFromStorage();

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        // 마지막 청크 업로드
        if (currentChunkDataRef.current.length > 0) {
          console.log("[ChunkedRecorder] Uploading final chunk...");
          await extractAndUploadChunk();
        }

        // 스트림 정리
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // AudioContext 정리
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
          setAnalyserNode(null);
        }

        // 대기 중인 청크 완료 대기 (최대 60초)
        if (chunkManagerRef.current?.hasPendingChunks()) {
          console.log("[ChunkedRecorder] Waiting for pending chunks...");
          await chunkManagerRef.current.waitForAllPending(60000);
        }

        // 결과 수집
        const transcripts = chunkManagerRef.current?.getAllTranscripts() || [];
        const totalChunks = currentChunkIndexRef.current;
        const totalDuration = duration;

        console.log(
          `[ChunkedRecorder] Recording stopped, ${transcripts.length}/${totalChunks} chunks transcribed, session: ${currentSessionId}`
        );

        // 상태 리셋
        setIsRecording(false);
        setIsPaused(false);
        setIsBackgroundPaused(false);
        setDuration(0);
        setPausedSession(null);
        pausedTimeRef.current = 0;

        resolve({
          transcripts,
          totalDuration,
          totalChunks,
          sessionId: currentSessionId || undefined,
        });
      };

      // 일시정지 상태면 재개
      if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
      }

      // 데이터 플러시
      if (mediaRecorder.state === "recording") {
        try {
          mediaRecorder.requestData();
        } catch (e) {
          console.warn("[ChunkedRecorder] requestData not supported:", e);
        }
      }

      // 약간의 딜레이 후 정지
      setTimeout(() => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      }, 100);
    });
  }, [isRecording, releaseWakeLock, stopKeepAliveAudio, extractAndUploadChunk, duration, clearSessionFromStorage]);

  /**
   * 저장된 세션 재개 (백그라운드에서 복귀 시)
   */
  const resumeSession = useCallback(async (session: RecordingSession) => {
    console.log("[ChunkedRecorder] Resuming session:", session);

    // 세션 정보 설정
    setSessionId(session.sessionId);
    sessionIdRef.current = session.sessionId;
    currentChunkIndexRef.current = session.chunkIndex;
    pausedTimeRef.current = session.duration * 1000;
    setDuration(session.duration);

    // 새로 녹음 시작
    await startRecording();
  }, [startRecording]);

  /**
   * 저장된 세션 폐기
   */
  const discardSession = useCallback(async () => {
    const session = pausedSession;
    if (!session) return;

    console.log("[ChunkedRecorder] Discarding session:", session.sessionId);

    // 서버에서 세션 삭제 (status를 'recording'에서 삭제 또는 failed로 변경)
    try {
      await fetch(`/api/recordings/${session.sessionId}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to delete session:", e);
    }

    // 로컬 상태 정리
    clearSessionFromStorage();
    setPausedSession(null);
    setIsBackgroundPaused(false);
    setSessionId(null);
    sessionIdRef.current = null;
  }, [pausedSession, clearSessionFromStorage]);

  /**
   * 현재 세션을 여기까지만 저장 (finalize)
   */
  const finalizeCurrentSession = useCallback(async (): Promise<ChunkedRecordingResult | null> => {
    const session = pausedSession;
    if (!session) return null;

    console.log("[ChunkedRecorder] Finalizing session with current data:", session.sessionId);

    // 로컬 상태 정리
    clearSessionFromStorage();
    setPausedSession(null);
    setIsBackgroundPaused(false);

    // 결과 반환 (세션 ID만 전달하여 서버에서 처리)
    return {
      transcripts: [], // 세션 기반이므로 빈 배열 (서버에 이미 저장됨)
      totalDuration: session.duration,
      totalChunks: session.chunkIndex,
      sessionId: session.sessionId,
    };
  }, [pausedSession, clearSessionFromStorage]);

  // 마운트 시 저장된 세션 확인
  useEffect(() => {
    const storedSession = loadSessionFromStorage();
    if (storedSession) {
      console.log("[ChunkedRecorder] Found stored session on mount:", storedSession);
      setPausedSession(storedSession);
    }
  }, [loadSessionFromStorage]);

  return {
    // 기본 상태
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    analyserNode,

    // 청킹 상태
    chunksTranscribed,
    chunksTotal,
    pendingChunks,
    isUploadingChunk,
    isOnline,

    // 세션 상태
    sessionId,
    pausedSession,
    isBackgroundPaused,

    // 제어
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,

    // 세션 제어
    resumeSession,
    discardSession,
    finalizeCurrentSession,
  };
}
