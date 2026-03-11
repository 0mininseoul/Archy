import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProStatus } from "@/lib/promo";
import { loadUserWithUsageReset } from "@/lib/usage-cycle";

export const runtime = "edge";

// GET /api/user/usage - Get user usage
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error, usageCycle } = await loadUserWithUsageReset<{
      monthly_minutes_used: number;
      last_reset_at: string;
      bonus_minutes: number;
      promo_expires_at?: string | null;
      created_at: string;
    }>(
      supabase,
      user.id,
      "monthly_minutes_used, last_reset_at, bonus_minutes, promo_expires_at, created_at"
    );

    if (error || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const proStatus = getProStatus(userData);

    return NextResponse.json({
      used: userData.monthly_minutes_used,
      limit: proStatus.isPro ? null : 350 + (userData.bonus_minutes || 0),
      lastReset: userData.last_reset_at,
      nextReset: usageCycle?.nextResetAtIso || null,
      isPro: proStatus.isPro,
      proDaysRemaining: proStatus.daysRemaining,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
