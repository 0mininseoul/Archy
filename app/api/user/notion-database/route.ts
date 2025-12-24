import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PUT /api/user/notion-database - Update user's Notion save target (database or page)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { databaseId, pageId, saveTargetType, title } = body;

    // At least one of databaseId or pageId must be provided
    const targetId = databaseId || pageId;
    if (!targetId) {
      return NextResponse.json(
        { error: "Database ID or Page ID is required" },
        { status: 400 }
      );
    }

    // Update notion_database_id with the selected target ID
    // We use this field to store whichever target (database or page) is selected
    const { error: updateError } = await supabase
      .from("users")
      .update({
        notion_database_id: targetId,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update Notion save target:", updateError);
      return NextResponse.json(
        { error: "Failed to update save target" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      saveTarget: {
        type: saveTargetType || (databaseId ? "database" : "page"),
        id: targetId,
        title: title || "Untitled",
      },
    });
  } catch (error) {
    console.error("Failed to update Notion save target:", error);
    return NextResponse.json(
      { error: "Failed to update save target" },
      { status: 500 }
    );
  }
}

// DELETE /api/user/notion-database - Disconnect Notion
export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear all Notion related fields
    const { error: updateError } = await supabase
      .from("users")
      .update({
        notion_access_token: null,
        notion_database_id: null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to disconnect Notion:", updateError);
      return NextResponse.json(
        { error: "Failed to disconnect Notion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to disconnect Notion:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Notion" },
      { status: 500 }
    );
  }
}
