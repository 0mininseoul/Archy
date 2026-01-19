"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatDuration } from "@/lib/utils";

interface StealthModeProps {
  isActive: boolean;
  duration: number;
  onExit: () => void;
}

const DOUBLE_TAP_DELAY = 300; // ms

export function StealthMode({ isActive, duration, onExit }: StealthModeProps) {
  const [showHint, setShowHint] = useState(true);
  const lastTapRef = useRef<number>(0);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 더블탭 감지
  const handleTap = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
      // 더블탭 감지됨
      console.log("[StealthMode] Double tap detected, exiting...");
      onExit();
    } else {
      // 첫 번째 탭 - 힌트 표시
      setShowHint(true);
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
      hintTimeoutRef.current = setTimeout(() => {
        setShowHint(false);
      }, 2000);
    }

    lastTapRef.current = now;
  }, [onExit]);

  // 마운트 시 힌트 표시 후 숨김
  useEffect(() => {
    if (isActive) {
      setShowHint(true);
      hintTimeoutRef.current = setTimeout(() => {
        setShowHint(false);
      }, 3000);
    }

    return () => {
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
    };
  }, [isActive]);

  // 키보드 ESC 키로도 종료 가능
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      }
    };

    if (isActive) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, onExit]);

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 bg-black z-[9999] cursor-pointer select-none"
      onClick={handleTap}
      onTouchEnd={handleTap}
    >
      {/* 녹음 표시 (최소화) */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white/30 text-sm font-mono">
          {formatDuration(duration)}
        </span>
      </div>

      {/* 더블탭 힌트 */}
      {showHint && (
        <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
          <div className="text-center text-white/40 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                />
              </svg>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                />
              </svg>
            </div>
            <p className="text-xs">두 번 탭하면 화면이 밝아집니다</p>
          </div>
        </div>
      )}
    </div>
  );
}
