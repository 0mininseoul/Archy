/**
 * Recording Processor Service
 *
 * 녹음 처리 파이프라인을 관리하는 서비스
 * 각 단계가 독립적인 함수로 분리되어 테스트 및 재사용이 용이함
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/services/whisper";
import { formatDocument } from "@/lib/services/openai";
import { createNotionPage } from "@/lib/services/notion";
import { sendSlackNotification } from "@/lib/services/slack";
import { createGoogleDoc, getValidAccessToken, convertMarkdownToPlainText } from "@/lib/services/google";
import { sendPushNotification, PushSubscription } from "@/lib/services/push";
import {
  Recording,
  User,
  ProcessingStep,
  ErrorStep,
  RecordingFormat,
} from "@/lib/types/database";

// ... (previous imports and interfaces remain the same, I'm only modifying the imports section slightly to remove FormatDocAuto and prompts)

// =============================================================================
// Types
// =============================================================================

export interface ProcessingContext {
  recordingId: string;
  audioFile: File;
  format: RecordingFormat;
  duration: number;
  userData: User;
  title: string;
}

export interface ProcessingResult {
  success: boolean;
  transcript?: string;
  formattedContent?: string;
  title?: string;
  notionUrl?: string;
  googleDocUrl?: string;
  error?: {
    step: ErrorStep;
    message: string;
  };
}

interface StepResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

async function updateProcessingStep(
  supabase: SupabaseClient,
  recordingId: string,
  step: ProcessingStep
): Promise<void> {
  await supabase
    .from("recordings")
    .update({ processing_step: step })
    .eq("id", recordingId);
}

async function updateRecordingError(
  supabase: SupabaseClient,
  recordingId: string,
  errorStep: ErrorStep,
  errorMessage: string,
  markFailed = false
): Promise<void> {
  const update: Partial<Recording> = {
    error_step: errorStep,
    error_message: errorMessage,
  };

  if (markFailed) {
    update.status = "failed";
  }

  await supabase.from("recordings").update(update).eq("id", recordingId);
}

function log(recordingId: string, message: string): void {
  console.log(`[${recordingId}] ${message}`);
}

function logError(recordingId: string, message: string, error?: unknown): void {
  console.error(`[${recordingId}] ${message}`, error);
}

// =============================================================================
// Processing Steps
// =============================================================================

/**
 * Step 1: Transcribe audio file using Whisper API
 */
async function stepTranscribe(
  supabase: SupabaseClient,
  recordingId: string,
  audioFile: File
): Promise<StepResult<string>> {
  log(recordingId, "Step 1: Transcribing audio...");
  await updateProcessingStep(supabase, recordingId, "transcription");

  try {
    const transcript = await transcribeAudio(audioFile);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error("Transcription returned empty result");
    }

    await supabase
      .from("recordings")
      .update({ transcript })
      .eq("id", recordingId);

    log(recordingId, `Transcription completed, length: ${transcript.length}`);
    return { success: true, data: transcript };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown transcription error";
    logError(recordingId, "Transcription failed:", errorMessage);

    await updateRecordingError(supabase, recordingId, "transcription", errorMessage, true);
    return { success: false, error: errorMessage };
  }
}

/**
 * Step 2: Format document with AI
 */
async function stepFormat(
  supabase: SupabaseClient,
  recordingId: string,
  transcript: string,
  format: RecordingFormat,
  userId: string,
  defaultTitle: string
): Promise<StepResult<{ content: string; title: string }>> {
  log(recordingId, "Step 2: Formatting document...");
  await updateProcessingStep(supabase, recordingId, "formatting");

  try {
    // Check for custom format
    const { data: defaultFormat } = await supabase
      .from("custom_formats")
      .select("prompt")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single();

    let formatResult;
    if (defaultFormat?.prompt) {
      log(recordingId, "Using custom format");
      formatResult = await formatDocument(
        transcript,
        format, // format ignored internally but passed for compatibility
        defaultFormat.prompt
      );
    } else {
      log(recordingId, "Using universal format");
      formatResult = await formatDocument(transcript);
    }

    let formattedContent: string;
    let aiGeneratedTitle = defaultTitle;

    if (!formatResult.content || formatResult.content.trim().length === 0) {
      log(recordingId, "Formatting returned empty, using raw transcript");
      formattedContent = transcript;
    } else {
      formattedContent = formatResult.content;
    }

    if (formatResult.title && formatResult.title.trim().length > 0) {
      aiGeneratedTitle = formatResult.title;
      log(recordingId, `AI generated title: ${aiGeneratedTitle}`);
    }

    await supabase
      .from("recordings")
      .update({
        formatted_content: formattedContent,
        title: aiGeneratedTitle,
      })
      .eq("id", recordingId);

    log(recordingId, "Formatting completed");
    return { success: true, data: { content: formattedContent, title: aiGeneratedTitle } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown formatting error";
    logError(recordingId, "Formatting failed:", errorMessage);

    // Formatting failure is not critical - use raw transcript
    await supabase
      .from("recordings")
      .update({
        formatted_content: transcript,
        error_step: "formatting",
        error_message: `Formatting failed (using raw transcript): ${errorMessage}`,
      })
      .eq("id", recordingId);

    return { success: true, data: { content: transcript, title: defaultTitle } };
  }
}

/**
 * Step 3: Create Notion page
 */
async function stepNotionSave(
  supabase: SupabaseClient,
  recordingId: string,
  userData: User,
  title: string,
  content: string,
  format: RecordingFormat,
  duration: number
): Promise<StepResult<string>> {
  if (!userData.notion_access_token || !userData.notion_database_id) {
    log(recordingId, "Notion not configured, skipping...");
    return { success: true, data: "" };
  }

  log(recordingId, "Step 3: Creating Notion page...");
  await updateProcessingStep(supabase, recordingId, "notion");

  try {
    const notionUrl = await createNotionPage(
      userData.notion_access_token,
      userData.notion_database_id,
      title,
      content,
      format as keyof typeof FORMAT_PROMPTS,
      duration,
      userData.notion_save_target_type || "database"
    );

    await supabase
      .from("recordings")
      .update({ notion_page_url: notionUrl })
      .eq("id", recordingId);

    log(recordingId, `Notion page created: ${notionUrl}`);
    return { success: true, data: notionUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Notion error";
    logError(recordingId, "Notion creation failed:", errorMessage);

    await updateRecordingError(
      supabase,
      recordingId,
      "notion",
      `Notion 저장 실패: ${errorMessage}`
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Step 4: Create Google Doc
 */
async function stepGoogleDocSave(
  supabase: SupabaseClient,
  recordingId: string,
  userData: User,
  title: string,
  content: string
): Promise<StepResult<string>> {
  if (!userData.google_access_token) {
    log(recordingId, "Google not configured, skipping...");
    return { success: true, data: "" };
  }

  log(recordingId, "Step 4: Creating Google Doc...");

  try {
    const accessToken = await getValidAccessToken({
      access_token: userData.google_access_token,
      refresh_token: userData.google_refresh_token ?? undefined,
      token_expires_at: userData.google_token_expires_at ?? undefined,
    });

    // Update token if refreshed
    if (accessToken !== userData.google_access_token) {
      await supabase
        .from("users")
        .update({ google_access_token: accessToken })
        .eq("id", userData.id);
    }

    const plainTextContent = convertMarkdownToPlainText(content);
    const googleDocUrl = await createGoogleDoc(
      accessToken,
      title,
      plainTextContent,
      userData.google_folder_id || undefined
    );

    await supabase
      .from("recordings")
      .update({ google_doc_url: googleDocUrl })
      .eq("id", recordingId);

    log(recordingId, `Google Doc created: ${googleDocUrl}`);
    return { success: true, data: googleDocUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Google error";
    logError(recordingId, "Google Doc creation failed:", errorMessage);

    // Check if there's already an error
    const { data: currentRecording } = await supabase
      .from("recordings")
      .select("error_step")
      .eq("id", recordingId)
      .single();

    if (!currentRecording?.error_step) {
      await updateRecordingError(
        supabase,
        recordingId,
        "google" as ErrorStep,
        `Google Docs 저장 실패: ${errorMessage}`
      );
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Step 5: Send Slack notification
 */
async function stepSlackNotify(
  supabase: SupabaseClient,
  recordingId: string,
  userData: User,
  title: string,
  duration: number,
  notionUrl: string,
  googleDocUrl: string
): Promise<StepResult<boolean>> {
  if (!userData.slack_access_token || !userData.slack_channel_id) {
    log(recordingId, "Slack not configured, skipping...");
    return { success: true, data: true };
  }

  log(recordingId, "Step 5: Sending Slack notification...");

  try {
    let appUrl = "https://archynote.vercel.app";
    if (process.env.NODE_ENV === "development") {
      appUrl = "http://localhost:3000";
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      appUrl = process.env.NEXT_PUBLIC_APP_URL;
    }

    const archyUrl = `${appUrl}/recordings/${recordingId}`;

    await sendSlackNotification(
      userData.slack_access_token,
      userData.slack_channel_id,
      title,
      duration,
      {
        notionUrl: notionUrl || undefined,
        googleDocUrl: googleDocUrl || undefined,
        archyUrl,
      }
    );

    log(recordingId, "Slack notification sent");
    return { success: true, data: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Slack error";
    logError(recordingId, "Slack notification failed:", errorMessage);

    const { data: currentRecording } = await supabase
      .from("recordings")
      .select("error_step")
      .eq("id", recordingId)
      .single();

    if (!currentRecording?.error_step || currentRecording.error_step === "notion") {
      await updateRecordingError(
        supabase,
        recordingId,
        "slack",
        `Slack notification failed: ${errorMessage}`
      );
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Step 6: Send PWA push notification
 */
async function stepPushNotify(
  recordingId: string,
  userData: User,
  title: string,
  notionUrl: string,
  googleDocUrl: string
): Promise<void> {
  if (!userData.push_enabled || !userData.push_subscription) {
    return;
  }

  log(recordingId, "Step 6: Sending PWA push notification...");

  try {
    const savedServices: string[] = [];
    if (notionUrl) savedServices.push("Notion");
    if (googleDocUrl) savedServices.push("Google Docs");

    let body = "";
    if (savedServices.length > 0) {
      body = `${savedServices.join(", ")}에 저장되었습니다.`;
    } else {
      body = "전사 및 요약이 완료되었습니다.";
    }

    await sendPushNotification(userData.push_subscription as PushSubscription, {
      title,
      body,
      url: "/history",
      recordingId,
    });

    log(recordingId, "PWA push notification sent");
  } catch (error) {
    logError(recordingId, "PWA push notification failed:", error);
    // Push notification failure is not critical
  }
}

// =============================================================================
// Main Processing Function
// =============================================================================

/**
 * Process a recording through the full pipeline
 */
export async function processRecording(ctx: ProcessingContext): Promise<ProcessingResult> {
  const { recordingId, audioFile, format, duration, userData, title } = ctx;
  const supabase = await createClient();

  log(recordingId, "Starting processing...");

  // Step 1: Transcribe
  const transcribeResult = await stepTranscribe(supabase, recordingId, audioFile);
  if (!transcribeResult.success) {
    return {
      success: false,
      error: { step: "transcription", message: transcribeResult.error! },
    };
  }
  const transcript = transcribeResult.data!;

  // Step 2: Format
  const formatResult = await stepFormat(
    supabase,
    recordingId,
    transcript,
    format,
    userData.id,
    title
  );
  const formattedContent = formatResult.data!.content;
  const finalTitle = formatResult.data!.title;

  // Step 3: Notion (optional)
  const notionResult = await stepNotionSave(
    supabase,
    recordingId,
    userData,
    finalTitle,
    formattedContent,
    format,
    duration
  );
  const notionUrl = notionResult.data || "";

  // Step 4: Google Docs (optional)
  const googleResult = await stepGoogleDocSave(
    supabase,
    recordingId,
    userData,
    finalTitle,
    formattedContent
  );
  const googleDocUrl = googleResult.data || "";

  // Step 5: Slack (optional)
  await stepSlackNotify(
    supabase,
    recordingId,
    userData,
    finalTitle,
    duration,
    notionUrl,
    googleDocUrl
  );

  // Mark as completed
  log(recordingId, "Processing completed successfully");
  await supabase
    .from("recordings")
    .update({
      status: "completed",
      processing_step: null,
      error_step: null,
      error_message: null,
    })
    .eq("id", recordingId);

  // Step 6: Push notification (after marking complete)
  await stepPushNotify(recordingId, userData, finalTitle, notionUrl, googleDocUrl);

  return {
    success: true,
    transcript,
    formattedContent,
    title: finalTitle,
    notionUrl: notionUrl || undefined,
    googleDocUrl: googleDocUrl || undefined,
  };
}

/**
 * Handle critical errors in processing
 */
export async function handleProcessingError(
  recordingId: string,
  error: unknown
): Promise<void> {
  console.error(`[${recordingId}] Critical error in processRecording:`, error);

  try {
    const supabase = await createClient();
    await supabase
      .from("recordings")
      .update({
        status: "failed",
        error_step: "upload",
        error_message: `Critical error: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
      .eq("id", recordingId);
  } catch (updateError) {
    console.error(`[${recordingId}] Failed to update error status:`, updateError);
  }
}
