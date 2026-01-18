"use client";

import { useEffect, useRef, useState } from "react";
import {
  useChunkedRecorder,
  ChunkedRecordingResult,
} from "@/hooks/useChunkedRecorder";
import { formatDuration } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface ChunkedAudioRecorderProps {
  onRecordingComplete: (result: ChunkedRecordingResult) => void;
  format: string;
}

function WaveformVisualizer({
  analyserNode,
  isRecording,
  isPaused,
}: {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  isPaused: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const waveformDataRef = useRef<number[]>([]);
  const maxBars = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / maxBars;
      const barGap = 2;
      const centerY = height / 2;

      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, width, height);

      const playheadX = width / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      if (analyserNode && isRecording && !isPaused) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);

        const average =
          dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        const normalizedAmplitude = average / 255;

        waveformDataRef.current.push(normalizedAmplitude);

        if (waveformDataRef.current.length > maxBars) {
          waveformDataRef.current.shift();
        }
      }

      const bars = waveformDataRef.current;
      const startIndex = Math.max(0, bars.length - maxBars);

      for (let i = startIndex; i < bars.length; i++) {
        const barIndex = i - startIndex;
        const x = barIndex * barWidth;
        const amplitude = bars[i];
        const barHeight = Math.max(4, amplitude * (height * 0.8));

        ctx.fillStyle = "#9ca3af";
        ctx.fillRect(
          x + barGap / 2,
          centerY - barHeight / 2,
          barWidth - barGap,
          barHeight
        );
      }

      ctx.fillStyle = "#9ca3af";
      ctx.beginPath();
      ctx.arc(playheadX, 8, 4, 0, Math.PI * 2);
      ctx.fill();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserNode, isRecording, isPaused]);

  useEffect(() => {
    if (!isRecording) {
      waveformDataRef.current = [];
    }
  }, [isRecording]);

  return (
    <div className="w-full rounded-xl overflow-hidden bg-slate-100">
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full h-[150px]"
      />
    </div>
  );
}

export function ChunkedAudioRecorder({
  onRecordingComplete,
}: ChunkedAudioRecorderProps) {
  const { t } = useI18n();
  const [showIosWarning, setShowIosWarning] = useState(false);

  const {
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    analyserNode,
    chunksTranscribed,
    chunksTotal,
    pendingChunks,
    isOnline,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useChunkedRecorder();

  // Check if iOS device
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const handleStartRecording = async () => {
    // Show iOS warning on first recording
    if (isIOS && typeof window !== 'undefined') {
      const hasSeenWarning = localStorage.getItem('archy_ios_background_warning_seen');
      if (!hasSeenWarning) {
        setShowIosWarning(true);
        return;
      }
    }
    await startRecording();
  };

  const handleDismissIosWarning = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('archy_ios_background_warning_seen', 'true');
    }
    setShowIosWarning(false);
    await startRecording();
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result) {
      onRecordingComplete(result);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center space-y-4">
      {/* Waveform Visualizer */}
      <WaveformVisualizer
        analyserNode={analyserNode}
        isRecording={isRecording}
        isPaused={isPaused}
      />

      {/* Wake Lock Status Badge */}
      {isRecording && (
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${isWakeLockActive
            ? "bg-green-50 text-green-600 border border-green-200"
            : "bg-amber-50 text-amber-600 border border-amber-200"
            }`}
        >
          {isWakeLockActive ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t.dashboard.wakeLockActive}</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t.dashboard.wakeLockInactive}</span>
            </>
          )}
        </div>
      )}

      {/* Chunk Progress */}
      {isRecording && chunksTotal > 0 && (
        <div className="text-sm text-blue-600 font-medium">
          {t.dashboard.chunkProgress
            .replace("{current}", String(chunksTranscribed))
            .replace("{total}", String(chunksTotal))}
        </div>
      )}

      {/* Pending Chunks Warning */}
      {isRecording && pendingChunks > 0 && (
        <div className="text-xs text-amber-600">
          {t.dashboard.pendingChunks.replace("{count}", String(pendingChunks))}
        </div>
      )}

      {/* Network Status */}
      {isRecording && !isOnline && (
        <div className="text-xs text-red-500 font-medium">
          {t.dashboard.networkOffline}
        </div>
      )}

      {/* Timer */}
      <div
        className={`text-4xl font-bold tracking-tight ${isRecording ? "text-red-500" : "text-slate-800"
          }`}
      >
        {formatDuration(duration)}
      </div>

      {error && (
        <div className="w-full p-3 bg-red-50 border border-red-100 rounded-xl text-center">
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      {/* iOS Background Warning Modal */}
      {showIosWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">iOS 녹음 안내</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              {t.dashboard.iosBackgroundWarning}
            </p>
            <button
              onClick={handleDismissIosWarning}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
            >
              {t.dashboard.iosBackgroundWarningDismiss}
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 pt-2">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
            aria-label="Start Recording"
          >
            <div className="absolute inset-0 rounded-full border-2 border-white/20 group-hover:border-white/40 transition-colors" />
            <div className="w-7 h-7 rounded-full bg-white" />
          </button>
        ) : (
          <>
            {/* Pause/Resume Button */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all hover:scale-105 active:scale-95"
              aria-label={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>

            {/* Stop Button */}
            <button
              onClick={handleStopRecording}
              className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-white border-2 border-red-100 hover:border-red-200 shadow-xl shadow-red-500/10 transition-all hover:scale-105 active:scale-95"
              aria-label="Stop Recording"
            >
              <div className="w-7 h-7 rounded-lg bg-red-500 group-hover:bg-red-600 transition-colors" />
            </button>
          </>
        )}
      </div>

      {/* Helper Text */}
      {!isRecording && (
        <p className="text-center text-xs text-slate-400">
          {t.dashboard.startRecording}
          <br />
          <span className="text-xs opacity-75">{t.dashboard.maxDuration}</span>
        </p>
      )}
    </div>
  );
}
