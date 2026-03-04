import { createServiceRoleClient } from "@/lib/supabase/server";

export type GroqApiKeySource = "primary" | "tier_2" | "tier_3";

export interface GroqKeySelection {
  apiKey: string;
  source: GroqApiKeySource;
  activeRecorderUsers: number;
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

export function selectGroqApiKeyByActiveUsers(activeRecorderUsers: number): {
  apiKey: string;
  source: GroqApiKeySource;
} {
  const primaryKey = getPrimaryGroqApiKey();
  const tier2Key = process.env.GROQ_API_KEY_TIER_2;
  const tier3Key = process.env.GROQ_API_KEY_TIER_3;

  if (activeRecorderUsers >= TIER_3_THRESHOLD) {
    if (tier3Key) {
      return { apiKey: tier3Key, source: "tier_3" };
    }
    if (tier2Key) {
      return { apiKey: tier2Key, source: "tier_2" };
    }
    return { apiKey: primaryKey, source: "primary" };
  }

  if (activeRecorderUsers >= TIER_2_THRESHOLD) {
    if (tier2Key) {
      return { apiKey: tier2Key, source: "tier_2" };
    }
    return { apiKey: primaryKey, source: "primary" };
  }

  return { apiKey: primaryKey, source: "primary" };
}

export async function countActiveRecordingUsers(): Promise<number> {
  // Fallback: if service role key is unavailable, avoid blocking transcription.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 1;
  }

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { count, error } = await supabaseAdmin
      .from("recordings")
      .select("id", { head: true, count: "exact" })
      .eq("status", "recording")
      .is("session_paused_at", null);

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

export async function resolveGroqKeySelection(): Promise<GroqKeySelection> {
  const activeRecorderUsers = await countActiveRecordingUsers();
  const selected = selectGroqApiKeyByActiveUsers(activeRecorderUsers);

  return {
    apiKey: selected.apiKey,
    source: selected.source,
    activeRecorderUsers,
  };
}
