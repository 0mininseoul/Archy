import { MONTHLY_MINUTES_LIMIT, Recording, User } from "@/lib/types/database";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  handleProcessingError,
  processFromTranscripts,
} from "@/lib/services/recording-processor";
import {
  appendTranscriptionWarnings,
  createTranscriptionWarning,
  isTranscriptionStateSchemaError,
  loadRecordingChunkAssembly,
  type RecordingChunkRow,
  type RecordingTranscriptionWarning,
  type TranscriptionQualityStatus,
} from "@/lib/services/recording-transcription-state";
import { hasUnlimitedUsage } from "@/lib/promo";
import { loadUserWithUsageReset } from "@/lib/usage-cycle";
import { hasMeaningfulTranscript, sanitizeTranscriptText } from "@/lib/utils/transcript";

type FinalizeSessionStatus = Extract<
  Recording["status"],
  "recording" | "processing" | "completed" | "failed"
>;

interface FinalizeSessionRow {
  duration_seconds: number | null;
  error_message: string | null;
  error_step: Recording["error_step"] | null;
  expected_chunk_count?: number | null;
  format: Recording["format"] | null;
  formatted_content?: string | null;
  id: string;
  last_chunk_index: number | null;
  status: FinalizeSessionStatus;
  termination_reason?: Recording["termination_reason"] | null;
  title: string;
  transcript: string | null;
  transcription_quality_status?: Recording["transcription_quality_status"];
  transcription_warnings?: unknown;
}

export interface FinalizeRecordingSessionParams {
  expectedChunkCount?: number;
  recordingId: string;
  totalDurationSeconds: number;
  userId: string;
  format?: Recording["format"];
}

export interface FinalizeRecordingSessionResult {
  recording: Pick<Recording, "id" | "title" | "status">;
  error?: string;
  idempotent: boolean;
  statusBefore?: FinalizeSessionStatus;
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
      stableCount += 1;
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

function canRecoverFailedSession(session: FinalizeSessionRow): boolean {
  if (session.status !== "failed" || session.formatted_content) {
    return false;
  }

  return (
    hasMeaningfulTranscript(session.transcript) &&
    (
      session.termination_reason === "stale_timeout" ||
      session.termination_reason === "processing_error" ||
      session.error_step === "abandoned" ||
      session.error_step === "transcription"
    )
  );
}

function buildChunkWarningList(
  chunks: RecordingChunkRow[],
  expectedChunkCount?: number | null
): RecordingTranscriptionWarning[] {
  if (chunks.length === 0) {
    return [];
  }

  const warnings: RecordingTranscriptionWarning[] = [];
  const failedChunkIndices = chunks
    .filter((chunk) => chunk.status === "failed")
    .map((chunk) => chunk.chunk_index);
  const succeededChunkIndices = new Set(
    chunks.filter((chunk) => chunk.status === "succeeded").map((chunk) => chunk.chunk_index)
  );

  if (failedChunkIndices.length > 0) {
    warnings.push(
      createTranscriptionWarning("chunk_failures", {
        failedChunkCount: failedChunkIndices.length,
        failedChunkIndices,
      })
    );
  }

  if (expectedChunkCount && expectedChunkCount > 0) {
    const missingChunkIndices: number[] = [];
    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
      if (!succeededChunkIndices.has(chunkIndex)) {
        missingChunkIndices.push(chunkIndex);
      }
    }

    if (missingChunkIndices.length > 0) {
      warnings.push(
        createTranscriptionWarning("chunk_missing", {
          expectedChunkCount,
          missingChunkCount: missingChunkIndices.length,
          missingChunkIndices,
          succeededChunkCount: succeededChunkIndices.size,
        })
      );
    }
  }

  return warnings;
}

function buildClaimPayload(
  totalDurationSeconds: number,
  existingDurationSeconds: number | null,
  transcript: string,
  expectedChunkCount?: number | null
): {
  basePayload: Record<string, number | string | null>;
  payload: Record<string, number | string | null>;
} {
  const nowIso = new Date().toISOString();
  const processingStep = hasMeaningfulTranscript(transcript) ? "formatting" : "transcription";
  const basePayload = {
    status: "processing",
    processing_step: processingStep,
    duration_seconds: Math.max(totalDurationSeconds, existingDurationSeconds ?? 0),
    session_paused_at: null,
    last_activity_at: nowIso,
    termination_reason: "user_stop",
    error_step: null,
    error_message: null,
  };

  return {
    basePayload,
    payload: {
      ...basePayload,
      expected_chunk_count: expectedChunkCount ?? null,
    },
  };
}

async function claimRecordingForFinalize(
  session: FinalizeSessionRow,
  params: {
    expectedChunkCount?: number | null;
    totalDurationSeconds: number;
    transcript: string;
    userId: string;
  }
): Promise<{
  claimedSession: Pick<Recording, "id" | "title" | "status"> | null;
  error?: string;
  idempotent?: boolean;
  statusCode?: number;
}> {
  const supabase = createServiceRoleClient();
  const { payload, basePayload } = buildClaimPayload(
    params.totalDurationSeconds,
    session.duration_seconds,
    params.transcript,
    params.expectedChunkCount
  );

  let { data: claimedSession, error: claimError } = await supabase
    .from("recordings")
    .update(payload)
    .eq("id", session.id)
    .eq("user_id", params.userId)
    .eq("status", session.status)
    .select("id, title, status")
    .maybeSingle();

  if (claimError && isTranscriptionStateSchemaError(claimError)) {
    ({ data: claimedSession, error: claimError } = await supabase
      .from("recordings")
      .update(basePayload)
      .eq("id", session.id)
      .eq("user_id", params.userId)
      .eq("status", session.status)
      .select("id, title, status")
      .maybeSingle());
  }

  if (claimError) {
    console.error("[Finalize] Failed to claim session:", claimError);
    return {
      claimedSession: null,
      error: "Failed to finalize session",
      statusCode: 500,
    };
  }

  if (claimedSession) {
    return { claimedSession };
  }

  const { data: latestSession, error: latestError } = await supabase
    .from("recordings")
    .select("id, title, status")
    .eq("id", session.id)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (latestError) {
    console.error("[Finalize] Failed to load latest session:", latestError);
    return {
      claimedSession: null,
      error: "Failed to load session state",
      statusCode: 500,
    };
  }

  if (!latestSession) {
    return {
      claimedSession: null,
      error: "Session not found",
      statusCode: 404,
    };
  }

  const latestStatus = latestSession.status as FinalizeSessionStatus;
  if (latestStatus === "processing" || latestStatus === "completed") {
    console.log(
      `[Finalize] Idempotent finalize skip after claim miss for session ${session.id}, status=${latestStatus}`
    );
    return { claimedSession: latestSession, idempotent: true };
  }

  return {
    claimedSession: null,
    error: latestStatus === "failed" ? "Session already failed" : "Session is not active",
    statusCode: latestStatus === "failed" ? 409 : 400,
  };
}

export async function finalizeRecordingSession(
  params: FinalizeRecordingSessionParams
): Promise<FinalizeRecordingSessionResult> {
  const { recordingId, totalDurationSeconds, userId, format, expectedChunkCount } = params;

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
      loadUserWithUsageReset<User>(supabase, userId, "*"),
      supabase
        .from("recordings")
        .select("*")
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
  const recoverFailedSession = canRecoverFailedSession(session);

  if (statusBefore === "failed" && !recoverFailedSession) {
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
  if (!recoverFailedSession && !hasUnlimitedUsage(userData as User)) {
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

  const fallbackTranscript = await waitForTranscriptToStabilize(
    recordingId,
    userId,
    session.transcript || ""
  );
  const chunkAssembly = await loadRecordingChunkAssembly(recordingId);
  if (chunkAssembly.error) {
    console.error("[Finalize] Failed to load recording chunks:", chunkAssembly.error);
  }

  const mergedTranscript =
    sanitizeTranscriptText(chunkAssembly.transcript) || sanitizeTranscriptText(fallbackTranscript);
  const resolvedExpectedChunkCount =
    expectedChunkCount ?? session.expected_chunk_count ?? null;
  const warningAdditions = buildChunkWarningList(
    chunkAssembly.chunks,
    resolvedExpectedChunkCount
  );

  if (recoverFailedSession) {
    warningAdditions.push(
      createTranscriptionWarning("recovered_after_terminal_failure", {
        priorErrorStep: session.error_step ?? null,
        priorTerminationReason: session.termination_reason ?? null,
      })
    );
  }

  const transcriptionWarnings = appendTranscriptionWarnings(
    session.transcription_warnings,
    warningAdditions
  );
  const transcriptionQualityStatus: TranscriptionQualityStatus =
    transcriptionWarnings.length > 0 || session.transcription_quality_status === "degraded"
      ? "degraded"
      : "ok";

  const {
    claimedSession,
    error: claimError,
    idempotent: claimIdempotent,
    statusCode,
  } = await claimRecordingForFinalize(
    session,
    {
      expectedChunkCount: resolvedExpectedChunkCount,
      totalDurationSeconds,
      transcript: mergedTranscript,
      userId,
    }
  );

  if (claimError) {
    return {
      recording: {
        id: session.id,
        title: session.title,
        status: session.status,
      },
      idempotent: false,
      statusBefore,
      error: claimError,
      statusCode,
    };
  }

  if (!claimedSession) {
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

  if (claimIdempotent) {
    return {
      recording: claimedSession,
      idempotent: true,
      statusBefore,
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
    terminationReason: "user_stop",
    transcriptionQualityStatus,
    transcriptionWarnings,
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
