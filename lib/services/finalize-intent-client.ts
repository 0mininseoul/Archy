"use client";

import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from "@/lib/safe-storage";
import type { Recording } from "@/lib/types/database";

const PENDING_FINALIZE_STORAGE_KEY = "archy_pending_finalize_intent";

export interface PendingFinalizeIntent {
  sessionId: string;
  totalDurationSeconds: number;
  format?: Recording["format"];
  createdAt: string;
}

function isValidPendingIntent(
  value: PendingFinalizeIntent | null
): value is PendingFinalizeIntent {
  return Boolean(
    value &&
      typeof value.sessionId === "string" &&
      value.sessionId.length > 0 &&
      typeof value.totalDurationSeconds === "number" &&
      value.totalDurationSeconds > 0
  );
}

export function loadPendingFinalizeIntent(): PendingFinalizeIntent | null {
  try {
    const raw = safeLocalStorageGetItem(PENDING_FINALIZE_STORAGE_KEY, {
      logPrefix: "FinalizeIntent",
    });
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingFinalizeIntent;
    return isValidPendingIntent(parsed) ? parsed : null;
  } catch (error) {
    console.warn("[FinalizeIntent] Failed to load pending finalize intent:", error);
    return null;
  }
}

export function persistPendingFinalizeIntent(
  payload: Omit<PendingFinalizeIntent, "createdAt">
): PendingFinalizeIntent {
  const pendingIntent: PendingFinalizeIntent = {
    ...payload,
    createdAt: new Date().toISOString(),
  };

  safeLocalStorageSetItem(
    PENDING_FINALIZE_STORAGE_KEY,
    JSON.stringify(pendingIntent),
    { logPrefix: "FinalizeIntent" }
  );

  return pendingIntent;
}

export function clearPendingFinalizeIntent(expectedSessionId?: string): void {
  const pendingIntent = loadPendingFinalizeIntent();
  if (!pendingIntent) return;

  if (expectedSessionId && pendingIntent.sessionId !== expectedSessionId) {
    return;
  }

  safeLocalStorageRemoveItem(PENDING_FINALIZE_STORAGE_KEY, {
    logPrefix: "FinalizeIntent",
  });
}

export async function submitFinalizeIntent(
  payload: Omit<PendingFinalizeIntent, "createdAt">,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  const pendingIntent = persistPendingFinalizeIntent(payload);

  try {
    const response = await fetch("/api/recordings/finalize-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: options?.keepalive ?? false,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[FinalizeIntent] finalize-intent request failed:", errorText);
      return false;
    }

    clearPendingFinalizeIntent(pendingIntent.sessionId);
    return true;
  } catch (error) {
    console.warn("[FinalizeIntent] finalize-intent request failed:", error);
    return false;
  }
}

export function sendFinalizeIntentBeacon(): boolean {
  const pendingIntent = loadPendingFinalizeIntent();
  if (!pendingIntent) return false;

  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }

  const beaconBody = new Blob(
    [
      JSON.stringify({
        sessionId: pendingIntent.sessionId,
        totalDurationSeconds: pendingIntent.totalDurationSeconds,
        format: pendingIntent.format,
      }),
    ],
    { type: "application/json" }
  );

  return navigator.sendBeacon("/api/recordings/finalize-intent", beaconBody);
}

export async function flushPendingFinalizeIntent(): Promise<boolean> {
  const pendingIntent = loadPendingFinalizeIntent();
  if (!pendingIntent) return false;

  return submitFinalizeIntent(
    {
      sessionId: pendingIntent.sessionId,
      totalDurationSeconds: pendingIntent.totalDurationSeconds,
      format: pendingIntent.format,
    },
    { keepalive: true }
  );
}
