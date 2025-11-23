import { NextRequest, NextResponse } from "next/server";
import { getNotionAuthUrl } from "@/lib/services/notion";

// GET /api/auth/notion - Redirect to Notion OAuth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/notion/callback${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const authUrl = getNotionAuthUrl(redirectUri);

  return NextResponse.redirect(authUrl);
}
