import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionCode } from "@/lib/services/notion";

const DEFAULT_RETURN_TO = "/onboarding";

function sanitizeReturnTo(returnTo: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof returnTo !== "string") return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo;
}

function resolveCanonicalOrigin(requestOrigin: string): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredAppUrl) return requestOrigin;

  try {
    return new URL(configuredAppUrl).origin;
  } catch (error) {
    console.error("[Notion Callback] Invalid NEXT_PUBLIC_APP_URL:", error);
    return requestOrigin;
  }
}

function buildRedirectUrl(
  origin: string,
  path: string,
  options?: { errorCode?: string; params?: Record<string, string> }
): string {
  const safePath = sanitizeReturnTo(path, DEFAULT_RETURN_TO);
  const redirectUrl = new URL(safePath, origin);

  if (options?.errorCode) {
    redirectUrl.searchParams.set("error", options.errorCode);
  }

  if (options?.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      redirectUrl.searchParams.set(key, value);
    });
  }

  return redirectUrl.toString();
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const requestOrigin = requestUrl.origin;
  const canonicalOrigin = resolveCanonicalOrigin(requestOrigin);

  // Parse returnTo and selectDb from state
  let returnTo = DEFAULT_RETURN_TO;
  let selectDb = false;
  if (state) {
    try {
      const parsed = JSON.parse(state);
      returnTo = sanitizeReturnTo(parsed?.returnTo, DEFAULT_RETURN_TO);
      selectDb = parsed?.selectDb === "true" || parsed?.selectDb === true;
    } catch (e) {
      console.error("[Notion Callback] Failed to parse state:", e);
    }
  }

  const configuredRedirectUri = process.env.NOTION_REDIRECT_URI;
  if (process.env.NODE_ENV === "production" && !configuredRedirectUri) {
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { errorCode: "notion_not_configured" })
    );
  }

  if (error) {
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { errorCode: "notion_auth_failed" })
    );
  }

  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { errorCode: "no_code" })
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(buildRedirectUrl(canonicalOrigin, "/"));
    }

    // Exchange code for access token
    // IMPORTANT: The redirect_uri must match exactly what was used in the initial auth request
    const redirectUri = configuredRedirectUri || `${requestOrigin}/api/auth/notion/callback`;
    console.log("[Notion Callback] Using redirect URI:", redirectUri);

    const { access_token } = await exchangeNotionCode(code, redirectUri);
    console.log("[Notion Callback] Got access token, updating DB for user:", user.id);

    // Update user with Notion credentials
    const { error: updateError } = await supabase
      .from("users")
      .update({
        notion_access_token: access_token,
        // notion_database_id: will be set later when user selects
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[Notion Callback] DB update error:", updateError);
      return NextResponse.redirect(
        buildRedirectUrl(canonicalOrigin, returnTo, { errorCode: "db_update_failed" })
      );
    }

    console.log("[Notion Callback] Successfully saved token to DB");

    const redirectParams: Record<string, string> = { notion: "connected" };
    if (selectDb) {
      redirectParams.selectDb = "true";
    }
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { params: redirectParams })
    );
  } catch (err) {
    console.error("Notion OAuth error:", err);
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { errorCode: "notion_exchange_failed" })
    );
  }
}
