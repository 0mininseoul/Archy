import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { transcribeAudio } from "@/lib/services/whisper";

// Vercel Free tier: 4.5MB limit
// 20초 청크 (64kbps): ~160KB
// Route segment config for body size limit
export const maxDuration = 60; // 60 seconds timeout

interface ChunkTranscriptResponse {
  transcript: string;
  chunkIndex: number;
  totalDuration: number;
}

// POST /api/recordings/chunk - 청크 단위 전사 및 실시간 병합
export const POST = withAuth<ChunkTranscriptResponse>(
  async ({ user, supabase, request }) => {
    const formData = await request!.formData();
    const audioChunk = formData.get("audio") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const durationSeconds = parseInt(formData.get("durationSeconds") as string);
    const sessionId = formData.get("sessionId") as string;
    const totalDuration = parseInt(formData.get("totalDuration") as string) || 0;

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

    // File size check (Minimum 1KB) - 빈 오디오나 무음 파일 방지
    if (audioChunk.size < 1024) {
      console.log(`[Chunk] Chunk ${chunkIndex} too small (${audioChunk.size} bytes), skipping transcription`);
      return successResponse({
        transcript: "",
        chunkIndex,
        totalDuration,
      });
    }

    // File size check (4MB limit for Vercel)
    const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
    if (audioChunk.size > MAX_CHUNK_SIZE) {
      return errorResponse("Chunk size exceeds 4MB limit", 413);
    }

    console.log(
      `[Chunk] Processing chunk ${chunkIndex}, size: ${audioChunk.size}, duration: ${durationSeconds}s, session: ${sessionId || 'none'}`
    );

    try {
      // Groq Whisper API로 전사
      const transcript = await transcribeAudio(audioChunk);

      console.log(
        `[Chunk] Chunk ${chunkIndex} transcribed, length: ${transcript.length}`
      );

      // sessionId가 있으면 실시간으로 DB에 병합
      if (sessionId) {
        // 현재 세션 조회
        const { data: session } = await supabase
          .from("recordings")
          .select("transcript, last_chunk_index, status")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .single();

        if (session && session.status === "recording") {
          // 이미 처리된 청크인지 확인 (중복 방지)
          if (chunkIndex > session.last_chunk_index) {
            // 기존 전사본에 새 전사본 append (줄글로 이어서 작성)
            const existingTranscript = session.transcript || "";
            const newTranscript = existingTranscript
              ? `${existingTranscript} ${transcript}`
              : transcript;

            // DB 업데이트
            await supabase
              .from("recordings")
              .update({
                transcript: newTranscript,
                last_chunk_index: chunkIndex,
                duration_seconds: totalDuration,
              })
              .eq("id", sessionId)
              .eq("user_id", user.id);

            console.log(`[Chunk] Session ${sessionId} updated, chunk ${chunkIndex}, total duration: ${totalDuration}s`);
          } else {
            console.log(`[Chunk] Chunk ${chunkIndex} already processed for session ${sessionId}`);
          }
        }
      }

      return successResponse({
        transcript,
        chunkIndex,
        totalDuration,
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
