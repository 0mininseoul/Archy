"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// =============================================================================
// Types
// =============================================================================

interface RecordingCardProps {
  recording: Recording;
  pushEnabled: boolean;
  slackConnected: boolean;
  onHide: (id: string) => void;
  onTitleUpdate: (id: string, newTitle: string) => void;
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

function getFormatEmoji(format: string): string {
  switch (format) {
    case "meeting":
      return "🎙️";
    case "interview":
      return "📝";
    case "lecture":
      return "📚";
    default:
      return "📄";
  }
}

// =============================================================================
// Component
// =============================================================================

export function RecordingCard({
  recording,
  pushEnabled,
  slackConnected,
  onHide,
  onTitleUpdate,
}: RecordingCardProps) {
  const router = useRouter();
  const { t } = useI18n();

  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

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

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditingTitle(recording.title);
  }, [recording.title]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditingTitle("");
  }, []);

  const saveTitle = useCallback(async () => {
    if (!editingTitle.trim()) {
      alert(t.history.titleRequired);
      return;
    }

    try {
      const response = await fetch(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (response.ok) {
        onTitleUpdate(recording.id, editingTitle.trim());
        setIsEditing(false);
        setEditingTitle("");
      } else {
        throw new Error("Update failed");
      }
    } catch (error) {
      console.error("Failed to update title:", error);
      alert(t.history.titleUpdateFailed);
    }
  }, [recording.id, editingTitle, t, onTitleUpdate]);

  const handleCardClick = useCallback(() => {
    if (recording.transcript) {
      router.push(`/recordings/${recording.id}`);
    }
  }, [recording.transcript, recording.id, router]);

  const handleHide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onHide(recording.id);
    },
    [recording.id, onHide]
  );

  return (
    <div
      className={`card-touchable p-4 relative ${recording.transcript ? "cursor-pointer" : "cursor-default"}`}
      onClick={handleCardClick}
    >
      {/* Hide Button */}
      <button
        onClick={handleHide}
        className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label="녹음 숨기기"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl flex-shrink-0">
          {getFormatEmoji(recording.format)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-6">
          {isEditing ? (
            <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                autoFocus
              />
              <button
                onClick={saveTitle}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium min-h-[44px]"
              >
                {t.common.save}
              </button>
              <button
                onClick={cancelEditing}
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium min-h-[44px]"
              >
                {t.common.cancel}
              </button>
            </div>
          ) : (
            <>
              <h3
                className="text-base font-bold text-slate-900 line-clamp-2"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
              >
                {recording.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  {getStatusIcon(recording.status)} {getStatusText(recording.status, recording.processing_step)}
                </span>
                <span>·</span>
                <span>{formatDurationMinutes(recording.duration_seconds)}</span>
              </div>
            </>
          )}

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
                <a
                  href={recording.notion_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 min-h-[36px]"
                >
                  <span>Notion</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              {recording.google_doc_url && (
                <a
                  href={recording.google_doc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700 min-h-[36px]"
                >
                  <span>Google Docs</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  );
}
