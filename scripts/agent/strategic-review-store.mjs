import { createClient } from "@supabase/supabase-js";

let storageDisabledReason = null;

function getEnv(name, { optional = false, fallback = undefined } = {}) {
  const value = process.env[name] ?? fallback;
  if (!optional && (value === undefined || value === null || value === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isEnabled(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}

function getSupabaseAdminClient() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isMissingRelationError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    message.includes("does not exist") &&
    (message.includes("strategic_review_") || message.includes("agent_llm_logs"))
  );
}

function disableStorageIfMissingTable(error) {
  if (isMissingRelationError(error)) {
    storageDisabledReason = String(error.message || "missing strategic review tables");
    console.warn(
      `[strategic-review-store] disabled because required tables are missing: ${storageDisabledReason}`
    );
    return true;
  }
  return false;
}

function canUseStore() {
  if (storageDisabledReason) return false;
  return true;
}

function getMaxTextChars() {
  const parsed = Number(process.env.GEMINI_LOGGING_MAX_TEXT_CHARS || 120000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120000;
  return Math.floor(parsed);
}

function clipText(value, maxChars = getMaxTextChars()) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...(clipped)`;
}

function redactText(text) {
  let next = String(text || "");
  next = next.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
  next = next.replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_GOOGLE_KEY]");
  next = next.replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]");
  next = next.replace(
    /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]"
  );
  next = next.replace(
    /((?:api|access|refresh|service|bot|bearer|secret)[_-]?(?:key|token|secret)?["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
    "$1[REDACTED]"
  );
  return next;
}

function sanitizeForStorage(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const clipped = clipText(value);
    return isEnabled("GEMINI_LOGGING_REDACTION_ENABLED", true) ? redactText(clipped) : clipped;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForStorage(item));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (key === "thoughtSignature") continue;
      out[key] = sanitizeForStorage(item);
    }
    return out;
  }
  return value;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toYmd(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function toJsonArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

export function isGeminiLoggingEnabled() {
  return isEnabled("GEMINI_LOGGING_ENABLED", true);
}

export async function logGeminiApiCall(entry = {}) {
  if (!isGeminiLoggingEnabled() || !canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    provider: "gemini",
    component: entry.component || "ops-agent",
    flow: entry.flow || "general",
    tag: entry.tag || null,
    run_id: entry.runId || null,
    model: entry.model || null,
    status: entry.status || "success",
    system_instruction: sanitizeForStorage(entry.systemInstruction || null),
    request_json: sanitizeForStorage(entry.requestJson || {}),
    response_json: sanitizeForStorage(entry.responseJson || null),
    finish_reason: entry.finishReason || null,
    usage_metadata: sanitizeForStorage(entry.usageMetadata || null),
    error_message: sanitizeForStorage(entry.errorMessage || null),
    latency_ms: Number.isFinite(entry.latencyMs) ? Math.floor(entry.latencyMs) : null,
    metadata: sanitizeForStorage(entry.metadata || {}),
  };

  const { data, error } = await supabase.from("agent_llm_logs").insert(payload).select("id").single();
  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }
  return data || null;
}

export async function getActiveStrategicReviewPromptVersion() {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_prompt_versions")
    .select(
      "id,version_label,status,change_summary,problem_summary,system_instruction_suffix,prompt_instruction_suffix,metadata,created_at,updated_at"
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function createStrategicReviewRun(entry = {}) {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    run_id: entry.runId,
    run_ymd: toYmd(entry.runYmd) || toYmd(new Date()),
    target_ymd: toYmd(entry.targetYmd) || toYmd(new Date()),
    status: entry.status || "started",
    prompt_version_id: entry.promptVersionId || null,
    prompt_version_label: entry.promptVersionLabel || null,
    model: entry.model || null,
    context_profile: entry.contextProfile || null,
    system_instruction: sanitizeForStorage(entry.systemInstruction || null),
    user_prompt: sanitizeForStorage(entry.userPrompt || null),
    input_payload: sanitizeForStorage(entry.inputPayload || {}),
    raw_output: sanitizeForStorage(entry.rawOutput || null),
    rendered_output: sanitizeForStorage(entry.renderedOutput || null),
    usage_metadata: sanitizeForStorage(entry.usageMetadata || null),
    finish_reason: entry.finishReason || null,
    error_code: entry.errorCode || null,
    error_message: sanitizeForStorage(entry.errorMessage || null),
    feedback_window_end_at: toIsoDate(entry.feedbackWindowEndAt),
    metadata: sanitizeForStorage(entry.metadata || {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("strategic_review_runs")
    .upsert(payload, {
      onConflict: "run_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function updateStrategicReviewRun(runId, patch = {}) {
  if (!canUseStore()) return null;
  if (!runId) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) payload.status = patch.status;
  if (patch.promptVersionId !== undefined) payload.prompt_version_id = patch.promptVersionId;
  if (patch.promptVersionLabel !== undefined) payload.prompt_version_label = patch.promptVersionLabel;
  if (patch.model !== undefined) payload.model = patch.model;
  if (patch.contextProfile !== undefined) payload.context_profile = patch.contextProfile;
  if (patch.systemInstruction !== undefined) {
    payload.system_instruction = sanitizeForStorage(patch.systemInstruction);
  }
  if (patch.userPrompt !== undefined) payload.user_prompt = sanitizeForStorage(patch.userPrompt);
  if (patch.inputPayload !== undefined) payload.input_payload = sanitizeForStorage(patch.inputPayload);
  if (patch.rawOutput !== undefined) payload.raw_output = sanitizeForStorage(patch.rawOutput);
  if (patch.renderedOutput !== undefined) {
    payload.rendered_output = sanitizeForStorage(patch.renderedOutput);
  }
  if (patch.usageMetadata !== undefined) {
    payload.usage_metadata = sanitizeForStorage(patch.usageMetadata);
  }
  if (patch.finishReason !== undefined) payload.finish_reason = patch.finishReason;
  if (patch.errorCode !== undefined) payload.error_code = patch.errorCode;
  if (patch.errorMessage !== undefined) payload.error_message = sanitizeForStorage(patch.errorMessage);
  if (patch.discordChannelId !== undefined) payload.discord_channel_id = patch.discordChannelId;
  if (patch.discordMessageId !== undefined) payload.discord_message_id = patch.discordMessageId;
  if (patch.discordMessageIds !== undefined) {
    payload.discord_message_ids = sanitizeForStorage(patch.discordMessageIds);
  }
  if (patch.feedbackWindowEndAt !== undefined) {
    payload.feedback_window_end_at = toIsoDate(patch.feedbackWindowEndAt);
  }
  if (patch.metadata !== undefined) payload.metadata = sanitizeForStorage(patch.metadata);

  const { data, error } = await supabase
    .from("strategic_review_runs")
    .update(payload)
    .eq("run_id", runId)
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function attachStrategicReviewDiscordMessages({
  runId,
  channelId,
  primaryMessageId,
  messageIds = [],
} = {}) {
  if (!canUseStore() || !runId) return null;
  return updateStrategicReviewRun(runId, {
    discordChannelId: channelId,
    discordMessageId: primaryMessageId,
    discordMessageIds: messageIds,
  });
}

export async function getLatestCompletedStrategicReviewRun({ withinHours = 23 } = {}) {
  if (!canUseStore()) return null;

  const since = new Date(Date.now() - Math.max(1, withinHours) * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_runs")
    .select("*")
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function getStrategicReviewRunByPrimaryMessageId(messageId) {
  if (!canUseStore() || !messageId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_runs")
    .select("*")
    .eq("discord_message_id", messageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function saveStrategicReviewFeedback(entry = {}) {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    review_run_id: entry.reviewRunId,
    guild_id: entry.guildId,
    channel_id: entry.channelId,
    user_id: entry.userId,
    source_message_id: entry.sourceMessageId || null,
    feedback_text: sanitizeForStorage(entry.feedbackText || ""),
    sentiment: entry.sentiment || null,
    feedback_summary: sanitizeForStorage(entry.feedbackSummary || null),
    classification: sanitizeForStorage(entry.classification || {}),
  };

  const { data, error } = await supabase
    .from("strategic_review_feedback")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (String(error.code) === "23505") {
      return null;
    }
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function listStrategicReviewFeedback(reviewRunId) {
  if (!canUseStore() || !reviewRunId) return [];

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_feedback")
    .select("*")
    .eq("review_run_id", reviewRunId)
    .order("created_at", { ascending: true });

  if (error) {
    if (disableStorageIfMissingTable(error)) return [];
    throw error;
  }

  return data || [];
}

export async function saveStrategicReviewEvaluation(entry = {}) {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    review_run_id: entry.reviewRunId,
    evaluator_model: entry.evaluatorModel,
    hard_gate_passed: Boolean(entry.hardGatePassed),
    total_score: Number.isFinite(entry.totalScore) ? Math.round(entry.totalScore) : null,
    rubric_scores: sanitizeForStorage(entry.rubricScores || {}),
    hard_gate_failures: sanitizeForStorage(entry.hardGateFailures || []),
    summary: sanitizeForStorage(entry.summary || null),
    highest_priority_gap: sanitizeForStorage(entry.highestPriorityGap || null),
    improvement_needed: Boolean(entry.improvementNeeded),
    based_on_feedback: Boolean(entry.basedOnFeedback),
    raw_output: sanitizeForStorage(entry.rawOutput || {}),
  };

  const { data, error } = await supabase
    .from("strategic_review_evaluations")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function getOpenStrategicReviewProposal() {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .select("*")
    .in("status", ["pending", "held"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function createStrategicReviewProposal(entry = {}) {
  if (!canUseStore()) return null;

  const supabase = getSupabaseAdminClient();
  const payload = {
    review_run_id: entry.reviewRunId || null,
    evaluation_id: entry.evaluationId || null,
    status: entry.status || "pending",
    title: sanitizeForStorage(entry.title || "전략 리뷰 프롬프트 개선 제안"),
    problem_summary: sanitizeForStorage(entry.problemSummary || ""),
    as_is: sanitizeForStorage(entry.asIs || ""),
    to_be: sanitizeForStorage(entry.toBe || ""),
    expected_effect: sanitizeForStorage(entry.expectedEffect || ""),
    evidence: sanitizeForStorage(entry.evidence || []),
    proposed_system_instruction_suffix: sanitizeForStorage(
      entry.proposedSystemInstructionSuffix || ""
    ),
    proposed_prompt_instruction_suffix: sanitizeForStorage(
      entry.proposedPromptInstructionSuffix || ""
    ),
    evaluation_score: Number.isFinite(entry.evaluationScore)
      ? Math.round(entry.evaluationScore)
      : null,
    metadata: sanitizeForStorage(entry.metadata || {}),
  };

  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function markStrategicReviewProposalMessage({
  proposalId,
  channelId,
  messageId,
} = {}) {
  if (!canUseStore() || !proposalId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .update({
      discord_channel_id: channelId || null,
      discord_message_id: messageId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function getStrategicReviewProposalById(proposalId) {
  if (!canUseStore() || !proposalId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function updateStrategicReviewProposalStatus({
  proposalId,
  status,
  approvedByUserId = null,
  decisionReason = null,
  createdPromptVersionId = null,
} = {}) {
  if (!canUseStore() || !proposalId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .update({
      status,
      approved_by_user_id: approvedByUserId,
      decision_reason: sanitizeForStorage(decisionReason || null),
      created_prompt_version_id: createdPromptVersionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .select("*")
    .single();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function applyStrategicReviewProposal({
  proposalId,
  approvedByUserId,
  decisionReason = null,
} = {}) {
  if (!canUseStore() || !proposalId) return null;

  const proposal = await getStrategicReviewProposalById(proposalId);
  if (!proposal) return null;
  if (!["pending", "held"].includes(proposal.status)) return proposal;

  const supabase = getSupabaseAdminClient();
  const { error: archiveError } = await supabase
    .from("strategic_review_prompt_versions")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active");

  if (archiveError) {
    if (disableStorageIfMissingTable(archiveError)) return null;
    throw archiveError;
  }

  const versionLabel = `v${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_p${proposal.id}`;
  const insertPayload = {
    version_label: versionLabel,
    status: "active",
    change_summary: sanitizeForStorage(proposal.problem_summary || ""),
    problem_summary: sanitizeForStorage(proposal.problem_summary || ""),
    system_instruction_suffix: sanitizeForStorage(
      proposal.proposed_system_instruction_suffix || ""
    ),
    prompt_instruction_suffix: sanitizeForStorage(
      proposal.proposed_prompt_instruction_suffix || ""
    ),
    approved_by_user_id: approvedByUserId || null,
    metadata: sanitizeForStorage({
      sourceProposalId: proposal.id,
      evaluationScore: proposal.evaluation_score,
    }),
  };

  const { data: version, error: versionError } = await supabase
    .from("strategic_review_prompt_versions")
    .insert(insertPayload)
    .select("*")
    .single();

  if (versionError) {
    if (disableStorageIfMissingTable(versionError)) return null;
    throw versionError;
  }

  await updateStrategicReviewProposalStatus({
    proposalId,
    status: "applied",
    approvedByUserId,
    decisionReason,
    createdPromptVersionId: version?.id || null,
  });

  return version || null;
}

export async function findProposalByDiscordMessageId(messageId) {
  if (!canUseStore() || !messageId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_improvement_proposals")
    .select("*")
    .eq("discord_message_id", messageId)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function getStrategicReviewRunById(reviewRunId) {
  if (!canUseStore() || !reviewRunId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_runs")
    .select("*")
    .eq("id", reviewRunId)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export async function listRecentStrategicReviewRuns({ withinHours = 30, limit = 5 } = {}) {
  if (!canUseStore()) return [];

  const since = new Date(Date.now() - Math.max(1, withinHours) * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_runs")
    .select("*")
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (disableStorageIfMissingTable(error)) return [];
    throw error;
  }

  return data || [];
}

export async function getLatestStrategicReviewEvaluation(reviewRunId) {
  if (!canUseStore() || !reviewRunId) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("strategic_review_evaluations")
    .select("*")
    .eq("review_run_id", reviewRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (disableStorageIfMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

export function strategicReviewStoreInternals() {
  return {
    sanitizeForStorage,
    redactText,
    clipText,
    toJsonArray,
  };
}
