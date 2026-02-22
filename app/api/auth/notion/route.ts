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

// GET /api/auth/notion - Redirect to Notion OAuth
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/onboarding");
  const selectDb = searchParams.get("selectDb");
  const appOrigin = resolveAppOrigin(request);

  const configuredRedirectUri = process.env.NOTION_REDIRECT_URI;
  if (process.env.NODE_ENV === "production" && !configuredRedirectUri) {
    const errorUrl = new URL(returnTo, appOrigin);
    errorUrl.searchParams.set("error", "notion_not_configured");
    return NextResponse.redirect(errorUrl.toString());
  }

  // Use environment variable for redirect URI to ensure consistency with Notion developer console
  const redirectUri = configuredRedirectUri || `${requestUrl.origin}/api/auth/notion/callback`;

  console.log("[Notion Auth] Using redirect URI:", redirectUri);

  const state = JSON.stringify({ returnTo, selectDb });
  const authUrl = getNotionAuthUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
