import { getStaleRecordingCutoffIso } from "@/lib/recording-lifecycle";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface StaleRecordingCleanupRow {
  id: string;
  user_id: string;
  duration_seconds: number | null;
  last_chunk_index: number | null;
  last_activity_at: string;
  session_paused_at: string | null;
}

interface CleanupStaleRecordingsOptions {
  userId?: string;
  nowMs?: number;
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
    .update({
      status: "failed",
      processing_step: null,
      error_step: "abandoned",
      error_message: "Recording session timed out due to inactivity.",
      termination_reason: "stale_timeout",
      last_activity_at: nowIso,
    })
    .eq("status", "recording")
    .lt("last_activity_at", staleCutoffIso);

  const query = userId ? baseQuery.eq("user_id", userId) : baseQuery;

  const { data, error } = await query.select(
    "id, user_id, duration_seconds, last_chunk_index, last_activity_at, session_paused_at"
  );

  return {
    error,
    nowIso,
    recordings: (data as StaleRecordingCleanupRow[] | null) ?? [],
    staleCutoffIso,
  };
}
