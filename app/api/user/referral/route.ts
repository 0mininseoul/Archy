import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { createServiceRoleClient } from "@/lib/supabase/server";

const REFERRAL_BONUS_MINUTES = 350;

interface ReferralInfo {
  referralCode: string | null;
  bonusMinutes: number;
}

interface ReferralApplyResult {
  bonusMinutes: number;
  message: string;
}

// GET /api/user/referral - Get my referral code
export const GET = withAuth<ReferralInfo>(async ({ user, supabase }) => {
  const { data: userData, error } = await supabase
    .from("users")
    .select("referral_code, bonus_minutes")
    .eq("id", user.id)
    .single();

  if (error) {
    return errorResponse("Failed to get referral code", 500);
  }

  return successResponse({
    referralCode: userData?.referral_code ?? null,
    bonusMinutes: userData?.bonus_minutes || 0,
  });
});

// POST /api/user/referral - Apply referral code (give bonus)
export const POST = withAuth<ReferralApplyResult>(async ({ user, supabase, request }) => {
  const { referralCode } = await request!.json();

  if (!referralCode || referralCode.length !== 8) {
    return errorResponse("Invalid format", 400);
  }

  // Check current user info
  const { data: currentUser } = await supabase
    .from("users")
    .select("referred_by, referral_code")
    .eq("id", user.id)
    .single();

  // Already used a referral code
  if (currentUser?.referred_by) {
    return errorResponse("Referral code already used", 400);
  }

  // Can't use own code
  if (currentUser?.referral_code === referralCode.toUpperCase()) {
    return errorResponse("Cannot use your own referral code", 400);
  }

  // Find referrer using admin client (bypass RLS)
  const supabaseAdmin = createServiceRoleClient();
  const { data: referrer, error: referrerError } = await supabaseAdmin
    .from("users")
    .select("id, bonus_minutes")
    .eq("referral_code", referralCode.toUpperCase())
    .single();

  if (referrerError || !referrer) {
    return errorResponse("Referral code not found", 404);
  }

  // Update current user with bonus and referred_by
  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      referred_by: referrer.id,
      bonus_minutes: REFERRAL_BONUS_MINUTES,
    })
    .eq("id", user.id);

  if (userUpdateError) {
    return errorResponse("Failed to apply referral", 500);
  }

  // Give bonus to referrer (using admin client to bypass RLS)
  await supabaseAdmin
    .from("users")
    .update({
      bonus_minutes: (referrer.bonus_minutes || 0) + REFERRAL_BONUS_MINUTES,
    })
    .eq("id", referrer.id);

  return successResponse({
    bonusMinutes: REFERRAL_BONUS_MINUTES,
    message: `Referral applied successfully! You and your friend both received ${REFERRAL_BONUS_MINUTES} bonus minutes.`,
  });
});
