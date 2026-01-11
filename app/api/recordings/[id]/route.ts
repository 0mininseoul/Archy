import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/recordings/[id] - Get recording details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: recording, error } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ recording });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/recordings/[id] - Update recording (e.g., title)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, is_hidden } = body;

    // Build update object
    const updateData: any = {};

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return NextResponse.json(
          { error: "Invalid title" },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }

    if (is_hidden !== undefined) {
      if (typeof is_hidden !== "boolean") {
        return NextResponse.json(
          { error: "Invalid is_hidden value" },
          { status: 400 }
        );
      }
      updateData.is_hidden = is_hidden;
    }

    if (body.is_pinned !== undefined) {
      if (typeof body.is_pinned !== "boolean") {
        return NextResponse.json(
          { error: "Invalid is_pinned value" },
          { status: 400 }
        );
      }
      updateData.is_pinned = body.is_pinned;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("recordings")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ recording: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/recordings/[id] - Delete recording
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get recording
    const { data: recording } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Delete audio file from storage (if exists)
    if (recording.audio_file_path) {
      await supabase.storage
        .from("recordings")
        .remove([recording.audio_file_path]);
    }

    // Delete recording record
    const { error } = await supabase
      .from("recordings")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
