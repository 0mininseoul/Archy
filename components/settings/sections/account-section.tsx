"use client";

import { useI18n } from "@/lib/i18n";

interface AccountSectionProps {
  email: string;
  usage: { used: number; limit: number };
}

export function AccountSection({ email, usage }: AccountSectionProps) {
  const { t } = useI18n();

  return (
    <div className="card p-4">
      <h2 className="text-base font-bold text-slate-900 mb-3">{t.settings.account.title}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            {t.settings.account.email}
          </label>
          <div className="text-sm text-slate-900 font-medium">
            {email || t.settings.account.noEmail}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">
            {t.settings.account.usage}
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 font-medium">
                {usage.used} mins / {usage.limit} mins
              </span>
              <span className="text-slate-500">
                {Math.round((usage.used / usage.limit) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 transition-all duration-500"
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
