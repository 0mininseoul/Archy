import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/google - Redirect to Google OAuth
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard/settings";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error("[Google Auth] Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI");
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?error=google_not_configured`
    );
  }

  // State에 returnTo 저장
  const state = JSON.stringify({ returnTo });

  // Google OAuth URL 생성
  const scopes = [
    "https://www.googleapis.com/auth/drive.file", // 앱이 생성한 파일만 접근
  ];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline"); // refresh token 받기 위해
  authUrl.searchParams.set("prompt", "consent"); // 항상 동의 화면 표시
  authUrl.searchParams.set("state", state);

  console.log("[Google Auth] Redirecting to:", authUrl.toString());

  return NextResponse.redirect(authUrl.toString());
}
