"use client";

import { useState, useRef } from "react";
import { formatDuration } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  format: string;
}

export function AudioRecorder({ onRecordingComplete, format }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const finalDuration = Math.floor(duration);
        onRecordingComplete(blob, finalDuration);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);

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
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("마이크 접근 권한이 필요합니다.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        pausedTimeRef.current = Date.now() - startTimeRef.current;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
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
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Reset for next recording
      setDuration(0);
      pausedTimeRef.current = 0;
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center space-y-12 px-4">
      {/* Timer */}
      <div className="text-center space-y-4">
        <div className="text-6xl md:text-7xl font-mono font-bold text-gray-800 tracking-wider">
          {formatDuration(duration)}
        </div>
        {isRecording && !isPaused && (
          <div className="flex items-center justify-center gap-2 text-red-600 animate-pulse">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <span className="text-sm font-medium">녹음 중</span>
          </div>
        )}
        {isPaused && (
          <div className="text-sm font-medium text-gray-600">일시정지됨</div>
        )}
      </div>

      {error && (
        <div className="w-full p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Main Record Button */}
      {!isRecording ? (
        <button
          onClick={startRecording}
          className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-2xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
          aria-label="녹음 시작"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white" />
        </button>
      ) : (
        <div className="flex items-center gap-6">
          {/* Pause/Resume Button */}
          <button
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white border-4 border-gray-300 hover:border-gray-400 shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            aria-label={isPaused ? "재개" : "일시정지"}
          >
            {isPaused ? (
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-gray-700"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            ) : (
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-gray-700"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <rect x="5" y="4" width="3" height="12" rx="1" />
                <rect x="12" y="4" width="3" height="12" rx="1" />
              </svg>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={stopRecording}
            className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-800 hover:bg-gray-900 shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            aria-label="중지"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded bg-white" />
          </button>
        </div>
      )}

      {/* Info Text */}
      {!isRecording && (
        <p className="text-center text-sm text-gray-500 max-w-xs">
          빨간 버튼을 눌러 녹음을 시작하세요
          <br />
          <span className="text-xs">(최대 120분)</span>
        </p>
      )}
    </div>
  );
}
