import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeSlackCode } from "@/lib/services/slack";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnTo = searchParams.get("returnTo");

  const defaultRedirect = returnTo || "/onboarding";

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=slack_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=no_code`
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`);
    }

    // Exchange code for access token
    const baseRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`;
    const redirectUri = returnTo
      ? `${baseRedirectUri}?returnTo=${encodeURIComponent(returnTo)}`
      : baseRedirectUri;
    const { access_token } = await exchangeSlackCode(code, redirectUri);

    // For MVP, we'll use a default channel. In production, let user select.
    // You can call Slack API to get user's channels and let them choose.

    // Update user with Slack credentials
    await supabase
      .from("users")
      .update({
        slack_access_token: access_token,
        // slack_channel_id: will be set later when user selects
      })
      .eq("id", user.id);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?slack=connected`
    );
  } catch (err) {
    console.error("Slack OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=slack_exchange_failed`
    );
  }
}
