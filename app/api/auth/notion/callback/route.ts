import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionCode } from "@/lib/services/notion";

// Helper function to get the correct app URL
function getAppUrl(request: NextRequest): string {
  // Priority:
  // 1. NEXT_PUBLIC_APP_URL environment variable (for production)
  // 2. Vercel URL (for preview deployments)
  // 3. Request origin (for local development)

  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL !== "http://localhost:3000") {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // For Vercel deployments, use the VERCEL_URL or request origin
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback to request origin
  const origin = request.headers.get("origin") || request.headers.get("host");
  if (origin) {
    const protocol = origin.includes("localhost") ? "http" : "https";
    return origin.startsWith("http") ? origin : `${protocol}://${origin}`;
  }

  // Final fallback
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const appUrl = getAppUrl(request);

  // Parse returnTo and selectDb from state
  let returnTo = "/onboarding";
  let selectDb = false;
  if (state) {
    try {
      const parsed = JSON.parse(state);
      returnTo = parsed.returnTo || returnTo;
      selectDb = parsed.selectDb === "true";
    } catch (e) {
      console.error("Failed to parse state:", e);
    }
  }

  if (error) {
    return NextResponse.redirect(
      `${appUrl}${returnTo}?error=notion_auth_failed`
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

    // Exchange code for access token
    // IMPORTANT: The redirect_uri must match exactly what was used in the initial auth request
    const redirectUri = `${appUrl}/api/auth/notion/callback`;
    console.log("[Notion Callback] Using redirect URI:", redirectUri);

    const { access_token } = await exchangeNotionCode(code, redirectUri);

    // Update user with Notion credentials
    await supabase
      .from("users")
      .update({
        notion_access_token: access_token,
        // notion_database_id: will be set later when user selects
      })
      .eq("id", user.id);

    const redirectUrl = new URL(`${appUrl}${returnTo}`);
    redirectUrl.searchParams.set("notion", "connected");
    if (selectDb) {
      redirectUrl.searchParams.set("selectDb", "true");
    }
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Notion OAuth error:", err);
    return NextResponse.redirect(
      `${appUrl}${returnTo}?error=notion_exchange_failed`
    );
  }
}
