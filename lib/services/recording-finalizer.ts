import { MONTHLY_MINUTES_LIMIT, Recording, User } from "@/lib/types/database";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  handleProcessingError,
  processFromTranscripts,
} from "@/lib/services/recording-processor";
import { hasUnlimitedUsage } from "@/lib/promo";

type FinalizeSessionStatus = Extract<
  Recording["status"],
  "recording" | "processing" | "completed" | "failed"
>;

interface FinalizeSessionRow {
  id: string;
  title: string;
  status: FinalizeSessionStatus;
  transcript: string | null;
  last_chunk_index: number | null;
  format: Recording["format"] | null;
}

export interface FinalizeRecordingSessionParams {
  recordingId: string;
  totalDurationSeconds: number;
  userId: string;
  format?: Recording["format"];
}

export interface FinalizeRecordingSessionResult {
  recording: Pick<Recording, "id" | "title" | "status">;
  idempotent: boolean;
  statusBefore?: FinalizeSessionStatus;
  error?: string;
  statusCode?: number;
}

async function waitForTranscriptToStabilize(
  recordingId: string,
  userId: string,
  initialTranscript: string
): Promise<string> {
  const supabase = createServiceRoleClient();
  const maxWaitMs = 15000;
  const pollIntervalMs = 1000;
  const requiredStableCount = 2;

  let mergedTranscript = initialTranscript;
  let waitedMs = 0;
  let lastTranscriptLength = initialTranscript.length;
  let stableCount = 0;

  console.log(`[Finalize] Waiting for transcript to stabilize for ${recordingId}...`);

  while (waitedMs < maxWaitMs && stableCount < requiredStableCount) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    waitedMs += pollIntervalMs;

    const { data: refreshedSession, error } = await supabase
      .from("recordings")
      .select("transcript")
      .eq("id", recordingId)
      .eq("user_id", userId)
      .single();

    if (error) {
      console.warn(`[Finalize] Failed to refresh transcript for ${recordingId}:`, error);
      break;
    }

    const currentTranscript = refreshedSession?.transcript || "";
    const currentLength = currentTranscript.length;

    if (currentLength > lastTranscriptLength) {
      console.log(
        `[Finalize] Transcript grew for ${recordingId}: ${lastTranscriptLength} -> ${currentLength}`
      );
      mergedTranscript = currentTranscript;
      lastTranscriptLength = currentLength;
      stableCount = 0;
    } else {
      stableCount++;
      if (currentLength > mergedTranscript.length) {
        mergedTranscript = currentTranscript;
      }
    }
  }

  if (stableCount >= requiredStableCount) {
    console.log(
      `[Finalize] Transcript stabilized for ${recordingId} after ${waitedMs}ms, length=${mergedTranscript.length}`
    );
  } else if (waitedMs >= maxWaitMs) {
    console.warn(
      `[Finalize] Transcript wait timed out for ${recordingId} after ${maxWaitMs}ms, length=${mergedTranscript.length}`
    );
  }

  return mergedTranscript;
}

export async function finalizeRecordingSession(
  params: FinalizeRecordingSessionParams
): Promise<FinalizeRecordingSessionResult> {
  const { recordingId, totalDurationSeconds, userId, format } = params;

  if (!totalDurationSeconds || totalDurationSeconds <= 0) {
    return {
      recording: {
        id: recordingId,
        title: "",
        status: "failed",
      },
      idempotent: false,
      error: "Valid totalDurationSeconds is required",
      statusCode: 400,
    };
  }

  const supabase = createServiceRoleClient();

  const [{ data: userData, error: userError }, { data: session, error: sessionError }] =
    await Promise.all([
      supabase.from("users").select("*").eq("id", userId).single(),
      supabase
        .from("recordings")
        .select("id, title, status, transcript, last_chunk_index, format")
        .eq("id", recordingId)
        .eq("user_id", userId)
        .maybeSingle<FinalizeSessionRow>(),
    ]);

  if (userError) {
    console.error("[Finalize] Failed to load user:", userError);
    return {
      recording: { id: recordingId, title: "", status: "failed" },
      idempotent: false,
      error: "Failed to load user",
      statusCode: 500,
    };
  }

  if (!userData) {
    return {
      recording: { id: recordingId, title: "", status: "failed" },
      idempotent: false,
      error: "User not found",
      statusCode: 404,
    };
  }

  if (sessionError) {
    console.error("[Finalize] Failed to load session:", sessionError);
    return {
      recording: { id: recordingId, title: "", status: "failed" },
      idempotent: false,
      error: "Failed to load session",
      statusCode: 500,
    };
  }

  if (!session) {
    return {
      recording: { id: recordingId, title: "", status: "failed" },
      idempotent: false,
      error: "Session not found",
      statusCode: 404,
    };
  }

  const statusBefore = session.status;
  if (statusBefore === "failed") {
    return {
      recording: {
        id: session.id,
        title: session.title,
        status: session.status,
      },
      idempotent: false,
      statusBefore,
      error: "Session already failed",
      statusCode: 409,
    };
  }

  if (statusBefore === "processing" || statusBefore === "completed") {
    console.log(
      `[Finalize] Idempotent finalize skip for session ${recordingId}, status=${statusBefore}`
    );
    return {
      recording: {
        id: session.id,
        title: session.title,
        status: session.status,
      },
      idempotent: true,
      statusBefore,
    };
  }

  const durationMinutes = Math.ceil(totalDurationSeconds / 60);
  if (!hasUnlimitedUsage(userData as User)) {
    const totalMinutesAvailable =
      MONTHLY_MINUTES_LIMIT + ((userData as User).bonus_minutes || 0);
    if ((userData as User).monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
      return {
        recording: {
          id: session.id,
          title: session.title,
          status: session.status,
        },
        idempotent: false,
        statusBefore,
        error: "Monthly usage limit exceeded",
        statusCode: 403,
      };
    }
  }

  console.log(
    `[Finalize] Finalizing session ${recordingId}, duration=${totalDurationSeconds}s, last_chunk_index=${session.last_chunk_index}`
  );

  const mergedTranscript = await waitForTranscriptToStabilize(
    recordingId,
    userId,
    session.transcript || ""
  );

  const { data: claimedSession, error: claimError } = await supabase
    .from("recordings")
    .update({
      status: "processing",
      processing_step: "transcription",
      duration_seconds: totalDurationSeconds,
      session_paused_at: null,
      last_activity_at: new Date().toISOString(),
      termination_reason: "user_stop",
    })
    .eq("id", recordingId)
    .eq("user_id", userId)
    .eq("status", "recording")
    .select("id, title, status")
    .maybeSingle();

  if (claimError) {
    console.error("[Finalize] Failed to claim session:", claimError);
    return {
      recording: {
        id: session.id,
        title: session.title,
        status: session.status,
      },
      idempotent: false,
      statusBefore,
      error: "Failed to finalize session",
      statusCode: 500,
    };
  }

  if (!claimedSession) {
    const { data: latestSession, error: latestError } = await supabase
      .from("recordings")
      .select("id, title, status")
      .eq("id", recordingId)
      .eq("user_id", userId)
      .maybeSingle();

    if (latestError) {
      console.error("[Finalize] Failed to load latest session:", latestError);
      return {
        recording: {
          id: session.id,
          title: session.title,
          status: session.status,
        },
        idempotent: false,
        statusBefore,
        error: "Failed to load session state",
        statusCode: 500,
      };
    }

    if (!latestSession) {
      return {
        recording: {
          id: recordingId,
          title: session.title,
          status: "failed",
        },
        idempotent: false,
        statusBefore,
        error: "Session not found",
        statusCode: 404,
      };
    }

    const latestStatus = latestSession.status as FinalizeSessionStatus;
    if (latestStatus === "processing" || latestStatus === "completed") {
      console.log(
        `[Finalize] Idempotent finalize skip after claim miss for session ${recordingId}, status=${latestStatus}`
      );
      return {
        recording: {
          id: latestSession.id,
          title: latestSession.title,
          status: latestSession.status,
        },
        idempotent: true,
        statusBefore: latestStatus,
      };
    }

    if (latestStatus === "failed") {
      return {
        recording: {
          id: latestSession.id,
          title: latestSession.title,
          status: latestSession.status,
        },
        idempotent: false,
        statusBefore: latestStatus,
        error: "Session already failed",
        statusCode: 409,
      };
    }

    return {
      recording: {
        id: latestSession.id,
        title: latestSession.title,
        status: latestSession.status,
      },
      idempotent: false,
      statusBefore: latestStatus,
      error: "Session is not active",
      statusCode: 400,
    };
  }

  await supabase
    .from("users")
    .update({
      monthly_minutes_used: (userData as User).monthly_minutes_used + durationMinutes,
    })
    .eq("id", userId);

  const effectiveFormat = format || session.format || "meeting";
  const result = await processFromTranscripts({
    recordingId,
    transcript: mergedTranscript,
    format: effectiveFormat,
    duration: totalDurationSeconds,
    userData: userData as User,
    title: session.title,
  }).catch(async (error) => {
    await handleProcessingError(recordingId, error);
    return null;
  });

  return {
    recording: {
      id: recordingId,
      title: result?.title || session.title,
      status: result?.success ? "completed" : "failed",
    },
    idempotent: false,
    statusBefore,
  };
}
