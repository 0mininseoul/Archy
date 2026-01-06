"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function WithdrawPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const handleWithdraw = async () => {
    setIsLoading(true);
    try {
      // 모든 데이터 삭제 후 계정 삭제
      const response = await fetch("/api/user/withdraw", {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/settings/contact/withdraw/complete");
      } else {
        throw new Error("Failed to withdraw");
      }
    } catch (error) {
      console.error("Withdraw error:", error);
      alert("탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 text-slate-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-slate-900">
          {t.settings.contactPage.withdraw}
        </h1>
        <div className="w-9" />
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-6 flex flex-col items-center justify-center min-h-[calc(100vh-56px-64px)]">
        <div className="w-full max-w-sm space-y-6 text-center">
          {/* Emoji and Title */}
          <div className="space-y-3">
            <div className="text-5xl">😢</div>
            <h2 className="text-xl font-bold text-slate-900">
              {t.settings.withdrawPage.title}
            </h2>
            <p className="text-sm text-slate-600">
              {t.settings.withdrawPage.description}
            </p>
          </div>

          {/* Warning Box */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
            <p className="text-sm font-bold text-amber-800 mb-2">
              {t.settings.withdrawPage.warning}
            </p>
            <ul className="space-y-1.5">
              {t.settings.withdrawPage.warningItems.map((item: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-xs text-amber-700">
                  <span className="mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleWithdraw}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-red-500 text-white rounded-xl font-medium text-sm min-h-[44px] disabled:opacity-50"
            >
              {isLoading ? "처리 중..." : t.settings.withdrawPage.confirmButton}
            </button>
            <button
              onClick={() => router.back()}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm min-h-[44px] disabled:opacity-50"
            >
              {t.settings.withdrawPage.cancelButton}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
