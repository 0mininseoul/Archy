import { getStaleRecordingCutoffIso } from "@/lib/recording-lifecycle";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  appendTranscriptionWarnings,
  createTranscriptionWarning,
  isTranscriptionStateSchemaError,
  loadRecordingChunkAssembly,
} from "@/lib/services/recording-transcription-state";
import { hasMeaningfulTranscript } from "@/lib/utils/transcript";

export interface StaleRecordingCleanupRow {
  duration_seconds: number | null;
  formatted_content?: string | null;
  id: string;
  last_activity_at: string;
  last_chunk_index: number | null;
  session_paused_at: string | null;
  transcription_warnings?: unknown;
  transcript?: string | null;
  user_id: string;
}

interface CleanupStaleRecordingsOptions {
  nowMs?: number;
  userId?: string;
}

interface CleanupStaleRecordingsResult {
  error: unknown | null;
  nowIso: string;
  recordings: StaleRecordingCleanupRow[];
  staleCutoffIso: string;
}

export async function cleanupStaleRecordings(
  options: CleanupStaleRecordingsOptions = {}
): Promise<CleanupStaleRecordingsResult> {
  const { userId, nowMs = Date.now() } = options;
  const supabase = createServiceRoleClient();
  const nowIso = new Date(nowMs).toISOString();
  const staleCutoffIso = getStaleRecordingCutoffIso(nowMs);

  const baseQuery = supabase
    .from("recordings")
    .select(
      [
        "id",
        "user_id",
        "duration_seconds",
        "last_chunk_index",
        "last_activity_at",
        "session_paused_at",
        "transcript",
        "formatted_content",
        "transcription_warnings",
      ].join(",")
    )
    .eq("status", "recording")
    .lt("last_activity_at", staleCutoffIso);

  const query = userId ? baseQuery.eq("user_id", userId) : baseQuery;
  const { data, error } = await query;

  if (error) {
    return {
      error,
      nowIso,
      recordings: [],
      staleCutoffIso,
    };
  }

  const staleRecordings = (data as unknown as StaleRecordingCleanupRow[] | null) ?? [];
  const updatedRecordings: StaleRecordingCleanupRow[] = [];

  for (const recording of staleRecordings) {
    let recoveryTranscript = recording.transcript ?? "";

    if (!hasMeaningfulTranscript(recoveryTranscript)) {
      const chunkAssembly = await loadRecordingChunkAssembly(recording.id);
      if (chunkAssembly.error) {
        console.warn(
          `[StaleRecordings] Failed to load chunk assembly for ${recording.id}:`,
          chunkAssembly.error
        );
      } else if (hasMeaningfulTranscript(chunkAssembly.transcript)) {
        recoveryTranscript = chunkAssembly.transcript;
      }
    }

    const basePayload = {
      status: "failed" as const,
      processing_step: null,
      error_step: "abandoned" as const,
      error_message: "Recording session timed out due to inactivity.",
      termination_reason: "stale_timeout" as const,
      last_activity_at: nowIso,
    };
    const shouldFlagRecoveryCandidate =
      hasMeaningfulTranscript(recoveryTranscript) && !recording.formatted_content;
    const metadataPayload = shouldFlagRecoveryCandidate
      ? {
          ...basePayload,
          transcript: recoveryTranscript,
          transcription_quality_status: "degraded" as const,
          transcription_warnings: appendTranscriptionWarnings(
            recording.transcription_warnings,
            [
              createTranscriptionWarning("stale_timeout_recovery_candidate", {
                transcriptLength: recoveryTranscript.length,
              }),
            ]
          ),
        }
      : basePayload;

    let { error: updateError } = await supabase
      .from("recordings")
      .update(metadataPayload)
      .eq("id", recording.id)
      .eq("status", "recording");

    if (updateError && isTranscriptionStateSchemaError(updateError)) {
      ({ error: updateError } = await supabase
        .from("recordings")
        .update(basePayload)
        .eq("id", recording.id)
        .eq("status", "recording"));
    }

    if (updateError) {
      return {
        error: updateError,
        nowIso,
        recordings: updatedRecordings,
        staleCutoffIso,
      };
    }

    updatedRecordings.push(recording);
  }

  return {
    error: null,
    nowIso,
    recordings: updatedRecordings,
    staleCutoffIso,
  };
}
