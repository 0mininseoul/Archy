import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeSlackCode, getSlackDMChannelId } from "@/lib/services/slack";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  // Parse returnTo from state
  let returnTo = "/onboarding";
  if (state) {
    try {
      const parsed = JSON.parse(state);
      returnTo = parsed.returnTo || returnTo;
    } catch (e) {
      console.error("Failed to parse state:", e);
    }
  }

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?error=slack_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?error=no_code`
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
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`;
    const { access_token, user_id: slack_user_id } = await exchangeSlackCode(code, redirectUri);

    // Get DM channel ID
    // We open a DM with the user themselves (the one who authenticated) so the app speaks to them securely.
    let dmChannelId = "";
    try {
      dmChannelId = await getSlackDMChannelId(access_token, slack_user_id);
    } catch (dmError) {
      console.error("Failed to get DM channel:", dmError);
      // Fallback: don't set channel ID, user might need to retry or we handle it later
    }

    // Update user with Slack credentials
    await supabase
      .from("users")
      .update({
        slack_access_token: access_token,
        slack_channel_id: dmChannelId || null, // Save the DM channel ID
      })
      .eq("id", user.id);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?slack=connected`
    );
  } catch (err) {
    console.error("Slack OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?error=slack_exchange_failed`
    );
  }
}
