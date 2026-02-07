import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface ApplyPromoResult {
  success: boolean;
  expiresAt: string;
  benefitType: string;
  daysRemaining: number;
}

// POST /api/promo/apply - Apply a promo code
export const POST = withAuth<ApplyPromoResult>(async ({ user, supabase, request }) => {
  const { promoCode } = await request!.json();

  if (!promoCode || typeof promoCode !== "string") {
    return errorResponse("Promo code is required", 400);
  }

  const code = promoCode.trim().toUpperCase();

  // Check if user already has a promo applied
  const { data: currentUser } = await supabase
    .from("users")
    .select("promo_code_id, promo_expires_at")
    .eq("id", user.id)
    .single();

  if (currentUser?.promo_code_id) {
    return errorResponse("You have already used a promo code", 400);
  }

  // Use service role to access promo_codes table (bypasses RLS)
  const supabaseAdmin = createServiceRoleClient();

  // Find and validate promo code
  const { data: promo, error: promoError } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (promoError || !promo) {
    return errorResponse("Invalid or expired promo code", 404);
  }

  // Check if promo has started
  if (promo.starts_at && new Date(promo.starts_at) > new Date()) {
    return errorResponse("This promo code is not yet active", 400);
  }

  // Check if promo has expired
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return errorResponse("This promo code has expired", 400);
  }

  // Check redemption limit
  if (promo.current_redemptions >= promo.max_redemptions) {
    return errorResponse("This promo code has reached its limit", 400);
  }

  // Calculate expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + promo.benefit_duration_days);

  // Apply promo to user
  const { error: userUpdateError } = await supabaseAdmin
    .from("users")
    .update({
      promo_code_id: promo.id,
      promo_applied_at: new Date().toISOString(),
      promo_expires_at: expiresAt.toISOString(),
    })
    .eq("id", user.id);

  if (userUpdateError) {
    console.error("[Promo Apply] Failed to update user:", userUpdateError);
    return errorResponse("Failed to apply promo code", 500);
  }

  // Increment redemption count
  await supabaseAdmin
    .from("promo_codes")
    .update({
      current_redemptions: promo.current_redemptions + 1,
    })
    .eq("id", promo.id);

  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  return successResponse({
    success: true,
    expiresAt: expiresAt.toISOString(),
    benefitType: promo.benefit_type,
    daysRemaining,
  });
});
