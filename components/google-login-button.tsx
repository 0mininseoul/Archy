"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { isInAppBrowser, isAndroid, openExternalBrowser } from "@/lib/browser";
import { InAppBrowserModal } from "@/components/in-app-browser-modal";

interface GoogleLoginButtonProps {
  variant?: "nav" | "primary" | "cta";
}

export function GoogleLoginButton({ variant = "nav" }: GoogleLoginButtonProps) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const [showInAppModal, setShowInAppModal] = useState(false);

  const handleLogin = async () => {
    // 인앱 브라우저 감지
    if (isInAppBrowser()) {
      if (isAndroid()) {
        // Android: 자동으로 외부 브라우저로 리다이렉트
        openExternalBrowser();
        return;
      } else {
        // iOS: 안내 모달 표시
        setShowInAppModal(true);
        return;
      }
    }

    // 일반 브라우저: 기존 로직
    const supabase = createClient();

    // Include locale in redirectTo to preserve language preference
    // Don't specify 'next' - let auth callback determine based on user status (new vs existing)
    let redirectTo = `${window.location.origin}/api/auth/callback?locale=${locale}`;

    // Include promo code if present in URL
    const promoCode = searchParams.get("promo");
    if (promoCode) {
      redirectTo += `&promo=${encodeURIComponent(promoCode)}`;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  };

  const getButtonClass = () => {
    switch (variant) {
      case "primary":
        return "btn-primary";
      case "cta":
        return "inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 bg-white text-slate-900 rounded-xl font-bold text-base sm:text-lg hover:bg-slate-100 transition-all shadow-lg min-h-[48px]";
      default:
        return "btn-nav";
    }
  };

  // nav: "시작하기", cta/primary: "무료로 시작하기"
  const buttonText = variant === "nav" ? t.auth.signInWithGoogle : t.auth.getStarted;

  return (
    <>
      <button onClick={handleLogin} className={getButtonClass()}>
        {buttonText}
      </button>

      {/* iOS 인앱 브라우저 안내 모달 */}
      <InAppBrowserModal
        isOpen={showInAppModal}
        onClose={() => setShowInAppModal(false)}
      />
    </>
  );
}
