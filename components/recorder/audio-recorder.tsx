"use client";

import { useAudioRecorder, getFileExtension, getSupportedMimeType } from "@/hooks/useAudioRecorder";
import { formatDuration } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  format: string;
}

export function AudioRecorder({ onRecordingComplete, format }: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useAudioRecorder();

  const handleStopRecording = async () => {
    const blob = await stopRecording();
    if (blob) {
      onRecordingComplete(blob, duration);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center space-y-8">
      {/* Wake Lock Status Badge */}
      {isRecording && (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          isWakeLockActive
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-amber-50 text-amber-700 border border-amber-200"
        }`}>
          {isWakeLockActive ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>녹음 중 (화면이 켜진 상태로 유지됩니다)</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>화면 유지 기능을 사용할 수 없습니다</span>
            </>
          )}
        </div>
      )}

      {/* Timer */}
      <div className="text-center space-y-2">
        <div className={`text-7xl font-bold tracking-tighter font-mono ${isRecording ? 'text-red-500' : 'text-slate-800'}`}>
          {formatDuration(duration)}
        </div>
        <div className="h-6 flex items-center justify-center">
          {isRecording && !isPaused ? (
            <div className="flex items-center gap-2 text-red-500 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium uppercase tracking-wider">Recording</span>
            </div>
          ) : isPaused ? (
            <span className="text-sm font-medium text-amber-500 uppercase tracking-wider">Paused</span>
          ) : (
            <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">Ready to Record</span>
          )}
        </div>
      </div>

      {error && (
        <div className="w-full p-4 bg-red-50 border border-red-100 rounded-xl text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-6">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="group relative flex items-center justify-center w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
            aria-label="Start Recording"
          >
            <div className="absolute inset-0 rounded-full border-2 border-white/20 group-hover:border-white/40 transition-colors" />
            <div className="w-8 h-8 rounded-full bg-white" />
          </button>
        ) : (
          <>
            {/* Pause/Resume Button */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all hover:scale-105 active:scale-95"
              aria-label={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>

            {/* Stop Button */}
            <button
              onClick={handleStopRecording}
              className="group relative flex items-center justify-center w-24 h-24 rounded-full bg-white border-2 border-red-100 hover:border-red-200 shadow-xl shadow-red-500/10 transition-all hover:scale-105 active:scale-95"
              aria-label="Stop Recording"
            >
              <div className="w-8 h-8 rounded-lg bg-red-500 group-hover:bg-red-600 transition-colors" />
            </button>
          </>
        )}
      </div>

      {/* Helper Text */}
      {!isRecording && (
        <p className="text-center text-sm text-slate-400">
          버튼을 눌러 녹음을 시작하세요<br />
          <span className="text-xs opacity-75">(최대 120분)</span>
        </p>
      )}
    </div>
  );
}
