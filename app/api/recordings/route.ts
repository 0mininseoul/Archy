import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/services/whisper";
import { formatDocument } from "@/lib/services/openai";
import { createNotionPage } from "@/lib/services/notion";
import { sendSlackNotification } from "@/lib/services/slack";
import { FORMAT_PROMPTS } from "@/lib/prompts";
import { formatKSTDate } from "@/lib/utils";

// POST /api/recordings - Upload and process recording
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const duration = parseInt(formData.get("duration") as string);
    const format = (formData.get("format") as string) || "meeting";

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Check usage limit
    const durationMinutes = Math.ceil(duration / 60);
    if (userData.monthly_minutes_used + durationMinutes > 350) {
      return NextResponse.json(
        { error: "Monthly usage limit exceeded" },
        { status: 403 }
      );
    }

    // Generate title
    const title = `Flownote - ${formatKSTDate()}`;

    // Upload audio to Supabase Storage
    const fileName = `${user.id}/${Date.now()}.webm`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(fileName, audioFile);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload audio" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("recordings").getPublicUrl(fileName);

    // Create recording record
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: fileName,
        duration_seconds: duration,
        format,
        status: "processing",
      })
      .select()
      .single();

    if (recordingError) {
      console.error("Recording error:", recordingError);
      return NextResponse.json(
        { error: "Failed to create recording" },
        { status: 500 }
      );
    }

    // Process in background (in production, use a queue)
    processRecording(
      recording.id,
      audioFile,
      format as keyof typeof FORMAT_PROMPTS,
      duration,
      userData,
      title,
      publicUrl
    ).catch(console.error);

    // Update usage
    await supabase
      .from("users")
      .update({
        monthly_minutes_used: userData.monthly_minutes_used + durationMinutes,
      })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      recording: {
        id: recording.id,
        title: recording.title,
        status: recording.status,
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/recordings - List recordings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: recordings, error } = await supabase
      .from("recordings")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recordings });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Background processing function
async function processRecording(
  recordingId: string,
  audioFile: File,
  format: keyof typeof FORMAT_PROMPTS,
  duration: number,
  userData: any,
  title: string,
  audioUrl: string
) {
  const supabase = await createClient();

  try {
    // Step 1: Transcribe audio
    const transcript = await transcribeAudio(audioFile);

    await supabase
      .from("recordings")
      .update({ transcript })
      .eq("id", recordingId);

    // Step 2: Format document with AI
    const formattedContent = await formatDocument(transcript, format);

    await supabase
      .from("recordings")
      .update({ formatted_content: formattedContent })
      .eq("id", recordingId);

    // Step 3: Create Notion page
    let notionUrl = "";
    if (userData.notion_access_token && userData.notion_database_id) {
      notionUrl = await createNotionPage(
        userData.notion_access_token,
        userData.notion_database_id,
        title,
        formattedContent,
        format,
        duration,
        audioUrl
      );

      await supabase
        .from("recordings")
        .update({ notion_page_url: notionUrl })
        .eq("id", recordingId);
    }

    // Step 4: Send Slack notification
    if (userData.slack_access_token && userData.slack_channel_id && notionUrl) {
      await sendSlackNotification(
        userData.slack_access_token,
        userData.slack_channel_id,
        title,
        duration,
        notionUrl
      );
    }

    // Mark as completed
    await supabase
      .from("recordings")
      .update({ status: "completed" })
      .eq("id", recordingId);
  } catch (error) {
    console.error("Processing error:", error);

    // Mark as failed
    await supabase
      .from("recordings")
      .update({ status: "failed" })
      .eq("id", recordingId);
  }
}
