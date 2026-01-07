"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export default function WithdrawCompletePage() {
  const router = useRouter();
  const { t } = useI18n();

  // Sign out when page loads
  useEffect(() => {
    const signOut = async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
    };
    signOut();
  }, []);

  return (
    <div className="app-container">
      {/* Main Content - Full screen centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          {/* Emoji and Title */}
          <div className="space-y-4">
            <div className="text-6xl">👋</div>
            <h2 className="text-xl font-bold text-slate-900">
              {t.settings.withdrawComplete.title}
            </h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">
              {t.settings.withdrawComplete.description}
            </p>
          </div>

          {/* Button */}
          <div className="pt-4">
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 px-4 bg-slate-900 text-white rounded-xl font-medium text-sm min-h-[44px]"
            >
              {t.settings.withdrawComplete.homeButton}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
