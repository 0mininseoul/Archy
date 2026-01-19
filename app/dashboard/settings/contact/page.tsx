"use client";

import { useRouter } from "next/navigation";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { useI18n } from "@/lib/i18n";

export default function ContactPage() {
  const router = useRouter();
  const { t } = useI18n();

  const developerEmail = "contact@ascentum.co.kr";

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
          {t.settings.contactPage.title}
        </h1>
        <div className="w-9" />
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-6">
        <div className="space-y-6">
          {/* Description */}
          <p className="text-sm text-slate-600 text-center">
            {t.settings.contactPage.description}
          </p>

          {/* Email Card */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 mb-0.5">{t.settings.contactPage.email}</p>
                <a
                  href={`mailto:${developerEmail}`}
                  className="text-sm font-medium text-slate-900 hover:text-indigo-600 transition-colors"
                >
                  {developerEmail}
                </a>
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div className="h-8" />

          {/* Withdraw Button */}
          <div className="text-center">
            <button
              onClick={() => router.push("/dashboard/settings/contact/withdraw")}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              {t.settings.contactPage.withdraw}
            </button>
          </div>
        </div>
      </main>

      {/* Bottom Tab */}
      <BottomTab />
    </div>
  );
}
