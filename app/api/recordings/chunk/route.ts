import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { transcribeAudio } from "@/lib/services/whisper";

// Vercel Free tier: 4.5MB limit
// 5분 청크 (64kbps): ~2.4MB
// Route segment config for body size limit
export const maxDuration = 60; // 60 seconds timeout

interface ChunkTranscriptResponse {
  transcript: string;
  chunkIndex: number;
}

// POST /api/recordings/chunk - 청크 단위 전사
export const POST = withAuth<ChunkTranscriptResponse>(
  async ({ user, supabase, request }) => {
    const formData = await request!.formData();
    const audioChunk = formData.get("audio") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const durationSeconds = parseInt(formData.get("durationSeconds") as string);

    // Validation
    if (!audioChunk) {
      return errorResponse("Audio chunk is required", 400);
    }

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return errorResponse("Valid chunkIndex is required", 400);
    }

    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return errorResponse("Valid durationSeconds is required", 400);
    }

    // File size check (4MB limit for Vercel)
    const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
    if (audioChunk.size > MAX_CHUNK_SIZE) {
      return errorResponse("Chunk size exceeds 4MB limit", 413);
    }

    console.log(
      `[Chunk] Processing chunk ${chunkIndex}, size: ${audioChunk.size}, duration: ${durationSeconds}s`
    );

    try {
      // Groq Whisper API로 전사
      const transcript = await transcribeAudio(audioChunk);

      console.log(
        `[Chunk] Chunk ${chunkIndex} transcribed, length: ${transcript.length}`
      );

      return successResponse({
        transcript,
        chunkIndex,
      });
    } catch (error) {
      console.error(`[Chunk] Transcription failed for chunk ${chunkIndex}:`, error);
      return errorResponse(
        `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        500
      );
    }
  }
);
