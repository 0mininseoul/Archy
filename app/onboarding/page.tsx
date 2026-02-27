"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as amplitude from "@amplitude/analytics-browser";
import { useI18n } from "@/lib/i18n";
import { DesktopLoginNoticeModal } from "@/components/desktop-login-notice-modal";
import { consumeDesktopLoginNoticeEligibility } from "@/lib/desktop-login-notice";

type OnboardingStep = 1 | 2;

interface PromoStatus {
  isPro: boolean;
  daysRemaining: number | null;
}

interface ConsentState {
  age14: boolean;
  terms: boolean;
  privacy: boolean;
  serviceQuality: boolean;
  marketing: boolean;
}

function OnboardingContent() {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [showDesktopLoginNotice, setShowDesktopLoginNotice] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralStatus, setReferralStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [referralMessage, setReferralMessage] = useState("");
  const [consents, setConsents] = useState<ConsentState>({
    age14: false,
    terms: false,
    privacy: false,
    serviceQuality: false,
    marketing: false,
  });
  const [consentStatus, setConsentStatus] = useState<"idle" | "loading" | "error">("idle");
  const [consentError, setConsentError] = useState("");
  const [promoStatus, setPromoStatus] = useState<PromoStatus | null>(null);
  const hasTrackedSignupCompletionRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const requiredConsentsChecked = consents.age14 && consents.terms && consents.privacy;
  const allConsentsChecked = requiredConsentsChecked && consents.serviceQuality && consents.marketing;

  // Check if user has promo applied (from signup link)
  useEffect(() => {
    if (consumeDesktopLoginNoticeEligibility()) {
      setShowDesktopLoginNotice(true);
    }
  }, []);

  useEffect(() => {
    const signupStatus = searchParams.get("signup");
    if (signupStatus !== "completed" || hasTrackedSignupCompletionRef.current) {
      return;
    }

    hasTrackedSignupCompletionRef.current = true;

    try {
      amplitude.track("signup_completed", {
        signup_method: "google_oauth",
        completion_entry: "onboarding",
        path: window.location.pathname,
      });
    } catch {
      console.warn("[Amplitude] Failed to track signup_completed");
    }

    const cleanedParams = new URLSearchParams(searchParams.toString());
    cleanedParams.delete("signup");
    const nextUrl = cleanedParams.toString()
      ? `/onboarding?${cleanedParams.toString()}`
      : "/onboarding";
    router.replace(nextUrl, { scroll: false });
  }, [router, searchParams]);

  // Check if user has promo applied (from signup link)
  useEffect(() => {
    const checkPromoStatus = async () => {
      try {
        const response = await fetch("/api/promo/status");
        if (response.ok) {
          const data = await response.json();
          if (data.data?.isPro) {
            setPromoStatus(data.data);
          }
        }
      } catch (error) {
        console.error("Failed to check promo status:", error);
      }
    };
    checkPromoStatus();
  }, []);

  const toggleConsent = (key: keyof ConsentState) => {
    setConsentError("");
    setConsentStatus("idle");
    setConsents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllConsents = () => {
    setConsentError("");
    setConsentStatus("idle");
    const shouldCheckAll = !allConsentsChecked;
    setConsents({
      age14: shouldCheckAll,
      terms: shouldCheckAll,
      privacy: shouldCheckAll,
      serviceQuality: shouldCheckAll,
      marketing: shouldCheckAll,
    });
  };

  const handleConsentNext = async () => {
    if (!requiredConsentsChecked) return;

    setConsentStatus("loading");
    setConsentError("");

    try {
      const response = await fetch("/api/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age14: consents.age14,
          terms: consents.terms,
          privacy: consents.privacy,
          serviceQualityOptIn: consents.serviceQuality,
          marketingOptIn: consents.marketing,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save consents");
      }

      setConsentStatus("idle");
      setStep(2);
    } catch {
      setConsentStatus("error");
      setConsentError(t.onboarding.step1.saveFailed);
    }
  };

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
        setReferralMessage(t.onboarding.step2.referralSuccess);
      } else {
        setReferralStatus("error");
        switch (data.code) {
          case "INVALID_FORMAT":
            setReferralMessage(t.onboarding.step2.referralInvalidFormat);
            break;
          case "ALREADY_USED":
            setReferralMessage(t.onboarding.step2.referralAlreadyUsed);
            break;
          case "SELF_REFERRAL":
            setReferralMessage(t.onboarding.step2.referralSelf);
            break;
          case "NOT_FOUND":
            setReferralMessage(t.onboarding.step2.referralNotFound);
            break;
          default:
            setReferralMessage(t.onboarding.step2.referralError);
        }
      }
    } catch {
      setReferralStatus("error");
      setReferralMessage(t.onboarding.step2.referralError);
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
      <main className="flex-1 flex flex-col items-center px-4 py-4 font-pretendard">
        <div className="w-full max-w-sm space-y-3 flex-1 flex flex-col">
          {/* Pro Promo Applied Banner */}
          {promoStatus?.isPro && (
            <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎉</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-900">
                    {t.onboarding.promoApplied}
                  </p>
                  {promoStatus.daysRemaining && (
                    <p className="text-xs text-purple-600 mt-0.5">
                      {t.onboarding.promoExpires.replace("{days}", String(promoStatus.daysRemaining))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${step >= num
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-400"
                    }`}
                >
                  {num}
                </div>
                {num < 2 && (
                  <div
                    className={`w-8 h-0.5 mx-1 rounded-full transition-all duration-300 ${step > num ? "bg-slate-900" : "bg-slate-200"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="animate-slide-up flex-1 flex flex-col px-1">
            {step === 1 && (
              <div className="flex-1 flex flex-col">
                <button
                  onClick={() => router.push("/")}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label={t.common.back}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="mt-5 space-y-2">
                  <h2 className="text-3xl font-bold text-slate-900">{t.onboarding.step1.title}</h2>
                  <p className="text-base text-slate-400">{t.onboarding.step1.description}</p>
                </div>

                <button
                  onClick={toggleAllConsents}
                  className="w-full mt-8 bg-slate-100 rounded-2xl px-4 py-5 flex items-center gap-3"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${allConsentsChecked ? "bg-slate-900 text-white" : "bg-slate-200 text-white"}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-xl font-bold text-slate-900">{t.onboarding.step1.allAgree}</span>
                </button>

                <div className="mt-4 space-y-1">
                  <button
                    onClick={() => toggleConsent("age14")}
                    className="w-full py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${consents.age14 ? "text-blue-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-lg text-slate-900">{t.onboarding.step1.requiredAge}</span>
                    </div>
                  </button>

                  <div className="w-full py-3 flex items-center justify-between">
                    <button
                      onClick={() => toggleConsent("terms")}
                      className="flex items-center gap-3"
                    >
                      <svg className={`w-5 h-5 ${consents.terms ? "text-blue-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-lg text-slate-900">{t.onboarding.step1.requiredTerms}</span>
                    </button>
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-slate-600"
                      aria-label={t.onboarding.step1.openTerms}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>

                  <div className="w-full py-3 flex items-center justify-between">
                    <button
                      onClick={() => toggleConsent("privacy")}
                      className="flex items-center gap-3"
                    >
                      <svg className={`w-5 h-5 ${consents.privacy ? "text-blue-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-lg text-slate-900">{t.onboarding.step1.requiredPrivacy}</span>
                    </button>
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-slate-600"
                      aria-label={t.onboarding.step1.openPrivacy}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>

                  <button
                    onClick={() => toggleConsent("serviceQuality")}
                    className="w-full py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${consents.serviceQuality ? "text-blue-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-lg text-slate-900">{t.onboarding.step1.optionalQuality}</span>
                    </div>
                  </button>

                  <button
                    onClick={() => toggleConsent("marketing")}
                    className="w-full py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${consents.marketing ? "text-blue-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-lg text-slate-900">{t.onboarding.step1.optionalMarketing}</span>
                    </div>
                  </button>
                </div>

                {consentError && (
                  <p className="mt-2 text-sm text-red-500">{consentError}</p>
                )}

                <div className="mt-auto pt-5">
                  <button
                    onClick={handleConsentNext}
                    disabled={!requiredConsentsChecked || consentStatus === "loading"}
                    className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {consentStatus === "loading" ? t.common.loading : t.onboarding.step1.next}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex-1 flex flex-col">
                <button
                  onClick={() => setStep(1)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label={t.common.back}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="mt-5 space-y-2">
                  <h2 className="text-3xl font-bold text-slate-900">{t.onboarding.step2.title}</h2>
                  <p className="text-base text-slate-400">{t.onboarding.step2.description}</p>
                </div>

                <div className="mt-7 space-y-1">
                  <div className="w-full py-3 flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <h3 className="text-lg text-slate-900">{t.onboarding.step2.autoFormat.title}</h3>
                      <p className="text-sm text-slate-500 leading-tight mt-1">
                        {t.onboarding.step2.autoFormat.description}
                      </p>
                    </div>
                  </div>

                  <div className="w-full py-3 flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <h3 className="text-lg text-slate-900">{t.onboarding.step2.integrations.title}</h3>
                      <p className="text-sm text-slate-500 leading-tight mt-1">
                        {t.onboarding.step2.integrations.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600">Notion</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600">Google Docs</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600">Slack</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full py-3 flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <h3 className="text-lg text-slate-900">{t.onboarding.step2.customFormat.title}</h3>
                      <p className="text-sm text-slate-500 leading-tight mt-1">
                        {t.onboarding.step2.customFormat.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-600 leading-tight">
                    <strong>💡</strong> {t.onboarding.step2.settingsTip}
                  </p>
                </div>

                <div className="mt-3 border border-slate-200 rounded-xl p-3">
                  <button
                    onClick={() => setShowReferralInput(!showReferralInput)}
                    className="w-full text-sm text-slate-600 hover:text-slate-800 flex items-center justify-between"
                  >
                    <span>{t.onboarding.step2.referralQuestion}</span>
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
                          placeholder={t.onboarding.step2.referralPlaceholder}
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
                            t.onboarding.step2.referralApply
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

                <div className="mt-auto pt-5">
                  <button
                    onClick={handleComplete}
                    className="btn-primary w-full"
                  >
                    {t.onboarding.step2.start}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <DesktopLoginNoticeModal
        isOpen={showDesktopLoginNotice}
        onClose={() => setShowDesktopLoginNotice(false)}
      />
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
