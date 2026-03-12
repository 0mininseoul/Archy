import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

// POST /api/admin/impersonate - Generate a magic link to log in as a specific user
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

    // Generate magic link for the target user
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
        options: {
          redirectTo: `${siteUrl}/api/auth/callback?next=/dashboard`,
        },
      });

    if (linkError || !linkData) {
      console.error("[Admin Impersonate] generateLink error:", linkError);
      return NextResponse.json(
        { error: linkError?.message || "Failed to generate link" },
        { status: 500 }
      );
    }

    // action_link is the Supabase-hosted verification URL
    // When visited, Supabase verifies the token and redirects to our callback with a code
    const actionLink = linkData.properties?.action_link;

    if (!actionLink) {
      return NextResponse.json(
        { error: "Failed to generate action link" },
        { status: 500 }
      );
    }

    console.warn(
      `[Admin Impersonate] Admin ${user.email} impersonating ${targetEmail}`
    );

    return NextResponse.json({
      success: true,
      targetEmail,
      url: actionLink,
    });
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
