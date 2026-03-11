import { NextResponse } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording } from "@/lib/types/database";
import {
  GroqTranscriptionError,
  transcribeAudio,
} from "@/lib/services/whisper";
import { logSttDecision } from "@/lib/services/stt-observability";
import { getGroqBilledAudioSeconds } from "@/lib/services/groq-audio-budget";
import { resolveGroqKeySelection } from "@/lib/services/groq-key-router";
import {
  beginRecordingChunkAttempt,
  completeRecordingChunkAttempt,
} from "@/lib/services/recording-transcription-state";

export const maxDuration = 60;
const MAX_CHUNK_SIZE = 4 * 1024 * 1024;
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

function getRetryableFlag(error: unknown): boolean {
  if (error instanceof GroqTranscriptionError && error.statusCode) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }

  return true;
}

function getProviderErrorCode(error: unknown): string {
  if (!(error instanceof GroqTranscriptionError)) {
    return "transcription_error";
  }

  if (/Audio Seconds per Day|ASPD/i.test(error.errorText ?? "")) {
    return "groq_aspd_rate_limit";
  }

  if (error.statusCode === 429) {
    return "groq_rate_limit";
  }

  if (error.statusCode === 503) {
    return "groq_service_unavailable";
  }

  if (error.statusCode === 500) {
    return "groq_internal_error";
  }

  return "groq_transcription_error";
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof GroqTranscriptionError) {
    if (error.statusCode === 429) {
      return "전사 처리량이 많아 잠시 후 다시 시도해주세요.";
    }

    if ((error.statusCode ?? 0) >= 500) {
      return "전사 서버가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.";
    }
  }

  return "전사 처리에 실패했습니다.";
}

function createChunkErrorResponse(
  error: unknown,
  options: {
    sessionStatus?: Recording["status"];
    terminal?: boolean;
  } = {}
): ReturnType<typeof errorResponse> {
  const statusCode =
    error instanceof GroqTranscriptionError && error.statusCode
      ? error.statusCode
      : 500;
  const retryAfterSeconds =
    error instanceof GroqTranscriptionError &&
    Number.isFinite(error.retryAfterSeconds)
      ? error.retryAfterSeconds
      : undefined;
  const response = NextResponse.json(
    {
      success: false,
      error: getSafeErrorMessage(error),
      code: getProviderErrorCode(error),
      recoverable: getRetryableFlag(error),
      retryAfterSeconds,
      sessionStatus: options.sessionStatus,
      terminal: options.terminal ?? false,
    },
    { status: statusCode }
  ) as ReturnType<typeof errorResponse>;

  if (Number.isFinite(retryAfterSeconds)) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }

  return response;
}

export const POST = withAuth(
  async ({ user, supabase, request }) => {
    const formData = await request!.formData();
    const audioChunk = formData.get("audio") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
    const durationSeconds = parseInt(formData.get("durationSeconds") as string, 10);
    const sessionId = formData.get("sessionId") as string;
    const totalDuration = parseInt(formData.get("totalDuration") as string, 10) || 0;
    const avgRms = parseOptionalNumber(formData.get("avgRms"));
    const peakRms = parseOptionalNumber(formData.get("peakRms"));

    if (!audioChunk) {
      return errorResponse("Audio chunk is required", 400);
    }

    if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
      return errorResponse("Valid chunkIndex is required", 400);
    }

    if (Number.isNaN(durationSeconds) || durationSeconds <= 0) {
      return errorResponse("Valid durationSeconds is required", 400);
    }

    if (audioChunk.size > MAX_CHUNK_SIZE) {
      return errorResponse("Chunk size exceeds 4MB limit", 413);
    }

    const chunkLogPrefix = `[Chunk session=${sessionId || "none"} chunk=${chunkIndex} user=${user.id}]`;

    console.log(
      `${chunkLogPrefix} Processing size=${audioChunk.size} duration=${durationSeconds}s`
    );

    const nowIso = new Date().toISOString();
    const { data: session } = sessionId
      ? await supabase
          .from("recordings")
          .select("id, status, transcript, last_chunk_index, duration_seconds")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle<{
            duration_seconds: number | null;
            id: string;
            last_chunk_index: number | null;
            status: Recording["status"];
            transcript: string | null;
          }>()
      : { data: null };

    if (sessionId && session && session.status !== "recording") {
      return NextResponse.json(
        {
          success: false,
          error: "녹음 세션이 이미 종료되었습니다.",
          code: "recording_not_active",
          recoverable: false,
          sessionStatus: session.status,
          terminal: true,
        },
        { status: 409 }
      ) as ReturnType<typeof errorResponse>;
    }

    const chunkAttempt = sessionId
      ? await beginRecordingChunkAttempt({
          recordingId: sessionId,
          chunkIndex,
          durationSeconds,
          avgRms,
          peakRms,
        })
      : { attemptCount: 1, supported: false as const };

    if (chunkAttempt.error) {
      console.error(
        `[Chunk] Failed to begin chunk attempt tracking for session ${sessionId}:`,
        chunkAttempt.error
      );
    }

    const updateSessionProgress = async (transcript: string): Promise<void> => {
      if (!sessionId || !session || session.status !== "recording") {
        return;
      }

      const progressPayload: {
        duration_seconds: number;
        last_activity_at: string;
        last_chunk_index: number;
        session_paused_at: null;
        termination_reason: null;
        transcript?: string;
      } = {
        duration_seconds: Math.max(totalDuration, session.duration_seconds ?? 0),
        last_activity_at: nowIso,
        last_chunk_index: Math.max(session.last_chunk_index ?? -1, chunkIndex),
        session_paused_at: null,
        termination_reason: null,
      };

      if (!chunkAttempt.supported && transcript.trim().length > 0) {
        const existingTranscript = session.transcript || "";
        if (chunkIndex > (session.last_chunk_index ?? -1)) {
          progressPayload.transcript = existingTranscript
            ? `${existingTranscript} ${transcript}`
            : transcript;
        }
      }

      const { error: sessionUpdateError } = await supabase
        .from("recordings")
        .update(progressPayload)
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .eq("status", "recording");

      if (sessionUpdateError) {
        console.error(`${chunkLogPrefix} Failed to update session progress:`, sessionUpdateError);
      }
    };

    try {
      let transcript = "";
      let silenceReason: string | undefined;

      if (audioChunk.size < 1024) {
        silenceReason = "size_too_small";
        console.log(
          `${chunkLogPrefix} Skipping transcription because chunk is too small (${audioChunk.size} bytes)`
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
          metrics: {
            avgRms,
            peakRms,
            segmentCount: 0,
          },
        });
      } else if (typeof avgRms === "number" && avgRms < PRE_TRANSCRIPTION_RMS_GATE) {
        silenceReason = "pre_gate_low_signal";
        console.log(
          `${chunkLogPrefix} Pre-transcription gate avgRms=${avgRms} peakRms=${peakRms ?? "n/a"}`
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
        const estimatedAudioSeconds = getGroqBilledAudioSeconds(durationSeconds);
        const keySelection = await resolveGroqKeySelection({
          estimatedAudioSeconds,
          routingKey: sessionId || `${user.id}:${chunkIndex}`,
        });
        console.log(
          `${chunkLogPrefix} Key routing activeRecorders=${keySelection.activeRecorderUsers} keySource=${keySelection.source} routingReason=${keySelection.routingReason} recordedLastHour=${keySelection.recordedAudioSecondsLastHour} projectedLastHour=${keySelection.projectedAudioSecondsLastHour} hourlyRiskThreshold=${keySelection.hourlyAudioRiskThresholdSeconds} recordedLast24h=${keySelection.recordedAudioSecondsLast24h} providerFloorLast24h=${keySelection.providerFloorAudioUsedSecondsLast24h ?? "none"} effectiveLast24h=${keySelection.effectiveAudioSecondsLast24h} projectedLast24h=${keySelection.projectedAudioSecondsLast24h} dailyRiskThreshold=${keySelection.dailyAudioRiskThresholdSeconds} aspdCooldownUntil=${keySelection.aspdCooldownUntil ?? "none"}`
        );

        const transcription = await transcribeAudio(audioChunk, {
          avgRms,
          peakRms,
          durationSeconds,
          chunkIndex,
          apiKeyOverride: keySelection.apiKey,
          apiKeySource: keySelection.source,
          activeRecorderUsers: keySelection.activeRecorderUsers,
        });
        transcript = transcription.text;
        silenceReason = transcription.isLikelySilence ? transcription.reason : undefined;

        console.log(
          `${chunkLogPrefix} Transcribed length=${transcript.length} avgNoSpeechProb=${transcription.metrics.avgNoSpeechProb ?? "n/a"} avgLogprob=${transcription.metrics.avgLogprob ?? "n/a"}`
        );

        if (transcription.isLikelySilence) {
          console.log(
            `${chunkLogPrefix} Filtered as likely silence reason=${silenceReason} avgRms=${avgRms ?? "n/a"}`
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

      await updateSessionProgress(transcript);

      if (sessionId && chunkAttempt.supported) {
        const completion = await completeRecordingChunkAttempt({
          recordingId: sessionId,
          chunkIndex,
          durationSeconds,
          avgRms,
          peakRms,
          attemptCount: chunkAttempt.attemptCount,
          transcript,
          status: "succeeded",
        });

        if (completion.error) {
          console.error(
            `${chunkLogPrefix} Failed to persist chunk success:`,
            completion.error
          );
        }
      }

      return successResponse({
        transcript,
        chunkIndex,
        totalDuration,
      });
    } catch (error) {
      await updateSessionProgress("");

      if (sessionId && chunkAttempt.supported) {
        const completion = await completeRecordingChunkAttempt({
          recordingId: sessionId,
          chunkIndex,
          durationSeconds,
          avgRms,
          peakRms,
          attemptCount: chunkAttempt.attemptCount,
          providerErrorCode: getProviderErrorCode(error),
          providerStatusCode:
            error instanceof GroqTranscriptionError ? error.statusCode : undefined,
          status: "failed",
        });

        if (completion.error) {
          console.error(
            `${chunkLogPrefix} Failed to persist chunk failure:`,
            completion.error
          );
        }
      }

      console.error(`${chunkLogPrefix} Transcription failed:`, error);
      return createChunkErrorResponse(error, {
        sessionStatus: session?.status,
        terminal: false,
      });
    }
  }
);
