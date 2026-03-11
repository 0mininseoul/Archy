import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import {
  processFromTranscripts,
  handleProcessingError,
} from "@/lib/services/recording-processor";
import { formatKSTDate } from "@/lib/utils";
import { hasUnlimitedUsage } from "@/lib/promo";
import {
  finalizeRecordingSession,
  type FinalizeRecordingSessionResult,
} from "@/lib/services/recording-finalizer";
import { loadUserWithUsageReset } from "@/lib/usage-cycle";

interface ChunkTranscript {
  chunkIndex: number;
  transcript: string;
}

interface FinalizeRequest {
  sessionId?: string;
  transcripts?: ChunkTranscript[];
  totalDurationSeconds: number;
  format?: string;
}

interface FinalizeResponse {
  recording: Pick<Recording, "id" | "title" | "status">;
  idempotent: boolean;
  statusBefore?: FinalizeRecordingSessionResult["statusBefore"];
}

export const POST = withAuth<FinalizeResponse>(
  async ({ user, supabase, request }) => {
    const body: FinalizeRequest = await request!.json();
    const { sessionId, transcripts, totalDurationSeconds, format } = body;

    if (!totalDurationSeconds || totalDurationSeconds <= 0) {
      return errorResponse("Valid totalDurationSeconds is required", 400);
    }

    if (sessionId) {
      const result = await finalizeRecordingSession({
        recordingId: sessionId,
        totalDurationSeconds,
        userId: user.id,
        format: (format as Recording["format"] | undefined) || undefined,
      });

      if (result.error) {
        return errorResponse(result.error, result.statusCode || 500);
      }

      return successResponse({
        recording: result.recording,
        idempotent: result.idempotent,
        statusBefore: result.statusBefore,
      });
    }

    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return errorResponse("Either sessionId or transcripts array is required", 400);
    }

    const { data: userData, error: userError } = await loadUserWithUsageReset<User>(
      supabase,
      user.id,
      "*"
    );

    if (userError) {
      console.error("[Finalize] Failed to load user:", userError);
      return errorResponse("Failed to load user", 500);
    }

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    const durationMinutes = Math.ceil(totalDurationSeconds / 60);
    if (!hasUnlimitedUsage(userData as User)) {
      const totalMinutesAvailable =
        MONTHLY_MINUTES_LIMIT + ((userData as User).bonus_minutes || 0);
      if ((userData as User).monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
        return errorResponse("Monthly usage limit exceeded", 403);
      }
    }

    const sortedTranscripts = [...transcripts].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const mergedTranscript = sortedTranscripts.map((t) => t.transcript).join("\n\n");
    const title = `Archy - ${formatKSTDate()}`;

    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null,
        duration_seconds: totalDurationSeconds,
        format: (format as Recording["format"] | undefined) || "meeting",
        status: "processing",
        transcript: mergedTranscript,
        last_activity_at: new Date().toISOString(),
        termination_reason: "user_stop",
      })
      .select()
      .single();

    if (recordingError) {
      console.error("[Finalize] Failed to create recording:", recordingError);
      return errorResponse("Failed to create recording", 500);
    }

    await supabase
      .from("users")
      .update({
        monthly_minutes_used: (userData as User).monthly_minutes_used + durationMinutes,
      })
      .eq("id", user.id);

    const result = await processFromTranscripts({
      recordingId: recording.id,
      transcript: mergedTranscript,
      format: ((format as Recording["format"] | undefined) || "meeting") as Recording["format"],
      duration: totalDurationSeconds,
      userData: userData as User,
      title,
    }).catch(async (error) => {
      await handleProcessingError(recording.id, error);
      return null;
    });

    return successResponse({
      recording: {
        id: recording.id,
        title: result?.title || title,
        status: result?.success ? "completed" : "failed",
      },
      idempotent: false,
    });
  }
);
