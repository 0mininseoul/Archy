"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Recording } from "@/types";
import { formatDurationMinutes } from "@/lib/utils";

export default function HistoryPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    try {
      const response = await fetch("/api/recordings");
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecording = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setRecordings(recordings.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete recording:", error);
      alert("삭제에 실패했습니다.");
    }
  };

  const startEditingTitle = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveTitle = async (id: string) => {
    if (!editingTitle.trim()) {
      alert("제목을 입력해주세요.");
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
      alert("제목 수정에 실패했습니다.");
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

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "처리 완료";
      case "processing":
        return "처리 중...";
      case "failed":
        return "처리 실패";
      default:
        return "대기 중";
    }
  };

  const getErrorStepText = (errorStep?: string) => {
    switch (errorStep) {
      case "transcription":
        return "음성 전사 단계";
      case "formatting":
        return "AI 포맷팅 단계";
      case "notion":
        return "Notion 연동 단계";
      case "slack":
        return "Slack 알림 단계";
      case "upload":
        return "파일 업로드 단계";
      default:
        return "알 수 없는 단계";
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container-custom h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push("/dashboard")}>
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold">
              F
            </div>
            <span className="text-xl font-bold text-slate-900">Flownote</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Dashboard"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container-custom py-8 flex-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Recording History</h1>

          {/* Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {[
              { value: "all", label: "All" },
              { value: "processing", label: "Processing" },
              { value: "completed", label: "Completed" },
              { value: "failed", label: "Failed" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value as any)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${filter === item.value
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recordings List */}
        {loading ? (
          <div className="card p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
            <p className="text-slate-500">Loading recordings...</p>
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="text-6xl mb-6 opacity-50">📝</div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              No recordings found
            </h3>
            <p className="text-slate-500 mb-8">Start your first recording to see it here.</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-primary"
            >
              Start Recording
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRecordings.map((recording) => (
              <div key={recording.id} className="card p-6 hover:border-slate-300 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl flex-shrink-0">
                    {getFormatEmoji(recording.format)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1">
                        {editingId === recording.id ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                              placeholder="Enter title"
                              autoFocus
                            />
                            <button
                              onClick={() => saveTitle(recording.id)}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <h3
                            className="text-lg font-bold text-slate-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => startEditingTitle(recording.id, recording.title)}
                            title="Click to edit"
                          >
                            {recording.title}
                          </h3>
                        )}
                        <div className="flex items-center gap-3 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            {getStatusIcon(recording.status)} {getStatusText(recording.status)}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span>{formatDurationMinutes(recording.duration_seconds)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {recording.status === "completed" && (
                          <>
                            {recording.notion_page_url && (
                              <a
                                href={recording.notion_page_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
                              >
                                <span>Notion</span>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                            <button
                              onClick={() => router.push(`/recordings/${recording.id}`)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
                            >
                              Details
                            </button>
                          </>
                        )}

                        {recording.status === "failed" && recording.transcript && (
                          <button
                            onClick={() => router.push(`/recordings/${recording.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
                          >
                            View Transcript
                          </button>
                        )}

                        <button
                          onClick={() => deleteRecording(recording.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Audio Player */}
                    {recording.audio_url && (
                      <div className="mt-4 bg-slate-50 rounded-lg p-2">
                        <audio
                          controls
                          className="w-full h-8"
                          preload="metadata"
                          style={{ maxWidth: "100%" }}
                        >
                          <source src={recording.audio_url} type="audio/webm" />
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    {/* Error Message */}
                    {recording.status === "failed" && recording.error_message && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                        <div className="flex items-start gap-2">
                          <span className="text-red-600 font-semibold text-sm">
                            ⚠️ Error
                          </span>
                          {recording.error_step && (
                            <span className="text-red-500 text-sm">
                              ({getErrorStepText(recording.error_step)})
                            </span>
                          )}
                        </div>
                        <p className="text-red-700 text-sm mt-1">
                          {recording.error_message}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
