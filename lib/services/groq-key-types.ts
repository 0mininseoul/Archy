export const GROQ_API_KEY_SOURCES = ["primary", "tier_2", "tier_3"] as const;

export type GroqApiKeySource = (typeof GROQ_API_KEY_SOURCES)[number];
