import { NextRequest, NextResponse } from "next/server";
import { getNotionAuthUrl } from "@/lib/services/notion";

// GET /api/auth/notion - Redirect to Notion OAuth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo");
  const selectDb = searchParams.get("selectDb");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/notion/callback`;
  const state = returnTo ? JSON.stringify({ returnTo, selectDb }) : undefined;
  const authUrl = getNotionAuthUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
