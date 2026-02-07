"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import Image from "next/image";
import { PlanManagementModal } from "./plan-management-modal";

interface AccountSectionProps {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  usage: { used: number; limit: number | null; isPro?: boolean; proDaysRemaining?: number | null };
}

export function AccountSection({ email, name, avatarUrl, usage }: AccountSectionProps) {
  const { t } = useI18n();
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  return (
    <>
      <div className="bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Profile Image */}
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Profile"
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {name || "사용자"}
              </h2>
              <p className="text-sm text-slate-500 mb-2">{email}</p>
              <div className="flex items-center gap-2">
                {usage.isPro ? (
                  <>
                    <div className="inline-flex items-center justify-center px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full">
                      <span className="text-white text-xs font-medium">Pro</span>
                    </div>
                    {usage.proDaysRemaining && (
                      <span className="text-xs text-slate-500">
                        {t.settings.account.proExpires.replace("{days}", String(usage.proDaysRemaining))}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="inline-flex items-center justify-center px-3 py-1 bg-[#333333] rounded-full">
                    <span className="text-white text-xs font-medium">Free</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Manage Plan Button */}
          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            플랜 관리
          </button>
        </div>

        {/* Usage Info */}
        <div className="mt-6">
          {usage.isPro ? (
            // Pro users - show unlimited
            <div className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl">
              <span className="text-lg">✨</span>
              <span className="text-sm font-medium text-purple-700">{t.settings.account.unlimited}</span>
            </div>
          ) : (
            // Free users - show usage bar
            <>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-slate-900 transition-all duration-500"
                  style={{ width: `${usage.limit ? Math.min((usage.used / usage.limit) * 100, 100) : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-slate-900">
                <span>{usage.used}분 사용</span>
                <span className="text-slate-500">{usage.limit}분 사용가능</span>
              </div>
            </>
          )}
        </div>
      </div>

      <PlanManagementModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />
    </>
  );
}
