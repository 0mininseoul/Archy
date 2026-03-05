"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  AUTO_PAUSE_NOTICE_EVENT,
  AUTO_PAUSE_NOTICE_STORAGE_KEY,
  RECORDING_STALE_TIMEOUT_MS,
} from "@/lib/recording-lifecycle";
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
} from "@/lib/safe-storage";

interface BottomTabProps {
  showSettingsTooltip?: boolean;
}

export function BottomTab({ showSettingsTooltip = false }: BottomTabProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [showAutoPauseNotice, setShowAutoPauseNotice] = useState(false);

  const consumeAutoPauseNotice = useCallback(() => {
    const raw = safeLocalStorageGetItem(AUTO_PAUSE_NOTICE_STORAGE_KEY, {
      logPrefix: "BottomTab",
    });
    if (!raw) return;

    safeLocalStorageRemoveItem(AUTO_PAUSE_NOTICE_STORAGE_KEY, {
      logPrefix: "BottomTab",
    });

    try {
      const parsed = JSON.parse(raw) as { createdAt?: string };
      const createdAt = parsed.createdAt ? new Date(parsed.createdAt).getTime() : 0;
      if (!createdAt || Number.isNaN(createdAt)) return;

      // Ignore stale notices to avoid unexpected popups after a long idle.
      if (Date.now() - createdAt > RECORDING_STALE_TIMEOUT_MS) return;

      setShowAutoPauseNotice(true);
    } catch (error) {
      console.warn("[BottomTab] Failed to parse auto-pause notice:", error);
    }
  }, []);

  useEffect(() => {
    consumeAutoPauseNotice();

    const onAutoPauseNotice = () => consumeAutoPauseNotice();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        consumeAutoPauseNotice();
      }
    };

    window.addEventListener(AUTO_PAUSE_NOTICE_EVENT, onAutoPauseNotice);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener(AUTO_PAUSE_NOTICE_EVENT, onAutoPauseNotice);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [consumeAutoPauseNotice]);

  useEffect(() => {
    if (!showAutoPauseNotice) return;

    const timeoutId = window.setTimeout(() => {
      setShowAutoPauseNotice(false);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showAutoPauseNotice]);

  const tabs = [
    {
      id: "record",
      path: "/dashboard",
      label: t.nav.record,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
    },
    {
      id: "history",
      path: "/dashboard/history",
      label: t.nav.history,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "settings",
      path: "/dashboard/settings",
      label: t.nav.settings,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="bottom-tab">
      {showAutoPauseNotice && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-16 z-50 w-[calc(100%-1rem)] max-w-[398px] animate-fade-in rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-lg">
          <p className="text-xs font-medium leading-5 text-amber-700 clamp-2-lines">
            {t.nav.autoPauseNotice}
          </p>
        </div>
      )}
      <div className="bottom-tab-inner">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative">
            {/* Settings tooltip */}
            {tab.id === "settings" && showSettingsTooltip && (
              <div className="absolute -top-12 right-[-4px] z-10 animate-bounce-vertical">
                <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                  {t.nav.settingsTooltip}
                  <div className="absolute top-full right-8 border-[5px] border-transparent border-t-indigo-600" />
                </div>
              </div>
            )}
            <Link
              href={tab.path}
              prefetch={false}
              className={`bottom-tab-item ${isActive(tab.path) ? "active" : ""}`}
            >
              {tab.icon}
              <span className="bottom-tab-label">{tab.label}</span>
            </Link>
          </div>
        ))}
      </div>
    </nav>
  );
}
