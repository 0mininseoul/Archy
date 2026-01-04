import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Parse returnTo from state
  let returnTo = "/settings";
  if (state) {
    try {
      const parsed = JSON.parse(state);
      returnTo = parsed.returnTo || returnTo;
    } catch (e) {
      console.error("[Google Callback] Failed to parse state:", e);
    }
  }

  if (error) {
    console.error("[Google Callback] OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}${returnTo}?error=google_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}${returnTo}?error=no_code`
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("[Google Callback] Token exchange failed:", errorData);
      return NextResponse.redirect(
        `${appUrl}${returnTo}?error=google_token_failed`
      );
    }

    const tokens = await tokenResponse.json();
    console.log("[Google Callback] Got tokens, updating DB for user:", user.id);

    // Fetch user info from Google
    let userName: string | null = null;
    try {
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        userName = userInfo.name || null;
        console.log("[Google Callback] Got user name:", userName);
      }
    } catch (err) {
      console.error("[Google Callback] Failed to fetch user info:", err);
    }

    // Update user with Google credentials and name
    const { error: updateError } = await supabase
      .from("users")
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token || null,
        google_token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        ...(userName && { name: userName }),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[Google Callback] DB update error:", updateError);
      return NextResponse.redirect(
        `${appUrl}${returnTo}?error=db_update_failed`
      );
    }

    console.log("[Google Callback] Successfully saved tokens to DB");

    const redirectUrl = new URL(`${appUrl}${returnTo}`);
    redirectUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("[Google Callback] Error:", err);
    return NextResponse.redirect(
      `${appUrl}${returnTo}?error=google_exchange_failed`
    );
  }
}
