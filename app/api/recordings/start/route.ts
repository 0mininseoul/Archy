import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import { formatKSTDate } from "@/lib/utils";
import { hasUnlimitedUsage } from "@/lib/promo";
import { cleanupStaleRecordings } from "@/lib/services/stale-recordings";
import { loadUserWithUsageReset } from "@/lib/usage-cycle";

interface StartSessionResponse {
  sessionId: string;
  title: string;
}

// POST /api/recordings/start - 녹음 세션 시작 (임시 레코드 생성)
export const POST = withAuth<StartSessionResponse>(
  async ({ user, supabase, request }) => {
    const body = await request!.json();
    const { format = "meeting" } = body;
    const nowIso = new Date().toISOString();
    const path = new URL(request!.url).pathname;

    const { recordings: staleSessions, error: staleError } = await cleanupStaleRecordings({
      userId: user.id,
    });

    if (staleError) {
      console.error("[StartSession] Failed to cleanup stale sessions:", staleError);
    } else if (staleSessions && staleSessions.length > 0) {
      console.log("[RecorderLifecycle]", {
        event: "stale_failed",
        userId: user.id,
        count: staleSessions.length,
        sessionIds: staleSessions.map((session) => session.id),
        path,
      });
    }

    // 유저 데이터와 기존 세션을 병렬로 조회 (속도 최적화)
    const [userResult, sessionResult] = await Promise.all([
      loadUserWithUsageReset<{
        monthly_minutes_used: number;
        bonus_minutes: number;
        promo_expires_at?: string | null;
        last_reset_at: string;
        created_at: string;
      }>(
        supabase,
        user.id,
        "monthly_minutes_used, bonus_minutes, promo_expires_at, last_reset_at, created_at"
      ),
      supabase
        .from("recordings")
        .select("id, duration_seconds, last_chunk_index, session_paused_at")
        .eq("user_id", user.id)
        .eq("status", "recording")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const userData = userResult.data;
    const existingSession = sessionResult.data;

    if (userResult.error) {
      console.error("[StartSession] Failed to load user:", userResult.error);
      return errorResponse("Failed to load user", 500);
    }

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    if (existingSession) {
      await supabase
        .from("recordings")
        .update({
          last_activity_at: nowIso,
          session_paused_at: null,
          termination_reason: null,
        })
        .eq("id", existingSession.id)
        .eq("user_id", user.id);

      // Return existing session instead of creating new one
      console.log(`[StartSession] User already has active session: ${existingSession.id}`);
      console.log("[RecorderLifecycle]", {
        event: "session_reused",
        userId: user.id,
        sessionId: existingSession.id,
        durationSeconds: existingSession.duration_seconds ?? 0,
        lastChunkIndex: existingSession.last_chunk_index ?? -1,
        pausedAt: existingSession.session_paused_at,
        path,
      });
      return successResponse({
        sessionId: existingSession.id,
        title: `Archy - ${formatKSTDate()}`,
      });
    }

    // Check if user has remaining minutes (Pro users have unlimited usage)
    if (!hasUnlimitedUsage(userData)) {
      const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);
      if (userData.monthly_minutes_used >= totalMinutesAvailable) {
        return errorResponse("Monthly usage limit exceeded", 403);
      }
    }

    // Generate title
    const title = `Archy - ${formatKSTDate()}`;

    // Create recording record with 'recording' status
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null,
        duration_seconds: 0,
        format: format || "meeting",
        status: "recording",
        transcript: "",
        last_chunk_index: -1,
        last_activity_at: nowIso,
        termination_reason: null,
      })
      .select()
      .single();

    if (recordingError) {
      console.error("[StartSession] Failed to create session:", recordingError);
      return errorResponse("Failed to create recording session", 500);
    }

    console.log(`[StartSession] Created new session: ${recording.id}`);
    console.log("[RecorderLifecycle]", {
      event: "session_started",
      userId: user.id,
      sessionId: recording.id,
      durationSeconds: 0,
      lastChunkIndex: -1,
      path,
    });

    return successResponse({
      sessionId: recording.id,
      title,
    });
  }
);

// GET /api/recordings/start - 활성 세션 조회
export const GET = withAuth<{ session: { id: string; duration: number; lastChunkIndex: number; pausedAt: string | null } | null }>(
  async ({ user, supabase }) => {
    const { data: session } = await supabase
      .from("recordings")
      .select("id, duration_seconds, last_chunk_index, session_paused_at, transcript")
      .eq("user_id", user.id)
      .eq("status", "recording")
      .single();

    if (!session) {
      return successResponse({ session: null });
    }

    return successResponse({
      session: {
        id: session.id,
        duration: session.duration_seconds,
        lastChunkIndex: session.last_chunk_index,
        pausedAt: session.session_paused_at,
      },
    });
  }
);
