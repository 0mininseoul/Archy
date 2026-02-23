import { withAuth, successResponse, errorResponse } from "@/lib/api";
import {
  NotionSaveTargetsResult,
  NotionSearchResultsPayload,
  searchNotionSaveTargets,
} from "@/lib/services/notion-save-targets";

export const runtime = "edge";

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 300;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

interface SearchCacheEntry {
  data?: NotionSearchResultsPayload;
  expiresAt: number;
  lastAccessedAt: number;
  inFlight?: Promise<NotionSearchResultsPayload>;
}

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
  var __archyNotionSaveTargetsSearchCache:
    | Map<string, SearchCacheEntry>
    | undefined;
}

interface SearchResponseData extends NotionSearchResultsPayload {
  meta: NotionSearchResultsPayload["meta"] & {
    fromCache: boolean;
  };
}

function getSearchCache(): Map<string, SearchCacheEntry> {
  if (!globalThis.__archyNotionSaveTargetsSearchCache) {
    globalThis.__archyNotionSaveTargetsSearchCache = new Map();
  }
  return globalThis.__archyNotionSaveTargetsSearchCache;
}

function getSaveTargetsCache(): Map<string, SaveTargetsCacheEntry> {
  if (!globalThis.__archyNotionSaveTargetsCache) {
    globalThis.__archyNotionSaveTargetsCache = new Map();
  }
  return globalThis.__archyNotionSaveTargetsCache;
}

function cleanupSearchCache(cache: Map<string, SearchCacheEntry>) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (!entry.inFlight && entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size <= SEARCH_CACHE_MAX_ENTRIES) return;

  const sortedEntries = Array.from(cache.entries()).sort(
    (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
  );
  const removeCount = cache.size - SEARCH_CACHE_MAX_ENTRIES;
  for (let i = 0; i < removeCount; i++) {
    cache.delete(sortedEntries[i][0]);
  }
}

function readDeepIndexCache(cacheKey: string): NotionSaveTargetsResult | null {
  const cache = getSaveTargetsCache();
  const entry = cache.get(cacheKey);
  if (!entry?.data) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  entry.lastAccessedAt = Date.now();
  return entry.data;
}

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function parseRefresh(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parseIncludeDbItems(value: string | null): boolean {
  if (!value) return true;
  return !(value === "0" || value === "false");
}

function normalizeQuery(value: string | null): string {
  if (!value) return "";
  return value.trim();
}

function hashStringFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function buildConnectionFingerprint(connection: {
  token: string;
  targetId: string | null;
  targetType: string | null;
  targetTitle: string | null;
}): string {
  const tokenHash = hashStringFNV1a(connection.token);
  const targetHash = hashStringFNV1a(
    `${connection.targetId ?? ""}|${connection.targetType ?? ""}|${connection.targetTitle ?? ""}`
  );
  return `${tokenHash}:${targetHash}`;
}

async function getCachedOrFetch(
  cacheKey: string,
  loader: () => Promise<NotionSearchResultsPayload>
): Promise<{ data: NotionSearchResultsPayload; fromCache: boolean }> {
  const cache = getSearchCache();
  cleanupSearchCache(cache);

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

  const entry: SearchCacheEntry = existing ?? {
    expiresAt: 0,
    lastAccessedAt: now,
  };

  entry.inFlight = loader()
    .then((data) => {
      entry.data = data;
      entry.expiresAt = Date.now() + SEARCH_CACHE_TTL_MS;
      entry.lastAccessedAt = Date.now();
      return data;
    })
    .finally(() => {
      const current = cache.get(cacheKey);
      if (current) {
        current.inFlight = undefined;
      }
      cleanupSearchCache(cache);
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

// GET /api/notion/save-targets/search
export const GET = withAuth<SearchResponseData>(
  async ({ user, supabase, request }) => {
    const query = normalizeQuery(request?.nextUrl.searchParams.get("q") || null);
    const limit = parseLimit(
      request?.nextUrl.searchParams.get("limit") || null,
      DEFAULT_LIMIT
    );
    const includeDbItems = parseIncludeDbItems(
      request?.nextUrl.searchParams.get("include_db_items") || null
    );
    const refresh = parseRefresh(request?.nextUrl.searchParams.get("refresh") || null);

    if (!query) {
      return errorResponse("Query is required", 400);
    }

    const { data: userData } = await supabase
      .from("users")
      .select(
        "notion_access_token, notion_database_id, notion_save_target_type, notion_save_target_title"
      )
      .eq("id", user.id)
      .single();

    if (!userData?.notion_access_token) {
      return errorResponse("Notion not connected", 400);
    }

    const connectionFingerprint = buildConnectionFingerprint({
      token: userData.notion_access_token,
      targetId: userData.notion_database_id ?? null,
      targetType: userData.notion_save_target_type ?? null,
      targetTitle: userData.notion_save_target_title ?? null,
    });

    const deepCacheKey = `${user.id}:notion-save-targets:${connectionFingerprint}:deep`;
    const searchCacheKey =
      `${user.id}:notion-save-targets:${connectionFingerprint}:search:` +
      `${query.toLowerCase()}:${limit}:${includeDbItems ? "1" : "0"}`;

    const deepSnapshot = readDeepIndexCache(deepCacheKey);

    const loader = () =>
      searchNotionSaveTargets(userData.notion_access_token, {
        query,
        limit,
        includeDatabaseItems: includeDbItems,
        indexSnapshot: deepSnapshot
          ? {
              pages: deepSnapshot.pages,
              databases: deepSnapshot.databases,
              rootPageIds: deepSnapshot.root_page_ids,
              rootDatabaseIds: deepSnapshot.root_database_ids,
              partial: deepSnapshot.meta.partial,
            }
          : undefined,
      });

    if (refresh) {
      const freshData = await loader();
      const cache = getSearchCache();
      cache.set(searchCacheKey, {
        data: freshData,
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        lastAccessedAt: Date.now(),
      });
      cleanupSearchCache(cache);

      return successResponse({
        ...freshData,
        meta: {
          ...freshData.meta,
          fromCache: false,
        },
      });
    }

    const { data, fromCache } = await getCachedOrFetch(searchCacheKey, loader);
    return successResponse({
      ...data,
      meta: {
        ...data.meta,
        fromCache,
      },
    });
  }
);
