import { withAuth, successResponse, errorResponse } from "@/lib/api";
import {
  getNotionSaveTargets,
  NotionSaveTargetsResult,
} from "@/lib/services/notion";

export const runtime = "edge";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const DEFAULT_FAST_LIMIT = 15;
const MAX_LIMIT = 100;

type SaveTargetMode = "fast" | "deep";

interface SaveTargetsCacheEntry {
  data?: NotionSaveTargetsResult;
  expiresAt: number;
  lastAccessedAt: number;
  inFlight?: Promise<NotionSaveTargetsResult>;
}

declare global {
  var __archyNotionSaveTargetsCache:
    | Map<string, SaveTargetsCacheEntry>
    | undefined;
}

interface SaveTargetsResponseData extends NotionSaveTargetsResult {
  meta: NotionSaveTargetsResult["meta"] & {
    fromCache: boolean;
  };
}

function getServerCache(): Map<string, SaveTargetsCacheEntry> {
  if (!globalThis.__archyNotionSaveTargetsCache) {
    globalThis.__archyNotionSaveTargetsCache = new Map();
  }
  return globalThis.__archyNotionSaveTargetsCache;
}

function cleanupServerCache(cache: Map<string, SaveTargetsCacheEntry>) {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (!entry.inFlight && entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  const sortedEntries = Array.from(cache.entries()).sort(
    (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
  );
  const removeCount = cache.size - CACHE_MAX_ENTRIES;

  for (let i = 0; i < removeCount; i++) {
    cache.delete(sortedEntries[i][0]);
  }
}

function parseMode(value: string | null): SaveTargetMode {
  return value === "deep" ? "deep" : "fast";
}

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

async function getCachedOrFetch(
  cacheKey: string,
  loader: () => Promise<NotionSaveTargetsResult>
): Promise<{ data: NotionSaveTargetsResult; fromCache: boolean }> {
  const cache = getServerCache();
  cleanupServerCache(cache);

  const now = Date.now();
  const existing = cache.get(cacheKey);

  if (existing?.data && existing.expiresAt > now) {
    existing.lastAccessedAt = now;
    return { data: existing.data, fromCache: true };
  }

  if (existing?.inFlight) {
    const inFlightData = await existing.inFlight;
    existing.lastAccessedAt = Date.now();
    return { data: inFlightData, fromCache: true };
  }

  const entry: SaveTargetsCacheEntry = existing ?? {
    expiresAt: 0,
    lastAccessedAt: now,
  };

  entry.inFlight = loader()
    .then((data) => {
      entry.data = data;
      entry.expiresAt = Date.now() + CACHE_TTL_MS;
      entry.lastAccessedAt = Date.now();
      return data;
    })
    .finally(() => {
      const current = cache.get(cacheKey);
      if (current) {
        current.inFlight = undefined;
      }
      cleanupServerCache(cache);
    });

  cache.set(cacheKey, entry);

  try {
    const freshData = await entry.inFlight;
    return { data: freshData, fromCache: false };
  } catch (error) {
    if (entry.data) {
      return { data: entry.data, fromCache: true };
    }
    throw error;
  }
}

// GET /api/notion/save-targets - List save targets with fast/deep mode
export const GET = withAuth<SaveTargetsResponseData>(
  async ({ user, supabase, request }) => {
    const { data: userData } = await supabase
      .from("users")
      .select("notion_access_token")
      .eq("id", user.id)
      .single();

    if (!userData?.notion_access_token) {
      return errorResponse("Notion not connected", 400);
    }

    const mode = parseMode(request?.nextUrl.searchParams.get("mode") || null);
    const limit = parseLimit(
      request?.nextUrl.searchParams.get("limit") || null,
      DEFAULT_FAST_LIMIT
    );

    const cacheKey =
      mode === "fast"
        ? `${user.id}:notion-save-targets:fast:${limit}`
        : `${user.id}:notion-save-targets:deep`;

    const { data, fromCache } = await getCachedOrFetch(cacheKey, () =>
      getNotionSaveTargets(userData.notion_access_token, {
        mode,
        limit,
      })
    );

    return successResponse({
      ...data,
      meta: {
        ...data.meta,
        fromCache,
      },
    });
  }
);
