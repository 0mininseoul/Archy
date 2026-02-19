"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface DesktopLoginNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOBILE_SERVICE_URL = "https://www.archynotes.com";

export function DesktopLoginNoticeModal({ isOpen, onClose }: DesktopLoginNoticeModalProps) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(MOBILE_SERVICE_URL);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = MOBILE_SERVICE_URL;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopyState("copied");
    } catch (error) {
      console.error("[DesktopLoginNoticeModal] Failed to copy link:", error);
      setCopyState("failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl animate-slide-up">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">
          💻
        </div>

        <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
          {t.desktopLoginNotice.title}
        </h2>

        <p className="text-slate-600 text-sm text-center whitespace-pre-line mb-4">
          {t.desktopLoginNotice.description}
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center mb-4">
          <span className="text-sm font-medium text-slate-700 break-all">
            {MOBILE_SERVICE_URL}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
        >
          {copyState === "copied" ? t.desktopLoginNotice.copySuccess : t.desktopLoginNotice.copy}
        </button>

        {copyState === "failed" && (
          <p className="text-xs text-red-500 text-center mt-2">
            {t.desktopLoginNotice.copyFailed}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors mt-2"
        >
          {t.desktopLoginNotice.close}
        </button>
      </div>
    </div>
  );
}
