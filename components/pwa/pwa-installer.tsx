"use client";

import { useEffect, useRef, useState } from "react";
import {
  syncAmplitudeUser,
  trackAmplitudeEvent,
} from "@/lib/analytics/amplitude";
import { safeLocalStorageGetItem, safeLocalStorageRemoveItem, safeLocalStorageSetItem } from "@/lib/safe-storage";
import { createClient } from "@/lib/supabase/client";

type Platform = "android" | "ios" | "desktop";
type InstallSource = "appinstalled" | "standalone";

interface PendingPWAInstall {
  detectedAt: string;
  platform: Platform;
  source: InstallSource;
}

interface PWAInstallResponseData {
  installed_at?: string;
  record_status?: "recorded" | "already_recorded";
  message?: string;
}

const PWA_INSTALL_RECORDED_KEY = "pwa_install_recorded";
const PWA_INSTALL_PENDING_KEY = "pwa_install_pending";
const STORAGE_LOG_PREFIX = "PWAInstaller";

/**
 * PWA 설치 감지와 DB 저장을 분리한다.
 * - 감지 시: PWA_Install_Detected
 * - DB 저장 성공/기존 기록 확인 시: PWA_Installed
 * - DB 저장 실패 시: PWA_Install_Persist_Failed
 */
export function PWAInstaller() {
  const hasRecordedRef = useRef(false);
  const isPersistingRef = useRef(false);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    hasRecordedRef.current = safeLocalStorageGetItem(PWA_INSTALL_RECORDED_KEY, {
      logPrefix: STORAGE_LOG_PREFIX,
    }) === "true";

    const readPendingInstall = (): PendingPWAInstall | null => {
      const raw = safeLocalStorageGetItem(PWA_INSTALL_PENDING_KEY, {
        logPrefix: STORAGE_LOG_PREFIX,
      });
      if (!raw) return null;

      try {
        return JSON.parse(raw) as PendingPWAInstall;
      } catch (error) {
        console.warn("[PWA] Failed to parse pending install metadata:", error);
        safeLocalStorageRemoveItem(PWA_INSTALL_PENDING_KEY, {
          logPrefix: STORAGE_LOG_PREFIX,
        });
        return null;
      }
    };

    const writePendingInstall = (pending: PendingPWAInstall) => {
      safeLocalStorageSetItem(PWA_INSTALL_PENDING_KEY, JSON.stringify(pending), {
        logPrefix: STORAGE_LOG_PREFIX,
      });
    };

    const markInstallRecorded = () => {
      hasRecordedRef.current = true;
      safeLocalStorageSetItem(PWA_INSTALL_RECORDED_KEY, "true", {
        logPrefix: STORAGE_LOG_PREFIX,
      });
      safeLocalStorageRemoveItem(PWA_INSTALL_PENDING_KEY, {
        logPrefix: STORAGE_LOG_PREFIX,
      });
    };

    const parseResponseData = (payload: unknown): PWAInstallResponseData => {
      if (!payload || typeof payload !== "object") return {};

      if ("data" in payload && payload.data && typeof payload.data === "object") {
        return payload.data as PWAInstallResponseData;
      }

      return payload as PWAInstallResponseData;
    };

    const parseResponseError = (payload: unknown): string | null => {
      if (!payload || typeof payload !== "object") return null;

      if ("error" in payload && typeof payload.error === "string") {
        return payload.error;
      }

      return null;
    };

    const persistPendingInstall = async (pending: PendingPWAInstall) => {
      if (hasRecordedRef.current || isPersistingRef.current) return;

      isPersistingRef.current = true;

      let userId: string | null = null;

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.warn("[PWA] Failed to resolve auth user:", error);
          return;
        }

        userId = user?.id || null;
        if (!userId) return;

        await syncAmplitudeUser(userId);

        const response = await fetch("/api/user/pwa-install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          // Ignore JSON parse failures and fall back to status-based logging.
        }

        if (!response.ok) {
          const errorMessage = parseResponseError(payload) || `HTTP ${response.status}`;
          await trackAmplitudeEvent("PWA_Install_Persist_Failed", {
            platform: pending.platform,
            install_source: pending.source,
            detected_at: pending.detectedAt,
            error: errorMessage,
            http_status: response.status,
          });
          console.error("[PWA] Failed to record installation:", errorMessage);
          return;
        }

        const data = parseResponseData(payload);
        const installedAt = data.installed_at || pending.detectedAt;
        const recordStatus = data.record_status || "recorded";

        markInstallRecorded();

        await trackAmplitudeEvent("PWA_Installed", {
          platform: pending.platform,
          install_source: pending.source,
          detected_at: pending.detectedAt,
          installed_at: installedAt,
          record_status: recordStatus,
        });
      } catch (error) {
        await trackAmplitudeEvent("PWA_Install_Persist_Failed", {
          platform: pending.platform,
          install_source: pending.source,
          detected_at: pending.detectedAt,
          error: error instanceof Error ? error.message : String(error),
          ...(userId ? { supabase_user_id: userId } : {}),
        });
        console.error("[PWA] Failed to record installation:", error);
      } finally {
        isPersistingRef.current = false;
      }
    };

    const handleInstallDetected = async (source: InstallSource) => {
      if (hasRecordedRef.current) return;

      const existingPending = readPendingInstall();
      const pending = existingPending || {
        detectedAt: new Date().toISOString(),
        platform: getPlatform(),
        source,
      };

      if (!existingPending) {
        writePendingInstall(pending);
        await trackAmplitudeEvent("PWA_Install_Detected", {
          platform: pending.platform,
          install_source: pending.source,
          detected_at: pending.detectedAt,
        });
      }

      await persistPendingInstall(pending);
    };

    const handleAppInstalled = () => {
      void handleInstallDetected("appinstalled");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;

      const pending = readPendingInstall();
      if (pending) {
        void persistPendingInstall(pending);
      }
    });

    const pending = readPendingInstall();
    if (pending) {
      void persistPendingInstall(pending);
    } else if (isStandaloneMode() && !hasRecordedRef.current) {
      void handleInstallDetected("standalone");
    }

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getPlatform(): Platform {
  if (typeof window === "undefined") return "desktop";

  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "desktop";
}
