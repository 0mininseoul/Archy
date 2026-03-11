import { after } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording } from "@/lib/types/database";
import { finalizeRecordingSession } from "@/lib/services/recording-finalizer";

interface FinalizeIntentRequest {
  expectedChunkCount?: number;
  sessionId: string;
  totalDurationSeconds: number;
  format?: Recording["format"];
}

interface FinalizeIntentResponse {
  recording: Pick<Recording, "id" | "status">;
  scheduled: boolean;
}

export const POST = withAuth<FinalizeIntentResponse>(
  async ({ user, request }) => {
    const body: FinalizeIntentRequest = await request!.json();
    const { sessionId, totalDurationSeconds, expectedChunkCount, format } = body;

    if (!sessionId) {
      return errorResponse("Session ID is required", 400);
    }

    if (!totalDurationSeconds || totalDurationSeconds <= 0) {
      return errorResponse("Valid totalDurationSeconds is required", 400);
    }

    after(async () => {
      const result = await finalizeRecordingSession({
        recordingId: sessionId,
        totalDurationSeconds,
        expectedChunkCount,
        userId: user.id,
        format,
      });

      if (result.error && (result.statusCode || 500) >= 500) {
        console.error("[FinalizeIntent] Background finalize failed:", {
          sessionId,
          userId: user.id,
          error: result.error,
          statusCode: result.statusCode,
        });
      }
    });

    return successResponse(
      {
        recording: {
          id: sessionId,
          status: "processing",
        },
        scheduled: true,
      },
      202
    );
  }
);
