"use client";

import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";

interface GoogleLoginButtonProps {
  variant?: "nav" | "primary" | "cta";
}

// iOS Chrome 감지 함수
function isIOSChrome(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isChrome = /CriOS/i.test(ua); // iOS Chrome은 CriOS로 표시됨

  return isIOS && isChrome;
}

export function GoogleLoginButton({ variant = "nav" }: GoogleLoginButtonProps) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const handleLogin = async () => {
    // iOS Chrome인 경우 Safari 안내 페이지로 이동
    if (isIOSChrome()) {
      router.push("/safari-guide");
      return;
    }

    const supabase = createClient();

    // Include locale in redirectTo to preserve language preference
    // Don't specify 'next' - let auth callback determine based on user status (new vs existing)
    const redirectTo = `${window.location.origin}/api/auth/callback?locale=${locale}`;

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
    <button onClick={handleLogin} className={getButtonClass()}>
      {buttonText}
    </button>
  );
}
