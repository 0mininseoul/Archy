"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  isWakeLockActive: boolean;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

// Get the best supported MIME type for the current browser
function getSupportedMimeType(): string {
  const mimeTypes = [
    "audio/mp4",        // iOS Safari
    "audio/webm;codecs=opus",  // Chrome, Firefox
    "audio/webm",       // Chrome, Firefox fallback
    "audio/ogg;codecs=opus",   // Firefox
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Default fallback
  return "audio/webm";
}

// Get file extension from MIME type
export function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mimeTypeRef = useRef<string>("");

  // Request Wake Lock to prevent screen from turning off
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setIsWakeLockActive(true);

        wakeLockRef.current.addEventListener("release", () => {
          setIsWakeLockActive(false);
        });

        console.log("[WakeLock] Screen wake lock acquired");
      } catch (err) {
        console.warn("[WakeLock] Failed to acquire wake lock:", err);
        // Wake lock failure is not critical, continue recording
      }
    } else {
      console.warn("[WakeLock] Wake Lock API not supported");
    }
  }, []);

  // Release Wake Lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsWakeLockActive(false);
        console.log("[WakeLock] Screen wake lock released");
      } catch (err) {
        console.warn("[WakeLock] Failed to release wake lock:", err);
      }
    }
  }, []);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && isRecording && !isPaused) {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording, isPaused, requestWakeLock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      releaseWakeLock();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [releaseWakeLock]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      streamRef.current = stream;

      // Get supported MIME type
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      console.log("[Recorder] Using MIME type:", mimeType);

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("[Recorder] MediaRecorder error:", event);
        setError("녹음 중 오류가 발생했습니다.");
      };

      // Request wake lock before starting
      await requestWakeLock();

      // Start recording with timeslice for periodic data
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // Start timer
      startTimeRef.current = Date.now() - pausedTimeRef.current;
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // Stop recording after 120 minutes (7200 seconds)
        if (elapsed >= 7200) {
          stopRecording();
        }
      }, 1000);

      console.log("[Recorder] Recording started");
    } catch (err) {
      console.error("[Recorder] Error starting recording:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("마이크 접근 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.");
      } else {
        setError("녹음을 시작할 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.");
      }
    }
  }, [requestWakeLock]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
      }

      // Release wake lock while paused
      releaseWakeLock();

      console.log("[Recorder] Recording paused");
    }
  }, [isRecording, isPaused, releaseWakeLock]);

  const resumeRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      // Re-acquire wake lock
      await requestWakeLock();

      mediaRecorderRef.current.resume();
      setIsPaused(false);

      // Resume timer
      startTimeRef.current = Date.now() - pausedTimeRef.current;
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        if (elapsed >= 7200) {
          stopRecording();
        }
      }, 1000);

      console.log("[Recorder] Recording resumed");
    }
  }, [isRecording, isPaused, requestWakeLock]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = () => {
        const mimeType = mimeTypeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });

        console.log("[Recorder] Recording stopped, blob size:", blob.size, "type:", mimeType);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        resolve(blob);
      };

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Release wake lock
      releaseWakeLock();

      // Stop the media recorder
      mediaRecorder.stop();

      // Reset state
      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
      pausedTimeRef.current = 0;
    });
  }, [isRecording, releaseWakeLock]);

  return {
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}

// Export MIME type helper for use in other components
export { getSupportedMimeType };
