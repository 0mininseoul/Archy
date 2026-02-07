import { User, MAX_CUSTOM_FORMATS, PRO_MAX_CUSTOM_FORMATS } from "@/lib/types/database";

export interface ProStatus {
  isPro: boolean;
  reason: "promo" | "subscription" | null; // Extensible for future paid plans
  expiresAt: Date | null;
  daysRemaining: number | null;
}

/**
 * Check if a user has active Pro status from a promotion
 */
export function getProStatus(user: Pick<User, "promo_expires_at"> | null): ProStatus {
  if (!user) {
    return {
      isPro: false,
      reason: null,
      expiresAt: null,
      daysRemaining: null,
    };
  }

  // Check if user has an active promo
  if (user.promo_expires_at) {
    const expiresAt = new Date(user.promo_expires_at);
    const now = new Date();

    if (expiresAt > now) {
      const daysRemaining = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        isPro: true,
        reason: "promo",
        expiresAt,
        daysRemaining,
      };
    }
  }

  // Future: check for paid subscription here

  return {
    isPro: false,
    reason: null,
    expiresAt: null,
    daysRemaining: null,
  };
}

/**
 * Check if user has unlimited usage (no minute limit)
 */
export function hasUnlimitedUsage(user: Pick<User, "promo_expires_at"> | null): boolean {
  return getProStatus(user).isPro;
}

/**
 * Get the effective custom format limit for a user
 */
export function getCustomFormatLimit(user: Pick<User, "promo_expires_at"> | null): number {
  const { isPro } = getProStatus(user);
  return isPro ? PRO_MAX_CUSTOM_FORMATS : MAX_CUSTOM_FORMATS;
}
