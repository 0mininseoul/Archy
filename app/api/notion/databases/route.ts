import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getNotionDatabases } from "@/lib/services/notion";

export const runtime = "edge";

// GET /api/notion/databases - List user's Notion databases
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Notion access token
    const { data: userData } = await supabase
      .from("users")
      .select("notion_access_token")
      .eq("id", user.id)
      .single();

    if (!userData?.notion_access_token) {
      return NextResponse.json(
        { error: "Notion not connected" },
        { status: 400 }
      );
    }

    const databases = await getNotionDatabases(userData.notion_access_token);

    return NextResponse.json({ databases });
  } catch (error) {
    console.error("Failed to fetch Notion databases:", error);
    return NextResponse.json(
      { error: "Failed to fetch databases" },
      { status: 500 }
    );
  }
}
