"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function SafariGuidePage() {
  const { t } = useI18n();
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 로그인 페이지 URL 설정
    setCurrentUrl(`${window.location.origin}`);
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
              F
            </div>
            <span className="text-lg font-bold text-slate-900">Flownote</span>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Safari Icon */}
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2"/>
                <path d="M12 2C12 2 14.5 5 14.5 12C14.5 19 12 22 12 22" stroke="#3B82F6" strokeWidth="1.5"/>
                <path d="M12 2C12 2 9.5 5 9.5 12C9.5 19 12 22 12 22" stroke="#3B82F6" strokeWidth="1.5"/>
                <path d="M2 12H22" stroke="#3B82F6" strokeWidth="1.5"/>
                <path d="M4 7H20" stroke="#3B82F6" strokeWidth="1"/>
                <path d="M4 17H20" stroke="#3B82F6" strokeWidth="1"/>
                <polygon points="12,6 8,16 12,14 16,16" fill="#3B82F6"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">
              {t.safariGuide.title}
            </h1>
            <p className="text-sm text-slate-600">
              {t.safariGuide.description}
            </p>
          </div>

          {/* Benefits */}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-sm font-medium text-green-800 mb-3">
              {t.safariGuide.benefits.title}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.safariGuide.benefits.integration}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.safariGuide.benefits.pwa}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.safariGuide.benefits.fullscreen}</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-4">
            <p className="text-sm font-medium text-slate-800">
              {t.safariGuide.instructions.title}
            </p>

            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-900 border border-slate-200 flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-700">
                  {t.safariGuide.instructions.step1}
                </p>
                <div className="mt-2">
                  <button
                    onClick={handleCopyUrl}
                    className="w-full p-3 bg-white rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 transition-colors group"
                  >
                    <p className="text-xs text-slate-500 mb-1">
                      {t.safariGuide.instructions.longPress}
                    </p>
                    <p className="text-sm font-medium text-blue-600 break-all">
                      {currentUrl || "flownoteforu.vercel.app"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 group-hover:text-blue-500">
                      {copied ? t.safariGuide.instructions.copied : t.safariGuide.instructions.tapToCopy}
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-900 border border-slate-200 flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-700">
                  {t.safariGuide.instructions.step2}
                </p>
                <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200 inline-flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <polygon points="12,6 8,16 12,14 16,16" fill="currentColor"/>
                  </svg>
                  <span className="text-sm text-slate-700">{t.safariGuide.instructions.openInSafari}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alternative: Continue in Chrome */}
          <div className="text-center pt-2">
            <a
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              {t.safariGuide.continueInChrome}
            </a>
            <p className="text-xs text-slate-400 mt-1">
              {t.safariGuide.limitedFeatures}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
