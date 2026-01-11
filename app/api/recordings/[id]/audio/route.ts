import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/recordings/[id]/audio - Get signed URL for audio playback
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get recording with audio_file_path
    const { data: recording, error } = await supabase
      .from("recordings")
      .select("audio_file_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !recording) {
      return NextResponse.json(
        { success: false, error: "Recording not found" },
        { status: 404 }
      );
    }

    // Check if audio exists
    if (!recording.audio_file_path) {
      return NextResponse.json(
        { success: true, data: { hasAudio: false } },
        { status: 200 }
      );
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from("recordings")
      .createSignedUrl(recording.audio_file_path, 3600);

    if (urlError || !signedUrl) {
      console.error("[Audio URL] Failed to generate signed URL:", urlError);
      return NextResponse.json(
        { success: false, error: "Failed to generate audio URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        hasAudio: true,
        url: signedUrl.signedUrl,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    console.error("[Audio URL] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
