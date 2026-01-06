"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

type OnboardingStep = 1 | 2;

function OnboardingContent() {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralStatus, setReferralStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [referralMessage, setReferralMessage] = useState("");
  const router = useRouter();
  const { t } = useI18n();

  const handleApplyReferral = async () => {
    if (!referralCode.trim()) return;

    setReferralStatus("loading");
    try {
      const response = await fetch("/api/user/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: referralCode.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (response.ok) {
        setReferralStatus("success");
        setReferralMessage(t.onboarding.step1.referralSuccess);
      } else {
        setReferralStatus("error");
        if (data.error === "Already referred") {
          setReferralMessage(t.onboarding.step1.referralAlreadyUsed);
        } else {
          setReferralMessage(t.onboarding.step1.referralError);
        }
      }
    } catch (error) {
      setReferralStatus("error");
      setReferralMessage(t.onboarding.step1.referralError);
    }
  };

  // Step 2에 진입하면 온보딩 완료 처리
  useEffect(() => {
    if (step === 2) {
      markOnboardingComplete();
    }
  }, [step]);

  const markOnboardingComplete = async () => {
    try {
      await fetch("/api/user/onboarding", {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    }
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  return (
    <div className="app-container !overflow-y-auto">
      <main className="flex-1 flex flex-col items-center px-4 py-4">
        <div className="w-full max-w-sm space-y-3 flex-1 flex flex-col">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                    step >= num
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {num}
                </div>
                {num < 2 && (
                  <div
                    className={`w-8 h-0.5 mx-1 rounded-full transition-all duration-300 ${
                      step > num ? "bg-slate-900" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="card p-5 animate-slide-up flex-1 flex flex-col">
            {step === 1 && (
              <div className="space-y-5 text-center flex-1 flex flex-col justify-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mx-auto">
                  👋
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-slate-900">
                    {t.onboarding.step1.title}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {t.onboarding.step1.description}
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {t.onboarding.step1.getStarted}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>

                {/* Referral Code Section */}
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowReferralInput(!showReferralInput)}
                    className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mx-auto"
                  >
                    {t.onboarding.step1.referralQuestion}
                    <svg
                      className={`w-4 h-4 transition-transform ${showReferralInput ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showReferralInput && (
                    <div className="mt-3 space-y-2 animate-fade-in">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          placeholder={t.onboarding.step1.referralPlaceholder}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent uppercase"
                          maxLength={8}
                          disabled={referralStatus === "success" || referralStatus === "loading"}
                        />
                        <button
                          onClick={handleApplyReferral}
                          disabled={!referralCode.trim() || referralStatus === "success" || referralStatus === "loading"}
                          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                        >
                          {referralStatus === "loading" ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            t.onboarding.step1.referralApply
                          )}
                        </button>
                      </div>

                      {referralMessage && (
                        <p className={`text-xs ${referralStatus === "success" ? "text-green-600" : "text-red-500"}`}>
                          {referralMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex-1 flex flex-col">
                {/* Content area - vertically centered */}
                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-xl mx-auto mb-2">
                      ✨
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t.onboarding.step2.title}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {t.onboarding.step2.description}
                    </p>
                  </div>

                  {/* Feature Cards */}
                  <div className="space-y-2">
                    {/* Auto Format Detection */}
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
                          🎯
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm">{t.onboarding.step2.autoFormat.title}</h3>
                          <p className="text-xs text-slate-500 leading-tight mt-0.5">
                            {t.onboarding.step2.autoFormat.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Integrations */}
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
                          🔗
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm">{t.onboarding.step2.integrations.title}</h3>
                          <p className="text-xs text-slate-500 leading-tight mt-0.5">
                            {t.onboarding.step2.integrations.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[11px] text-slate-600">Notion</span>
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[11px] text-slate-600">Google Docs</span>
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[11px] text-slate-600">Slack</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Custom Formats */}
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-100 to-amber-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
                          📝
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm">{t.onboarding.step2.customFormat.title}</h3>
                          <p className="text-xs text-slate-500 leading-tight mt-0.5">
                            {t.onboarding.step2.customFormat.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Settings Guide */}
                    <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-xs text-blue-700 leading-tight">
                        <strong>💡</strong> {t.onboarding.step2.settingsTip}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Buttons - fixed at bottom */}
                <div className="flex gap-3 mt-4 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="py-2.5 px-4 text-slate-500 font-medium text-sm min-h-[44px]"
                  >
                    {t.common.back}
                  </button>
                  <button
                    onClick={handleComplete}
                    className="flex-1 btn-primary"
                  >
                    시작하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="app-container">
        <main className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
        </main>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
