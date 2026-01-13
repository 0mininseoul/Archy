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
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
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
