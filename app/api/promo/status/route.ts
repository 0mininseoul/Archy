import { withAuth, successResponse } from "@/lib/api";
import { getProStatus } from "@/lib/promo";

interface PromoStatusResult {
  isPro: boolean;
  reason: "promo" | "subscription" | null;
  expiresAt: string | null;
  daysRemaining: number | null;
}

// GET /api/promo/status - Get current user's promo status
export const GET = withAuth<PromoStatusResult>(async ({ user, supabase }) => {
  const { data: userData } = await supabase
    .from("users")
    .select("promo_code_id, promo_applied_at, promo_expires_at")
    .eq("id", user.id)
    .single();

  const proStatus = getProStatus(userData);

  return successResponse({
    isPro: proStatus.isPro,
    reason: proStatus.reason,
    expiresAt: proStatus.expiresAt?.toISOString() || null,
    daysRemaining: proStatus.daysRemaining,
  });
});
