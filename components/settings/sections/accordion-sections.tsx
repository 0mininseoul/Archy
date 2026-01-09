"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

// =============================================================================
// Push Notification Section
// =============================================================================

interface PushNotificationSectionProps {
  initialEnabled: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function PushNotificationSection({
  initialEnabled,
  isOpen,
  onToggle,
}: PushNotificationSectionProps) {
  const { t } = useI18n();

  const [pushEnabled, setPushEnabled] = useState(initialEnabled);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const handleTogglePush = useCallback(async (enable: boolean) => {
    const previousState = pushEnabled;
    setPushEnabled(enable);
    setPushLoading(true);
    setPushError(null);

    try {
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushError(t.settings.pushNotification.permissionDenied);
          setPushEnabled(previousState);
          setPushLoading(false);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });

        const response = await fetch("/api/user/push-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (response.ok) {
          await fetch("/api/user/push-enabled", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          });
        } else {
          throw new Error("Failed to save subscription");
        }
      } else {
        await fetch("/api/user/push-enabled", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
      }
    } catch (error) {
      console.error("Failed to toggle push notifications:", error);
      setPushError(t.settings.pushNotification.notSupported);
      setPushEnabled(previousState);
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled, t]);

  return (
    <div className="card p-0 overflow-hidden">
      <button onClick={onToggle} className="w-full bg-white flex items-center justify-between p-4">
        <span className="font-bold text-slate-900 text-base">{t.settings.pushNotification.title}</span>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 animate-slide-down">
          <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">
                {pushEnabled ? t.settings.pushNotification.enabled : t.settings.pushNotification.disabled}
              </h3>
              <p className="text-xs text-slate-500">{t.settings.pushNotification.description}</p>
              {pushError && <p className="text-xs text-red-500 mt-1">{pushError}</p>}
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={pushEnabled}
                disabled={pushLoading}
                onChange={(e) => handleTogglePush(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Data Management Section
// =============================================================================

interface DataManagementSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DataManagementSection({ isOpen, onToggle }: DataManagementSectionProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [autoSave, setAutoSave] = useState(true);

  const handleDeleteAllData = useCallback(async () => {
    if (!confirm(t.settings.data.deleteConfirm)) return;
    if (!confirm(t.settings.data.deleteDoubleConfirm)) return;

    try {
      const response = await fetch("/api/user/data", { method: "DELETE" });
      if (response.ok) {
        alert(t.settings.data.deleteSuccess);
        router.push("/");
      } else {
        throw new Error("Failed to delete data");
      }
    } catch (error) {
      console.error("Failed to delete data:", error);
      alert(t.settings.data.deleteFailed);
    }
  }, [t, router]);

  return (
    <div className="card p-0 overflow-hidden">
      <button onClick={onToggle} className="w-full bg-white flex items-center justify-between p-4">
        <span className="font-bold text-slate-900 text-base">{t.settings.data.title}</span>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 animate-slide-down space-y-3">
          <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">{t.settings.data.autoDelete}</h3>
              <p className="text-xs text-slate-500">{t.settings.data.autoDeleteDesc}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
            </label>
          </div>

          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <h3 className="font-bold text-red-700 text-sm mb-1">{t.settings.data.danger}</h3>
            <p className="text-xs text-red-600 mb-3">{t.settings.data.dangerDesc}</p>
            <button
              onClick={handleDeleteAllData}
              className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium min-h-[44px]"
            >
              {t.settings.data.deleteAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Language Section
// =============================================================================

interface LanguageSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function LanguageSection({ isOpen, onToggle }: LanguageSectionProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="card p-0 overflow-hidden">
      <button onClick={onToggle} className="w-full bg-white flex items-center justify-between p-4">
        <span className="font-bold text-slate-900 text-base">{t.settings.language.title}</span>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 animate-slide-down">
          <div className="flex gap-2">
            <button
              onClick={() => setLocale("ko")}
              className={`flex-1 px-3 py-3 rounded-xl font-medium text-sm transition-all min-h-[44px] ${
                locale === "ko" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              한국어
            </button>
            <button
              onClick={() => setLocale("en")}
              className={`flex-1 px-3 py-3 rounded-xl font-medium text-sm transition-all min-h-[44px] ${
                locale === "en" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              English
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
