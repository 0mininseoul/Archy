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

  const handleComplete = async () => {
    try {
      // Mark user as onboarded
      await fetch("/api/user/onboarding", {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to update onboarding status:", error);
    }
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-4">
          {[1, 2].map((num) => (
            <div key={num} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${step >= num
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                  : "bg-white text-slate-400 border border-slate-200"
                  }`}
              >
                {num}
              </div>
              {num < 2 && (
                <div
                  className={`w-16 h-1 mx-2 rounded-full transition-all duration-300 ${step > num ? "bg-slate-900" : "bg-slate-200"
                    }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="card p-6 md:p-12 space-y-8 animate-slide-up">
          {step === 1 && (
            <div className="space-y-8 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
                  👋
                </div>
                <h2 className="text-3xl font-bold text-slate-900">
                  Welcome to Flownote
                </h2>
                <p className="text-lg text-slate-600 max-w-md mx-auto">
                  Let's get you set up in just a few seconds. We'll connect your favorite tools to automate your workflow.
                </p>
              </div>
              <button
                onClick={() => setStep(2)}
                className="btn-primary w-full max-w-sm mx-auto flex items-center justify-center gap-2"
              >
                Get Started
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">
                  Connect Services
                </h2>
                <p className="text-slate-600">
                  Link Notion and Slack to enable automation
                </p>
              </div>

              <div className="space-y-4">
                {/* Notion Connection */}
                <div className="border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-all group">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      📔
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">Notion</h3>
                      <p className="text-sm text-slate-500">
                        Auto-save summaries to your database
                      </p>
                    </div>
                    {notionConnected && (
                      <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-bold">Connected</span>
                      </div>
                    )}
                  </div>
                  {!notionConnected ? (
                    <button
                      onClick={handleNotionConnect}
                      className="w-full py-2.5 px-4 border-2 border-slate-900 text-slate-900 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                    >
                      Connect Notion
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-4 bg-slate-50 text-slate-500 rounded-lg font-medium text-center border border-slate-200">
                      Configuration available in Settings
                    </div>
                  )}
                </div>

                {/* Slack Connection */}
                <div className="border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-all group">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      💬
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">Slack</h3>
                      <p className="text-sm text-slate-500">
                        Receive notifications when ready
                      </p>
                    </div>
                    {slackConnected && (
                      <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-bold">Connected</span>
                      </div>
                    )}
                  </div>
                  {!slackConnected ? (
                    <button
                      onClick={handleSlackConnect}
                      className="w-full py-2.5 px-4 border-2 border-slate-900 text-slate-900 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                    >
                      Connect Slack
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-4 bg-slate-50 text-slate-500 rounded-lg font-medium text-center border border-slate-200">
                      Configuration available in Settings
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 px-4 text-slate-500 font-medium hover:text-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  className="flex-1 btn-primary shadow-lg shadow-slate-900/10"
                >
                  Complete Setup
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
