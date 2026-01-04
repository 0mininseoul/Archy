"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type DeviceType = "android" | "ios-safari" | "ios-chrome" | "desktop" | "standalone";

export function PWAInstallPrompt({ onComplete }: { onComplete: () => void }) {
  const { t } = useI18n();
  const [deviceType, setDeviceType] = useState<DeviceType>("desktop");
  const [showModal, setShowModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 이미 Standalone(앱 모드)인 경우 스킵
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setDeviceType("standalone");
      return;
    }

    // iOS standalone 모드 확인
    if ((navigator as any).standalone === true) {
      setDeviceType("standalone");
      return;
    }

    // 24시간 내 닫은 적 있는지 확인
    const dismissedTime = localStorage.getItem("pwa_install_dismissed");
    if (dismissedTime) {
      const dismissed = parseInt(dismissedTime, 10);
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (now - dismissed < twentyFourHours) {
        // 24시간 이내에 닫은 적 있으면 스킵
        return;
      }
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

    setShowModal(true);

    // Android: beforeinstallprompt 이벤트 캡처
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        onComplete();
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa_install_dismissed", Date.now().toString());
    setShowModal(false);
    onComplete();
  };

  const handleSkip = () => {
    onComplete();
  };

  // Standalone이거나 표시할 필요 없으면 아무것도 렌더링하지 않음
  if (deviceType === "standalone" || !showModal) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">
          ✅
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">모든 설정이 완료되었습니다!</h2>
          <p className="text-sm text-slate-600">이제 Flownote를 사용할 준비가 되었습니다.</p>
        </div>
        <button
          onClick={onComplete}
          className="btn-primary w-full"
        >
          시작하기
        </button>
      </div>
    );
  }

  // Android - 네이티브 설치 프롬프트
  if (deviceType === "android") {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">
          📱
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">홈 화면에 추가하기</h2>
          <p className="text-sm text-slate-600">
            앱처럼 빠르게 접근하고 더 안정적으로 사용할 수 있습니다.
          </p>
        </div>

        {/* Benefits */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-left">
          <div className="space-y-2 text-xs text-green-700">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>앱처럼 빠르게 실행</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>서비스 연동이 더 안정적으로 작동</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>전체 화면으로 편리하게 사용</span>
            </div>
          </div>
        </div>

        {deferredPrompt ? (
          <button
            onClick={handleInstallClick}
            className="btn-primary w-full"
          >
            홈 화면에 추가
          </button>
        ) : (
          <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-600">
            <p>브라우저 메뉴에서 &quot;홈 화면에 추가&quot;를 선택하세요.</p>
          </div>
        )}

        <button
          onClick={handleSkip}
          className="text-sm text-slate-500 font-medium"
        >
          나중에
        </button>
      </div>
    );
  }

  // iOS Safari - 하단 공유 버튼 가이드
  if (deviceType === "ios-safari") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            📱
          </div>
          <h2 className="text-xl font-bold text-slate-900">홈 화면에 추가하기</h2>
          <p className="text-sm text-slate-600">
            앱처럼 빠르게 접근하고 더 안정적으로 사용할 수 있습니다.
          </p>
        </div>

        {/* Benefits */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
          <div className="space-y-2 text-xs text-green-700">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>앱처럼 빠르게 실행</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>서비스 연동이 더 안정적으로 작동</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>전체 화면으로 편리하게 사용</span>
            </div>
          </div>
        </div>

        {/* iOS Safari 가이드 */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg font-bold text-slate-900 border border-slate-200 flex-shrink-0">
              1
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-700 font-medium">
                화면 하단의 공유 버튼을 탭하세요
              </p>
              <div className="mt-2 flex justify-center">
                {/* iOS Share Icon */}
                <div className="p-2 bg-blue-500 rounded-lg animate-bounce-arrow">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg font-bold text-slate-900 border border-slate-200 flex-shrink-0">
              2
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-700 font-medium">
                "홈 화면에 추가"를 선택하세요
              </p>
              <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200 inline-flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-slate-700">홈 화면에 추가</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 text-slate-500 font-medium text-sm"
          >
            나중에
          </button>
          <button
            onClick={handleSkip}
            className="flex-1 btn-primary"
          >
            완료
          </button>
        </div>
      </div>
    );
  }

  // iOS Chrome/기타 브라우저 - 상단 우측 공유 버튼 가이드
  if (deviceType === "ios-chrome") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            📱
          </div>
          <h2 className="text-xl font-bold text-slate-900">홈 화면에 추가하기</h2>
          <p className="text-sm text-slate-600">
            앱처럼 빠르게 접근하고 더 안정적으로 사용할 수 있습니다.
          </p>
        </div>

        {/* Benefits */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
          <div className="space-y-2 text-xs text-green-700">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>앱처럼 빠르게 실행</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>서비스 연동이 더 안정적으로 작동</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>전체 화면으로 편리하게 사용</span>
            </div>
          </div>
        </div>

        {/* iOS Chrome 가이드 */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg font-bold text-slate-900 border border-slate-200 flex-shrink-0">
              1
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-700 font-medium">
                화면 상단 우측의 공유 버튼을 탭하세요
              </p>
              <div className="mt-2 flex justify-end">
                {/* Top right arrow indicator */}
                <div className="p-2 bg-blue-500 rounded-lg animate-bounce-arrow">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg font-bold text-slate-900 border border-slate-200 flex-shrink-0">
              2
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-700 font-medium">
                "홈 화면에 추가"를 선택하세요
              </p>
              <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200 inline-flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-slate-700">홈 화면에 추가</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Tip:</strong> Safari에서 열면 더 쉽게 추가할 수 있습니다!
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 text-slate-500 font-medium text-sm"
          >
            나중에
          </button>
          <button
            onClick={handleSkip}
            className="flex-1 btn-primary"
          >
            완료
          </button>
        </div>
      </div>
    );
  }

  // Desktop - 기본 안내
  return (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">
        💻
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-900">모바일에서 더 편리하게!</h2>
        <p className="text-sm text-slate-600">
          스마트폰에서 Flownote를 열어 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.
        </p>
      </div>
      <button
        onClick={handleSkip}
        className="btn-primary w-full"
      >
        시작하기
      </button>
    </div>
  );
}
