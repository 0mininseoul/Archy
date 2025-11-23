import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionCode } from "@/lib/services/notion";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnTo = searchParams.get("returnTo");

  const defaultRedirect = returnTo || "/onboarding";

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=notion_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=no_code`
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`);
    }

    // Exchange code for access token
    const baseRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/notion/callback`;
    const redirectUri = returnTo
      ? `${baseRedirectUri}?returnTo=${encodeURIComponent(returnTo)}`
      : baseRedirectUri;
    const { access_token } = await exchangeNotionCode(code, redirectUri);

    // For MVP, we'll use a default database. In production, let user select.
    // You'll need to call Notion API to get user's databases and let them choose.

    // Update user with Notion credentials
    await supabase
      .from("users")
      .update({
        notion_access_token: access_token,
        // notion_database_id: will be set later when user selects
      })
      .eq("id", user.id);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?notion=connected`
    );
  } catch (err) {
    console.error("Notion OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${defaultRedirect}?error=notion_exchange_failed`
    );
  }
}
