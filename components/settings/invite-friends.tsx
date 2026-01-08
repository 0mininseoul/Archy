"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";

declare global {
  interface Window {
    Kakao: any;
  }
}

export function InviteFriends() {
  const { t } = useI18n();
  const [referralCode, setReferralCode] = useState<string>("");
  const [bonusMinutes, setBonusMinutes] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [kakaoLoaded, setKakaoLoaded] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    // 레퍼럴 코드 가져오기
    const fetchReferralCode = async () => {
      try {
        const response = await fetch("/api/user/referral");
        if (response.ok) {
          const data = await response.json();
          setReferralCode(data.referralCode || "");
          setBonusMinutes(data.bonusMinutes || 0);
        }
      } catch (error) {
        console.error("Failed to fetch referral code:", error);
      }
    };
    fetchReferralCode();

    // Kakao SDK 로드
    const loadKakaoSDK = () => {
      if (window.Kakao) {
        if (!window.Kakao.isInitialized()) {
          const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
          if (kakaoKey) {
            window.Kakao.init(kakaoKey);
            setKakaoLoaded(true);
          }
        } else {
          setKakaoLoaded(true);
        }
      }
    };

    if (typeof window !== "undefined") {
      if (window.Kakao) {
        loadKakaoSDK();
      } else {
        const script = document.createElement("script");
        script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.5.0/kakao.min.js";
        script.async = true;
        script.onload = loadKakaoSDK;
        document.head.appendChild(script);
      }
    }
  }, []);

  const shareMessage = `나 요즘 이 앱으로 회의 녹음하면 자동으로 요약해주더라! 한번 써봐 👉 ${appUrl}\n\n내 추천 코드: ${referralCode}\n코드 입력하면 너도 나도 350분 추가 사용 가능!`;

  const handleKakaoShare = () => {
    if (!kakaoLoaded || !window.Kakao) {
      alert("카카오톡 공유를 사용할 수 없습니다.");
      return;
    }

    window.Kakao.Share.sendDefault({
      objectType: "text",
      text: shareMessage,
      link: {
        mobileWebUrl: appUrl,
        webUrl: appUrl,
      },
      buttons: [
        {
          title: "앱 열기",
          link: {
            mobileWebUrl: appUrl,
            webUrl: appUrl,
          },
        },
      ],
    });
  };

  const handleCopyForInstagram = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // 인스타그램 앱이 있으면 열기 시도
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);

      if (isIOS || isAndroid) {
        // 잠시 후 인스타그램 DM 페이지로 이동 시도
        setTimeout(() => {
          window.location.href = "instagram://direct-inbox";
        }, 500);
      }
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="text-base font-bold text-slate-900 mb-1">
        {t.settings.invite.title}
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        {t.settings.invite.description}
      </p>

      {/* 레퍼럴 코드 표시 */}
      <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-indigo-600 font-medium mb-1">
              {t.settings.invite.myCode}
            </p>
            <p className="text-lg font-bold text-indigo-900 tracking-wider">
              {referralCode || "Loading..."}
            </p>
          </div>

        </div>
      </div>

      {/* 공유 버튼들 */}
      <div className="grid grid-cols-2 gap-2">
        {/* 카카오톡 */}
        <button
          onClick={handleKakaoShare}
          className="flex items-center justify-center gap-2 p-3 bg-[#FEE500] text-[#3C1E1E] rounded-xl font-medium text-sm min-h-[48px] transition-all active:scale-95"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.48 3 2 6.48 2 10.5c0 2.55 1.59 4.8 4 6.15v3.6c0 .45.45.75.9.6l3.3-1.65c.6.15 1.2.3 1.8.3 5.52 0 10-3.48 10-7.5S17.52 3 12 3z" />
          </svg>
          <span>{t.settings.invite.kakao}</span>
        </button>

        {/* 인스타그램 (복사) */}
        <button
          onClick={handleCopyForInstagram}
          className="flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white rounded-xl font-medium text-sm min-h-[48px] transition-all active:scale-95"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
          <span>{copied ? t.settings.invite.copied : t.settings.invite.instagram}</span>
        </button>
      </div>

      <p className="text-[10px] text-slate-400 text-center mt-3">
        {t.settings.invite.hint}
      </p>
    </div>
  );
}
