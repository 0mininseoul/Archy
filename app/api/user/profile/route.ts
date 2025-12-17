import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/user/profile - Get user profile with connection status
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user data from users table including connection status
    const { data: userData } = await supabase
      .from("users")
      .select("notion_access_token, notion_database_id, slack_access_token, notion_save_target")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      email: user.email,
      notion_access_token: userData?.notion_access_token || null,
      notion_database_id: userData?.notion_database_id || null,
      slack_access_token: userData?.slack_access_token || null,
      notion_save_target: userData?.notion_save_target || null,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
