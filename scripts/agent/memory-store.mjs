import { createClient } from "@supabase/supabase-js";

let memoryDisabledReason = null;

function getEnv(name, { optional = false, fallback = undefined } = {}) {
  const value = process.env[name] ?? fallback;
  if (!optional && (value === undefined || value === null || value === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isMemoryEnabled() {
  const value = String(process.env.ARCHY_MEMORY_ENABLED || "true").toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

function getSupabaseAdminClient() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isNoRowsError(error) {
  if (!error) return false;
  return String(error.code) === "PGRST116";
}

function isMissingRelationError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return message.includes("does not exist") && message.includes("agent_memory_");
}

function disableMemoryIfMissingTable(error) {
  if (isMissingRelationError(error)) {
    memoryDisabledReason = String(error.message || "missing memory tables");
    console.warn(`[memory] disabled because memory tables are missing: ${memoryDisabledReason}`);
    return true;
  }
  return false;
}

async function getOrCreateThread({ guildId, channelId, userId }) {
  if (!isMemoryEnabled()) return null;
  if (memoryDisabledReason) return null;

  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_memory_threads")
    .upsert(
      {
        guild_id: guildId,
        channel_id: channelId,
        user_id: userId,
        updated_at: nowIso,
      },
      {
        onConflict: "guild_id,channel_id,user_id",
        ignoreDuplicates: false,
      }
    )
    .select("id,latest_summary,summary_updated_at")
    .single();

  if (error) {
    if (disableMemoryIfMissingTable(error)) return null;
    throw error;
  }

  return data;
}

export async function getConversationMemory({ guildId, channelId, userId, recentLimit = 12 }) {
  if (!isMemoryEnabled()) {
    return {
      enabled: false,
      threadId: null,
      summary: null,
      summaryUpdatedAt: null,
      facts: [],
      recentTurns: [],
    };
  }
  if (memoryDisabledReason) {
    return {
      enabled: false,
      threadId: null,
      summary: null,
      summaryUpdatedAt: null,
      facts: [],
      recentTurns: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const thread = await getOrCreateThread({ guildId, channelId, userId });
  if (!thread) {
    return {
      enabled: false,
      threadId: null,
      summary: null,
      summaryUpdatedAt: null,
      facts: [],
      recentTurns: [],
    };
  }

  const [messagesRes, factsRes] = await Promise.all([
    supabase
      .from("agent_memory_messages")
      .select("role,content,created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(recentLimit),
    supabase
      .from("agent_memory_facts")
      .select("fact_key,fact_value,fact_type,confidence,updated_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  if (messagesRes.error) {
    if (disableMemoryIfMissingTable(messagesRes.error)) {
      return {
        enabled: false,
        threadId: null,
        summary: null,
        summaryUpdatedAt: null,
        facts: [],
        recentTurns: [],
      };
    }
    throw messagesRes.error;
  }

  if (factsRes.error) {
    if (disableMemoryIfMissingTable(factsRes.error)) {
      return {
        enabled: false,
        threadId: null,
        summary: null,
        summaryUpdatedAt: null,
        facts: [],
        recentTurns: [],
      };
    }
    throw factsRes.error;
  }

  const recentTurns = [...(messagesRes.data || [])].reverse();

  return {
    enabled: true,
    threadId: thread.id,
    summary: thread.latest_summary || null,
    summaryUpdatedAt: thread.summary_updated_at || null,
    facts: factsRes.data || [],
    recentTurns,
  };
}

export async function saveConversationTurn({
  guildId,
  channelId,
  userId,
  userMessage,
  assistantMessage,
  model,
}) {
  if (!isMemoryEnabled() || memoryDisabledReason) return;

  const supabase = getSupabaseAdminClient();
  const thread = await getOrCreateThread({ guildId, channelId, userId });
  if (!thread) return;

  const nowIso = new Date().toISOString();
  const payload = [
    {
      thread_id: thread.id,
      guild_id: guildId,
      channel_id: channelId,
      user_id: userId,
      role: "user",
      content: userMessage,
      metadata: { source: "discord_message" },
      created_at: nowIso,
    },
    {
      thread_id: thread.id,
      guild_id: guildId,
      channel_id: channelId,
      user_id: userId,
      role: "assistant",
      content: assistantMessage,
      metadata: { source: "discord_reply", model: model || null },
      created_at: nowIso,
    },
  ];

  const { error: insertError } = await supabase.from("agent_memory_messages").insert(payload);
  if (insertError) {
    if (disableMemoryIfMissingTable(insertError)) return;
    throw insertError;
  }

  const { error: updateError } = await supabase
    .from("agent_memory_threads")
    .update({ updated_at: nowIso })
    .eq("id", thread.id);

  if (updateError) {
    if (disableMemoryIfMissingTable(updateError)) return;
    throw updateError;
  }
}

export async function getConversationForSummary({
  guildId,
  channelId,
  userId,
  limit = 60,
}) {
  if (!isMemoryEnabled() || memoryDisabledReason) {
    return {
      enabled: false,
      threadId: null,
      summary: null,
      summaryUpdatedAt: null,
      messages: [],
    };
  }

  const thread = await getOrCreateThread({ guildId, channelId, userId });
  if (!thread) {
    return {
      enabled: false,
      threadId: null,
      summary: null,
      summaryUpdatedAt: null,
      messages: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_memory_messages")
    .select("role,content,created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (disableMemoryIfMissingTable(error)) {
      return {
        enabled: false,
        threadId: null,
        summary: null,
        summaryUpdatedAt: null,
        messages: [],
      };
    }
    throw error;
  }

  return {
    enabled: true,
    threadId: thread.id,
    summary: thread.latest_summary || null,
    summaryUpdatedAt: thread.summary_updated_at || null,
    messages: [...(data || [])].reverse(),
  };
}

export async function saveConversationSummary({ threadId, summary, sourceModel }) {
  if (!isMemoryEnabled() || memoryDisabledReason) return;
  if (!threadId) return;

  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("agent_memory_threads")
    .update({
      latest_summary: summary,
      summary_updated_at: nowIso,
      summary_source_model: sourceModel || null,
      updated_at: nowIso,
    })
    .eq("id", threadId);

  if (error) {
    if (disableMemoryIfMissingTable(error)) return;
    throw error;
  }
}

export async function upsertMemoryFacts({ guildId, userId, facts }) {
  if (!isMemoryEnabled() || memoryDisabledReason) return;
  if (!Array.isArray(facts) || facts.length === 0) return;

  const nowIso = new Date().toISOString();
  const rows = facts
    .map((fact) => {
      const key = String(fact?.key || "").trim();
      const value = String(fact?.value || "").trim();
      if (!key || !value) return null;
      const type = String(fact?.type || "general").trim() || "general";
      const confidenceNumber = Number(fact?.confidence);
      const confidence = Number.isFinite(confidenceNumber)
        ? Math.max(0, Math.min(1, confidenceNumber))
        : 0.7;
      return {
        guild_id: guildId,
        user_id: userId,
        fact_key: key,
        fact_value: value,
        fact_type: type,
        confidence,
        source: "conversation_summary",
        updated_at: nowIso,
        created_at: nowIso,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("agent_memory_facts").upsert(rows, {
    onConflict: "guild_id,user_id,fact_key",
    ignoreDuplicates: false,
  });

  if (error) {
    if (disableMemoryIfMissingTable(error)) return;
    throw error;
  }
}

export async function getConversationMessageCount({ guildId, channelId, userId }) {
  if (!isMemoryEnabled() || memoryDisabledReason) return 0;

  const thread = await getOrCreateThread({ guildId, channelId, userId });
  if (!thread) return 0;

  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("agent_memory_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", thread.id);

  if (error) {
    if (disableMemoryIfMissingTable(error)) return 0;
    if (isNoRowsError(error)) return 0;
    throw error;
  }

  return count || 0;
}
