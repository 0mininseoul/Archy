import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { transcribeAudio } from "@/lib/services/whisper";
import { logSttDecision } from "@/lib/services/stt-observability";
import { resolveGroqKeySelection } from "@/lib/services/groq-key-router";

// Vercel Free tier: 4.5MB limit
// 20초 청크 (64kbps): ~160KB
// Route segment config for body size limit
export const maxDuration = 60; // 60 seconds timeout
const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
const PRE_TRANSCRIPTION_RMS_GATE = 0.002;

interface ChunkTranscriptResponse {
  transcript: string;
  chunkIndex: number;
  totalDuration: number;
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const avgRms = parseOptionalNumber(formData.get("avgRms"));
    const peakRms = parseOptionalNumber(formData.get("peakRms"));

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
      logSttDecision({
        pipeline: "chunk",
        decision: "pre_gated",
        reason: "size_too_small",
        sessionId: sessionId || undefined,
        chunkIndex,
        durationSeconds,
        audioSizeBytes: audioChunk.size,
        textLength: 0,
        metrics: {
          avgRms,
          peakRms,
          segmentCount: 0,
        },
      });
      return successResponse({
        transcript: "",
        chunkIndex,
        totalDuration,
      });
    }

    if (audioChunk.size > MAX_CHUNK_SIZE) {
      return errorResponse("Chunk size exceeds 4MB limit", 413);
    }

    console.log(
      `[Chunk] Processing chunk ${chunkIndex}, size: ${audioChunk.size}, duration: ${durationSeconds}s, session: ${sessionId || 'none'}`
    );

    try {
      let transcript = "";
      let silenceReason: string | undefined;

      // Extremely low signal chunks are skipped before STT call.
      if (typeof avgRms === "number" && avgRms < PRE_TRANSCRIPTION_RMS_GATE) {
        silenceReason = "pre_gate_low_signal";
        console.log(
          `[Chunk] Chunk ${chunkIndex} skipped before transcription (avgRms=${avgRms}, peakRms=${peakRms ?? "n/a"})`
        );
        logSttDecision({
          pipeline: "chunk",
          decision: "pre_gated",
          reason: silenceReason,
          sessionId: sessionId || undefined,
          chunkIndex,
          durationSeconds,
          audioSizeBytes: audioChunk.size,
          textLength: 0,
          preTranscriptionRmsGate: PRE_TRANSCRIPTION_RMS_GATE,
          metrics: {
            avgRms,
            peakRms,
            segmentCount: 0,
          },
        });
      } else {
        const keySelection = await resolveGroqKeySelection();
        console.log(
          `[Chunk] Key routing for chunk ${chunkIndex}: activeRecorders=${keySelection.activeRecorderUsers}, keySource=${keySelection.source}`
        );

        const transcription = await transcribeAudio(audioChunk, {
          avgRms,
          peakRms,
          chunkIndex,
          apiKeyOverride: keySelection.apiKey,
          apiKeySource: keySelection.source,
          activeRecorderUsers: keySelection.activeRecorderUsers,
        });
        transcript = transcription.text;
        silenceReason = transcription.isLikelySilence
          ? transcription.reason
          : undefined;

        console.log(
          `[Chunk] Chunk ${chunkIndex} transcribed, length=${transcript.length}, avgNoSpeechProb=${transcription.metrics.avgNoSpeechProb ?? "n/a"}, avgLogprob=${transcription.metrics.avgLogprob ?? "n/a"}`
        );

        if (transcription.isLikelySilence) {
          console.log(
            `[Chunk] Chunk ${chunkIndex} filtered as likely silence (reason=${silenceReason}, avgRms=${avgRms ?? "n/a"})`
          );
        }

        logSttDecision({
          pipeline: "chunk",
          decision: transcription.isLikelySilence ? "filtered" : "accepted",
          reason: silenceReason,
          sessionId: sessionId || undefined,
          chunkIndex,
          durationSeconds,
          audioSizeBytes: audioChunk.size,
          textLength: transcription.rawTextLength,
          preTranscriptionRmsGate: PRE_TRANSCRIPTION_RMS_GATE,
          metrics: transcription.metrics,
        });
      }

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
            const updatePayload: {
              transcript?: string;
              last_chunk_index: number;
              duration_seconds: number;
              session_paused_at: null;
            } = {
              last_chunk_index: chunkIndex,
              duration_seconds: totalDuration,
              session_paused_at: null,
            };

            if (transcript.trim().length > 0) {
              // 기존 전사본에 새 전사본 append (줄글로 이어서 작성)
              const existingTranscript = session.transcript || "";
              updatePayload.transcript = existingTranscript
                ? `${existingTranscript} ${transcript}`
                : transcript;
            }

            // DB 업데이트
            await supabase
              .from("recordings")
              .update(updatePayload)
              .eq("id", sessionId)
              .eq("user_id", user.id);

            if (transcript.trim().length > 0) {
              console.log(
                `[Chunk] Session ${sessionId} updated with transcript, chunk ${chunkIndex}, total duration: ${totalDuration}s`
              );
            } else {
              console.log(
                `[Chunk] Session ${sessionId} updated without transcript append, chunk ${chunkIndex}, total duration: ${totalDuration}s, reason=${silenceReason ?? "empty_transcript"}`
              );
            }
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
