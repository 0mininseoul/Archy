"use client";

import { useI18n } from "@/lib/i18n";

interface RecordingGuideModalProps {
  isOpen: boolean;
  pushPermissionDenied: boolean;
  onConfirm: () => void;
  onRequestPushPermission: () => void;
  onClose: () => void;
}

export function RecordingGuideModal({
  isOpen,
  pushPermissionDenied,
  onConfirm,
  onRequestPushPermission,
  onClose,
}: RecordingGuideModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-slide-up">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {t.recordingGuide?.title || "녹음을 시작합니다"}
          </h3>
        </div>

        {/* 안내 내용 */}
        <div className="space-y-4 mb-6">
          {/* 화면 유지 안내 */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-700 font-medium">
                {t.recordingGuide?.keepScreen || "녹음 중에는 화면을 유지해 주세요."}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.recordingGuide?.keepScreenDesc || "홈 화면이나 다른 앱으로 이동하면 녹음이 일시정지됩니다."}
              </p>
            </div>
          </div>

          {/* 스텔스 모드 안내 */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-700 font-medium">
                {t.recordingGuide?.stealthMode || "화면이 자동으로 어두워집니다."}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.recordingGuide?.stealthModeDesc || '화면을 "두 번" 탭하면 다시 밝아집니다.'}
              </p>
            </div>
          </div>

          {/* 푸시알림 거부 경고 */}
          {pushPermissionDenied && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm text-amber-800 font-medium">
                  {t.recordingGuide?.pushDenied || "알림이 꺼져 있어 녹음 중단 시 알려드릴 수 없습니다."}
                </p>
                <button
                  onClick={onRequestPushPermission}
                  className="mt-2 text-xs text-amber-700 font-semibold hover:underline"
                >
                  {t.recordingGuide?.enablePush || "알림 켜기"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-xl transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors"
          >
            {t.recordingGuide?.confirm || "확인하고 녹음 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}
