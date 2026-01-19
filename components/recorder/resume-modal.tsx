"use client";

import { useI18n } from "@/lib/i18n";
import { formatDuration } from "@/lib/utils";
import { RecordingSession } from "@/hooks/useChunkedRecorder";

interface ResumeModalProps {
  isOpen: boolean;
  session: RecordingSession | null;
  onResume: () => void;
  onSaveHere: () => void;
  onDiscard: () => void;
}

export function ResumeModal({
  isOpen,
  session,
  onResume,
  onSaveHere,
  onDiscard,
}: ResumeModalProps) {
  const { t } = useI18n();

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-slide-up">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {t.resumeModal?.title || "녹음이 일시정지되었습니다"}
          </h3>
        </div>

        {/* 녹음 시간 표시 */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-slate-500 mb-1">
            {t.resumeModal?.recordedSoFar || "현재까지 녹음"}
          </p>
          <p className="text-3xl font-bold text-slate-900 font-mono">
            {formatDuration(session.duration)}
          </p>
        </div>

        {/* 버튼들 */}
        <div className="space-y-3">
          {/* 이어서 녹음 */}
          <button
            onClick={onResume}
            className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            {t.resumeModal?.resume || "이어서 녹음"}
          </button>

          {/* 여기까지만 저장 */}
          <button
            onClick={onSaveHere}
            className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            {t.resumeModal?.saveHere || "여기까지만 저장"}
          </button>

          {/* 취소 */}
          <button
            onClick={onDiscard}
            className="w-full py-3.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            {t.resumeModal?.discard || "녹음 취소"}
          </button>
        </div>
      </div>
    </div>
  );
}
