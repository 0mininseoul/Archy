"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface AudioPlayerProps {
  recordingId: string;
  saveAudioEnabled: boolean;
  hasAudioFile: boolean;
}

export function AudioPlayer({ recordingId, saveAudioEnabled, hasAudioFile }: AudioPlayerProps) {
  const { locale } = useI18n();
  // If we know there's audio, start with null (loading). If we know there isn't, start with false.
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState<boolean | null>(hasAudioFile ? null : false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch audio URL
  useEffect(() => {
    // Skip if we already know there is no audio file
    if (!hasAudioFile) return;

    const fetchAudioUrl = async () => {
      try {
        const response = await fetch(`/api/recordings/${recordingId}/audio`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load audio");
        }

        if (result.data?.hasAudio === false) {
          setHasAudio(false);
          return;
        }

        if (result.data?.url) {
          setAudioUrl(result.data.url);
          setHasAudio(true);
        } else {
          setHasAudio(false);
        }
      } catch (err) {
        console.error("Failed to fetch audio URL:", err);
        setError(locale === "ko" ? "오디오를 불러올 수 없습니다." : "Failed to load audio.");
        setHasAudio(false);
      }
    };

    fetchAudioUrl();
  }, [recordingId, locale, hasAudioFile]);

  // Audio event handlers
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Loading state
  if (hasAudio === null) {
    return (
      <div className="bg-slate-50 p-4 rounded-xl">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span>{locale === "ko" ? "오디오 로딩 중..." : "Loading audio..."}</span>
        </div>
      </div>
    );
  }

  // No audio available
  if (hasAudio === false) {
    // If audio storage is disabled by user, don't show the warning
    if (!saveAudioEnabled) {
      return null;
    }

    return (
      <div className="bg-slate-50 p-4 rounded-xl">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          <span>
            {locale === "ko"
              ? "이 녹음의 오디오 파일이 저장되지 않았습니다."
              : "Audio file was not saved for this recording."}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {locale === "ko"
            ? "설정 > 데이터 관리에서 오디오 저장을 활성화하면 새 녹음부터 오디오가 저장됩니다."
            : "Enable audio storage in Settings > Data Management to save audio for future recordings."}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-xl">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  // Audio player UI
  return (
    <div className="bg-slate-50 p-4 rounded-xl">
      <audio
        ref={audioRef}
        src={audioUrl!}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlayPause}
          className="w-10 h-10 flex items-center justify-center bg-slate-900 text-white rounded-full hover:bg-slate-800 transition-colors flex-shrink-0"
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress Bar */}
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:rounded-full"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
