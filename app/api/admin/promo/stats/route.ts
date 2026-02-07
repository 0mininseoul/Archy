import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// List of admin emails - add your admin emails here
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

interface PromoStats {
  code: string;
  name: string;
  currentRedemptions: number;
  maxRedemptions: number;
  remainingSlots: number;
  isActive: boolean;
  benefitType: string;
  benefitDurationDays: number;
  startsAt: string;
  expiresAt: string | null;
}

// GET /api/admin/promo/stats - Get promo code usage statistics (admin only)
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (!ADMIN_EMAILS.includes(user.email || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseAdmin = createServiceRoleClient();

    const { data: promoCodes, error } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin Promo Stats] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stats: PromoStats[] = (promoCodes || []).map((p) => ({
      code: p.code,
      name: p.name,
      currentRedemptions: p.current_redemptions,
      maxRedemptions: p.max_redemptions,
      remainingSlots: p.max_redemptions - p.current_redemptions,
      isActive: p.is_active,
      benefitType: p.benefit_type,
      benefitDurationDays: p.benefit_duration_days,
      startsAt: p.starts_at,
      expiresAt: p.expires_at,
    }));

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("[Admin Promo Stats] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
