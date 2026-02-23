import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionCode } from "@/lib/services/notion";

const DEFAULT_RETURN_TO = "/onboarding";

interface NotionOAuthState {
  returnTo?: unknown;
  selectDb?: unknown;
  traceId?: unknown;
}

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

function toTraceId(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "trace-unknown";
}

function logWithTrace(traceId: string, message: string, details?: Record<string, unknown>) {
  if (details) {
    console.warn(`[Notion Callback][${traceId}] ${message}`, details);
    return;
  }
  console.warn(`[Notion Callback][${traceId}] ${message}`);
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
  let traceId = "trace-unknown";
  if (state) {
    try {
      const parsed = JSON.parse(state) as NotionOAuthState;
      returnTo = sanitizeReturnTo(parsed?.returnTo, DEFAULT_RETURN_TO);
      selectDb = parsed?.selectDb === "true" || parsed?.selectDb === true;
      traceId = toTraceId(parsed?.traceId);
    } catch (e) {
      console.error("[Notion Callback] Failed to parse state:", e);
    }
  }

  const configuredRedirectUri = process.env.NOTION_REDIRECT_URI;
  logWithTrace(traceId, "Received callback", {
    hasCode: Boolean(code),
    hasError: Boolean(error),
    returnTo,
    selectDb,
    requestOrigin,
    canonicalOrigin,
  });

  if (process.env.NODE_ENV === "production" && !configuredRedirectUri) {
    logWithTrace(traceId, "Missing NOTION_REDIRECT_URI");
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, {
        errorCode: "notion_not_configured",
        params: { trace: traceId },
      })
    );
  }

  if (error) {
    logWithTrace(traceId, "Authorization denied or failed", { notionError: error });
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, {
        errorCode: "notion_auth_failed",
        params: { trace: traceId },
      })
    );
  }

  if (!code) {
    logWithTrace(traceId, "Missing authorization code");
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, {
        errorCode: "no_code",
        params: { trace: traceId },
      })
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logWithTrace(traceId, "No authenticated user in callback");
      return NextResponse.redirect(
        buildRedirectUrl(canonicalOrigin, returnTo, {
          errorCode: "no_session",
          params: { trace: traceId },
        })
      );
    }

    // Exchange code for access token
    // IMPORTANT: The redirect_uri must match exactly what was used in the initial auth request
    const redirectUri = configuredRedirectUri || `${requestOrigin}/api/auth/notion/callback`;
    logWithTrace(traceId, "Exchanging code", { redirectUri, userId: user.id });

    const { access_token } = await exchangeNotionCode(code, redirectUri);
    logWithTrace(traceId, "Received access token, updating user");

    // Update user with Notion credentials
    const { error: updateError } = await supabase
      .from("users")
      .update({
        notion_access_token: access_token,
        // notion_database_id: will be set later when user selects
      })
      .eq("id", user.id);

    if (updateError) {
      console.error(`[Notion Callback][${traceId}] DB update error:`, updateError);
      return NextResponse.redirect(
        buildRedirectUrl(canonicalOrigin, returnTo, {
          errorCode: "db_update_failed",
          params: { trace: traceId },
        })
      );
    }

    logWithTrace(traceId, "Successfully saved token to DB");

    const redirectParams: Record<string, string> = { notion: "connected" };
    if (selectDb) {
      redirectParams.selectDb = "true";
    }
    logWithTrace(traceId, "OAuth completed", { returnTo, selectDb });
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, { params: redirectParams })
    );
  } catch (err) {
    console.error(`[Notion Callback][${traceId}] OAuth error:`, err);
    return NextResponse.redirect(
      buildRedirectUrl(canonicalOrigin, returnTo, {
        errorCode: "notion_exchange_failed",
        params: { trace: traceId },
      })
    );
  }
}
