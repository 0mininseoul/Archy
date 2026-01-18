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
import { createNotionPage, getNotionDatabases, getNotionPages } from "@/lib/services/notion";
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

export interface TranscriptProcessingContext {
  recordingId: string;
  transcript: string;
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
    // Retry logic for formatting (max 2 attempts)
    let formatResult;
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 90000; // 90 seconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(recordingId, `Step 2: Formatting document (Attempt ${attempt}/${MAX_RETRIES})...`);

        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Formatting timed out after 90 seconds")), TIMEOUT_MS);
        });

        // Check for custom format
        const { data: defaultFormat } = await supabase
          .from("custom_formats")
          .select("prompt")
          .eq("user_id", userId)
          .eq("is_default", true)
          .single();

        let formatPromise;
        if (defaultFormat?.prompt) {
          log(recordingId, "Using custom format");
          formatPromise = formatDocument(
            transcript,
            format, // format ignored internally but passed for compatibility
            defaultFormat.prompt
          );
        } else {
          log(recordingId, "Using universal format");
          formatPromise = formatDocument(transcript);
        }

        // Race between formatting and timeout
        formatResult = await Promise.race([formatPromise, timeoutPromise]);

        // If successful, break the loop
        break;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError(recordingId, `Formatting attempt ${attempt} failed:`, errorMessage);

        if (attempt === MAX_RETRIES) {
          throw new Error(`All formatting attempts failed: ${errorMessage}`);
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!formatResult) {
      throw new Error("Formatting failed (no result)");
    }

    let formattedContent: string;
    let aiGeneratedTitle = defaultTitle;

    if (!formatResult.content || formatResult.content.trim().length === 0) {
      // This case might be rare if we throw on error, but if OpenAI returns empty content successfully:
      log(recordingId, "Formatting returned empty content");
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
    logError(recordingId, "Formatting failed after retries:", errorMessage);

    // Propagate error to mark as failed
    return { success: false, error: errorMessage };
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
  // Notion 연결되지 않은 경우 스킵
  if (!userData.notion_access_token) {
    log(recordingId, "Notion not connected, skipping...");
    return { success: true, data: "" };
  }

  log(recordingId, "Step 3: Creating Notion page...");
  await updateProcessingStep(supabase, recordingId, "notion");

  try {
    let targetId = userData.notion_database_id;
    let targetType = userData.notion_save_target_type || "database";

    // 저장 위치가 설정되지 않은 경우 자동 선택
    if (!targetId) {
      log(recordingId, "Notion save location not set, auto-selecting...");

      // 1. 데이터베이스 우선 검색
      const databases = await getNotionDatabases(userData.notion_access_token);
      if (databases.length > 0) {
        targetId = databases[0].id;
        targetType = "database";
        log(recordingId, `Auto-selected database: ${databases[0].title}`);
      } else {
        // 2. 데이터베이스 없으면 페이지 검색
        const pages = await getNotionPages(userData.notion_access_token);
        if (pages.length > 0) {
          targetId = pages[0].id;
          targetType = "page";
          log(recordingId, `Auto-selected page: ${pages[0].title}`);
        }
      }

      // 여전히 없으면 스킵
      if (!targetId) {
        log(recordingId, "No accessible Notion pages or databases found, skipping...");
        return { success: true, data: "" };
      }

      // 자동 선택된 위치를 사용자 설정에 저장 (다음 녹음부터 재사용)
      await supabase
        .from("users")
        .update({
          notion_database_id: targetId,
          notion_save_target_type: targetType,
        })
        .eq("id", userData.id);
      log(recordingId, "Auto-selected location saved to user settings");
    }

    const notionUrl = await createNotionPage(
      userData.notion_access_token,
      targetId,
      title,
      content,
      format,
      duration,
      targetType as "database" | "page"
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
    let appUrl = "https://www.archynotes.com";
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
 * Process a recording from pre-transcribed chunks (skip transcription step)
 * Used when audio was chunked and transcribed during recording
 */
export async function processFromTranscripts(
  ctx: TranscriptProcessingContext
): Promise<ProcessingResult> {
  const { recordingId, transcript, format, duration, userData, title } = ctx;
  const supabase = await createClient();

  log(recordingId, "Starting processing from pre-transcribed chunks...");

  // Skip Step 1 (transcription already done)
  // Step 2: Format
  const formatResult = await stepFormat(
    supabase,
    recordingId,
    transcript,
    format,
    userData.id,
    title
  );

  if (!formatResult.success) {
    await supabase
      .from("recordings")
      .update({
        status: "failed",
        error_step: "formatting",
        error_message: formatResult.error,
      })
      .eq("id", recordingId);

    return {
      success: false,
      error: { step: "formatting", message: formatResult.error! },
    };
  }

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
