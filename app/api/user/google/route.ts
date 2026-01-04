import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PUT /api/user/google - Update Google folder settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { folderId, folderName } = await request.json();

    const { error } = await supabase
      .from("users")
      .update({
        google_folder_id: folderId,
        google_folder_name: folderName,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[Google] Failed to update folder:", error);
      return NextResponse.json(
        { error: "Failed to update Google folder" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/user/google - Disconnect Google
export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("users")
      .update({
        google_access_token: null,
        google_refresh_token: null,
        google_token_expires_at: null,
        google_folder_id: null,
        google_folder_name: null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[Google] Failed to disconnect:", error);
      return NextResponse.json(
        { error: "Failed to disconnect Google" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
