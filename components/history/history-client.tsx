"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface HistoryClientProps {
  initialRecordings: Recording[];
}

export function HistoryClient({ initialRecordings }: HistoryClientProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings);
  const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Polling for processing recordings
  useEffect(() => {
    const hasProcessing = recordings.some((r) => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/recordings");
        const data = await response.json();
        setRecordings(data.recordings || []);
      } catch (error) {
        console.error("Failed to fetch recordings:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [recordings]);

  const hideRecording = async (id: string) => {
    if (!confirm("이 녹음을 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: true }),
      });

      if (response.ok) {
        setRecordings(recordings.filter((r) => r.id !== id));
      } else {
        throw new Error("Hide failed");
      }
    } catch (error) {
      console.error("Failed to hide recording:", error);
      alert("녹음을 숨기는데 실패했습니다.");
    }
  };

  const startEditingTitle = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveTitle = async (id: string) => {
    if (!editingTitle.trim()) {
      alert(t.history.titleRequired);
      return;
    }

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (response.ok) {
        const { recording } = await response.json();
        setRecordings(recordings.map((r) => (r.id === id ? recording : r)));
        setEditingId(null);
        setEditingTitle("");
      } else {
        throw new Error("Update failed");
      }
    } catch (error) {
      console.error("Failed to update title:", error);
      alert(t.history.titleUpdateFailed);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const filteredRecordings = recordings.filter((recording) => {
    if (filter === "all") return true;
    return recording.status === filter;
  });

  const getStatusIcon = (status: string) => {
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
  };

  const getStatusText = (status: string, processingStep?: string) => {
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
  };

  const getErrorStepText = (errorStep?: string) => {
    switch (errorStep) {
      case "transcription":
        return t.history.errorSteps.transcription;
      case "formatting":
        return t.history.errorSteps.formatting;
      case "notion":
        return t.history.errorSteps.notion;
      case "slack":
        return t.history.errorSteps.slack;
      case "upload":
        return t.history.errorSteps.upload;
      default:
        return t.history.errorSteps.unknown;
    }
  };

  const getFormatEmoji = (format: string) => {
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
  };

  return (
    <>
      {/* Filter Chips */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="scroll-x flex gap-2 pb-1">
          {[
            { value: "all", label: t.history.filters.all },
            { value: "processing", label: t.history.filters.processing },
            { value: "completed", label: t.history.filters.completed },
            { value: "failed", label: t.history.filters.failed },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value as any)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                filter === item.value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recordings List */}
      <div className="px-4 py-4">
        {filteredRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4 opacity-50">📝</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {t.history.noRecordings}
            </h3>
            <p className="text-sm text-slate-500 mb-6">{t.history.noRecordingsDesc}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-primary"
            >
              {t.history.startRecording}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecordings.map((recording) => (
              <div
                key={recording.id}
                className="card-touchable p-4 relative"
                onClick={() => {
                  if (recording.status === "completed" && recording.transcript) {
                    router.push(`/recordings/${recording.id}`);
                  }
                }}
              >
                {/* Hide Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hideRecording(recording.id);
                  }}
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
                    {editingId === recording.id ? (
                      <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => saveTitle(recording.id)}
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
                          className="text-base font-bold text-slate-900 truncate"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingTitle(recording.id, recording.title);
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
                          <svg className="w-3 h-3 mt-0.5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span className="leading-relaxed">
                            이 페이지에서 나가셔도 자동 처리됩니다.<br />
                            완료되면 슬랙으로 알려드릴게요 :)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Error Message */}
                    {recording.status === "failed" && recording.error_message && (
                      <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg">
                        <div className="flex items-start gap-1 text-xs text-red-700">
                          <span className="font-semibold">⚠️</span>
                          {recording.error_step && (
                            <span>({getErrorStepText(recording.error_step)})</span>
                          )}
                        </div>
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">
                          {recording.error_message}
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
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Failed - Actions */}
                    {recording.status === "failed" && (
                      <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                        {recording.transcript && (
                          <button
                            onClick={() => router.push(`/recordings/${recording.id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 min-h-[36px]"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{t.history.viewTranscript}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
