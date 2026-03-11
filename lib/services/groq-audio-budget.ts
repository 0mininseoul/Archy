import { createServiceRoleClient } from "@/lib/supabase/admin";
import { GROQ_API_KEY_SOURCES, type GroqApiKeySource } from "@/lib/services/groq-key-types";

const DEFAULT_DAILY_LIMIT_SECONDS = 28_800;
const DEFAULT_RISK_THRESHOLD_RATIO = 0.9;
const DEFAULT_FIXED_BUFFER_SECONDS = 300;
const DEFAULT_PER_ACTIVE_RECORDER_BUFFER_SECONDS = 40;
const DEFAULT_ROLLING_WINDOW_HOURS = 24;
const DEFAULT_BUCKET_MINUTES = 5;
const DEFAULT_ASPD_COOLDOWN_MINUTES = 60;
const GROQ_MINIMUM_BILLED_AUDIO_SECONDS = 10;
const BUDGET_CIRCUIT_BREAKER_MS = 5 * 60 * 1000;

let budgetCircuitOpenUntilMs = 0;
let lastBudgetCircuitReason: string | null = null;

export interface GroqAudioBudgetConfig {
  aspdCooldownMinutes: number;
  bucketMinutes: number;
  dailyLimitSeconds: number;
  fixedSafetyBufferSeconds: number;
  perActiveRecorderBufferSeconds: number;
  riskThresholdRatio: number;
  rollingWindowHours: number;
}

export interface GroqAudioUsageSummary {
  cooldownUntil: string | null;
  lastKnownAudioLimitSeconds: number | null;
  lastKnownAudioUsedSeconds: number | null;
  lastRateLimitedAt: string | null;
  rollingAudioSeconds: number;
}

interface GroqAudioUsageBucketRow {
  audio_seconds: number | null;
  key_source: GroqApiKeySource;
}

interface GroqKeyHealthRow {
  aspd_cooldown_until: string | null;
  key_source: GroqApiKeySource;
  last_known_audio_limit_seconds: number | null;
  last_known_audio_used_seconds: number | null;
  last_rate_limited_at: string | null;
}

function getBudgetSchemaErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : undefined;
}

function isBudgetSchemaError(error: unknown): boolean {
  const code = getBudgetSchemaErrorCode(error);
  if (code && ["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? error.message : undefined;
  return (
    typeof message === "string" &&
    /groq_audio_usage_buckets|groq_key_health|increment_groq_audio_usage|upsert_groq_key_health/i.test(
      message
    )
  );
}

function isBudgetCircuitOpen(nowMs: number = Date.now()): boolean {
  return budgetCircuitOpenUntilMs > nowMs;
}

function openBudgetCircuit(reason: string, error: unknown): void {
  const nowMs = Date.now();
  budgetCircuitOpenUntilMs = nowMs + BUDGET_CIRCUIT_BREAKER_MS;

  if (lastBudgetCircuitReason === reason && isBudgetCircuitOpen(nowMs - 1)) {
    return;
  }

  lastBudgetCircuitReason = reason;
  console.warn(
    `[GroqAudioBudget] Disabling budget tracking for ${BUDGET_CIRCUIT_BREAKER_MS / 1000}s (${reason}).`,
    error
  );
}

function parsePositiveNumber(
  rawValue: string | undefined,
  fallback: number,
  {
    min = 0,
    max,
  }: { max?: number; min?: number } = {}
): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.max(min, parsed);
  if (typeof max === "number") {
    return Math.min(max, bounded);
  }

  return bounded;
}

export function getGroqAudioBudgetConfig(): GroqAudioBudgetConfig {
  return {
    dailyLimitSeconds: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_DAILY_LIMIT,
      DEFAULT_DAILY_LIMIT_SECONDS,
      { min: 60 }
    ),
    riskThresholdRatio: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_DAILY_RISK_THRESHOLD_RATIO,
      DEFAULT_RISK_THRESHOLD_RATIO,
      { min: 0.5, max: 1 }
    ),
    fixedSafetyBufferSeconds: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_DAILY_FIXED_BUFFER_SECONDS,
      DEFAULT_FIXED_BUFFER_SECONDS,
      { min: 0 }
    ),
    perActiveRecorderBufferSeconds: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_DAILY_BUFFER_PER_ACTIVE_RECORDER_SECONDS,
      DEFAULT_PER_ACTIVE_RECORDER_BUFFER_SECONDS,
      { min: 0 }
    ),
    rollingWindowHours: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_ROLLING_WINDOW_HOURS,
      DEFAULT_ROLLING_WINDOW_HOURS,
      { min: 1, max: 48 }
    ),
    bucketMinutes: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_BUCKET_MINUTES,
      DEFAULT_BUCKET_MINUTES,
      { min: 1, max: 60 }
    ),
    aspdCooldownMinutes: parsePositiveNumber(
      process.env.GROQ_ASPD_RATE_LIMIT_COOLDOWN_MINUTES,
      DEFAULT_ASPD_COOLDOWN_MINUTES,
      { min: 1, max: 1_440 }
    ),
  };
}

export function getGroqBilledAudioSeconds(durationSeconds?: number): number {
  if (!Number.isFinite(durationSeconds) || (durationSeconds ?? 0) <= 0) {
    return GROQ_MINIMUM_BILLED_AUDIO_SECONDS;
  }

  return Math.max(GROQ_MINIMUM_BILLED_AUDIO_SECONDS, Math.ceil(durationSeconds ?? 0));
}

function getBucketStartIso(
  nowMs: number,
  bucketMinutes: number
): string {
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketStartMs = Math.floor(nowMs / bucketMs) * bucketMs;
  return new Date(bucketStartMs).toISOString();
}

function createEmptyUsageSummary(): GroqAudioUsageSummary {
  return {
    rollingAudioSeconds: 0,
    cooldownUntil: null,
    lastRateLimitedAt: null,
    lastKnownAudioLimitSeconds: null,
    lastKnownAudioUsedSeconds: null,
  };
}

export function parseGroqAspdRateLimit(errorText: string): {
  limitSeconds?: number;
  usedSeconds?: number;
} {
  const matched = errorText.match(
    /Audio Seconds per Day \(ASPD\): Limit (\d+), Used (\d+)/i
  );

  if (!matched) {
    return {};
  }

  const limitSeconds = Number.parseInt(matched[1] ?? "", 10);
  const usedSeconds = Number.parseInt(matched[2] ?? "", 10);

  return {
    limitSeconds: Number.isFinite(limitSeconds) ? limitSeconds : undefined,
    usedSeconds: Number.isFinite(usedSeconds) ? usedSeconds : undefined,
  };
}

export async function loadGroqAudioUsageSummaries(
  sources: GroqApiKeySource[],
  nowMs: number = Date.now()
): Promise<Map<GroqApiKeySource, GroqAudioUsageSummary>> {
  const summaries = new Map<GroqApiKeySource, GroqAudioUsageSummary>();
  for (const source of GROQ_API_KEY_SOURCES) {
    if (sources.includes(source)) {
      summaries.set(source, createEmptyUsageSummary());
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || sources.length === 0 || isBudgetCircuitOpen(nowMs)) {
    return summaries;
  }

  const { rollingWindowHours } = getGroqAudioBudgetConfig();
  const windowStartIso = new Date(
    nowMs - rollingWindowHours * 60 * 60 * 1000
  ).toISOString();

  try {
    const supabase = createServiceRoleClient();
    const [{ data: bucketRows, error: bucketError }, { data: healthRows, error: healthError }] =
      await Promise.all([
        supabase
          .from("groq_audio_usage_buckets")
          .select("key_source,audio_seconds")
          .in("key_source", sources)
          .gte("window_start", windowStartIso),
        supabase
          .from("groq_key_health")
          .select(
            "key_source,aspd_cooldown_until,last_rate_limited_at,last_known_audio_limit_seconds,last_known_audio_used_seconds"
          )
          .in("key_source", sources),
      ]);

    if (bucketError) {
      if (isBudgetSchemaError(bucketError)) {
        openBudgetCircuit("load_usage_buckets_schema_error", bucketError);
      } else {
        console.error("[GroqAudioBudget] Failed to load usage buckets:", bucketError);
      }
      return summaries;
    }

    if (healthError) {
      if (isBudgetSchemaError(healthError)) {
        openBudgetCircuit("load_key_health_schema_error", healthError);
      } else {
        console.error("[GroqAudioBudget] Failed to load key health:", healthError);
      }
      return summaries;
    }

    for (const row of (bucketRows as GroqAudioUsageBucketRow[] | null) ?? []) {
      const current = summaries.get(row.key_source) ?? createEmptyUsageSummary();
      current.rollingAudioSeconds += row.audio_seconds ?? 0;
      summaries.set(row.key_source, current);
    }

    for (const row of (healthRows as GroqKeyHealthRow[] | null) ?? []) {
      const current = summaries.get(row.key_source) ?? createEmptyUsageSummary();
      current.cooldownUntil = row.aspd_cooldown_until;
      current.lastRateLimitedAt = row.last_rate_limited_at;
      current.lastKnownAudioLimitSeconds = row.last_known_audio_limit_seconds;
      current.lastKnownAudioUsedSeconds = row.last_known_audio_used_seconds;
      summaries.set(row.key_source, current);
    }
  } catch (error) {
    if (isBudgetSchemaError(error)) {
      openBudgetCircuit("load_usage_unexpected_schema_error", error);
    } else {
      console.error("[GroqAudioBudget] Unexpected error while loading usage summaries:", error);
    }
  }

  return summaries;
}

export async function recordGroqAudioUsage(
  source: GroqApiKeySource,
  audioSeconds: number,
  nowMs: number = Date.now()
): Promise<void> {
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    audioSeconds <= 0 ||
    isBudgetCircuitOpen(nowMs)
  ) {
    return;
  }

  const { bucketMinutes } = getGroqAudioBudgetConfig();
  const bucketStartIso = getBucketStartIso(nowMs, bucketMinutes);

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc("increment_groq_audio_usage", {
      p_audio_seconds: audioSeconds,
      p_key_source: source,
      p_request_count: 1,
      p_window_start: bucketStartIso,
    });

    if (error) {
      if (isBudgetSchemaError(error)) {
        openBudgetCircuit("record_audio_usage_schema_error", error);
      } else {
        console.error("[GroqAudioBudget] Failed to record audio usage:", error);
      }
    }
  } catch (error) {
    if (isBudgetSchemaError(error)) {
      openBudgetCircuit("record_audio_usage_unexpected_schema_error", error);
    } else {
      console.error("[GroqAudioBudget] Unexpected error while recording audio usage:", error);
    }
  }
}

export async function markGroqKeyAspdRateLimited(
  source: GroqApiKeySource,
  errorText: string,
  options: { nowMs?: number; retryAfterSeconds?: number } = {}
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || isBudgetCircuitOpen(options.nowMs)) {
    return;
  }

  const nowMs = options.nowMs ?? Date.now();
  const { aspdCooldownMinutes } = getGroqAudioBudgetConfig();
  const { limitSeconds, usedSeconds } = parseGroqAspdRateLimit(errorText);
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil(options.retryAfterSeconds ?? aspdCooldownMinutes * 60)
  );
  const cooldownUntilIso = new Date(nowMs + retryAfterSeconds * 1000).toISOString();

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc("upsert_groq_key_health", {
      p_aspd_cooldown_until: cooldownUntilIso,
      p_key_source: source,
      p_last_error_message: errorText,
      p_last_known_audio_limit_seconds: limitSeconds ?? null,
      p_last_known_audio_used_seconds: usedSeconds ?? null,
      p_last_rate_limited_at: new Date(nowMs).toISOString(),
    });

    if (error) {
      if (isBudgetSchemaError(error)) {
        openBudgetCircuit("mark_aspd_rate_limit_schema_error", error);
      } else {
        console.error("[GroqAudioBudget] Failed to mark ASPD rate limit:", error);
      }
    }
  } catch (error) {
    if (isBudgetSchemaError(error)) {
      openBudgetCircuit("mark_aspd_rate_limit_unexpected_schema_error", error);
    } else {
      console.error("[GroqAudioBudget] Unexpected error while marking ASPD limit:", error);
    }
  }
}
