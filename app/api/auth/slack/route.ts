import { NextRequest, NextResponse } from "next/server";
import { getSlackAuthUrl } from "@/lib/services/slack";

// GET /api/auth/slack - Redirect to Slack OAuth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const authUrl = getSlackAuthUrl(redirectUri);

  return NextResponse.redirect(authUrl);
}
