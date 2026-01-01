import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

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
    // Note: notion_save_target 컬럼이 DB에 없을 수 있으므로 기본 컬럼만 조회
    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select("notion_access_token, notion_database_id, slack_access_token")
      .eq("id", user.id)
      .single();

    // 디버깅: DB 조회 결과 확인
    console.log("[Profile API] User ID:", user.id);
    console.log("[Profile API] DB query result:", {
      hasData: !!userData,
      dbError: dbError?.message,
      hasNotionToken: !!userData?.notion_access_token,
      notionTokenLength: userData?.notion_access_token?.length || 0,
    });

    return NextResponse.json({
      email: user.email,
      notion_access_token: userData?.notion_access_token || null,
      notion_database_id: userData?.notion_database_id || null,
      slack_access_token: userData?.slack_access_token || null,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
