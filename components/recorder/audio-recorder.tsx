"use client";

import { useEffect, useRef } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { formatDuration } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  format: string;
}

function WaveformVisualizer({ analyserNode, isRecording, isPaused }: {
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

      ctx.fillStyle = "#f1f5f9"; // slate-100 background
      ctx.fillRect(0, 0, width, height);

      // Draw center playhead line
      const playheadX = width / 2;
      ctx.strokeStyle = "#94a3b8"; // slate-400
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Draw waveform bars
      if (analyserNode && isRecording && !isPaused) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);

        // Calculate average amplitude
        const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        const normalizedAmplitude = average / 255;

        // Add new bar to waveform data
        waveformDataRef.current.push(normalizedAmplitude);

        // Keep only the last maxBars values
        if (waveformDataRef.current.length > maxBars) {
          waveformDataRef.current.shift();
        }
      }

      // Draw bars from waveform history
      const bars = waveformDataRef.current;
      const startIndex = Math.max(0, bars.length - maxBars);

      for (let i = startIndex; i < bars.length; i++) {
        const barIndex = i - startIndex;
        const x = barIndex * barWidth;
        const amplitude = bars[i];
        const barHeight = Math.max(4, amplitude * (height * 0.8));

        ctx.fillStyle = "#9ca3af"; // gray-400
        ctx.fillRect(
          x + barGap / 2,
          centerY - barHeight / 2,
          barWidth - barGap,
          barHeight
        );
      }

      // Draw center dot on playhead
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

  // Reset waveform data when not recording
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

export function AudioRecorder({ onRecordingComplete, format }: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    duration,
    error,
    isWakeLockActive,
    analyserNode,
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
    <div className="w-full flex flex-col items-center justify-center space-y-4">
      {/* Waveform Visualizer */}
      <WaveformVisualizer
        analyserNode={analyserNode}
        isRecording={isRecording}
        isPaused={isPaused}
      />

      {/* Wake Lock Status Badge - smaller size */}
      {isRecording && (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${isWakeLockActive
            ? "bg-green-50 text-green-600 border border-green-200"
            : "bg-amber-50 text-amber-600 border border-amber-200"
          }`}>
          {isWakeLockActive ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>녹음 중 (화면이 켜진 상태로 유지됩니다)</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>화면 유지 기능을 사용할 수 없습니다</span>
            </>
          )}
        </div>
      )}

      {/* Timer - smaller size */}
      <div className={`text-4xl font-bold tracking-tight ${isRecording ? 'text-red-500' : 'text-slate-800'}`}>
        {formatDuration(duration)}
      </div>

      {error && (
        <div className="w-full p-3 bg-red-50 border border-red-100 rounded-xl text-center">
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 pt-2">
        {!isRecording ? (
          <button
            onClick={startRecording}
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
          버튼을 눌러 녹음을 시작하세요<br />
          <span className="text-xs opacity-75">(최대 120분)</span>
        </p>
      )}
    </div>
  );
}
