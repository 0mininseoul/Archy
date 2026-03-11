import {
  SILENCE_FILTER_VERSION,
  SILENCE_FILTER_THRESHOLDS,
  TranscriptionMetrics,
} from "@/lib/services/whisper";

type SttPipeline = "chunk" | "single";
type SttDecision = "accepted" | "filtered" | "pre_gated";

interface SttDecisionLogInput {
  pipeline: SttPipeline;
  decision: SttDecision;
  reason?: string;
  sessionId?: string;
  recordingId?: string;
  chunkIndex?: number;
  durationSeconds?: number;
  audioSizeBytes?: number;
  textLength?: number;
  metrics?: Partial<TranscriptionMetrics>;
  preTranscriptionRmsGate?: number;
}

function roundMaybe(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value * 1000000) / 1000000;
}

export function logSttDecision(input: SttDecisionLogInput): void {
  const sessionLabel = [
    input.sessionId ? `session=${input.sessionId}` : null,
    typeof input.chunkIndex === "number" ? `chunk=${input.chunkIndex}` : null,
    `decision=${input.decision}`,
  ]
    .filter(Boolean)
    .join(" ");
  const payload = {
    event: "stt_transcription_decision",
    schema_version: 1,
    session_label: sessionLabel || null,
    session_id: input.sessionId,
    recording_id: input.recordingId,
    chunk_index: input.chunkIndex,
    timestamp: new Date().toISOString(),
    pipeline: input.pipeline,
    decision: input.decision,
    reason: input.reason,
    duration_seconds: input.durationSeconds,
    audio_size_bytes: input.audioSizeBytes,
    text_length: input.textLength ?? 0,
    filter_version: SILENCE_FILTER_VERSION,
    thresholds: {
      ...SILENCE_FILTER_THRESHOLDS,
      preTranscriptionRmsGate: input.preTranscriptionRmsGate,
    },
    metrics: {
      avgRms: roundMaybe(input.metrics?.avgRms),
      peakRms: roundMaybe(input.metrics?.peakRms),
      avgNoSpeechProb: roundMaybe(input.metrics?.avgNoSpeechProb),
      avgLogprob: roundMaybe(input.metrics?.avgLogprob),
      segmentCount: input.metrics?.segmentCount ?? 0,
    },
  };

  console.log(`[SttDecision ${sessionLabel || "session=none"}] ${JSON.stringify(payload)}`);
}
