"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function EmptyState() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4 opacity-50">📝</div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{t.history.noRecordings}</h3>
      <p className="text-sm text-slate-500 mb-6">{t.history.noRecordingsDesc}</p>
      <button onClick={() => router.push("/dashboard")} className="btn-primary">
        {t.history.startRecording}
      </button>
    </div>
  );
}
