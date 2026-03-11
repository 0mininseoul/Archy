// Groq Whisper Large V3 STT Service
// Using Groq API for fast and accurate Korean transcription

import {
  getGroqBilledAudioSeconds,
  markGroqKeyAspdRateLimited,
  recordGroqAudioUsage,
} from "@/lib/services/groq-audio-budget";
import type { GroqApiKeySource } from "@/lib/services/groq-key-types";
import { hasMeaningfulTranscript } from "@/lib/utils/transcript";

export interface TranscriptionOptions {
  avgRms?: number;
  peakRms?: number;
  durationSeconds?: number;
  chunkIndex?: number;
  apiKeyOverride?: string;
  apiKeySource?: GroqApiKeySource;
  activeRecorderUsers?: number;
}

export interface TranscriptionMetrics {
  avgNoSpeechProb?: number;
  avgLogprob?: number;
  segmentCount: number;
  avgRms?: number;
  peakRms?: number;
}

export interface TranscriptionResult {
  text: string;
  rawTextLength: number;
  isLikelySilence: boolean;
  reason?: string;
  metrics: TranscriptionMetrics;
}

export class GroqTranscriptionError extends Error {
  apiKeySource?: GroqApiKeySource;
  errorText?: string;
  retryAfterSeconds?: number;
  statusCode?: number;

  constructor(
    message: string,
    options: {
      apiKeySource?: GroqApiKeySource;
      errorText?: string;
      retryAfterSeconds?: number;
      statusCode?: number;
    } = {}
  ) {
    super(message);
    this.name = "GroqTranscriptionError";
    this.apiKeySource = options.apiKeySource;
    this.errorText = options.errorText;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.statusCode = options.statusCode;
  }
}

export function isGroqAspdRateLimitError(error: unknown): error is GroqTranscriptionError {
  return (
    error instanceof GroqTranscriptionError &&
    error.statusCode === 429 &&
    /Audio Seconds per Day|ASPD/i.test(error.errorText ?? "")
  );
}

interface GroqSegment {
  avg_logprob?: number;
  no_speech_prob?: number;
}

interface GroqVerboseJsonResponse {
  text?: string;
  segments?: GroqSegment[];
}

export const SILENCE_FILTER_VERSION = "balanced_v1";

// Balanced filtering thresholds
export const SILENCE_FILTER_THRESHOLDS = {
  lowSignalRms: 0.006,
  weakSignalRms: 0.0085,
  highNoSpeechProb: 0.62,
  midNoSpeechProb: 0.5,
  lowAvgLogprob: -1.1,
  allSegmentNoSpeechProb: 0.8,
  suspiciousShortTextMaxChars: 12,
  longChunkMinSeconds: 10,
  repetitiveTokenMinOccurrences: 4,
  repetitiveTokenRatio: 0.3,
  repetitiveConsecutiveTokenMin: 3,
  mixedScriptFamilyMin: 3,
  mixedScriptShortTextMaxChars: 48,
  mixedScriptShortTextMaxTokens: 8,
} as const;

// Keep this list narrow and always combine with signal/confidence checks.
const SUSPICIOUS_SHORT_PHRASES = new Set([
  "감사합니다",
  "고맙습니다",
  "thankyou",
  "thanks",
]);

const OUTRO_HALLUCINATION_MARKERS = [
  "시청해주셔서감사합니다",
  "들어주셔서감사합니다",
  "봐주셔서감사합니다",
  "구독과좋아요",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isSuspiciousShortPhrase(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > SILENCE_FILTER_THRESHOLDS.suspiciousShortTextMaxChars) {
    return false;
  }

  return SUSPICIOUS_SHORT_PHRASES.has(normalized);
}

function isLikelyOutroHallucination(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (OUTRO_HALLUCINATION_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const gratitudeMatches = normalized.match(/감사합니다|고맙습니다|thankyou|thanks/gu) ?? [];
  if (gratitudeMatches.length < 2) {
    return false;
  }

  const stripped = gratitudeMatches.reduce(
    (value, token) => value.replaceAll(token, ""),
    normalized
  );

  return stripped.length <= 8;
}

function extractWordTokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hasSuspiciousTokenRepetition(text: string): boolean {
  const tokens = extractWordTokens(text);
  if (tokens.length < 8) {
    return false;
  }

  const counts = new Map<string, number>();
  let maxTokenCount = 0;
  let consecutiveRepeats = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextCount = (counts.get(token) ?? 0) + 1;
    counts.set(token, nextCount);
    if (nextCount > maxTokenCount) {
      maxTokenCount = nextCount;
    }

    if (index > 0 && token === tokens[index - 1]) {
      consecutiveRepeats += 1;
    }
  }

  return (
    consecutiveRepeats >= SILENCE_FILTER_THRESHOLDS.repetitiveConsecutiveTokenMin ||
    (
      maxTokenCount >= SILENCE_FILTER_THRESHOLDS.repetitiveTokenMinOccurrences &&
      maxTokenCount / tokens.length >= SILENCE_FILTER_THRESHOLDS.repetitiveTokenRatio
    )
  );
}

function countScriptFamilies(text: string): number {
  let families = 0;

  if (/[\p{Script=Hangul}]/u.test(text)) {
    families += 1;
  }
  if (/[\p{Script=Latin}]/u.test(text)) {
    families += 1;
  }
  if (/[\p{Script=Cyrillic}]/u.test(text)) {
    families += 1;
  }
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    families += 1;
  }

  return families;
}

function isSuspiciousMixedScriptGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.includes("�")) {
    return true;
  }

  const tokens = extractWordTokens(trimmed);
  return (
    trimmed.length <= SILENCE_FILTER_THRESHOLDS.mixedScriptShortTextMaxChars &&
    tokens.length <= SILENCE_FILTER_THRESHOLDS.mixedScriptShortTextMaxTokens &&
    countScriptFamilies(trimmed) >= SILENCE_FILTER_THRESHOLDS.mixedScriptFamilyMin
  );
}

function analyzeSilence(
  text: string,
  avgNoSpeechProb: number | undefined,
  avgLogprob: number | undefined,
  noSpeechValues: number[],
  options: TranscriptionOptions
): { isLikelySilence: boolean; reason?: string } {
  if (!text.trim()) {
    return { isLikelySilence: true, reason: "empty_text" };
  }

  if (!hasMeaningfulTranscript(text)) {
    return { isLikelySilence: true, reason: "punctuation_only_text" };
  }

  const hasRms = isFiniteNumber(options.avgRms);
  const avgRms = hasRms ? options.avgRms : undefined;

  // Rule A: low signal + low confidence
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.lowSignalRms &&
    (
      (isFiniteNumber(avgNoSpeechProb) && avgNoSpeechProb >= SILENCE_FILTER_THRESHOLDS.highNoSpeechProb) ||
      (isFiniteNumber(avgLogprob) && avgLogprob <= SILENCE_FILTER_THRESHOLDS.lowAvgLogprob)
    )
  ) {
    return { isLikelySilence: true, reason: "rule_a_low_signal_low_confidence" };
  }

  // Rule B: every segment strongly indicates no speech
  if (
    noSpeechValues.length > 0 &&
    noSpeechValues.every((value) => value >= SILENCE_FILTER_THRESHOLDS.allSegmentNoSpeechProb)
  ) {
    return { isLikelySilence: true, reason: "rule_b_all_segments_high_no_speech" };
  }

  // Rule C: suspicious short phrase + low signal + moderate no-speech
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.lowSignalRms &&
    isFiniteNumber(avgNoSpeechProb) &&
    avgNoSpeechProb >= SILENCE_FILTER_THRESHOLDS.midNoSpeechProb &&
    isSuspiciousShortPhrase(text)
  ) {
    return { isLikelySilence: true, reason: "rule_c_suspicious_short_phrase" };
  }

  // Rule D: long weak-signal chunk containing only a tiny gratitude phrase.
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.weakSignalRms &&
    (options.durationSeconds ?? 0) >= SILENCE_FILTER_THRESHOLDS.longChunkMinSeconds &&
    isSuspiciousShortPhrase(text)
  ) {
    return { isLikelySilence: true, reason: "rule_d_long_chunk_short_phrase" };
  }

  // Rule E: long weak-signal chunk that looks like an outro hallucination.
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.weakSignalRms &&
    (options.durationSeconds ?? 0) >= SILENCE_FILTER_THRESHOLDS.longChunkMinSeconds &&
    isLikelyOutroHallucination(text)
  ) {
    return { isLikelySilence: true, reason: "rule_e_long_chunk_outro_hallucination" };
  }

  // Rule F: weak-signal chunk dominated by repeated tokens.
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.weakSignalRms &&
    (options.durationSeconds ?? 0) >= SILENCE_FILTER_THRESHOLDS.longChunkMinSeconds &&
    hasSuspiciousTokenRepetition(text)
  ) {
    return { isLikelySilence: true, reason: "rule_f_low_signal_repetition" };
  }

  // Rule G: weak-signal chunk with obvious encoding/script corruption.
  if (
    hasRms &&
    avgRms! < SILENCE_FILTER_THRESHOLDS.weakSignalRms &&
    isSuspiciousMixedScriptGibberish(text)
  ) {
    return { isLikelySilence: true, reason: "rule_g_low_signal_mixed_script_gibberish" };
  }

  return { isLikelySilence: false };
}

export async function transcribeAudio(
  audioFile: File,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const groqApiKey = options.apiKeyOverride || process.env.GROQ_API_KEY;
  const billedAudioSeconds = getGroqBilledAudioSeconds(options.durationSeconds);
  if (!groqApiKey) {
    throw new Error("Groq API key not configured");
  }

  console.log("[Transcription] Starting Groq Whisper transcription...");
  console.log("[Transcription] File type:", audioFile.type, "Size:", audioFile.size);
  if (options.apiKeySource) {
    console.log(
      `[Transcription] Using key source=${options.apiKeySource}, activeRecorders=${options.activeRecorderUsers ?? "n/a"}`
    );
  }

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "ko"); // Korean language for best accuracy
  formData.append("response_format", "verbose_json");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;
      console.error("[Transcription] Groq API error:", errorText);
      if (
        response.status === 429 &&
        options.apiKeySource &&
        /Audio Seconds per Day|ASPD/i.test(errorText)
      ) {
        await markGroqKeyAspdRateLimited(options.apiKeySource, errorText, {
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        });
      }
      throw new GroqTranscriptionError(
        `Groq API error: ${response.status} - ${errorText}`,
        {
          apiKeySource: options.apiKeySource,
          errorText,
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
          statusCode: response.status,
        }
      );
    }

    const data = await response.json() as GroqVerboseJsonResponse;
    const text = typeof data.text === "string" ? data.text.trim() : "";
    const segments = Array.isArray(data.segments) ? data.segments : [];
    const noSpeechValues = segments
      .map((segment) => segment.no_speech_prob)
      .filter(isFiniteNumber);
    const logprobValues = segments
      .map((segment) => segment.avg_logprob)
      .filter(isFiniteNumber);

    const avgNoSpeechProb = average(noSpeechValues);
    const avgLogprob = average(logprobValues);
    const analysis = analyzeSilence(
      text,
      avgNoSpeechProb,
      avgLogprob,
      noSpeechValues,
      options
    );

    const metrics: TranscriptionMetrics = {
      avgNoSpeechProb,
      avgLogprob,
      segmentCount: segments.length,
      avgRms: options.avgRms,
      peakRms: options.peakRms,
    };

    if (analysis.isLikelySilence) {
      console.log(
        `[Transcription] Filtered likely silence (reason=${analysis.reason}, chunk=${options.chunkIndex ?? "n/a"}, avgRms=${options.avgRms ?? "n/a"}, avgNoSpeechProb=${avgNoSpeechProb ?? "n/a"}, avgLogprob=${avgLogprob ?? "n/a"})`
      );
    } else {
      console.log("[Transcription] Groq transcription succeeded, length:", text.length);
    }

    if (options.apiKeySource) {
      await recordGroqAudioUsage(options.apiKeySource, billedAudioSeconds);
    }

    return {
      text: analysis.isLikelySilence ? "" : text,
      rawTextLength: text.length,
      isLikelySilence: analysis.isLikelySilence,
      reason: analysis.reason,
      metrics,
    };
  } catch (error) {
    console.error("[Transcription] Groq error:", error);
    if (error instanceof GroqTranscriptionError) {
      throw error;
    }
    throw new GroqTranscriptionError(
      `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      { apiKeySource: options.apiKeySource }
    );
  }
}
