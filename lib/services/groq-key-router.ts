import { getStaleRecordingCutoffIso } from "@/lib/recording-lifecycle";
import {
  getGroqAudioBudgetConfig,
  loadGroqAudioUsageSummaries,
} from "@/lib/services/groq-audio-budget";
import {
  GROQ_API_KEY_SOURCES,
  type GroqApiKeySource,
} from "@/lib/services/groq-key-types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface GroqKeySelection {
  activeRecorderUsers: number;
  apiKey: string;
  aspdCooldownUntil: string | null;
  dailyAudioRiskThresholdSeconds: number;
  projectedAudioSecondsLast24h: number;
  recordedAudioSecondsLast24h: number;
  routingReason: "active_user_threshold" | "aspd_risk" | "cooldown_fallback";
  source: GroqApiKeySource;
}

interface GroqConfiguredKey {
  apiKey: string;
  source: GroqApiKeySource;
}

interface GroqCandidate extends GroqConfiguredKey {
  aspdCooldownUntil: string | null;
  isWithinAspdRiskBudget: boolean;
  projectedAudioSecondsLast24h: number;
  recordedAudioSecondsLast24h: number;
  riskHeadroomSeconds: number;
}

const TIER_2_THRESHOLD = 3;
const TIER_3_THRESHOLD = 5;

function getPrimaryGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY not configured");
  }
  return key;
}

function getConfiguredGroqKeys(): GroqConfiguredKey[] {
  const primaryKey = getPrimaryGroqApiKey();
  const tier2Key = process.env.GROQ_API_KEY_TIER_2;
  const tier3Key = process.env.GROQ_API_KEY_TIER_3;

  return [
    { apiKey: primaryKey, source: "primary" },
    ...(tier2Key ? [{ apiKey: tier2Key, source: "tier_2" as const }] : []),
    ...(tier3Key ? [{ apiKey: tier3Key, source: "tier_3" as const }] : []),
  ];
}

function getSourcePriority(activeRecorderUsers: number): GroqApiKeySource[] {
  if (activeRecorderUsers >= TIER_3_THRESHOLD) {
    return ["tier_3", "tier_2", "primary"];
  }

  if (activeRecorderUsers >= TIER_2_THRESHOLD) {
    return ["tier_2", "primary", "tier_3"];
  }

  return ["primary", "tier_2", "tier_3"];
}

export function selectGroqApiKeyByActiveUsers(activeRecorderUsers: number): GroqConfiguredKey {
  const configuredKeyMap = new Map(
    getConfiguredGroqKeys().map((configuredKey) => [configuredKey.source, configuredKey])
  );
  const preferredSources = getSourcePriority(activeRecorderUsers);
  const selectedSource =
    preferredSources.find((source) => configuredKeyMap.has(source)) ?? "primary";

  return configuredKeyMap.get(selectedSource) ?? {
    apiKey: getPrimaryGroqApiKey(),
    source: "primary",
  };
}

async function buildOrderedCandidates(
  configuredKeys: GroqConfiguredKey[],
  activeRecorderUsers: number,
  estimatedAudioSeconds: number,
  nowMs: number
): Promise<GroqCandidate[]> {
  const configuredKeyMap = new Map(
    configuredKeys.map((configuredKey) => [configuredKey.source, configuredKey])
  );
  const orderedSources = getSourcePriority(activeRecorderUsers).filter((source) =>
    configuredKeyMap.has(source)
  );
  const fallbackSources = GROQ_API_KEY_SOURCES.filter(
    (source) => configuredKeyMap.has(source) && !orderedSources.includes(source)
  );
  const candidateSources = [...orderedSources, ...fallbackSources];
  const usageSummaries = await loadGroqAudioUsageSummaries(candidateSources, nowMs);
  const {
    dailyLimitSeconds,
    fixedSafetyBufferSeconds,
    perActiveRecorderBufferSeconds,
    riskThresholdRatio,
  } = getGroqAudioBudgetConfig();
  const riskThresholdSeconds = Math.floor(dailyLimitSeconds * riskThresholdRatio);
  const dynamicBufferSeconds =
    fixedSafetyBufferSeconds + activeRecorderUsers * perActiveRecorderBufferSeconds;

  return candidateSources.flatMap((source) => {
    const configuredKey = configuredKeyMap.get(source);
    if (!configuredKey) {
      return [];
    }

    const usage = usageSummaries.get(source);
    const recordedAudioSecondsLast24h = usage?.rollingAudioSeconds ?? 0;
    const projectedAudioSecondsLast24h =
      recordedAudioSecondsLast24h + estimatedAudioSeconds + dynamicBufferSeconds;
    const aspdCooldownUntil =
      usage?.cooldownUntil && new Date(usage.cooldownUntil).getTime() > nowMs
        ? usage.cooldownUntil
        : null;

    return [{
      ...configuredKey,
      aspdCooldownUntil,
      recordedAudioSecondsLast24h,
      projectedAudioSecondsLast24h,
      riskHeadroomSeconds: riskThresholdSeconds - projectedAudioSecondsLast24h,
      isWithinAspdRiskBudget: projectedAudioSecondsLast24h <= riskThresholdSeconds,
    }];
  });
}

export async function countActiveRecordingUsers(): Promise<number> {
  // Fallback: if service role key is unavailable, avoid blocking transcription.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 1;
  }

  try {
    const supabaseAdmin = createServiceRoleClient();
    const staleCutoffIso = getStaleRecordingCutoffIso();
    const { count, error } = await supabaseAdmin
      .from("recordings")
      .select("id", { head: true, count: "exact" })
      .eq("status", "recording")
      .is("session_paused_at", null)
      .gte("last_activity_at", staleCutoffIso);

    if (error) {
      console.error("[GroqKeyRouter] Failed to count active recordings:", error);
      return 1;
    }

    return Math.max(1, count ?? 0);
  } catch (error) {
    console.error("[GroqKeyRouter] Unexpected error while counting active recordings:", error);
    return 1;
  }
}

export async function resolveGroqKeySelection(
  options: { estimatedAudioSeconds?: number; nowMs?: number } = {}
): Promise<GroqKeySelection> {
  const nowMs = options.nowMs ?? Date.now();
  const { dailyLimitSeconds, riskThresholdRatio } = getGroqAudioBudgetConfig();
  const dailyAudioRiskThresholdSeconds = Math.floor(dailyLimitSeconds * riskThresholdRatio);
  const activeRecorderUsers = await countActiveRecordingUsers();
  const estimatedAudioSeconds = Math.max(0, Math.ceil(options.estimatedAudioSeconds ?? 0));
  const configuredKeys = getConfiguredGroqKeys();
  const fallbackSelection = selectGroqApiKeyByActiveUsers(activeRecorderUsers);
  const candidates = await buildOrderedCandidates(
    configuredKeys,
    activeRecorderUsers,
    estimatedAudioSeconds,
    nowMs
  );
  const safeCandidate = candidates.find(
    (candidate) => !candidate.aspdCooldownUntil && candidate.isWithinAspdRiskBudget
  );
  const bestAvailableCandidate = candidates
    .filter((candidate) => !candidate.aspdCooldownUntil)
    .sort((a, b) => b.riskHeadroomSeconds - a.riskHeadroomSeconds)[0];
  const leastBlockedCandidate = candidates
    .slice()
    .sort((a, b) => {
      const aCooldown = a.aspdCooldownUntil ? new Date(a.aspdCooldownUntil).getTime() : 0;
      const bCooldown = b.aspdCooldownUntil ? new Date(b.aspdCooldownUntil).getTime() : 0;
      if (aCooldown !== bCooldown) {
        return aCooldown - bCooldown;
      }
      return b.riskHeadroomSeconds - a.riskHeadroomSeconds;
    })[0];
  const selected = safeCandidate ?? bestAvailableCandidate ?? leastBlockedCandidate;

  if (!selected) {
    return {
      activeRecorderUsers,
      apiKey: fallbackSelection.apiKey,
      aspdCooldownUntil: null,
      dailyAudioRiskThresholdSeconds,
      projectedAudioSecondsLast24h: estimatedAudioSeconds,
      recordedAudioSecondsLast24h: 0,
      routingReason: "active_user_threshold",
      source: fallbackSelection.source,
    };
  }

  const routingReason: GroqKeySelection["routingReason"] =
    selected.source === fallbackSelection.source && !selected.aspdCooldownUntil
      ? "active_user_threshold"
      : selected.isWithinAspdRiskBudget && !selected.aspdCooldownUntil
        ? "aspd_risk"
        : "cooldown_fallback";

  return {
    activeRecorderUsers,
    apiKey: selected.apiKey,
    aspdCooldownUntil: selected.aspdCooldownUntil,
    dailyAudioRiskThresholdSeconds,
    projectedAudioSecondsLast24h: selected.projectedAudioSecondsLast24h,
    recordedAudioSecondsLast24h: selected.recordedAudioSecondsLast24h,
    routingReason,
    source: selected.source,
  };
}
