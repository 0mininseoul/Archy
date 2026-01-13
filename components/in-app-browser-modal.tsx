"use client";

import { useI18n } from "@/lib/i18n";

interface InAppBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * iOS용 인앱 브라우저 안내 모달
 * Safari로 열기 안내를 표시합니다.
 */
export function InAppBrowserModal({ isOpen, onClose }: InAppBrowserModalProps) {
    const { t } = useI18n();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl animate-fade-in">
                {/* 제목 */}
                <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
                    {t.inAppBrowser.title}
                </h2>

                {/* 설명 */}
                <p className="text-slate-600 text-center whitespace-pre-line mb-6">
                    {t.inAppBrowser.description}
                </p>

                {/* 안내 단계 */}
                <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-4">
                    {/* Step 1 */}
                    <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            1
                        </span>
                        <p className="text-slate-700 pt-0.5">
                            {t.inAppBrowser.step1}{" "}
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-200 rounded">
                                <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-4-6l-4-4m0 0l-4 4m4-4v13" />
                                </svg>
                            </span>
                            {" "}{t.inAppBrowser.step2}
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            2
                        </span>
                        <p className="text-slate-700 pt-0.5">
                            {t.inAppBrowser.step3}
                        </p>
                    </div>
                </div>

                {/* 확인 버튼 */}
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
                >
                    {t.inAppBrowser.confirm}
                </button>
            </div>
        </div>
    );
}
