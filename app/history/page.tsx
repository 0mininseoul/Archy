"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Recording } from "@/types";
import { formatDurationMinutes, formatKSTDate } from "@/lib/utils";

export default function HistoryPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");

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
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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
              <h1 className="text-2xl font-bold text-gray-800">녹음 히스토리</h1>
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
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {[
            { value: "all", label: "전체" },
            { value: "processing", label: "처리중" },
            { value: "completed", label: "완료" },
            { value: "failed", label: "실패" },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
              <div key={recording.id} className="glass-card p-6">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="text-4xl">{getFormatEmoji(recording.format)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-800 truncate">
                          {recording.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                          <span>
                            {getStatusIcon(recording.status)} {getStatusText(recording.status)}
                          </span>
                          <span>•</span>
                          <span>{formatDurationMinutes(recording.duration_seconds)}</span>
                          <span>•</span>
                          <span>
                            {formatKSTDate(new Date(recording.created_at))}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <button
                        onClick={() => deleteRecording(recording.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
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

                    {/* Links */}
                    {recording.status === "completed" && (
                      <div className="flex gap-2 mt-4">
                        {recording.notion_page_url && (
                          <a
                            href={recording.notion_page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            📔 Notion에서 보기
                          </a>
                        )}
                        <button
                          onClick={() => router.push(`/recordings/${recording.id}`)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          상세 보기
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
