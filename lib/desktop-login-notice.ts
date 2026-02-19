import { isDesktopEnvironment } from "@/lib/browser";

const LOGIN_INTENT_KEY = "archy_login_intent";
const DESKTOP_NOTICE_SEEN_KEY = "archy_desktop_notice_seen_v1";

export function markLoginIntent(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
}

/**
 * Returns whether desktop login notice should be shown, and consumes the trigger.
 * If this returns true, the notice is marked as seen immediately to avoid duplicates.
 */
export function consumeDesktopLoginNoticeEligibility(): boolean {
  if (typeof window === "undefined") return false;

  const fromLogin = sessionStorage.getItem(LOGIN_INTENT_KEY) === "1";
  sessionStorage.removeItem(LOGIN_INTENT_KEY);

  if (!fromLogin) return false;
  if (localStorage.getItem(DESKTOP_NOTICE_SEEN_KEY) === "1") return false;
  if (!isDesktopEnvironment()) return false;

  localStorage.setItem(DESKTOP_NOTICE_SEEN_KEY, "1");
  return true;
}
