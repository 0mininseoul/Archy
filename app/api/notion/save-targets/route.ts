import { withAuth, successResponse, errorResponse } from "@/lib/api";
import {
  getNotionFastSaveTargets,
  getNotionDeepSaveTargetsTick,
  NotionDeepSyncState,
  NotionSaveTargetsResult,
} from "@/lib/services/notion-save-targets";

export const runtime = "edge";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const SYNC_STATE_TTL_MS = 10 * 60 * 1000;
const SYNC_STATE_MAX_ENTRIES = 400;
const DEFAULT_FAST_LIMIT = 15;
const MAX_LIMIT = 100;

type SaveTargetMode = "fast" | "deep";

interface SaveTargetsCacheEntry {
  data?: NotionSaveTargetsResult;
  expiresAt: number;
  lastAccessedAt: number;
  inFlight?: Promise<NotionSaveTargetsResult>;
}

interface SyncStateCacheEntry {
  state: NotionDeepSyncState;
  userId: string;
  connectionFingerprint: string;
  expiresAt: number;
  lastAccessedAt: number;
}

declare global {
  var __archyNotionSaveTargetsCache:
    | Map<string, SaveTargetsCacheEntry>
    | undefined;
  var __archyNotionSaveTargetsSyncStateCache:
    | Map<string, SyncStateCacheEntry>
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

function getSyncStateCache(): Map<string, SyncStateCacheEntry> {
  if (!globalThis.__archyNotionSaveTargetsSyncStateCache) {
    globalThis.__archyNotionSaveTargetsSyncStateCache = new Map();
  }
  return globalThis.__archyNotionSaveTargetsSyncStateCache;
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

function cleanupSyncStateCache(cache: Map<string, SyncStateCacheEntry>) {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size <= SYNC_STATE_MAX_ENTRIES) {
    return;
  }

  const sortedEntries = Array.from(cache.entries()).sort(
    (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
  );
  const removeCount = cache.size - SYNC_STATE_MAX_ENTRIES;

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

function parseRefresh(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parseSyncToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
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

function writeServerCache(cacheKey: string, data: NotionSaveTargetsResult) {
  const cache = getServerCache();
  cache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastAccessedAt: Date.now(),
  });
  cleanupServerCache(cache);
}

function readServerCache(cacheKey: string): NotionSaveTargetsResult | null {
  const cache = getServerCache();
  cleanupServerCache(cache);

  const entry = cache.get(cacheKey);
  if (!entry?.data) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  entry.lastAccessedAt = Date.now();
  return entry.data;
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

function createSyncToken(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }
}

function readSyncState(
  token: string,
  userId: string,
  connectionFingerprint: string
): NotionDeepSyncState | null {
  const cache = getSyncStateCache();
  cleanupSyncStateCache(cache);

  const entry = cache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(token);
    return null;
  }
  if (entry.userId !== userId || entry.connectionFingerprint !== connectionFingerprint) {
    cache.delete(token);
    return null;
  }

  entry.lastAccessedAt = Date.now();
  return entry.state;
}

function writeSyncState(
  token: string,
  userId: string,
  connectionFingerprint: string,
  state: NotionDeepSyncState
) {
  const cache = getSyncStateCache();
  cache.set(token, {
    state,
    userId,
    connectionFingerprint,
    expiresAt: Date.now() + SYNC_STATE_TTL_MS,
    lastAccessedAt: Date.now(),
  });
  cleanupSyncStateCache(cache);
}

function deleteSyncState(token: string | null) {
  if (!token) return;
  const cache = getSyncStateCache();
  cache.delete(token);
}

// GET /api/notion/save-targets - List save targets with fast/deep mode
export const GET = withAuth<SaveTargetsResponseData>(
  async ({ user, supabase, request }) => {
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

    const mode = parseMode(request?.nextUrl.searchParams.get("mode") || null);
    const limit = parseLimit(
      request?.nextUrl.searchParams.get("limit") || null,
      DEFAULT_FAST_LIMIT
    );
    const refresh = parseRefresh(request?.nextUrl.searchParams.get("refresh") || null);
    const syncTokenParam = parseSyncToken(request?.nextUrl.searchParams.get("sync_token") || null);

    const connectionFingerprint = buildConnectionFingerprint({
      token: userData.notion_access_token,
      targetId: userData.notion_database_id ?? null,
      targetType: userData.notion_save_target_type ?? null,
      targetTitle: userData.notion_save_target_title ?? null,
    });

    const fastCacheKey = `${user.id}:notion-save-targets:${connectionFingerprint}:fast:${limit}`;
    const deepCacheKey = `${user.id}:notion-save-targets:${connectionFingerprint}:deep`;

    if (mode === "fast") {
      if (refresh) {
        const freshData = await getNotionFastSaveTargets(userData.notion_access_token, {
          limit,
        });
        writeServerCache(fastCacheKey, freshData);
        return successResponse({
          ...freshData,
          meta: {
            ...freshData.meta,
            fromCache: false,
          },
        });
      }

      const { data, fromCache } = await getCachedOrFetch(fastCacheKey, () =>
        getNotionFastSaveTargets(userData.notion_access_token, { limit })
      );

      return successResponse({
        ...data,
        meta: {
          ...data.meta,
          fromCache,
        },
      });
    }

    // deep mode
    if (!refresh && !syncTokenParam) {
      const cachedDeep = readServerCache(deepCacheKey);
      if (cachedDeep && !cachedDeep.meta.partial) {
        return successResponse({
          ...cachedDeep,
          meta: {
            ...cachedDeep.meta,
            fromCache: true,
          },
        });
      }
    }

    let syncState: NotionDeepSyncState | undefined;
    if (!refresh && syncTokenParam) {
      syncState = readSyncState(syncTokenParam, user.id, connectionFingerprint) || undefined;
    } else if (refresh && syncTokenParam) {
      deleteSyncState(syncTokenParam);
    }

    const tick = await getNotionDeepSaveTargetsTick(userData.notion_access_token, {
      state: syncState,
      preferredTargetId: userData.notion_database_id ?? null,
    });

    let responseSyncToken: string | undefined;
    if (tick.nextState) {
      responseSyncToken = syncTokenParam || createSyncToken();
      writeSyncState(responseSyncToken, user.id, connectionFingerprint, tick.nextState);
    } else {
      deleteSyncState(syncTokenParam);
      writeServerCache(deepCacheKey, tick.result);
    }

    return successResponse({
      ...tick.result,
      meta: {
        ...tick.result.meta,
        sync_token: responseSyncToken,
        fromCache: false,
      },
    });
  }
);
