import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getValidAccessToken, getGoogleDriveFolders } from "@/lib/services/google";

// GET /api/google/folders - Get Google Drive folders
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Google tokens
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("google_access_token, google_refresh_token, google_token_expires_at")
      .eq("id", user.id)
      .single();

    if (userError || !userData?.google_access_token) {
      return NextResponse.json(
        { error: "Google not connected" },
        { status: 400 }
      );
    }

    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken({
      access_token: userData.google_access_token,
      refresh_token: userData.google_refresh_token,
      token_expires_at: userData.google_token_expires_at,
    });

    // If token was refreshed, update it in the database
    if (accessToken !== userData.google_access_token) {
      await supabase
        .from("users")
        .update({ google_access_token: accessToken })
        .eq("id", user.id);
    }

    // Get folders from Google Drive
    const folders = await getGoogleDriveFolders(accessToken);

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("[Google Folders] API error:", error);
    return NextResponse.json(
      { error: "Failed to get folders" },
      { status: 500 }
    );
  }
}
