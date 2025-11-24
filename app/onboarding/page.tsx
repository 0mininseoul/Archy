"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OnboardingStep = 1 | 2;

function OnboardingContent() {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [notionConnected, setNotionConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch connection status from database
  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch("/api/user/data");
      if (response.ok) {
        const data = await response.json();
        setNotionConnected(data.notionConnected);
        setSlackConnected(data.slackConnected);
      }
    } catch (error) {
      console.error("Failed to fetch connection status:", error);
    }
  };

  // Check for OAuth callback results and fetch actual connection status
  useEffect(() => {
    const notion = searchParams.get("notion");
    const slack = searchParams.get("slack");
    const error = searchParams.get("error");

    // If OAuth callback, fetch updated connection status from database
    if (notion === "connected" || slack === "connected") {
      fetchConnectionStatus();
      setStep(2); // Stay on step 2
    } else {
      // On initial load, fetch connection status
      fetchConnectionStatus();
    }

    if (error) {
      console.error("OAuth error:", error);
      // TODO: Show error message to user
    }
  }, [searchParams]);

  const handleNotionConnect = () => {
    // Notion OAuth flow will be implemented
    window.location.href = "/api/auth/notion";
  };

  const handleSlackConnect = () => {
    // Slack OAuth flow will be implemented
    window.location.href = "/api/auth/slack";
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-8">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-4">
          {[1, 2].map((num) => (
            <div key={num} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step >= num
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {num}
              </div>
              {num < 2 && (
                <div
                  className={`w-16 h-1 ${
                    step > num ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="glass-card p-12 space-y-8">
          {step === 1 && (
            <div className="space-y-6 text-center">
              <h2 className="text-3xl font-bold text-gray-800">
                환영합니다!
              </h2>
              <p className="text-gray-600">
                Flownote를 사용하기 위해 간단한 설정을 진행합니다.
              </p>
              <button
                onClick={() => setStep(2)}
                className="glass-button w-full max-w-sm mx-auto"
              >
                다음
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-gray-800">
                  서비스 연결
                </h2>
                <p className="text-gray-600">
                  Notion과 Slack을 연결하여 자동화를 시작하세요
                </p>
              </div>

              <div className="space-y-4">
                {/* Notion Connection */}
                <div className="border border-gray-200 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📔</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">Notion</h3>
                      <p className="text-sm text-gray-600">
                        정리된 문서가 자동으로 저장됩니다
                      </p>
                    </div>
                    {notionConnected && (
                      <div className="flex items-center gap-2 text-green-600">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm font-medium">연결됨</span>
                      </div>
                    )}
                  </div>
                  {!notionConnected ? (
                    <button
                      onClick={handleNotionConnect}
                      className="w-full py-2 px-4 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
                    >
                      Notion 연결하기
                    </button>
                  ) : (
                    <div className="w-full py-2 px-4 bg-green-50 text-green-700 rounded-lg font-medium text-center">
                      연결 완료
                    </div>
                  )}
                </div>

                {/* Slack Connection */}
                <div className="border border-gray-200 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">💬</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">Slack</h3>
                      <p className="text-sm text-gray-600">
                        완료 알림을 받습니다
                      </p>
                    </div>
                    {slackConnected && (
                      <div className="flex items-center gap-2 text-green-600">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm font-medium">연결됨</span>
                      </div>
                    )}
                  </div>
                  {!slackConnected ? (
                    <button
                      onClick={handleSlackConnect}
                      className="w-full py-2 px-4 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
                    >
                      Slack 연결하기
                    </button>
                  ) : (
                    <div className="w-full py-2 px-4 bg-green-50 text-green-700 rounded-lg font-medium text-center">
                      연결 완료
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleComplete}
                  className="flex-1 glass-button"
                >
                  시작하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
