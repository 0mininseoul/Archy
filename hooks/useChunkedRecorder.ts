"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChunkUploadManager,
  type ChunkUploadTerminalSession,
  ChunkTranscriptResult,
  ChunkSignalMetrics,
} from "@/lib/services/chunk-upload-manager";
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from "@/lib/safe-storage";
import {
  AUTO_PAUSE_NOTICE_EVENT,
  AUTO_PAUSE_NOTICE_STORAGE_KEY,
  PauseNotifyReason,
} from "@/lib/recording-lifecycle";
import { submitFinalizeIntent } from "@/lib/services/finalize-intent-client";
import type { Recording } from "@/lib/types/database";

// 청크 설정
const CHUNK_DURATION_SECONDS = 20; // 20초로 변경 (스마트 재개 시스템)
const AUDIO_BITRATE = 64000; // 64kbps
const SYSTEM_INTERRUPTION_ERROR_MESSAGE =
  "iOS 시스템 알림으로 녹음이 일시정지되었습니다. 이어서 녹음을 눌러 계속하세요.";

// 로컬 스토리지 키
const SESSION_STORAGE_KEY = "archy_recording_session";

export type RecorderRuntimeState =
  | "idle"
  | "starting"
  | "recording"
  | "pausing"
  | "paused"
  | "resuming"
  | "stopping"
  | "inactive_unexpected"
  | "error";

type RecorderAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "background_transition"
  | "route_unmount_autopause"
  | "chunk_restart"
  | "state_sync";

interface AutoPauseNoticePayload {
  reason: PauseNotifyReason;
  createdAt: string;
}

type RecorderContextWindow = Window & {
  __archyRecorderContext?: {
    recorderRuntimeState: RecorderRuntimeState;
    mediaRecorderState: RecordingState;
    action: RecorderAction | null;
    updatedAt: string;
  };
};

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

interface RecordingSessionServerState {
  durationSeconds: number;
  formattedContent: string | null;
  status: Recording["status"];
  transcriptLength: number;
}

export interface UseChunkedRecorderReturn {
  // 기본 녹음 상태
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  isWakeLockActive: boolean;
  analyserNode: AnalyserNode | null;
  recorderRuntimeState: RecorderRuntimeState;
  isControlBusy: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;

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
  resumeRecording: () => Promise<boolean>;
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

function isLikelyIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useChunkedRecorder(): UseChunkedRecorderReturn {
  // 기본 상태
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [recorderRuntimeState, setRecorderRuntimeState] =
    useState<RecorderRuntimeState>("idle");
  const [isControlBusy, setIsControlBusy] = useState(false);

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

  // 청킹 관련 Refs
  const chunkManagerRef = useRef<ChunkUploadManager | null>(null);
  const currentChunkDataRef = useRef<Blob[]>([]);
  const currentChunkRmsSamplesRef = useRef<number[]>([]);
  const currentChunkPeakRmsRef = useRef<number>(0);
  const currentChunkIndexRef = useRef<number>(0);
  const chunkStartTimeRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(0);
  const skipUnmountCleanupRef = useRef<boolean>(false);
  const isRestartingRef = useRef<boolean>(false); // iOS용 MediaRecorder 재시작 중 플래그
  const analyserNodeRef = useRef<AnalyserNode | null>(null); // AnalyserNode 참조 유지
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const recorderRuntimeStateRef = useRef<RecorderRuntimeState>("idle");
  const lastRecorderActionRef = useRef<RecorderAction | null>(null);
  const isBackgroundTransitioningRef = useRef<boolean>(false);
  const resumeContextRef = useRef<RecordingSession | null>(null);
  const autoFinalizeSessionIdsRef = useRef<Set<string>>(new Set());
  const streamInterruptionCleanupRef = useRef<(() => void) | null>(null);
  const interruptionHandlingRef = useRef<boolean>(false);
  const handleSystemInterruptionRef = useRef<(source: string) => void | Promise<void>>(
    () => {}
  );

  // iOS 감지 (MP4를 사용하는 경우)
  const isIOSRef = useRef<boolean>(false);

  const getMediaRecorderState = useCallback((): RecordingState => {
    return mediaRecorderRef.current?.state ?? "inactive";
  }, []);

  const publishRecorderContext = useCallback(
    (action?: RecorderAction) => {
      if (typeof window === "undefined") return;
      const targetWindow = window as RecorderContextWindow;
      if (action) {
        lastRecorderActionRef.current = action;
      }
      targetWindow.__archyRecorderContext = {
        recorderRuntimeState: recorderRuntimeStateRef.current,
        mediaRecorderState: getMediaRecorderState(),
        action: lastRecorderActionRef.current,
        updatedAt: new Date().toISOString(),
      };
    },
    [getMediaRecorderState]
  );

  const setRuntimeState = useCallback(
    (nextState: RecorderRuntimeState, action?: RecorderAction) => {
      recorderRuntimeStateRef.current = nextState;
      setRecorderRuntimeState(nextState);
      publishRecorderContext(action);
    },
    [publishRecorderContext]
  );

  const syncRuntimeStateFromRecorder = useCallback(
    (action: RecorderAction, inactiveErrorMessage?: string): RecordingState => {
      const state = getMediaRecorderState();

      if (state === "recording") {
        setIsRecording(true);
        setIsPaused(false);
        setRuntimeState("recording", action);
        return state;
      }

      if (state === "paused") {
        setIsRecording(true);
        setIsPaused(true);
        setRuntimeState("paused", action);
        return state;
      }

      setIsRecording(false);
      setIsPaused(false);
      if (inactiveErrorMessage) {
        setError(inactiveErrorMessage);
      }
      if (recorderRuntimeStateRef.current !== "idle") {
        setRuntimeState("inactive_unexpected", action);
      } else {
        publishRecorderContext(action);
      }
      return state;
    },
    [getMediaRecorderState, publishRecorderContext, setRuntimeState]
  );

  const safeRequestData = useCallback((action: RecorderAction) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return false;
    if (recorder.state !== "recording") return false;

    try {
      recorder.requestData();
      publishRecorderContext(action);
      return true;
    } catch (error) {
      console.warn("[ChunkedRecorder] requestData not supported:", error);
      syncRuntimeStateFromRecorder(action);
      return false;
    }
  }, [publishRecorderContext, syncRuntimeStateFromRecorder]);

  const safePause = useCallback(
    (action: RecorderAction): boolean => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return false;

      if (recorder.state !== "recording") {
        syncRuntimeStateFromRecorder(
          action,
          "녹음 상태가 비정상적으로 변경되었습니다. 다시 녹음을 시작해주세요."
        );
        return false;
      }

      setRuntimeState("pausing", action);
      setIsControlBusy(true);

      try {
        recorder.pause();
        return true;
      } catch (error) {
        console.warn("[ChunkedRecorder] pause failed:", error);
        syncRuntimeStateFromRecorder(
          action,
          "녹음 상태가 비정상적으로 변경되었습니다. 다시 녹음을 시작해주세요."
        );
        setIsControlBusy(false);
        return false;
      }
    },
    [setRuntimeState, syncRuntimeStateFromRecorder]
  );

  const safeResume = useCallback(
    (action: RecorderAction): boolean => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return false;

      if (recorder.state !== "paused") {
        syncRuntimeStateFromRecorder(action);
        return false;
      }

      setRuntimeState("resuming", action);
      setIsControlBusy(true);

      try {
        recorder.resume();
        return true;
      } catch (error) {
        console.warn("[ChunkedRecorder] resume failed:", error);
        syncRuntimeStateFromRecorder(
          action,
          "녹음 재개에 실패했습니다. 상태를 확인해주세요."
        );
        setIsControlBusy(false);
        return false;
      }
    },
    [setRuntimeState, syncRuntimeStateFromRecorder]
  );

  const safeStop = useCallback(
    (action: RecorderAction): boolean => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return false;
      if (recorder.state === "inactive") {
        syncRuntimeStateFromRecorder(action);
        return false;
      }

      setRuntimeState("stopping", action);
      setIsControlBusy(true);
      try {
        recorder.stop();
        return true;
      } catch (error) {
        console.warn("[ChunkedRecorder] stop failed:", error);
        syncRuntimeStateFromRecorder(
          action,
          "녹음 종료 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
        );
        setIsControlBusy(false);
        return false;
      }
    },
    [setRuntimeState, syncRuntimeStateFromRecorder]
  );

  const attachRecorderLifecycleListeners = useCallback(
    (recorder: MediaRecorder) => {
      recorder.addEventListener("start", () => {
        setIsRecording(true);
        setIsPaused(false);
        setRuntimeState("recording", "state_sync");
        setIsControlBusy(false);
      });

      recorder.addEventListener("pause", () => {
        setIsRecording(true);
        setIsPaused(true);
        setRuntimeState("paused", "state_sync");
        setIsControlBusy(false);
      });

      recorder.addEventListener("resume", () => {
        setIsRecording(true);
        setIsPaused(false);
        setRuntimeState("recording", "state_sync");
        setIsControlBusy(false);
      });

      recorder.addEventListener("stop", () => {
        if (isRestartingRef.current) {
          publishRecorderContext("chunk_restart");
          return;
        }
        if (recorderRuntimeStateRef.current === "stopping") {
          setRuntimeState("idle", "state_sync");
          setIsControlBusy(false);
          return;
        }

        if (sessionIdRef.current && (isRecordingRef.current || isPausedRef.current)) {
          void handleSystemInterruptionRef.current("media_recorder_stop");
          return;
        }

        syncRuntimeStateFromRecorder("state_sync");
        setIsControlBusy(false);
      });
    },
    [publishRecorderContext, setRuntimeState, syncRuntimeStateFromRecorder]
  );

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

  const cleanupStreamInterruptionListeners = useCallback(() => {
    if (streamInterruptionCleanupRef.current) {
      streamInterruptionCleanupRef.current();
      streamInterruptionCleanupRef.current = null;
    }
  }, []);


  // 세션 저장 함수
  const saveSessionToStorage = useCallback((session: RecordingSession) => {
    try {
      safeLocalStorageSetItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session),
        { logPrefix: "ChunkedRecorder" }
      );
      console.log("[ChunkedRecorder] Session saved to storage:", session);
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to save session:", e);
    }
  }, []);

  const createSessionSnapshot = useCallback(
    (pausedAt: number = Date.now()): RecordingSession | null => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return null;

      return {
        sessionId,
        duration: Math.floor(pausedTimeRef.current / 1000),
        pausedAt,
        chunkIndex: currentChunkIndexRef.current,
      };
    },
    []
  );

  const notifyAutoPause = useCallback((reason: PauseNotifyReason) => {
    try {
      const payload: AutoPauseNoticePayload = {
        reason,
        createdAt: new Date().toISOString(),
      };
      safeLocalStorageSetItem(
        AUTO_PAUSE_NOTICE_STORAGE_KEY,
        JSON.stringify(payload),
        { logPrefix: "ChunkedRecorder" }
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTO_PAUSE_NOTICE_EVENT));
      }
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to store auto-pause notice:", e);
    }
  }, []);

  const sendPauseNotify = useCallback(
    (
      session: RecordingSession,
      reason: PauseNotifyReason,
      preferBeacon: boolean = false
    ) => {
      if (!session.sessionId) return;

      const payload = JSON.stringify({
        sessionId: session.sessionId,
        duration: session.duration,
        reason,
      });

      try {
        if (
          preferBeacon &&
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function"
        ) {
          const beaconBody = new Blob([payload], {
            type: "application/json",
          });
          const sent = navigator.sendBeacon(
            "/api/recordings/pause-notify",
            beaconBody
          );

          if (sent) {
            return;
          }
        }

        void fetch("/api/recordings/pause-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: preferBeacon,
        }).catch((e) =>
          console.warn("[ChunkedRecorder] Failed to send pause notify:", e)
        );
      } catch (e) {
        console.warn("[ChunkedRecorder] Failed to send pause notify:", e);
      }
    },
    []
  );

  const persistPausedSession = useCallback(
    (pausedAt: number = Date.now()) => {
      const session = createSessionSnapshot(pausedAt);
      if (!session) return null;
      saveSessionToStorage(session);
      setPausedSession(session);
      setIsBackgroundPaused(true);
      setIsPaused(true);
      setIsRecording(true);
      setRuntimeState("paused", "background_transition");
      return session;
    },
    [createSessionSnapshot, saveSessionToStorage, setRuntimeState]
  );

  // 세션 로드 함수
  const loadSessionFromStorage = useCallback((): RecordingSession | null => {
    try {
      const stored = safeLocalStorageGetItem(SESSION_STORAGE_KEY, {
        logPrefix: "ChunkedRecorder",
      });
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
      safeLocalStorageRemoveItem(SESSION_STORAGE_KEY, {
        logPrefix: "ChunkedRecorder",
      });
    } catch (e) {
      console.warn("[ChunkedRecorder] Failed to clear session:", e);
    }
  }, []);

  const getCurrentDurationSeconds = useCallback((): number => {
    const liveElapsedSeconds =
      startTimeRef.current > 0
        ? Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000))
        : 0;

    return Math.max(duration, Math.floor(pausedTimeRef.current / 1000), liveElapsedSeconds);
  }, [duration]);

  const submitAutoFinalizeIntent = useCallback(
    async (activeSessionId: string, totalDurationSeconds: number, expectedChunkCount: number) => {
      if (totalDurationSeconds < 1 || !activeSessionId) {
        return false;
      }

      if (autoFinalizeSessionIdsRef.current.has(activeSessionId)) {
        return true;
      }

      autoFinalizeSessionIdsRef.current.add(activeSessionId);
      const submitted = await submitFinalizeIntent(
        {
          sessionId: activeSessionId,
          totalDurationSeconds,
          expectedChunkCount,
          format: "meeting",
        },
        { keepalive: true }
      );

      if (!submitted) {
        console.warn(
          `[ChunkedRecorder] Failed to submit auto-finalize intent for session ${activeSessionId}`
        );
      }

      return submitted;
    },
    []
  );

  const loadRecordingSessionServerState = useCallback(
    async (recordingId: string): Promise<RecordingSessionServerState | null> => {
      try {
        const response = await fetch(`/api/recordings/${recordingId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }

          throw new Error(`Failed to load recording session: HTTP ${response.status}`);
        }

        const data = await response.json();
        const recording = data?.recording;
        if (!recording?.id || typeof recording.status !== "string") {
          return null;
        }

        return {
          durationSeconds:
            typeof recording.duration_seconds === "number" ? recording.duration_seconds : 0,
          formattedContent:
            typeof recording.formatted_content === "string" ? recording.formatted_content : null,
          status: recording.status as Recording["status"],
          transcriptLength:
            typeof recording.transcript === "string" ? recording.transcript.length : 0,
        };
      } catch (error) {
        console.warn(
          `[ChunkedRecorder] Failed to verify server session state for ${recordingId}:`,
          error
        );
        return null;
      }
    },
    []
  );

  const reportRecorderInterruption = useCallback((source: string) => {
    if (typeof window === "undefined") return;

    const visibilityState = document.visibilityState;
    const pageHadFocus =
      typeof document.hasFocus === "function" ? document.hasFocus() : null;
    const isIOS = isLikelyIOSDevice();
    const possibleAlertLikeSource = [
      "media_recorder_stop",
      "media_recorder_error",
      "media_recorder_restart_error",
      "audio_track_ended",
      "audio_track_muted",
      "media_stream_inactive",
      "visibility_visible_reconcile",
      "window_focus_reconcile",
      "window_pageshow_reconcile",
    ].includes(source);
    const interruptionClassification =
      isIOS && visibilityState === "visible" && pageHadFocus !== false && possibleAlertLikeSource
        ? "possible_ios_system_alert"
        : isIOS
          ? "ios_system_interruption"
          : "system_interruption";
    const message =
      interruptionClassification === "possible_ios_system_alert"
        ? "Recorder interrupted by an iOS system alert while the page remained visible. This may correspond to an emergency or safety alert, but the Web API does not expose the exact trigger."
        : "Recorder interrupted by a system-level audio/session interruption.";

    const payload = {
      type: "error" as const,
      category: "recorder_interruption" as const,
      message,
      pathname: window.location.pathname,
      search: window.location.search,
      href: window.location.href,
      userAgent: navigator.userAgent,
      isStandalone: isStandaloneMode(),
      sampled: true,
      sessionId: sessionIdRef.current,
      interruptionSource: source,
      interruptionClassification,
      interruptionConfidence: "heuristic" as const,
      visibilityState,
      pageHadFocus,
      pageWasVisible: visibilityState === "visible",
      isIOS,
      recorderRuntimeState: recorderRuntimeStateRef.current,
      mediaRecorderState: mediaRecorderRef.current?.state ?? null,
      action: lastRecorderActionRef.current,
      timestamp: new Date().toISOString(),
    };

    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (error) {
      console.warn("[ChunkedRecorder] Failed to report recorder interruption:", error);
    }
  }, []);

  const resetRecorderState = useCallback(async () => {
    cleanupStreamInterruptionListeners();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    sessionIdRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        console.warn("[ChunkedRecorder] Failed to stop recorder during reset:", error);
      }
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch((error) => {
        console.warn("[ChunkedRecorder] Failed to close AudioContext during reset:", error);
      });
      audioContextRef.current = null;
    }

    analyserNodeRef.current = null;
    setAnalyserNode(null);

    if (chunkManagerRef.current) {
      chunkManagerRef.current.cleanup();
      chunkManagerRef.current = null;
    }

    currentChunkDataRef.current = [];
    currentChunkRmsSamplesRef.current = [];
    currentChunkPeakRmsRef.current = 0;
    currentChunkIndexRef.current = 0;
    chunkStartTimeRef.current = 0;
    lastChunkTimeRef.current = 0;
    pausedTimeRef.current = 0;
    resumeContextRef.current = null;
    isBackgroundTransitioningRef.current = false;
    interruptionHandlingRef.current = false;
    isRecordingRef.current = false;
    isPausedRef.current = false;

    clearSessionFromStorage();
    setPausedSession(null);
    setIsBackgroundPaused(false);
    setSessionId(null);
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setPendingChunks(0);
    setChunksTotal(0);
    setChunksTranscribed(0);
    setIsUploadingChunk(false);
    setIsControlBusy(false);
    await releaseWakeLock();
    setRuntimeState("idle", "state_sync");
  }, [
    cleanupStreamInterruptionListeners,
    clearSessionFromStorage,
    releaseWakeLock,
    setRuntimeState,
  ]);

  const reconcileStoredSession = useCallback(
    async (session: RecordingSession): Promise<RecordingSession | null> => {
      const serverState = await loadRecordingSessionServerState(session.sessionId);
      if (!serverState) {
        return session;
      }

      if (serverState.status === "recording") {
        return session;
      }

      console.warn(
        `[ChunkedRecorder] Discarding local session ${session.sessionId}; server status=${serverState.status}`
      );
      clearSessionFromStorage();
      setPausedSession(null);
      setIsBackgroundPaused(false);

      if (
        serverState.status === "failed" &&
        !serverState.formattedContent &&
        serverState.transcriptLength > 0
      ) {
        await submitAutoFinalizeIntent(
          session.sessionId,
          Math.max(session.duration, serverState.durationSeconds),
          Math.max(session.chunkIndex, 0)
        );
      }

      return null;
    },
    [clearSessionFromStorage, loadRecordingSessionServerState, submitAutoFinalizeIntent]
  );

  const handleTerminalSessionTermination = useCallback(
    async (terminalError: ChunkUploadTerminalSession) => {
      const activeSessionId = sessionIdRef.current;
      const totalDurationSeconds = getCurrentDurationSeconds();
      const expectedChunkCount = Math.max(
        currentChunkIndexRef.current,
        terminalError.failedChunkIndex + 1
      );

      console.warn(
        `[ChunkedRecorder] Terminal session rejection for ${activeSessionId ?? "none"} (status=${terminalError.sessionStatus ?? "unknown"}, code=${terminalError.code ?? "unknown"}, chunk=${terminalError.failedChunkIndex})`
      );

      await resetRecorderState();
      setError(null);

      if (activeSessionId) {
        await submitAutoFinalizeIntent(
          activeSessionId,
          totalDurationSeconds,
          expectedChunkCount
        );
      }
    },
    [getCurrentDurationSeconds, resetRecorderState, submitAutoFinalizeIntent]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (skipUnmountCleanupRef.current) {
        return;
      }

      const recorder = mediaRecorderRef.current;
      const shouldPersistSessionOnUnmount =
        isRecordingRef.current && Boolean(sessionIdRef.current);

      if (shouldPersistSessionOnUnmount) {
        if (recorder?.state === "recording") {
          try {
            recorder.requestData();
          } catch (error) {
            console.warn("[ChunkedRecorder] requestData failed during unmount:", error);
          }

          try {
            recorder.pause();
          } catch (error) {
            console.warn("[ChunkedRecorder] pause failed during unmount:", error);
          }
        }

        if (!isPausedRef.current) {
          pausedTimeRef.current = Math.max(0, Date.now() - startTimeRef.current);
        }
        const session = createSessionSnapshot();
        if (session) {
          saveSessionToStorage(session);
          notifyAutoPause("route_unmount");
          sendPauseNotify(session, "route_unmount", true);
          publishRecorderContext("route_unmount_autopause");
          console.log("[ChunkedRecorder] Session auto-paused on unmount:", session);
        }
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      void releaseWakeLock();
      cleanupStreamInterruptionListeners();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (chunkManagerRef.current) {
        chunkManagerRef.current.cleanup();
      }
      recorderRuntimeStateRef.current = "idle";
      if (typeof window !== "undefined") {
        const targetWindow = window as RecorderContextWindow;
        targetWindow.__archyRecorderContext = {
          recorderRuntimeState: "idle",
          mediaRecorderState: "inactive",
          action: "state_sync",
          updatedAt: new Date().toISOString(),
        };
      }
    };
  }, [
    cleanupStreamInterruptionListeners,
    createSessionSnapshot,
    notifyAutoPause,
    publishRecorderContext,
    releaseWakeLock,
    saveSessionToStorage,
    sendPauseNotify,
  ]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    publishRecorderContext("state_sync");
  }, [publishRecorderContext, recorderRuntimeState]);

  /**
   * 현재 오디오 프레임 RMS 샘플링
   */
  const sampleCurrentChunkRms = useCallback(() => {
    const analyser = analyserNodeRef.current;
    if (!analyser) return;

    const timeDomainData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeDomainData);

    let squareSum = 0;
    for (const sample of timeDomainData) {
      const normalized = (sample - 128) / 128;
      squareSum += normalized * normalized;
    }

    const rms = Math.sqrt(squareSum / timeDomainData.length);
    if (Number.isFinite(rms)) {
      currentChunkRmsSamplesRef.current.push(rms);
      if (rms > currentChunkPeakRmsRef.current) {
        currentChunkPeakRmsRef.current = rms;
      }
    }
  }, []);

  /**
   * 현재 청크의 RMS 통계 반환 후 리셋
   */
  const consumeCurrentChunkSignalMetrics = useCallback((): ChunkSignalMetrics => {
    const samples = currentChunkRmsSamplesRef.current;
    const avgRms = samples.length > 0
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : undefined;
    const peakRms = currentChunkPeakRmsRef.current > 0
      ? currentChunkPeakRmsRef.current
      : undefined;

    currentChunkRmsSamplesRef.current = [];
    currentChunkPeakRmsRef.current = 0;

    return { avgRms, peakRms };
  }, []);

  const isChunkUploadable = useCallback(
    (chunkBlob: Blob, chunkIndex: number, durationSeconds: number): boolean => {
      if (chunkBlob.size < 1024) {
        console.warn(
          `[ChunkedRecorder] Chunk ${chunkIndex} too small (${chunkBlob.size} bytes), skipping upload`
        );
        return false;
      }

      if (durationSeconds <= 0) {
        console.warn(
          `[ChunkedRecorder] Chunk ${chunkIndex} has non-positive duration (${durationSeconds}s), skipping upload`
        );
        return false;
      }

      return true;
    },
    []
  );

  /**
   * 청크 Blob 업로드 (공통 로직)
   */
  const uploadChunkBlob = useCallback(async (
    chunkBlob: Blob,
    chunkIndex: number,
    durationSeconds: number,
    signalMetrics?: ChunkSignalMetrics
  ) => {
    // 현재까지 총 녹음 시간 계산
    const currentTotalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    console.log(
      `[ChunkedRecorder] Uploading chunk ${chunkIndex}, size: ${chunkBlob.size}, duration: ${durationSeconds}s, totalDuration: ${currentTotalDuration}s`
    );

    // 총 청크 수 업데이트
    setChunksTotal((prev) => Math.max(prev, chunkIndex + 1));
    setIsUploadingChunk(true);

    // 업로드 (totalDuration 설정)
    if (chunkManagerRef.current) {
      chunkManagerRef.current.setTotalDuration(currentTotalDuration);
      await chunkManagerRef.current.uploadChunk(
        chunkIndex,
        chunkBlob,
        durationSeconds,
        signalMetrics
      );
    }

    setIsUploadingChunk(false);
    setPendingChunks(chunkManagerRef.current?.getPendingCount() || 0);
  }, []);

  const flushCurrentChunkForAutoPause = useCallback(
    async (source: string) => {
      if (currentChunkDataRef.current.length === 0) {
        currentChunkRmsSamplesRef.current = [];
        currentChunkPeakRmsRef.current = 0;
        return;
      }

      const chunkIndex = currentChunkIndexRef.current;
      const mimeType = mimeTypeRef.current || "audio/webm";
      const chunkBlob = new Blob(currentChunkDataRef.current, { type: mimeType });
      const chunkDuration = Date.now() - chunkStartTimeRef.current;
      const durationSeconds = Math.floor(chunkDuration / 1000);
      const signalMetrics = consumeCurrentChunkSignalMetrics();

      currentChunkDataRef.current = [];
      chunkStartTimeRef.current = Date.now();

      if (!isChunkUploadable(chunkBlob, chunkIndex, durationSeconds)) {
        return;
      }

      currentChunkIndexRef.current++;

      try {
        await uploadChunkBlob(chunkBlob, chunkIndex, durationSeconds, signalMetrics);
      } catch (error) {
        console.warn(
          `[ChunkedRecorder] Failed to upload auto-paused chunk (${source}):`,
          error
        );
      }
    },
    [consumeCurrentChunkSignalMetrics, isChunkUploadable, uploadChunkBlob]
  );

  /**
   * iOS용: MediaRecorder를 재시작하여 완전한 MP4 청크 생성
   */
  const restartMediaRecorderForChunk = useCallback(async () => {
    if (!mediaRecorderRef.current || !streamRef.current || isRestartingRef.current) return;
    if (mediaRecorderRef.current.state !== "recording") return;

    isRestartingRef.current = true;
    setIsControlBusy(true);

    try {
      const chunkIndex = currentChunkIndexRef.current;
      const chunkDuration = Date.now() - chunkStartTimeRef.current;
      const durationSeconds = Math.floor(chunkDuration / 1000);
      const mimeType = mimeTypeRef.current;

      console.log(`[ChunkedRecorder] iOS: Restarting MediaRecorder for chunk ${chunkIndex}`);

      // 현재 MediaRecorder 정지 → onstop에서 완전한 Blob 획득
      const currentRecorder = mediaRecorderRef.current;
      if (!currentRecorder) return;

      const chunkBlobPromise = new Promise<Blob>((resolve) => {
        const handleStop = () => {
          const chunkBlob = new Blob(currentChunkDataRef.current, { type: mimeType });
          currentChunkDataRef.current = [];
          resolve(chunkBlob);
          currentRecorder.removeEventListener("stop", handleStop);
        };
        currentRecorder.addEventListener("stop", handleStop);
      });

      currentRecorder.stop();

      // Blob 획득
      const chunkBlob = await chunkBlobPromise;
      const signalMetrics = consumeCurrentChunkSignalMetrics();
      const shouldUploadChunk = isChunkUploadable(
        chunkBlob,
        chunkIndex,
        durationSeconds
      );

      if (shouldUploadChunk) {
        currentChunkIndexRef.current++;
      }
      chunkStartTimeRef.current = Date.now();

      // 새 MediaRecorder 생성 및 시작
      const newRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITRATE,
      });

      attachRecorderLifecycleListeners(newRecorder);
      newRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          currentChunkDataRef.current.push(event.data);
        }
      };

      newRecorder.onerror = (event) => {
        console.error("[ChunkedRecorder] MediaRecorder error:", event);
        if (sessionIdRef.current) {
          void handleSystemInterruptionRef.current("media_recorder_restart_error");
          return;
        }
        setRuntimeState("error", "chunk_restart");
        setError("녹음 중 오류가 발생했습니다.");
      };

      mediaRecorderRef.current = newRecorder;
      try {
        newRecorder.start(1000); // 1초마다 데이터 수집
      } catch (startError) {
        console.warn("[ChunkedRecorder] Failed to start restarted recorder:", startError);
        setRuntimeState("inactive_unexpected", "chunk_restart");
        pausedTimeRef.current = Date.now() - startTimeRef.current;
        const fallbackSession = persistPausedSession();
        await releaseWakeLock();
        console.warn("[ChunkedRecorder] Session moved to paused fallback after restart failure:", fallbackSession);
        setError("녹음 상태가 일시 중단되었습니다. 이어서 녹음을 다시 시작해주세요.");
        return;
      }

      if (!shouldUploadChunk) {
        return;
      }

      // 백그라운드에서 업로드
      uploadChunkBlob(chunkBlob, chunkIndex, durationSeconds, signalMetrics);
    } finally {
      isRestartingRef.current = false;
      setIsControlBusy(false);
    }
  }, [
    attachRecorderLifecycleListeners,
    consumeCurrentChunkSignalMetrics,
    isChunkUploadable,
    persistPausedSession,
    releaseWakeLock,
    setRuntimeState,
    uploadChunkBlob,
  ]);

  /**
   * WebM용: 현재 청크 추출 및 업로드 (기존 방식)
   */
  const extractAndUploadChunk = useCallback(async () => {
    // iOS는 restartMediaRecorderForChunk 사용
    if (isIOSRef.current) {
      await restartMediaRecorderForChunk();
      return;
    }

    if (currentChunkDataRef.current.length === 0) return;

    const chunkIndex = currentChunkIndexRef.current;
    const mimeType = mimeTypeRef.current || "audio/webm";
    const chunkBlob = new Blob(currentChunkDataRef.current, { type: mimeType });
    const chunkDuration = Date.now() - chunkStartTimeRef.current;
    const durationSeconds = Math.floor(chunkDuration / 1000);
    const signalMetrics = consumeCurrentChunkSignalMetrics();

    if (!isChunkUploadable(chunkBlob, chunkIndex, durationSeconds)) {
      currentChunkDataRef.current = [];
      chunkStartTimeRef.current = Date.now();
      return;
    }

    // 현재 청크 데이터 초기화
    currentChunkDataRef.current = [];
    currentChunkIndexRef.current++;
    chunkStartTimeRef.current = Date.now();

    // 업로드
    await uploadChunkBlob(chunkBlob, chunkIndex, durationSeconds, signalMetrics);
  }, [
    consumeCurrentChunkSignalMetrics,
    isChunkUploadable,
    restartMediaRecorderForChunk,
    uploadChunkBlob,
  ]);

  const handleSystemInterruption = useCallback(
    async (source: string) => {
      if (!sessionIdRef.current || skipUnmountCleanupRef.current) return;
      if (interruptionHandlingRef.current || isBackgroundTransitioningRef.current) return;

      interruptionHandlingRef.current = true;

      try {
        console.warn(`[ChunkedRecorder] System interruption detected: ${source}`);
        setIsControlBusy(true);

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (startTimeRef.current > 0) {
          pausedTimeRef.current = Math.max(
            pausedTimeRef.current,
            Date.now() - startTimeRef.current
          );
        }

        if (mediaRecorderRef.current?.state === "recording") {
          safeRequestData("background_transition");
          await new Promise((resolve) => setTimeout(resolve, 100));
          safePause("background_transition");
        }

        await flushCurrentChunkForAutoPause(source);

        if (audioContextRef.current?.state === "running") {
          await audioContextRef.current.suspend().catch((error) => {
            console.warn("[ChunkedRecorder] Failed to suspend AudioContext:", error);
          });
        }

        const session = persistPausedSession();
        await releaseWakeLock();

        if (session) {
          notifyAutoPause("system_interruption");
          sendPauseNotify(session, "system_interruption");
        }

        reportRecorderInterruption(source);
        setError(SYSTEM_INTERRUPTION_ERROR_MESSAGE);
      } finally {
        interruptionHandlingRef.current = false;
        setIsControlBusy(false);
      }
    },
    [
      flushCurrentChunkForAutoPause,
      notifyAutoPause,
      persistPausedSession,
      releaseWakeLock,
      reportRecorderInterruption,
      safePause,
      safeRequestData,
      sendPauseNotify,
    ]
  );
  handleSystemInterruptionRef.current = handleSystemInterruption;

  const attachStreamInterruptionListeners = useCallback(
    (stream: MediaStream) => {
      cleanupStreamInterruptionListeners();

      const handleTrackEnded = () => {
        void handleSystemInterruption("audio_track_ended");
      };

      const handleTrackMute = () => {
        window.setTimeout(() => {
          const recorderState = mediaRecorderRef.current?.state ?? "inactive";
          const hasLiveAudioTrack =
            stream
              .getAudioTracks()
              .some((track) => track.readyState === "live") ?? false;

          if (recorderState === "inactive" || !hasLiveAudioTrack) {
            void handleSystemInterruption("audio_track_muted");
          }
        }, 250);
      };

      const handleStreamInactive = () => {
        void handleSystemInterruption("media_stream_inactive");
      };

      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded);
        track.addEventListener("mute", handleTrackMute);
      });
      stream.addEventListener("inactive", handleStreamInactive);

      streamInterruptionCleanupRef.current = () => {
        stream.getAudioTracks().forEach((track) => {
          track.removeEventListener("ended", handleTrackEnded);
          track.removeEventListener("mute", handleTrackMute);
        });
        stream.removeEventListener("inactive", handleStreamInactive);
      };
    },
    [cleanupStreamInterruptionListeners, handleSystemInterruption]
  );

  const reconcileForegroundRecorderState = useCallback(
    async (source: string) => {
      const recorderState = mediaRecorderRef.current?.state ?? "inactive";
      const hasLiveAudioTrack =
        streamRef.current?.getAudioTracks().some((track) => track.readyState === "live") ??
        false;

      if (
        sessionIdRef.current &&
        isRecordingRef.current &&
        !isPausedRef.current &&
        (recorderState === "inactive" || !hasLiveAudioTrack)
      ) {
        await handleSystemInterruption(source);
        return true;
      }

      return false;
    },
    [handleSystemInterruption]
  );

  // 백그라운드 전환 시 즉시 청크 추출 및 세션 저장
  const handleBackgroundTransition = useCallback(
    async (reason: PauseNotifyReason = "visibility_hidden") => {
    if (!mediaRecorderRef.current || !isRecordingRef.current || isPausedRef.current) return;
    if (isBackgroundTransitioningRef.current) return;

    isBackgroundTransitioningRef.current = true;

    try {
      setIsControlBusy(true);
      console.log("[ChunkedRecorder] Background transition detected, extracting chunk...");

      // 현재까지 데이터 즉시 추출
      safeRequestData("background_transition");

      // 약간의 딜레이 후 청크 업로드
      await new Promise((resolve) => setTimeout(resolve, 100));
      await extractAndUploadChunk();

      // 녹음 일시정지
      safePause("background_transition");

      // 타이머 정지
      if (timerRef.current) {
        clearInterval(timerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
      }

      // 세션 정보 저장
      const session = persistPausedSession();

      // Wake Lock 해제
      await releaseWakeLock();

      console.log("[ChunkedRecorder] Session paused and saved:", session);

      if (session) {
        notifyAutoPause(reason);
        sendPauseNotify(session, reason);
      }
    } finally {
      isBackgroundTransitioningRef.current = false;
      setIsControlBusy(false);
    }
    },
    [
      extractAndUploadChunk,
      notifyAutoPause,
      persistPausedSession,
      releaseWakeLock,
      safePause,
      safeRequestData,
      sendPauseNotify,
    ]
  );

  // Wake Lock 재획득 및 백그라운드 복귀 처리 (visibility change)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        // 백그라운드로 전환됨
        if (isRecording && !isPaused) {
          await handleBackgroundTransition("visibility_hidden");
        }
      } else if (document.visibilityState === "visible") {
        const interrupted = await reconcileForegroundRecorderState(
          "visibility_visible_reconcile"
        );

        // 포그라운드로 복귀
        if (!interrupted && isRecording && !isPaused) {
          await requestWakeLock();
        }

        // 저장된 세션이 있는지 확인
        const storedSession = loadSessionFromStorage();
        if (storedSession && !isRecording) {
          const reconciledSession = await reconcileStoredSession(storedSession);
          if (reconciledSession) {
            console.log("[ChunkedRecorder] Found paused session:", reconciledSession);
            setPausedSession(reconciledSession);
            setIsBackgroundPaused(true);
          }
        }
      }
    };

    const handleWindowFocus = () => {
      void reconcileForegroundRecorderState("window_focus_reconcile");
    };

    const handleWindowPageShow = () => {
      void reconcileForegroundRecorderState("window_pageshow_reconcile");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handleWindowPageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handleWindowPageShow);
    };
  }, [
    handleBackgroundTransition,
    isPaused,
    isRecording,
    loadSessionFromStorage,
    reconcileForegroundRecorderState,
    reconcileStoredSession,
    requestWakeLock,
  ]);

  /**
   * 녹음 시작
   */
  const startRecording = useCallback(async () => {
    const resumeContext = resumeContextRef.current;
    const isResumingExistingSession = Boolean(resumeContext?.sessionId);

    try {
      setRuntimeState("starting", "start");
      setIsControlBusy(true);
      setError(null);
      setIsBackgroundPaused(false);
      if (!isResumingExistingSession) {
        setPausedSession(null);
        clearSessionFromStorage();
      }

      console.log("[ChunkedRecorder] Starting recording...");

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      cleanupStreamInterruptionListeners();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current) {
        await audioContextRef.current.close().catch((closeError) => {
          console.warn("[ChunkedRecorder] Failed to close previous AudioContext:", closeError);
        });
        audioContextRef.current = null;
        analyserNodeRef.current = null;
        setAnalyserNode(null);
      }

      mediaRecorderRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;
      attachStreamInterruptionListeners(stream);

      let activeSessionId = resumeContext?.sessionId ?? null;
      if (!activeSessionId) {
        const sessionResponse = await fetch("/api/recordings/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "meeting" }),
        });

        if (!sessionResponse.ok) {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          const errorData = await sessionResponse.json();
          throw new Error(errorData.error || "Failed to start session");
        }

        const sessionData = await sessionResponse.json();
        activeSessionId = sessionData.data.sessionId as string;
        console.log(`[ChunkedRecorder] Session started: ${activeSessionId}`);
      } else {
        console.log(`[ChunkedRecorder] Resuming existing session: ${activeSessionId}`);
      }

      setSessionId(activeSessionId);
      sessionIdRef.current = activeSessionId;

      const shouldReuseChunkManager =
        isResumingExistingSession &&
        chunkManagerRef.current &&
        chunkManagerRef.current.getSessionId() === activeSessionId;

      if (!shouldReuseChunkManager) {
        if (chunkManagerRef.current) {
          chunkManagerRef.current.cleanup();
        }
        chunkManagerRef.current = new ChunkUploadManager({
          sessionId: activeSessionId,
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
              setPendingChunks(chunkManagerRef.current?.getPendingCount() || 0);
              setError(
                error.recoverable
                  ? `청크 ${chunkIndex} 업로드 실패`
                  : "녹음 세션 처리에 실패했습니다."
              );
            },
            onSessionTerminated: (terminalError) => {
              setPendingChunks(0);
              void handleTerminalSessionTermination(terminalError);
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
      } else {
        chunkManagerRef.current?.setSessionId(activeSessionId);
      }

      // 청킹 상태 초기화
      interruptionHandlingRef.current = false;
      const resumeDurationSeconds = resumeContext?.duration ?? 0;
      currentChunkDataRef.current = [];
      currentChunkRmsSamplesRef.current = [];
      currentChunkPeakRmsRef.current = 0;
      currentChunkIndexRef.current = resumeContext?.chunkIndex ?? 0;
      chunkStartTimeRef.current = Date.now();
      lastChunkTimeRef.current = 0;
      pausedTimeRef.current = resumeDurationSeconds * 1000;
      setDuration(resumeDurationSeconds);
      setChunksTranscribed(0);
      setChunksTotal(0);
      setPendingChunks(chunkManagerRef.current?.getPendingCount() || 0);

      // AudioContext 및 AnalyserNode 생성
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      setAnalyserNode(analyser);
      analyserNodeRef.current = analyser;

      // MediaRecorder 설정
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      // iOS 감지 (MP4 사용 시)
      isIOSRef.current = mimeType.includes("mp4");
      console.log("[ChunkedRecorder] Using MIME type:", mimeType, "iOS mode:", isIOSRef.current);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITRATE, // 64kbps
      });

      attachRecorderLifecycleListeners(mediaRecorder);
      mediaRecorderRef.current = mediaRecorder;

      // 데이터 수집
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          currentChunkDataRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("[ChunkedRecorder] MediaRecorder error:", event);
        if (sessionIdRef.current) {
          void handleSystemInterruptionRef.current("media_recorder_error");
          return;
        }
        setRuntimeState("error", "start");
        setIsControlBusy(false);
        setError("녹음 중 오류가 발생했습니다.");
      };

      // 녹음 먼저 시작 (지연 없이 즉시)
      mediaRecorder.start(1000);
      setRuntimeState("recording", "start");
      setIsRecording(true);
      setIsPaused(false);
      setIsControlBusy(false);

      // Wake Lock은 백그라운드에서 실행 (non-blocking)
      requestWakeLock().catch((err) => {
        console.warn("[ChunkedRecorder] WakeLock request failed:", err);
      });

      // 타이머 시작
      startTimeRef.current = Date.now() - pausedTimeRef.current;
      chunkStartTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        sampleCurrentChunkRms();

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

      clearSessionFromStorage();
      setPausedSession(null);
      resumeContextRef.current = null;
      console.log("[ChunkedRecorder] Recording started with session:", activeSessionId);
    } catch (err) {
      console.error("[ChunkedRecorder] Error starting:", err);
      setRuntimeState("error", "start");
      setIsControlBusy(false);
      setIsRecording(false);
      setIsPaused(false);
      if (resumeContextRef.current) {
        setPausedSession(resumeContextRef.current);
        setIsBackgroundPaused(true);
      }
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("마이크 접근 권한이 필요합니다.");
      } else {
        setError("녹음을 시작할 수 없습니다.");
      }
    }
  }, [
    attachStreamInterruptionListeners,
    attachRecorderLifecycleListeners,
    cleanupStreamInterruptionListeners,
    clearSessionFromStorage,
    extractAndUploadChunk,
    handleTerminalSessionTermination,
    requestWakeLock,
    sampleCurrentChunkRms,
    setRuntimeState,
  ]);

  /**
   * 녹음 일시정지
   */
  const pauseRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecordingRef.current || isPausedRef.current) return;
    if (isRestartingRef.current) return;

    const paused = safePause("pause");
    if (!paused) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      pausedTimeRef.current = Date.now() - startTimeRef.current;
    }

    const snapshot = createSessionSnapshot();
    if (snapshot) {
      saveSessionToStorage(snapshot);
      sendPauseNotify(snapshot, "manual_pause");
    }

    releaseWakeLock();
    console.log("[ChunkedRecorder] Recording paused");
  }, [createSessionSnapshot, releaseWakeLock, safePause, saveSessionToStorage, sendPauseNotify]);

  /**
   * 녹음 재개
   */
  const resumeRecording = useCallback(async (): Promise<boolean> => {
    if (!mediaRecorderRef.current || !isRecordingRef.current || !isPausedRef.current) return false;
    if (isRestartingRef.current) return false;

    const hasLiveAudioTrack =
      streamRef.current?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    const recorderInactive = mediaRecorderRef.current.state === "inactive";
    if (recorderInactive || !hasLiveAudioTrack) {
      const fallbackSession =
        pausedSession ||
        (sessionIdRef.current
          ? {
              sessionId: sessionIdRef.current,
              duration: Math.floor(pausedTimeRef.current / 1000),
              pausedAt: Date.now(),
              chunkIndex: currentChunkIndexRef.current,
            }
          : null);

      if (!fallbackSession) {
        setRuntimeState("inactive_unexpected", "resume");
        setError("녹음을 다시 시작할 세션 정보를 찾을 수 없습니다.");
        return false;
      }

      console.warn(
        "[ChunkedRecorder] Recorder became inactive while paused, rebuilding media pipeline"
      );
      resumeContextRef.current = fallbackSession;
      await startRecording();
      return recorderRuntimeStateRef.current === "recording";
    }

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume().catch((error) => {
        console.warn("[ChunkedRecorder] Failed to resume AudioContext:", error);
      });
    }

    await requestWakeLock();
    const resumed = safeResume("resume");
    if (!resumed) return false;

    setIsBackgroundPaused(false);
    clearSessionFromStorage();
    setPausedSession(null);

    startTimeRef.current = Date.now() - pausedTimeRef.current;
    chunkStartTimeRef.current = Date.now(); // 청크 타이머 리셋
    timerRef.current = setInterval(() => {
      sampleCurrentChunkRms();

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
    return true;
  }, [
    clearSessionFromStorage,
    extractAndUploadChunk,
    pausedSession,
    requestWakeLock,
    safeResume,
    sampleCurrentChunkRms,
    setRuntimeState,
    startRecording,
  ]);

  /**
   * 녹음 중지 및 결과 반환
   */
  const stopRecording = useCallback(async (): Promise<ChunkedRecordingResult | null> => {
    if (!mediaRecorderRef.current || !isRecordingRef.current) {
      skipUnmountCleanupRef.current = false;
      return null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder.state === "inactive") {
      skipUnmountCleanupRef.current = false;
      syncRuntimeStateFromRecorder("stop");
      setIsControlBusy(false);
      return null;
    }

    const currentSessionId = sessionIdRef.current;
    skipUnmountCleanupRef.current = true;
    setRuntimeState("stopping", "stop");
    setIsControlBusy(true);

    // 타이머 정지
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    releaseWakeLock();
    clearSessionFromStorage();

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        // 마지막 청크 업로드
        if (currentChunkDataRef.current.length > 0) {
          console.log("[ChunkedRecorder] Uploading final chunk...");

          // iOS 모드에서는 직접 Blob 생성 및 업로드 (restartMediaRecorderForChunk 호출 불가)
          const chunkIndex = currentChunkIndexRef.current;
          const mimeType = mimeTypeRef.current || "audio/webm";
          const chunkBlob = new Blob(currentChunkDataRef.current, { type: mimeType });
          const chunkDuration = Date.now() - chunkStartTimeRef.current;
          const durationSeconds = Math.floor(chunkDuration / 1000);
          const signalMetrics = consumeCurrentChunkSignalMetrics();

          if (isChunkUploadable(chunkBlob, chunkIndex, durationSeconds)) {
            currentChunkIndexRef.current++;
            await uploadChunkBlob(chunkBlob, chunkIndex, durationSeconds, signalMetrics);
          }
          currentChunkDataRef.current = [];
        }

        // 스트림 정리
        cleanupStreamInterruptionListeners();
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

        chunkManagerRef.current?.cleanup();

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
        skipUnmountCleanupRef.current = false;

        resolve({
          transcripts,
          totalDuration,
          totalChunks,
          sessionId: currentSessionId || undefined,
        });
      };

      // 일시정지 상태면 재개
      if (mediaRecorder.state === "paused") {
        safeResume("stop");
      }

      // 데이터 플러시
      safeRequestData("stop");

      // 약간의 딜레이 후 정지
      setTimeout(() => {
        safeStop("stop");
      }, 100);
    });
  }, [
    cleanupStreamInterruptionListeners,
    clearSessionFromStorage,
    consumeCurrentChunkSignalMetrics,
    duration,
    isChunkUploadable,
    releaseWakeLock,
    safeRequestData,
    safeResume,
    safeStop,
    setRuntimeState,
    syncRuntimeStateFromRecorder,
    uploadChunkBlob,
  ]);

  /**
   * 저장된 세션 재개 (백그라운드에서 복귀 시)
   */
  const resumeSession = useCallback(async (session: RecordingSession) => {
    const reconciledSession = await reconcileStoredSession(session);
    if (!reconciledSession) {
      return;
    }

    console.log("[ChunkedRecorder] Resuming session:", reconciledSession);
    resumeContextRef.current = reconciledSession;
    await startRecording();
  }, [reconcileStoredSession, startRecording]);

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
    resumeContextRef.current = null;
    setRuntimeState("idle", "state_sync");
  }, [pausedSession, clearSessionFromStorage, setRuntimeState]);

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
    resumeContextRef.current = null;
    setRuntimeState("idle", "state_sync");

    // 결과 반환 (세션 ID만 전달하여 서버에서 처리)
    return {
      transcripts: [], // 세션 기반이므로 빈 배열 (서버에 이미 저장됨)
      totalDuration: session.duration,
      totalChunks: session.chunkIndex,
      sessionId: session.sessionId,
    };
  }, [pausedSession, clearSessionFromStorage, setRuntimeState]);

  // 마운트 시 저장된 세션 확인
  useEffect(() => {
    void (async () => {
      const storedSession = loadSessionFromStorage();
      if (!storedSession) {
        return;
      }

      const reconciledSession = await reconcileStoredSession(storedSession);
      if (reconciledSession) {
        console.log("[ChunkedRecorder] Found stored session on mount:", reconciledSession);
        setPausedSession(reconciledSession);
        setIsBackgroundPaused(true);
      }
    })();
  }, [loadSessionFromStorage, reconcileStoredSession]);

  const canPause = !isControlBusy && recorderRuntimeState === "recording";
  const canResume = !isControlBusy && recorderRuntimeState === "paused";
  const canStop =
    !isControlBusy &&
    (recorderRuntimeState === "recording" ||
      recorderRuntimeState === "paused" ||
      recorderRuntimeState === "pausing" ||
      recorderRuntimeState === "resuming");

  return {
    // 기본 상태
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    analyserNode,
    recorderRuntimeState,
    isControlBusy,
    canPause,
    canResume,
    canStop,

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
