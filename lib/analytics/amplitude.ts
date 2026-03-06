"use client";

import * as amplitude from "@amplitude/analytics-browser";

export const TRACKING_SCHEMA_VERSION = 2 as const;

export type AppContext = "pwa" | "browser";
export type AnalyticsEventProperties = Record<string, unknown>;

let initPromise: Promise<boolean> | null = null;

export function getAppContext(): AppContext {
  if (typeof window === "undefined") return "browser";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isStandalone ? "pwa" : "browser";
}

async function ensureAmplitudeInitialized(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return false;

  if (!initPromise) {
    initPromise = amplitude
      .init(apiKey, {
        defaultTracking: true,
      })
      .promise.then(() => true)
      .catch((error) => {
        console.warn("[Amplitude] Initialization failed:", error);
        initPromise = null;
        return false;
      });
  }

  return initPromise;
}

function buildEventProperties(
  eventProperties: AnalyticsEventProperties = {}
): AnalyticsEventProperties {
  const identity = amplitude.getIdentity();
  const userId = identity.userId || amplitude.getUserId();

  return {
    ...eventProperties,
    tracking_schema_version: TRACKING_SCHEMA_VERSION,
    ...(userId ? { supabase_user_id: userId } : {}),
  };
}

async function identifyCurrentContext(userId?: string): Promise<boolean> {
  const ready = await ensureAmplitudeInitialized();
  if (!ready) return false;

  const identify = new amplitude.Identify().set("app_context", getAppContext());
  if (userId) {
    identify.set("supabase_user_id", userId);
  }

  try {
    await amplitude.identify(identify).promise;
    return true;
  } catch (error) {
    console.warn("[Amplitude] Identify failed:", error);
    return false;
  }
}

export async function bootstrapAmplitudeAnalytics(): Promise<boolean> {
  const ready = await ensureAmplitudeInitialized();
  if (!ready) return false;

  return identifyCurrentContext(amplitude.getUserId());
}

export async function syncAmplitudeUser(userId: string): Promise<boolean> {
  const ready = await ensureAmplitudeInitialized();
  if (!ready) return false;

  amplitude.setUserId(userId);
  return identifyCurrentContext(userId);
}

export async function resetAmplitudeUser(): Promise<boolean> {
  const ready = await ensureAmplitudeInitialized();
  if (!ready) return false;

  amplitude.reset();
  return identifyCurrentContext();
}

export async function trackAmplitudeEvent(
  eventName: string,
  eventProperties: AnalyticsEventProperties = {}
): Promise<boolean> {
  const ready = await ensureAmplitudeInitialized();
  if (!ready) return false;

  try {
    await amplitude.track(eventName, buildEventProperties(eventProperties)).promise;
    return true;
  } catch (error) {
    console.warn(`[Amplitude] Failed to track ${eventName}:`, error);
    return false;
  }
}

export function getAmplitudeUserId(): string | undefined {
  return amplitude.getUserId();
}
