import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import { formatKSTDate } from "@/lib/utils";

interface StartSessionResponse {
  sessionId: string;
  title: string;
}

// POST /api/recordings/start - 녹음 세션 시작 (임시 레코드 생성)
export const POST = withAuth<StartSessionResponse>(
  async ({ user, supabase, request }) => {
    const body = await request!.json();
    const { format = "meeting" } = body;

    // Get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    // Check if user already has an active recording session
    const { data: existingSession } = await supabase
      .from("recordings")
      .select("id, created_at, duration_seconds")
      .eq("user_id", user.id)
      .eq("status", "recording")
      .single();

    if (existingSession) {
      // Return existing session instead of creating new one
      console.log(`[StartSession] User already has active session: ${existingSession.id}`);
      return successResponse({
        sessionId: existingSession.id,
        title: `Archy - ${formatKSTDate()}`,
      });
    }

    // Check if user has remaining minutes
    const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);
    if (userData.monthly_minutes_used >= totalMinutesAvailable) {
      return errorResponse("Monthly usage limit exceeded", 403);
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
      })
      .select()
      .single();

    if (recordingError) {
      console.error("[StartSession] Failed to create session:", recordingError);
      return errorResponse("Failed to create recording session", 500);
    }

    console.log(`[StartSession] Created new session: ${recording.id}`);

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
