"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// =============================================================================
// Types
// =============================================================================

interface RecordingDetailClientProps {
  recording: Recording;
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

// =============================================================================
// Component
// =============================================================================

export function RecordingDetailClient({ recording }: RecordingDetailClientProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"transcript" | "formatted">("formatted");

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container-custom h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/history")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Image
                src="/icons/flownote logo.png"
                alt="Flownote"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-xl font-bold text-slate-900">Flownote</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Dashboard"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container-custom py-8 flex-1">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="card p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">{recording.title}</h1>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5">
                    {getStatusIcon(recording.status)} {getStatusText(recording.status)}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>{formatDurationMinutes(recording.duration_seconds)}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>{new Date(recording.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
              </div>
              {recording.notion_page_url && (
                <a
                  href={recording.notion_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  <span>Notion에서 보기</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p className="mt-4 text-xs text-slate-400">
              * 오디오 파일은 저장되지 않으며, 텍스트 변환 후 즉시 폐기됩니다.
            </p>
          </div>

          {/* Content Tabs */}
          {(recording.transcript || recording.formatted_content) && (
            <div className="mb-4">
              <div className="flex gap-2 border-b border-slate-200">
                {recording.formatted_content && (
                  <button
                    onClick={() => setViewMode("formatted")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      viewMode === "formatted"
                        ? "border-slate-900 text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    정리된 문서
                  </button>
                )}
                {recording.transcript && (
                  <button
                    onClick={() => setViewMode("transcript")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      viewMode === "transcript"
                        ? "border-slate-900 text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    원본 전사본
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Complete Failure */}
          {recording.status === "failed" && !recording.transcript && !recording.formatted_content && (
            <div className="card p-6">
              <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
                <h3 className="text-red-600 font-semibold mb-2">처리 실패</h3>
                <p className="text-red-700 text-sm">
                  {getUserFriendlyErrorMessage(recording.error_step, recording.error_message)}
                </p>
              </div>
            </div>
          )}

          {/* Content */}
          {(recording.transcript || recording.formatted_content) && (
            <div className="card p-6">
              {recording.error_step === "notion" && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <p className="text-sm text-amber-700">
                    {getUserFriendlyErrorMessage(recording.error_step, recording.error_message)}
                  </p>
                </div>
              )}

              {viewMode === "formatted" && recording.formatted_content ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">정리된 문서</h3>
                    <button
                      onClick={() => handleCopy(recording.formatted_content || "")}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      복사
                    </button>
                  </div>
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 p-4 rounded-lg border border-slate-200">
                      {recording.formatted_content}
                    </pre>
                  </div>
                </div>
              ) : viewMode === "transcript" && recording.transcript ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">원본 전사본</h3>
                    <button
                      onClick={() => handleCopy(recording.transcript || "")}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      복사
                    </button>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">{recording.transcript}</pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-500">콘텐츠를 불러올 수 없습니다.</p>
                </div>
              )}
            </div>
          )}

          {/* Still Processing */}
          {recording.status === "processing" && !recording.transcript && !recording.formatted_content && (
            <div className="card p-12 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">처리 중...</h3>
              <p className="text-slate-500">음성을 텍스트로 변환하고 있습니다. 잠시만 기다려주세요.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
