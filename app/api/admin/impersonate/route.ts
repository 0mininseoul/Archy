import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

// POST /api/admin/impersonate - Switch session to target user
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!ADMIN_EMAILS.includes(user.email || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, email } = await request.json();

    if (!userId && !email) {
      return NextResponse.json(
        { error: "userId or email is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();

    // Look up target user
    let targetEmail = email;
    if (userId && !email) {
      const { data: targetUser, error: lookupError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (lookupError || !targetUser?.user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      targetEmail = targetUser.user.email;
    }

    if (!targetEmail) {
      return NextResponse.json(
        { error: "Could not resolve user email" },
        { status: 400 }
      );
    }

    // Generate magic link to get OTP token
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });

    if (linkError || !linkData) {
      console.error("[Admin Impersonate] generateLink error:", linkError);
      return NextResponse.json(
        { error: linkError?.message || "Failed to generate link" },
        { status: 500 }
      );
    }

    const emailOtp = linkData.properties?.email_otp;
    if (!emailOtp) {
      return NextResponse.json(
        { error: "Failed to generate OTP" },
        { status: 500 }
      );
    }

    // Verify OTP on the cookie-based client to create session as target user
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: targetEmail,
      token: emailOtp,
      type: "magiclink",
    });

    if (verifyError) {
      console.error("[Admin Impersonate] verifyOtp error:", verifyError);
      return NextResponse.json(
        { error: verifyError.message },
        { status: 500 }
      );
    }

    console.warn(
      `[Admin Impersonate] Admin ${user.email} impersonating ${targetEmail}`
    );

    return NextResponse.json({ success: true, targetEmail });
  } catch (error) {
    console.error("[Admin Impersonate] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
