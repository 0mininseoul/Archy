import { isDesktopEnvironment } from "@/lib/browser";

const LOGIN_INTENT_KEY = "archy_login_intent";
const DESKTOP_NOTICE_SEEN_KEY = "archy_desktop_notice_seen_v1";

function safeSessionGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`[Desktop Notice] sessionStorage get failed for key "${key}":`, error);
    return null;
  }
}

function safeSessionSetItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[Desktop Notice] sessionStorage set failed for key "${key}":`, error);
  }
}

function safeSessionRemoveItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`[Desktop Notice] sessionStorage remove failed for key "${key}":`, error);
  }
}

function safeLocalGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`[Desktop Notice] localStorage get failed for key "${key}":`, error);
    return null;
  }
}

function safeLocalSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[Desktop Notice] localStorage set failed for key "${key}":`, error);
  }
}

export function markLoginIntent(): void {
  if (typeof window === "undefined") return;
  safeSessionSetItem(LOGIN_INTENT_KEY, "1");
}

/**
 * Returns whether desktop login notice should be shown, and consumes the trigger.
 * If this returns true, the notice is marked as seen immediately to avoid duplicates.
 */
export function consumeDesktopLoginNoticeEligibility(): boolean {
  if (typeof window === "undefined") return false;

  const fromLogin = safeSessionGetItem(LOGIN_INTENT_KEY) === "1";
  safeSessionRemoveItem(LOGIN_INTENT_KEY);

  if (!fromLogin) return false;
  if (safeLocalGetItem(DESKTOP_NOTICE_SEEN_KEY) === "1") return false;
  if (!isDesktopEnvironment()) return false;

  safeLocalSetItem(DESKTOP_NOTICE_SEEN_KEY, "1");
  return true;
}
