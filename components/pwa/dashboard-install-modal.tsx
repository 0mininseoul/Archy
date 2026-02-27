"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { safeLocalStorageSetItem } from "@/lib/safe-storage";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type DeviceType = "android" | "ios-safari" | "ios-chrome" | "desktop" | "standalone";

interface DashboardPWAInstallModalProps {
  onClose: () => void;
}

export function DashboardPWAInstallModal({ onClose }: DashboardPWAInstallModalProps) {
  const { t } = useI18n();
  const [deviceType, setDeviceType] = useState<DeviceType>("desktop");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 이미 Standalone(앱 모드)인 경우 표시하지 않음
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setDeviceType("standalone");
      onClose();
      return;
    }

    // iOS standalone 모드 확인
    if ((navigator as any).standalone === true) {
      setDeviceType("standalone");
      onClose();
      return;
    }

    // OS 감지
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);

    if (isAndroid) {
      setDeviceType("android");
    } else if (isIOS) {
      if (isSafari) {
        setDeviceType("ios-safari");
      } else {
        setDeviceType("ios-chrome");
      }
    } else {
      setDeviceType("desktop");
    }

    // Android: beforeinstallprompt 이벤트 캡처
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [onClose]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        onClose();
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    // 24시간 동안 다시 표시하지 않음
    safeLocalStorageSetItem("pwa_install_dismissed", Date.now().toString(), {
      logPrefix: "DashboardPWAInstallModal",
    });
    onClose();
  };

  // standalone이면 모달 표시 안 함
  if (deviceType === "standalone") {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 animate-slide-up relative">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-primary rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">
            📱
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {t.pwaModal.title}
          </h2>
          <p className="text-[13px] tracking-tight text-slate-600 mt-2 whitespace-nowrap break-keep">
            {t.pwaModal.description}
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <svg className="w-4 h-4 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t.pwaModal.benefits.fast}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <svg className="w-4 h-4 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t.pwaModal.benefits.fullscreen}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <svg className="w-4 h-4 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t.pwaModal.benefits.offline}</span>
          </div>
        </div>

        {/* Instructions based on device type */}
        {deviceType === "android" && deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="w-full h-[54px] bg-slate-900 hover:bg-slate-800 text-white text-[16px] font-bold rounded-[18px] shadow-sm transition-colors"
          >
            {t.pwaModal.install}
          </button>
        )}

        {deviceType === "ios-safari" && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <p className="text-[13px] tracking-tight font-medium text-slate-700">
              {t.pwaModal.iosSafari.title}
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs tracking-tight text-slate-600">{t.pwaModal.iosSafari.step1}</span>
              <div className="p-2 bg-slate-800 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <span className="text-xs tracking-tight text-slate-600">→</span>
              <span className="text-xs tracking-tight text-slate-600 font-medium">{t.pwaModal.iosSafari.step2}</span>
            </div>
          </div>
        )}

        {deviceType === "ios-chrome" && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-900 border border-slate-200 flex-shrink-0">
                1
              </div>
              <div className="flex-1 flex items-center justify-between gap-2">
                <p className="text-[13px] tracking-tight leading-tight text-slate-700">
                  {t.pwaModal.iosChrome.step1}
                </p>
                <div className="p-1.5 bg-slate-800 rounded-lg flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-900 border border-slate-200 flex-shrink-0">
                2
              </div>
              <p className="text-[13px] tracking-tight text-slate-700 flex-1">
                {t.pwaModal.iosChrome.step2}
              </p>
            </div>

          </div>
        )}

        {deviceType === "desktop" && (
          <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 text-center">
            <p>{t.pwaModal.desktopMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
