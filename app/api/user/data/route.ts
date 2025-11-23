import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/user/data - Get user connection status
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user data
    const { data: userData, error } = await supabase
      .from("users")
      .select("notion_access_token, slack_access_token")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      notionConnected: !!userData?.notion_access_token,
      slackConnected: !!userData?.slack_access_token,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/user/data - Delete all user data
export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all recordings
    const { data: recordings } = await supabase
      .from("recordings")
      .select("audio_file_path")
      .eq("user_id", user.id);

    // Delete all audio files
    if (recordings && recordings.length > 0) {
      const filePaths = recordings.map((r) => r.audio_file_path);
      await supabase.storage.from("recordings").remove(filePaths);
    }

    // Delete all recordings (cascade will handle this, but explicit is better)
    await supabase.from("recordings").delete().eq("user_id", user.id);

    // Delete all custom formats
    await supabase.from("custom_formats").delete().eq("user_id", user.id);

    // Reset user data
    await supabase
      .from("users")
      .update({
        notion_access_token: null,
        notion_database_id: null,
        slack_access_token: null,
        slack_channel_id: null,
        monthly_minutes_used: 0,
      })
      .eq("id", user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
