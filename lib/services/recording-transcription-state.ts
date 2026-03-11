import type { PostgrestError } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sanitizeTranscriptText } from "@/lib/utils/transcript";

export type RecordingChunkStatus = "pending" | "succeeded" | "failed";
export type TranscriptionQualityStatus = "ok" | "degraded";

export interface RecordingChunkRow {
  attempt_count: number | null;
  avg_rms: number | null;
  chunk_index: number;
  duration_seconds: number | null;
  last_error_at: string | null;
  last_success_at: string | null;
  peak_rms: number | null;
  provider_error_code: string | null;
  provider_status_code: number | null;
  recording_id: string;
  status: RecordingChunkStatus;
  transcript: string | null;
  updated_at: string | null;
}

export interface RecordingTranscriptionWarning {
  code: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

interface RecordingChunkAttemptParams {
  avgRms?: number;
  chunkIndex: number;
  durationSeconds: number;
  peakRms?: number;
  recordingId: string;
}

interface CompleteRecordingChunkAttemptParams extends RecordingChunkAttemptParams {
  attemptCount: number;
  providerErrorCode?: string | null;
  providerStatusCode?: number;
  transcript?: string;
}

interface RecordingChunkAttemptResult {
  attemptCount: number;
  error?: PostgrestError | null;
  supported: boolean;
}

interface RecordingChunkAssembly {
  chunks: RecordingChunkRow[];
  error?: PostgrestError | null;
  supported: boolean;
  transcript: string;
}

const TRANSCRIPTION_STATE_SCHEMA_ERROR_CODES = new Set([
  "42P01",
  "42703",
  "PGRST204",
  "PGRST205",
]);

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : undefined;
}

export function isTranscriptionStateSchemaError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && TRANSCRIPTION_STATE_SCHEMA_ERROR_CODES.has(code)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? error.message : undefined;
  return (
    typeof message === "string" &&
    /recording_chunks|expected_chunk_count|transcription_quality_status|transcription_warnings/i.test(
      message
    )
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseTranscriptionWarnings(
  value: unknown
): RecordingTranscriptionWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isObjectRecord(entry)) {
      return [];
    }

    const code = typeof entry.code === "string" ? entry.code : null;
    const createdAt =
      typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString();
    const details = isObjectRecord(entry.details) ? entry.details : undefined;

    if (!code) {
      return [];
    }

    return [{ code, createdAt, details }];
  });
}

export function appendTranscriptionWarnings(
  existing: unknown,
  additions: RecordingTranscriptionWarning[]
): RecordingTranscriptionWarning[] {
  const merged = [...parseTranscriptionWarnings(existing)];

  for (const warning of additions) {
    const key = JSON.stringify({
      code: warning.code,
      details: warning.details ?? null,
    });
    const alreadyExists = merged.some(
      (entry) =>
        JSON.stringify({
          code: entry.code,
          details: entry.details ?? null,
        }) === key
    );

    if (!alreadyExists) {
      merged.push(warning);
    }
  }

  return merged;
}

export function createTranscriptionWarning(
  code: string,
  details?: Record<string, unknown>
): RecordingTranscriptionWarning {
  return {
    code,
    createdAt: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

export function normalizeChunkTranscriptList(
  chunks: Pick<RecordingChunkRow, "status" | "transcript">[]
): string {
  return chunks
    .filter((chunk) => chunk.status === "succeeded")
    .map((chunk) => sanitizeTranscriptText(chunk.transcript))
    .filter((transcript) => transcript.length > 0)
    .join(" ")
    .trim();
}

export async function beginRecordingChunkAttempt(
  params: RecordingChunkAttemptParams
): Promise<RecordingChunkAttemptResult> {
  const supabase = createServiceRoleClient();
  const { recordingId, chunkIndex, durationSeconds, avgRms, peakRms } = params;
  const nowIso = new Date().toISOString();

  const { data: existingChunk, error: loadError } = await supabase
    .from("recording_chunks")
    .select("attempt_count")
    .eq("recording_id", recordingId)
    .eq("chunk_index", chunkIndex)
    .maybeSingle<{ attempt_count: number | null }>();

  if (loadError) {
    if (isTranscriptionStateSchemaError(loadError)) {
      return {
        attemptCount: 1,
        supported: false,
      };
    }

    return {
      attemptCount: 1,
      error: loadError,
      supported: true,
    };
  }

  const attemptCount = (existingChunk?.attempt_count ?? 0) + 1;
  const { error } = await supabase.from("recording_chunks").upsert(
    {
      recording_id: recordingId,
      chunk_index: chunkIndex,
      status: "pending",
      attempt_count: attemptCount,
      duration_seconds: durationSeconds,
      avg_rms: avgRms ?? null,
      peak_rms: peakRms ?? null,
      updated_at: nowIso,
    },
    { onConflict: "recording_id,chunk_index" }
  );

  if (error) {
    if (isTranscriptionStateSchemaError(error)) {
      return {
        attemptCount,
        supported: false,
      };
    }

    return {
      attemptCount,
      error,
      supported: true,
    };
  }

  return {
    attemptCount,
    supported: true,
  };
}

export async function completeRecordingChunkAttempt(
  params: CompleteRecordingChunkAttemptParams & { status: "succeeded" | "failed" }
): Promise<{ error?: PostgrestError | null; supported: boolean }> {
  const supabase = createServiceRoleClient();
  const {
    attemptCount,
    recordingId,
    chunkIndex,
    durationSeconds,
    avgRms,
    peakRms,
    providerErrorCode,
    providerStatusCode,
    status,
    transcript,
  } = params;
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("recording_chunks")
    .update({
      status,
      transcript:
        status === "succeeded" ? sanitizeTranscriptText(transcript) || null : null,
      attempt_count: attemptCount,
      duration_seconds: durationSeconds,
      avg_rms: avgRms ?? null,
      peak_rms: peakRms ?? null,
      provider_status_code: providerStatusCode ?? null,
      provider_error_code: providerErrorCode ?? null,
      last_error_at: status === "failed" ? nowIso : undefined,
      last_success_at: status === "succeeded" ? nowIso : undefined,
      updated_at: nowIso,
    })
    .eq("recording_id", recordingId)
    .eq("chunk_index", chunkIndex);

  if (error) {
    if (isTranscriptionStateSchemaError(error)) {
      return { supported: false };
    }

    return {
      error,
      supported: true,
    };
  }

  return { supported: true };
}

export async function loadRecordingChunkAssembly(
  recordingId: string
): Promise<RecordingChunkAssembly> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("recording_chunks")
    .select(
      [
        "recording_id",
        "chunk_index",
        "status",
        "transcript",
        "provider_status_code",
        "provider_error_code",
        "attempt_count",
        "duration_seconds",
        "avg_rms",
        "peak_rms",
        "last_error_at",
        "last_success_at",
        "updated_at",
      ].join(",")
    )
    .eq("recording_id", recordingId)
    .order("chunk_index", { ascending: true });

  if (error) {
    if (isTranscriptionStateSchemaError(error)) {
      return {
        chunks: [],
        supported: false,
        transcript: "",
      };
    }

    return {
      chunks: [],
      error,
      supported: true,
      transcript: "",
    };
  }

  const chunks = (data as unknown as RecordingChunkRow[] | null) ?? [];
  return {
    chunks,
    supported: true,
    transcript: normalizeChunkTranscriptList(chunks),
  };
}
