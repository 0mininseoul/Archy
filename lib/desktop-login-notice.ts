import { isDesktopEnvironment } from "@/lib/browser";
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from "@/lib/safe-storage";

const LOGIN_INTENT_KEY = "archy_login_intent";
const DESKTOP_NOTICE_SEEN_KEY = "archy_desktop_notice_seen_v1";

export function markLoginIntent(): void {
  if (typeof window === "undefined") return;
  safeSessionStorageSetItem(LOGIN_INTENT_KEY, "1", { logPrefix: "Desktop Notice" });
}

/**
 * Returns whether desktop login notice should be shown, and consumes the trigger.
 * If this returns true, the notice is marked as seen immediately to avoid duplicates.
 */
export function consumeDesktopLoginNoticeEligibility(): boolean {
  if (typeof window === "undefined") return false;

  const fromLogin =
    safeSessionStorageGetItem(LOGIN_INTENT_KEY, { logPrefix: "Desktop Notice" }) === "1";
  safeSessionStorageRemoveItem(LOGIN_INTENT_KEY, { logPrefix: "Desktop Notice" });

  if (!fromLogin) return false;
  if (safeLocalStorageGetItem(DESKTOP_NOTICE_SEEN_KEY, { logPrefix: "Desktop Notice" }) === "1") {
    return false;
  }
  if (!isDesktopEnvironment()) return false;

  safeLocalStorageSetItem(DESKTOP_NOTICE_SEEN_KEY, "1", { logPrefix: "Desktop Notice" });
  return true;
}
