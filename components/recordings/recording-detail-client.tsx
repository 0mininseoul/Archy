"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { AudioPlayer } from "./audio-player";

// =============================================================================
// Types
// =============================================================================

interface RecordingDetailClientProps {
  recording: Recording;
  saveAudioEnabled: boolean;
  isOwner: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const PRODUCTION_DOMAIN = "https://www.archynotes.com";

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

// =============================================================================
// Component
// =============================================================================

export function RecordingDetailClient({ recording, saveAudioEnabled, isOwner }: RecordingDetailClientProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"transcript" | "formatted">("formatted");
  const [isEditing, setIsEditing] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState(recording.title);
  const [editingTitle, setEditingTitle] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const startEditing = useCallback(() => {
    if (!isOwner) return;
    setIsEditing(true);
    setEditingTitle(recordingTitle);
    setShowMenu(false);
  }, [recordingTitle, isOwner]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditingTitle("");
  }, []);

  const saveTitle = useCallback(async () => {
    if (!editingTitle.trim()) {
      alert("제목을 입력해주세요.");
      return;
    }

    try {
      const response = await fetch(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (response.ok) {
        setRecordingTitle(editingTitle.trim());
        setIsEditing(false);
        setEditingTitle("");
      } else {
        throw new Error("Update failed");
      }
    } catch (error) {
      console.error("Failed to update title:", error);
      alert("제목 변경에 실패했습니다.");
    }
  }, [recording.id, editingTitle]);

  const handleCopyLink = useCallback(() => {
    const shareUrl = `${PRODUCTION_DOMAIN}/recordings/${recording.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert("링크가 복사되었습니다!");
    setShowMenu(false);
  }, [recording.id]);

  const getStatusText = useCallback((status: string) => {
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
  }, [t]);

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

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    alert("복사되었습니다!");
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header max-w-[430px] mx-auto w-full left-0 right-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-full transition-colors flex-shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {isEditing ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm min-w-0"
                autoFocus
              />
              <button
                onClick={saveTitle}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium whitespace-nowrap"
              >
                저장
              </button>
              <button
                onClick={cancelEditing}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium whitespace-nowrap"
              >
                취소
              </button>
            </div>
          ) : (
            <h1 className="text-lg font-bold text-slate-900 truncate flex-1">
              {recordingTitle}
            </h1>
          )}
        </div>

        {/* Menu Button */}
        {!isEditing && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-full transition-colors flex-shrink-0"
              aria-label="메뉴"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1 min-w-[140px] z-50">
                {isOwner && (
                  <button
                    onClick={startEditing}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    제목 수정
                  </button>
                )}
                <button
                  onClick={handleCopyLink}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  링크 복사
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="app-main bg-slate-50">
        <div className="px-mobile py-4 space-y-4">

          {/* Notion / Google Docs Buttons - Owner Only */}
          {isOwner && (recording.notion_page_url || recording.google_doc_url) && (
            <div className="flex items-center gap-3">
              {recording.notion_page_url && (
                <a
                  href={recording.notion_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <Image
                    src="/logos/notion.png"
                    alt="Notion"
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                  <span className="text-sm font-medium text-slate-700">에서 보기</span>
                </a>
              )}
              {recording.google_doc_url && (
                <a
                  href={recording.google_doc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <Image
                    src="/logos/google-docs.png"
                    alt="Google Docs"
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                  <span className="text-sm font-medium text-slate-700">에서 보기</span>
                </a>
              )}
            </div>
          )}

          {/* Info Card */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                {getStatusIcon(recording.status)} {getStatusText(recording.status)}
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>{formatDurationMinutes(recording.duration_seconds)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>{new Date(recording.created_at).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>

          {/* Audio Player - Owner Only */}
          {isOwner && recording.status === "completed" && (
            <AudioPlayer
              recordingId={recording.id}
              saveAudioEnabled={saveAudioEnabled}
              hasAudioFile={!!recording.audio_file_path}
            />
          )}

          {/* Content Tabs */}
          {(recording.transcript || recording.formatted_content) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100">
                {recording.formatted_content && (
                  <button
                    onClick={() => setViewMode("formatted")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${viewMode === "formatted"
                      ? "bg-slate-50 text-slate-900 border-b-2 border-slate-900"
                      : "text-slate-400 hover:text-slate-600"
                      }`}
                  >
                    정리된 문서
                  </button>
                )}
                {recording.transcript && (
                  <button
                    onClick={() => setViewMode("transcript")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${viewMode === "transcript"
                      ? "bg-slate-50 text-slate-900 border-b-2 border-slate-900"
                      : "text-slate-400 hover:text-slate-600"
                      }`}
                  >
                    원본 전사본
                  </button>
                )}
              </div>

              <div className="p-4 min-h-[300px]">
                {/* Error Message */}
                {recording.error_step && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                    {getUserFriendlyErrorMessage(recording.error_step, recording.error_message)}
                  </div>
                )}

                {/* Main Content Area */}
                {viewMode === "formatted" && recording.formatted_content ? (
                  <div>
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => handleCopy(recording.formatted_content || "")}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        복사
                      </button>
                    </div>
                    <div className="prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {recording.formatted_content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : viewMode === "transcript" && recording.transcript ? (
                  <div>
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => handleCopy(recording.transcript || "")}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        복사
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed">
                      {recording.transcript}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
                    <p>콘텐츠를 불러올 수 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing State */}
          {recording.status === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mb-4" />
              <p className="text-slate-900 font-medium mb-1">처리 중...</p>
              <p className="text-xs text-slate-500">잠시만 기다려주세요.</p>
            </div>
          )}
        </div>
      </main >
    </div >
  );
}
