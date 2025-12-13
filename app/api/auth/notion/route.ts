import { NextRequest, NextResponse } from "next/server";
import { getNotionAuthUrl } from "@/lib/services/notion";

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

// GET /api/auth/notion - Redirect to Notion OAuth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo");
  const selectDb = searchParams.get("selectDb");

  const appUrl = getAppUrl(request);
  const redirectUri = `${appUrl}/api/auth/notion/callback`;

  console.log("[Notion Auth] Using redirect URI:", redirectUri);

  const state = returnTo ? JSON.stringify({ returnTo, selectDb }) : undefined;
  const authUrl = getNotionAuthUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
