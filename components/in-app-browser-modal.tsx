"use client";

import { useI18n } from "@/lib/i18n";
import { InAppBrowserType } from "@/lib/browser";

interface InAppBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
    browserType?: InAppBrowserType;
}

/**
 * iOS용 인앱 브라우저 안내 모달
 * 앱별로 Safari로 열기 안내를 다르게 표시합니다.
 */
export function InAppBrowserModal({ isOpen, onClose, browserType }: InAppBrowserModalProps) {
    const { t } = useI18n();

    if (!isOpen) return null;

    // 앱 타입에 따른 안내 텍스트 가져오기
    const getAppInstructions = () => {
        const apps = t.inAppBrowser.apps;

        switch (browserType) {
            case "kakaotalk":
                return apps.kakaotalk;
            case "instagram":
                return apps.instagram;
            case "threads":
                return apps.threads;
            case "facebook":
                return apps.facebook;
            case "linkedin":
                return apps.linkedin;
            case "line":
                return apps.line;
            case "naver":
                return apps.naver;
            case "telegram":
                return apps.telegram;
            case "twitter":
                return apps.twitter;
            default:
                return apps.default;
        }
    };

    const instructions = getAppInstructions();

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
                            {instructions.step1}{" "}
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-200 rounded text-slate-700 font-bold">
                                {instructions.icon}
                            </span>
                            {" "}{instructions.step2}
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            2
                        </span>
                        <p className="text-slate-700 pt-0.5">
                            {instructions.step3}
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
