import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createNotionStandalonePage } from "@/lib/services/notion";

export const runtime = "edge";

// POST /api/notion/page - Create a new standalone page
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
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

    const pageId = await createNotionStandalonePage(
      userData.notion_access_token,
      title
    );

    return NextResponse.json({ pageId });
  } catch (error) {
    console.error("Failed to create Notion page:", error);
    return NextResponse.json(
      { error: "Failed to create page" },
      { status: 500 }
    );
  }
}
