import { NextRequest, NextResponse } from "next/server";
import { getNotionAuthUrl } from "@/lib/services/notion";

function sanitizeReturnTo(returnTo: string | null, fallback: string): string {
  if (!returnTo) return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo;
}

function resolveAppOrigin(request: NextRequest): string {
  const requestOrigin = new URL(request.url).origin;
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredAppUrl) return requestOrigin;

  try {
    return new URL(configuredAppUrl).origin;
  } catch (error) {
    console.error("[Notion Auth] Invalid NEXT_PUBLIC_APP_URL:", error);
    return requestOrigin;
  }
}

function createTraceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

// GET /api/auth/notion - Redirect to Notion OAuth
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/onboarding");
  const selectDb = searchParams.get("selectDb");
  const appOrigin = resolveAppOrigin(request);
  const traceId = createTraceId();

  const configuredRedirectUri = process.env.NOTION_REDIRECT_URI;
  if (process.env.NODE_ENV === "production" && !configuredRedirectUri) {
    const errorUrl = new URL(returnTo, appOrigin);
    errorUrl.searchParams.set("error", "notion_not_configured");
    errorUrl.searchParams.set("trace", traceId);
    console.error("[Notion Auth] Missing NOTION_REDIRECT_URI", {
      traceId,
      returnTo,
      appOrigin,
    });
    return NextResponse.redirect(errorUrl.toString());
  }

  // Use environment variable for redirect URI to ensure consistency with Notion developer console
  const redirectUri = configuredRedirectUri || `${requestUrl.origin}/api/auth/notion/callback`;

  console.warn("[Notion Auth] Start OAuth", {
    traceId,
    redirectUri,
    returnTo,
    selectDb,
    appOrigin,
  });

  const state = JSON.stringify({ returnTo, selectDb, traceId });
  const authUrl = getNotionAuthUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
