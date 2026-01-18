import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import { processFromTranscripts, handleProcessingError } from "@/lib/services/recording-processor";
import { formatKSTDate } from "@/lib/utils";

interface ChunkTranscript {
  chunkIndex: number;
  transcript: string;
}

interface FinalizeRequest {
  transcripts: ChunkTranscript[];
  totalDurationSeconds: number;
  format: string;
}

interface FinalizeResponse {
  recording: Pick<Recording, "id" | "title" | "status">;
}

// POST /api/recordings/finalize - 청크 전사 결과 병합 및 최종 처리
export const POST = withAuth<FinalizeResponse>(
  async ({ user, supabase, request }) => {
    const body: FinalizeRequest = await request!.json();
    const { transcripts, totalDurationSeconds, format } = body;

    // Validation
    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return errorResponse("Transcripts array is required", 400);
    }

    if (!totalDurationSeconds || totalDurationSeconds <= 0) {
      return errorResponse("Valid totalDurationSeconds is required", 400);
    }

    // Get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    // Check usage limit
    const durationMinutes = Math.ceil(totalDurationSeconds / 60);
    const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);

    if (userData.monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
      return errorResponse("Monthly usage limit exceeded", 403);
    }

    // Sort and merge transcripts
    const sortedTranscripts = [...transcripts].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const mergedTranscript = sortedTranscripts.map((t) => t.transcript).join("\n\n");

    console.log(
      `[Finalize] Merging ${transcripts.length} chunks, total duration: ${totalDurationSeconds}s`
    );
    console.log(`[Finalize] Merged transcript length: ${mergedTranscript.length}`);

    // Generate title
    const title = `Archy - ${formatKSTDate()}`;

    // Create recording record
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null,
        duration_seconds: totalDurationSeconds,
        format: format || "meeting",
        status: "processing",
        transcript: mergedTranscript,
      })
      .select()
      .single();

    if (recordingError) {
      console.error("[Finalize] Failed to create recording:", recordingError);
      return errorResponse("Failed to create recording", 500);
    }

    // Update usage
    await supabase
      .from("users")
      .update({
        monthly_minutes_used: userData.monthly_minutes_used + durationMinutes,
      })
      .eq("id", user.id);

    // Process in background (skip transcription, start from formatting)
    processFromTranscripts({
      recordingId: recording.id,
      transcript: mergedTranscript,
      format: format as Recording["format"],
      duration: totalDurationSeconds,
      userData: userData as User,
      title,
    }).catch((error) => handleProcessingError(recording.id, error));

    return successResponse({
      recording: {
        id: recording.id,
        title: recording.title,
        status: recording.status,
      },
    });
  }
);
