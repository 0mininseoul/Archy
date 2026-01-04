import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/services/whisper";
import { formatDocument, formatDocumentAuto } from "@/lib/services/openai";
import { createNotionPage } from "@/lib/services/notion";
import { sendSlackNotification } from "@/lib/services/slack";
import { createGoogleDoc, getValidAccessToken, convertMarkdownToPlainText } from "@/lib/services/google";
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

    // Create recording record (audio file will not be stored)
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null, // Audio files are not stored - only transcript is saved
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
    // Audio file is sent directly to Groq API and not stored
    processRecording(
      recording.id,
      audioFile,
      format as keyof typeof FORMAT_PROMPTS,
      duration,
      userData,
      title
    ).catch(async (error) => {
      console.error(`[${recording.id}] Critical error in processRecording:`, error);
      // Update status to failed if uncaught error
      try {
        const supabase = await createClient();
        await supabase
          .from("recordings")
          .update({
            status: "failed",
            error_step: "upload",
            error_message: `Critical error: ${error instanceof Error ? error.message : "Unknown error"}`
          })
          .eq("id", recording.id);
      } catch (updateError) {
        console.error(`[${recording.id}] Failed to update error status:`, updateError);
      }
    });

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
      .neq("is_hidden", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audio files are not stored, so no audio_url is returned
    return NextResponse.json({ recordings });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Background processing function with detailed error tracking
// Audio file is sent directly to Groq API and discarded after transcription
async function processRecording(
  recordingId: string,
  audioFile: File,
  format: keyof typeof FORMAT_PROMPTS,
  duration: number,
  userData: any,
  title: string
) {
  const supabase = await createClient();

  try {
    console.log(`[${recordingId}] Starting processing...`);

    // Step 1: Transcribe audio
    let transcript: string;
    try {
      console.log(`[${recordingId}] Step 1: Transcribing audio...`);

      // Update processing_step to 'transcription'
      await supabase
        .from("recordings")
        .update({ processing_step: "transcription" })
        .eq("id", recordingId);

      transcript = await transcribeAudio(audioFile);

      if (!transcript || transcript.trim().length === 0) {
        throw new Error("Transcription returned empty result");
      }

      await supabase
        .from("recordings")
        .update({ transcript })
        .eq("id", recordingId);

      console.log(`[${recordingId}] Transcription completed, length: ${transcript.length}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown transcription error";
      console.error(`[${recordingId}] Transcription failed:`, errorMessage);

      await supabase
        .from("recordings")
        .update({
          status: "failed",
          error_step: "transcription",
          error_message: errorMessage
        })
        .eq("id", recordingId);

      return; // Stop processing
    }

    // Step 2: Format document with AI (자동 포맷 감지 또는 지정된 포맷 사용)
    let formattedContent: string;
    let aiGeneratedTitle: string = title; // 기본값은 원래 제목
    try {
      console.log(`[${recordingId}] Step 2: Formatting document...`);

      // Update processing_step to 'formatting'
      await supabase
        .from("recordings")
        .update({ processing_step: "formatting" })
        .eq("id", recordingId);

      // 커스텀 포맷이 있는지 확인
      const { data: defaultFormat } = await supabase
        .from("custom_formats")
        .select("prompt")
        .eq("user_id", userData.id)
        .eq("is_default", true)
        .single();

      let formatResult;
      if (defaultFormat?.prompt) {
        // 커스텀 포맷이 있으면 기존 방식 사용
        console.log(`[${recordingId}] Using custom format`);
        formatResult = await formatDocument(transcript, format, defaultFormat.prompt);
      } else {
        // 커스텀 포맷이 없으면 자동 감지 사용
        console.log(`[${recordingId}] Using auto format detection`);
        formatResult = await formatDocumentAuto(transcript);
        if (formatResult.detectedType) {
          console.log(`[${recordingId}] Detected content type: ${formatResult.detectedType}`);
        }
      }

      if (!formatResult.content || formatResult.content.trim().length === 0) {
        // If formatting fails, use raw transcript
        console.warn(`[${recordingId}] Formatting returned empty, using raw transcript`);
        formattedContent = transcript;
      } else {
        formattedContent = formatResult.content;
      }

      // AI가 생성한 제목이 있으면 사용
      if (formatResult.title && formatResult.title.trim().length > 0) {
        aiGeneratedTitle = formatResult.title;
        console.log(`[${recordingId}] AI generated title: ${aiGeneratedTitle}`);
      }

      await supabase
        .from("recordings")
        .update({
          formatted_content: formattedContent,
          title: aiGeneratedTitle
        })
        .eq("id", recordingId);

      console.log(`[${recordingId}] Formatting completed`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown formatting error";
      console.error(`[${recordingId}] Formatting failed:`, errorMessage);

      // Formatting failure is not critical - use raw transcript
      formattedContent = transcript;

      await supabase
        .from("recordings")
        .update({
          formatted_content: transcript,
          error_step: "formatting",
          error_message: `Formatting failed (using raw transcript): ${errorMessage}`
        })
        .eq("id", recordingId);

      console.log(`[${recordingId}] Using raw transcript due to formatting error`);
    }

    // Step 3: Create Notion page (optional)
    // Note: Audio file is not attached to Notion page (only text content)
    let notionUrl = "";
    if (userData.notion_access_token) {
      if (!userData.notion_database_id) {
        // 노션 연결은 됐지만 저장 위치가 지정되지 않은 경우
        console.log(`[${recordingId}] Notion connected but no save target set`);
        await supabase
          .from("recordings")
          .update({
            error_step: "notion",
            error_message: "노션 저장 위치가 지정되지 않았습니다. 설정에서 저장 위치를 선택해주세요."
          })
          .eq("id", recordingId);
      } else {
        try {
          console.log(`[${recordingId}] Step 3: Creating Notion page...`);

          // Update processing_step to 'saving'
          await supabase
            .from("recordings")
            .update({ processing_step: "saving" })
            .eq("id", recordingId);
          notionUrl = await createNotionPage(
            userData.notion_access_token,
            userData.notion_database_id,
            aiGeneratedTitle,
            formattedContent,
            format,
            duration,
            userData.notion_save_target_type || "database"
          );

          await supabase
            .from("recordings")
            .update({ notion_page_url: notionUrl })
            .eq("id", recordingId);

          console.log(`[${recordingId}] Notion page created: ${notionUrl}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown Notion error";
          console.error(`[${recordingId}] Notion creation failed:`, errorMessage);

          // Notion failure is not critical - continue processing
          await supabase
            .from("recordings")
            .update({
              error_step: "notion",
              error_message: `Notion 저장 실패: ${errorMessage}`
            })
            .eq("id", recordingId);
        }
      }
    }

    // Step 4: Create Google Doc (optional)
    let googleDocUrl = "";
    if (userData.google_access_token) {
      try {
        console.log(`[${recordingId}] Step 4: Creating Google Doc...`);

        // Get valid access token (refresh if needed)
        const accessToken = await getValidAccessToken({
          access_token: userData.google_access_token,
          refresh_token: userData.google_refresh_token,
          token_expires_at: userData.google_token_expires_at,
        });

        // If token was refreshed, update it in the database
        if (accessToken !== userData.google_access_token) {
          await supabase
            .from("users")
            .update({ google_access_token: accessToken })
            .eq("id", userData.id);
        }

        // Convert markdown to plain text for Google Docs
        const plainTextContent = convertMarkdownToPlainText(formattedContent);

        googleDocUrl = await createGoogleDoc(
          accessToken,
          aiGeneratedTitle,
          plainTextContent,
          userData.google_folder_id || undefined
        );

        await supabase
          .from("recordings")
          .update({ google_doc_url: googleDocUrl })
          .eq("id", recordingId);

        console.log(`[${recordingId}] Google Doc created: ${googleDocUrl}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown Google error";
        console.error(`[${recordingId}] Google Doc creation failed:`, errorMessage);

        // Google failure is not critical - continue processing
        const { data: currentRecording } = await supabase
          .from("recordings")
          .select("error_step")
          .eq("id", recordingId)
          .single();

        if (!currentRecording?.error_step) {
          await supabase
            .from("recordings")
            .update({
              error_step: "google",
              error_message: `Google Docs 저장 실패: ${errorMessage}`
            })
            .eq("id", recordingId);
        }
      }
    }

    // Step 5: Send Slack notification (optional)
    const documentUrl = notionUrl || googleDocUrl;
    if (userData.slack_access_token && userData.slack_channel_id && documentUrl) {
      try {
        console.log(`[${recordingId}] Step 5: Sending Slack notification...`);
        await sendSlackNotification(
          userData.slack_access_token,
          userData.slack_channel_id,
          aiGeneratedTitle,
          duration,
          documentUrl
        );
        console.log(`[${recordingId}] Slack notification sent`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown Slack error";
        console.error(`[${recordingId}] Slack notification failed:`, errorMessage);

        // Slack failure is not critical - continue processing
        // Don't update error_step if it's already set from Notion
        const { data: currentRecording } = await supabase
          .from("recordings")
          .select("error_step")
          .eq("id", recordingId)
          .single();

        if (!currentRecording?.error_step || currentRecording.error_step === "notion") {
          await supabase
            .from("recordings")
            .update({
              error_step: "slack",
              error_message: `Slack notification failed: ${errorMessage}`
            })
            .eq("id", recordingId);
        }
      }
    }

    // Mark as completed
    console.log(`[${recordingId}] Processing completed successfully`);
    const { data: updateData, error: updateError } = await supabase
      .from("recordings")
      .update({
        status: "completed",
        processing_step: null,
        // Clear error fields if processing completed successfully
        error_step: null,
        error_message: null
      })
      .eq("id", recordingId)
      .select();

    if (updateError) {
      console.error(`[${recordingId}] Failed to update status to completed:`, updateError);
      throw new Error(`Status update failed: ${updateError.message}`);
    }

    console.log(`[${recordingId}] Status updated to completed:`, updateData);

  } catch (error) {
    // Catch-all for unexpected errors
    const errorMessage = error instanceof Error ? error.message : "Unknown processing error";
    console.error(`[${recordingId}] Unexpected processing error:`, errorMessage);

    await supabase
      .from("recordings")
      .update({
        status: "failed",
        error_step: "upload",
        error_message: errorMessage
      })
      .eq("id", recordingId);
  }
}
