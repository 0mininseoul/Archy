import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createNotionDatabase } from "@/lib/services/notion";

export const runtime = "edge";

// POST /api/notion/database - Create a new database in a page
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pageId, title } = await request.json();

    if (!pageId) {
      return NextResponse.json(
        { error: "Page ID is required" },
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

    const databaseId = await createNotionDatabase(
      userData.notion_access_token,
      pageId,
      title
    );

    return NextResponse.json({ databaseId });
  } catch (error) {
    console.error("Failed to create Notion database:", error);
    return NextResponse.json(
      { error: "Failed to create database" },
      { status: 500 }
    );
  }
}
