"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import Image from "next/image";

// =============================================================================
// Types
// =============================================================================

interface RecordingCardProps {
  recording: Recording;
  pushEnabled: boolean;
  slackConnected: boolean;
  onHide: (id: string) => void;
  onPin?: (id: string, isPinned: boolean) => void;
}

// =============================================================================
// Utility Functions
// =============================================================================

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "🟢";
    case "processing":
      return "🟡";
    case "failed":
      return "🔴";
    default:
      return "⚪";
  }
}



function formatRecordingDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false, // 24-hour format creates cleaner short dates like "1/15 18:05", or enable for "오후 6:05" but user screenshot showed "오후" in title but "1/15 9:18" in small text. Wait, user said "녹음 카드 제목은 한국 시간 기준... 작은 글씨의 녹음일시는 한국 시간이 아닌 것 같아". 
    // Screenshot shows small text "1/15 9:18". If it was 6pm, it should be 18:xx or 오후.
    // I will use 24h format or standard ko-KR short format.
    // "1/15 18:18" is standard short.
  }).format(date).replace(/\. /g, "/").replace(".", "");  // Simple ko-KR produces "2024. 1. 15. 18:00".
  // Let's stick to the user's seeming preference "1/15 9:18" style but correct time.
  // Actually, let's just use the `Intl` directly to get "1/15 18:30" style.
}

// Better yet, let's redefine it to be explicitly KST "M/D HH:mm" or similar.
function formatRecordingDateKST(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", { // Using en-US pattern for "M/D" but KST time
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date); // en-US produces "1/15, 18:18" roughly.
}
// Actually, let's correct the implementations below in one go.

// =============================================================================
// Component
// =============================================================================

export function RecordingCard({
  recording,
  pushEnabled,
  slackConnected,
  onHide,
  onPin,
}: RecordingCardProps) {
  const router = useRouter();
  const { t } = useI18n();

  // Prefetch for performance
  useEffect(() => {
    if (recording.transcript) {
      router.prefetch(`/recordings/${recording.id}`);
    }
  }, [recording.id, recording.transcript, router]);

  // Gesture state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Constants
  const MIN_SWIPE_DISTANCE = 50;
  const MAX_SWIPE_LEFT = -80;
  const MAX_SWIPE_RIGHT = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setIsDeleting(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;

    const currentTouch = e.targetTouches[0].clientX;
    const diff = currentTouch - touchStart;

    // Limit swipe range
    if (diff < 0) {
      // Swiping left (delete)
      setSwipeOffset(Math.max(diff, MAX_SWIPE_LEFT));
    } else {
      // Swiping right (pin)
      setSwipeOffset(Math.min(diff, MAX_SWIPE_RIGHT));
    }
  };

  const handleTouchEnd = () => {
    if (touchStart === null) return;

    if (swipeOffset <= MAX_SWIPE_LEFT / 2) {
      // Snapped to delete state
      setIsDeleting(true);
      setSwipeOffset(MAX_SWIPE_LEFT);
    } else if (swipeOffset >= MAX_SWIPE_RIGHT / 2) {
      // Snapped to pin state (Reveal)
      setSwipeOffset(MAX_SWIPE_RIGHT);
    } else {
      // Reset if not enough swipe
      setSwipeOffset(0);
      setIsDeleting(false);
    }
    setTouchStart(null);
  };

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPin && onPin(recording.id, !recording.is_pinned);
      setSwipeOffset(0);
    },
    [recording.id, recording.is_pinned, onPin]
  );

  const getStatusText = useCallback(
    (status: string, processingStep?: string) => {
      if (status === "processing" && processingStep) {
        switch (processingStep) {
          case "transcription":
            return t.history.processingSteps.transcription;
          case "formatting":
            return t.history.processingSteps.formatting;
          case "saving":
            return t.history.processingSteps.saving;
        }
      }
      switch (status) {
        case "completed":
          return t.history.status.completed;
        case "processing":
          return t.history.status.processing;
        case "failed":
          return t.history.status.failed;
        default:
          return t.history.status.pending;
      }
    },
    [t]
  );

  const getUserFriendlyErrorMessage = useCallback((errorStep?: string, errorMessage?: string) => {
    if (errorMessage?.includes("저장 위치가 지정되지 않았습니다")) {
      return errorMessage;
    }
    switch (errorStep) {
      case "transcription":
        return "음성 변환 중 오류가 발생했습니다. 다시 녹음해주세요.";
      case "formatting":
        return "문서 정리 중 오류가 발생했습니다.";
      case "notion":
        return "노션 저장 중 오류가 발생했습니다. 설정을 확인해주세요.";
      case "slack":
        return "슬랙 알림 전송 중 오류가 발생했습니다.";
      case "upload":
        return "녹음 파일 처리 중 오류가 발생했습니다. 다시 녹음해주세요.";
      default:
        return "처리 중 오류가 발생했습니다.";
    }
  }, []);

  const handleCardClick = useCallback(() => {
    // Only navigate if we are not in swiped state (delete mode)
    if (Math.abs(swipeOffset) > 10) {
      setSwipeOffset(0);
      setIsDeleting(false);
      return;
    }

    if (recording.transcript) {
      router.push(`/recordings/${recording.id}`);
    }
  }, [recording.transcript, recording.id, router, swipeOffset]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("정말로 이 녹음을 삭제하시겠습니까?")) {
        onHide(recording.id);
      } else {
        // Reset check state
        setSwipeOffset(0);
        setIsDeleting(false);
      }
    },
    [recording.id, onHide]
  );

  // Format date to KST
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(recording.created_at));

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-100">
      {/* Background Actions */}
      <div className="absolute inset-y-0 left-0 w-full flex items-center justify-between px-4">
        {/* Pin Action (Left Side) */}
        <div className={`flex items-center justify-start h-full transition-opacity ${swipeOffset > 0 ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={handlePin}
            className="bg-blue-500 text-white w-[80px] h-full flex flex-col items-center justify-center font-medium"
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span className="text-[11px]">{recording.is_pinned ? "해제" : "고정"}</span>
          </button>
        </div>

        {/* Delete Action (Right Side) */}
        <div className={`flex items-center justify-end h-full transition-opacity ${swipeOffset < 0 ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={handleDelete}
            className="bg-red-500 text-white px-4 h-full flex items-center justify-center font-medium absolute right-0 top-0 bottom-0 w-[80px]"
            style={{ display: isDeleting ? 'flex' : 'none' }}
          >
            삭제
          </button>
        </div>
      </div>

      {/* Main Card Content */}
      <div
        className={`bg-white p-3 relative transition-transform duration-200 ease-out border ${recording.transcript ? "cursor-pointer" : "cursor-default"} ${recording.is_pinned ? "border-blue-200 bg-blue-50/10" : "border-slate-200"}`}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
      >
        {recording.is_pinned && (
          <div className="absolute top-2 right-2 text-blue-500">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 5c0 .552-.448 1-1 1h-1v9l2 3v1H8v-1l2-3V6H9c-.552 0-1-.448-1-1s.448-1 1-1h6c.552 0 1 .448 1 1z" />
            </svg>
          </div>
        )}

        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <Image
              src="/icons/archy logo.png"
              alt="Archy"
              width={40}
              height={40}
              className="object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="text-base font-bold text-slate-900 line-clamp-2">
              {recording.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                {getStatusIcon(recording.status)} {getStatusText(recording.status, recording.processing_step)}
              </span>
              <span>·</span>
              <span>{formatDurationMinutes(recording.duration_seconds)}</span>
              <span>·</span>
              <span>{formattedDate}</span>
            </div>

            {/* Processing Status Info */}
            {recording.status === "processing" && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex items-start gap-2 text-xs text-blue-700">
                  <svg
                    className="w-3 h-3 mt-0.5 flex-shrink-0 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span className="leading-relaxed">
                    {t.history.processingNotice.base}
                    <br />
                    {pushEnabled && slackConnected && t.history.processingNotice.all}
                    {pushEnabled && !slackConnected && t.history.processingNotice.push}
                    {!pushEnabled && slackConnected && t.history.processingNotice.slack}
                  </span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {recording.status === "failed" && (
              <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-600">
                  {getUserFriendlyErrorMessage(recording.error_step, recording.error_message)}
                </p>
              </div>
            )}

            {/* Completed - Notion error message */}
            {recording.status === "completed" && recording.error_step === "notion" && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-xs text-amber-600">
                  {getUserFriendlyErrorMessage(recording.error_step, recording.error_message)}
                </p>
              </div>
            )}

            {/* Completed - Actions */}
            {recording.status === "completed" && (
              <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                {recording.notion_page_url && (
                  <button
                    onClick={() => {
                      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                      if (isMobile) {
                        window.location.href = recording.notion_page_url!;
                      } else {
                        window.open(recording.notion_page_url!, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 min-h-[36px]"
                  >
                    <Image src="/logos/notion.png" alt="Notion" width={14} height={14} />
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                )}
                {recording.google_doc_url && (
                  <a
                    href={recording.google_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700 min-h-[36px]"
                  >
                    <Image src="/logos/google-docs.png" alt="Google Docs" width={14} height={14} />
                    <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                )}
              </div>
            )}

            {/* Failed - Actions */}
            {recording.status === "failed" && recording.transcript && (
              <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => router.push(`/recordings/${recording.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 min-h-[36px]"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>{t.history.viewTranscript}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
