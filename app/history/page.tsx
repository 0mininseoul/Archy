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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">녹음 히스토리</h1>
            </div>

            <button
              onClick={() => router.push("/settings")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { value: "all", label: "전체" },
            { value: "processing", label: "처리중" },
            { value: "completed", label: "완료" },
            { value: "failed", label: "실패" },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === item.value
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Recordings List */}
        {loading ? (
          <div className="glass-card p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              녹음이 없습니다
            </h3>
            <p className="text-gray-600 mb-6">첫 녹음을 시작해보세요!</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="glass-button"
            >
              녹음 시작하기
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecordings.map((recording) => (
              <div key={recording.id} className="glass-card p-4 md:p-6">
                <div className="flex items-start gap-3 md:gap-4">
                  {/* Icon */}
                  <div className="text-3xl md:text-4xl flex-shrink-0">{getFormatEmoji(recording.format)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 md:gap-4">
                      <div className="flex-1 min-w-0">
                        {editingId === recording.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-indigo-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm md:text-base"
                              placeholder="제목을 입력하세요"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveTitle(recording.id)}
                                className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition-colors"
                              >
                                저장
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <h3
                            className="text-base md:text-lg font-semibold text-gray-800 truncate cursor-pointer hover:text-indigo-600 transition-colors"
                            onClick={() => startEditingTitle(recording.id, recording.title)}
                            title="클릭하여 수정"
                          >
                            {recording.title}
                          </h3>
                        )}
                        <div className="flex items-center gap-2 md:gap-3 mt-1 text-xs md:text-sm text-gray-600 flex-wrap">
                          <span>
                            {getStatusIcon(recording.status)} {getStatusText(recording.status)}
                          </span>
                          <span>•</span>
                          <span>{formatDurationMinutes(recording.duration_seconds)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <button
                        onClick={() => deleteRecording(recording.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors flex-shrink-0"
                        title="삭제"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Error Message */}
                    {recording.status === "failed" && recording.error_message && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="text-red-600 text-xs md:text-sm font-semibold">
                            ⚠️ 오류 발생
                          </span>
                          {recording.error_step && (
                            <span className="text-red-600 text-xs md:text-sm">
                              ({getErrorStepText(recording.error_step)})
                            </span>
                          )}
                        </div>
                        <p className="text-red-700 text-xs md:text-sm mt-1">
                          {recording.error_message}
                        </p>
                      </div>
                    )}

                    {/* Links */}
                    {recording.status === "completed" && (
                      <div className="flex gap-2 mt-4 flex-wrap">
                        {recording.notion_page_url && (
                          <a
                            href={recording.notion_page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            📔 Notion에서 보기
                          </a>
                        )}
                        <button
                          onClick={() => router.push(`/recordings/${recording.id}`)}
                          className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          상세 보기
                        </button>
                      </div>
                    )}

                    {/* Show detail button even for failed recordings if transcript exists */}
                    {recording.status === "failed" && recording.transcript && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => router.push(`/recordings/${recording.id}`)}
                          className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          전사본 보기
                        </button>
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
