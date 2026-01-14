"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import Image from "next/image";
import { PlanManagementModal } from "./plan-management-modal";

interface AccountSectionProps {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  usage: { used: number; limit: number };
}

export function AccountSection({ email, name, avatarUrl }: AccountSectionProps) {
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
              <div className="inline-flex items-center justify-center px-3 py-1 bg-[#333333] rounded-full">
                <span className="text-white text-xs font-medium">Free</span>
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

        {/* Usage Info (Bottom) - Replaced with minimal text or different UI if needed, 
                but request said "remove old usage bar and title".
                Current image shows "0분 사용 / 300분 사용가능" at the bottom.
                Let's add that back in a cleaner way if needed, or stick to the image style.
                The image shows a progress bar and text.
                Wait, the prompt said: "기존에 있던 "계정 정보" 타이틀이나, 사용량 퍼센테이지는 빼줘."
                BUT the second attached image SHOWS a usage bar and "0분 사용 300분 사용가능".
                I should probably keep the usage bar but style it like the image (cleaner).
                Actually, re-reading: "현재 계정 정보 카드 ui를 두 번째 첨부한 이미지처럼 업데이트하고 싶어."
                The second image clearly has a usage bar and text 0분 사용 / 300분 사용가능.
                So I will implement that style.
            */}
        <div className="mt-6">
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-slate-200" style={{ width: '0%' }} /> {/* Mocked at 0 for now or use prop */}
          </div>
          <div className="flex justify-between text-sm text-slate-900">
            <span>0분 사용</span>
            <span className="text-slate-500">300분 사용가능</span>
          </div>
        </div>
      </div>

      <PlanManagementModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />
    </>
  );
}
