const NOTION_VERSION = "2022-06-28";
const NOTION_API_BASE = "https://api.notion.com/v1";

const DEFAULT_FAST_LIMIT = 15;
const DEFAULT_DEEP_MAX_NODES_PER_TICK = 180;
const DEFAULT_DEEP_MAX_MS_PER_TICK = 2500;
const DEFAULT_DEEP_MAX_DEPTH = 8;
const DEFAULT_DEEP_CONCURRENCY = 4;
const DEFAULT_SEARCH_LIMIT = 30;
const DEFAULT_DATABASE_SEARCH_COUNT = 10;
const DEFAULT_DB_ITEMS_PER_DATABASE_LIMIT = 20;

const BLOCKS_WITH_CHILDREN = [
  "child_page",
  "column_list",
  "column",
  "toggle",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "callout",
  "synced_block",
];

type NotionObjectType = "page" | "database";
type SearchResultSource = "index" | "remote_search" | "db_query";

interface NotionParent {
  type?: string;
  page_id?: string;
  database_id?: string;
  block_id?: string;
}

interface NotionSearchObject {
  object: NotionObjectType;
  id: string;
  url?: string;
  last_edited_time?: string;
  parent?: NotionParent;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, unknown>;
}

interface NotionSearchResponse {
  results?: NotionSearchObject[];
  has_more?: boolean;
  next_cursor?: string | null;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  last_edited_time?: string;
  child_page?: { title?: string };
  child_database?: { title?: string };
}

interface NotionBlockChildrenResponse {
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
}

interface NotionDatabaseQueryResponse {
  results?: Array<{
    id: string;
    url?: string;
    last_edited_time?: string;
    parent?: NotionParent;
    properties?: Record<string, unknown>;
  }>;
  has_more?: boolean;
  next_cursor?: string | null;
}

export interface NotionDatabaseSummary {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
  parent_type?: string;
  parent_page_id?: string | null;
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
  parent_type?: string;
  parent_page_id?: string | null;
}

export interface NotionSaveTargetsProgress {
  roots: number;
  visited_nodes: number;
  pending_nodes: number;
}

export type NotionPartialReason =
  | "budget_exhausted"
  | "timeout"
  | "notion_search_failed"
  | "notion_children_failed";

export interface NotionSaveTargetsResult {
  pages: NotionPageSummary[];
  databases: NotionDatabaseSummary[];
  root_page_ids?: string[];
  root_database_ids?: string[];
  meta: {
    mode: "fast" | "deep";
    partial: boolean;
    fetchedAt: string;
    scope: "descendants";
    partial_reason?: NotionPartialReason;
    sync_token?: string;
    progress: NotionSaveTargetsProgress;
  };
}

export interface NotionSearchResult {
  type: "page" | "database" | "database_item";
  id: string;
  title: string;
  url: string;
  source: SearchResultSource;
  last_edited_time: string;
  parent_type?: string;
  parent_page_id?: string | null;
  database_id?: string;
}

export interface NotionSearchResultsPayload {
  results: NotionSearchResult[];
  meta: {
    from_index: number;
    from_remote_search: number;
    from_db_query: number;
    scope_filtered: boolean;
    partial: boolean;
    fetchedAt: string;
  };
}

interface NotionSaveTargetsOptions {
  mode: "fast" | "deep";
  limit?: number;
}

interface NotionFastOptions {
  limit?: number;
}

export interface NotionDeepSyncState {
  queue: NotionBlockTask[];
  visited_block_ids: string[];
  pages: NotionPageSummary[];
  databases: NotionDatabaseSummary[];
  root_page_ids: string[];
  root_database_ids: string[];
  known_page_ids: string[];
  known_database_ids: string[];
  initialized_at: string;
}

interface NotionDeepTickOptions {
  state?: NotionDeepSyncState;
  preferredTargetId?: string | null;
  maxNodesPerTick?: number;
  maxMsPerTick?: number;
  maxDepth?: number;
  concurrency?: number;
}

export interface NotionDeepTickResult {
  result: NotionSaveTargetsResult;
  nextState: NotionDeepSyncState | null;
}

interface NotionSearchOptions {
  query: string;
  limit?: number;
  includeDatabaseItems?: boolean;
  indexSnapshot?: Pick<
    NotionSaveTargetsResult,
    "pages" | "databases"
  > & {
    rootPageIds?: string[];
    rootDatabaseIds?: string[];
    partial?: boolean;
  };
}

interface NotionBlockTask {
  id: string;
  depth: number;
}

interface SearchSnapshot {
  pages: NotionSearchObject[];
  databases: NotionSearchObject[];
  partial: boolean;
}

interface RootContext {
  rootPageIds: string[];
  rootDatabaseIds: string[];
}

interface Deadline {
  hasTime: () => boolean;
  remaining: () => number;
}

function getHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  return new Date(0).toISOString();
}

function createDeadline(timeoutMs: number): Deadline {
  const end = Date.now() + timeoutMs;
  return {
    hasTime: () => Date.now() < end,
    remaining: () => Math.max(0, end - Date.now()),
  };
}

function sortByLastEditedDesc<T extends { last_edited_time: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.last_edited_time).getTime() -
      new Date(a.last_edited_time).getTime()
  );
}

function normalizeTitle(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function extractPageTitle(properties: Record<string, unknown> | undefined): string {
  if (!properties) return "Untitled";

  for (const property of Object.values(properties)) {
    if (
      property &&
      typeof property === "object" &&
      "type" in property &&
      (property as { type?: string }).type === "title" &&
      "title" in property
    ) {
      const title = (property as { title?: Array<{ plain_text?: string }> }).title;
      if (Array.isArray(title) && title[0]?.plain_text) {
        return title[0].plain_text;
      }
    }
  }

  return "Untitled";
}

function safeUrl(url: string | undefined, id: string): string {
  if (typeof url === "string" && url.length > 0) return url;
  return `https://notion.so/${id.replace(/-/g, "")}`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function notionFetchJson<T>(
  accessToken: string,
  url: string,
  init: RequestInit,
  timeoutMs?: number
): Promise<T> {
  const requestInit: RequestInit = {
    ...init,
    headers: {
      ...getHeaders(accessToken),
      ...(init.headers || {}),
    },
  };

  const response = timeoutMs
    ? await fetchWithTimeout(url, requestInit, timeoutMs)
    : await fetch(url, requestInit);

  if (!response.ok) {
    throw new Error(`Notion API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function mapPageSummary(page: NotionSearchObject): NotionPageSummary {
  return {
    id: page.id,
    title: extractPageTitle(page.properties),
    url: safeUrl(page.url, page.id),
    last_edited_time: toIsoDate(page.last_edited_time),
    parent_type: page.parent?.type,
    parent_page_id: page.parent?.page_id ?? null,
  };
}

function mapDatabaseSummary(database: NotionSearchObject): NotionDatabaseSummary {
  return {
    id: database.id,
    title: database.title?.[0]?.plain_text || "Untitled",
    url: safeUrl(database.url, database.id),
    last_edited_time: toIsoDate(database.last_edited_time),
    parent_type: database.parent?.type,
    parent_page_id: database.parent?.page_id ?? null,
  };
}

function mapDatabaseItemResult(
  item: {
    id: string;
    url?: string;
    last_edited_time?: string;
    properties?: Record<string, unknown>;
    parent?: NotionParent;
  },
  databaseId: string
): NotionSearchResult {
  return {
    type: "database_item",
    id: item.id,
    title: extractPageTitle(item.properties),
    url: safeUrl(item.url, item.id),
    source: "db_query",
    last_edited_time: toIsoDate(item.last_edited_time),
    parent_type: item.parent?.type,
    parent_page_id: item.parent?.page_id ?? null,
    database_id: databaseId,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function inferRootContext(
  pages: NotionSearchObject[],
  databases: NotionSearchObject[],
  preferredTargetId?: string | null
): RootContext {
  const pageIdSet = new Set(pages.map((page) => page.id));
  const databaseIdSet = new Set(databases.map((database) => database.id));

  const rootPageIds = pages
    .filter((page) => {
      const parentType = page.parent?.type;
      if (parentType !== "page_id") return true;
      if (!page.parent?.page_id) return true;
      return !pageIdSet.has(page.parent.page_id);
    })
    .map((page) => page.id);

  const rootDatabaseIds = databases
    .filter((database) => {
      const parentType = database.parent?.type;
      if (parentType !== "page_id") return true;
      if (!database.parent?.page_id) return true;
      return !pageIdSet.has(database.parent.page_id);
    })
    .map((database) => database.id);

  if (preferredTargetId) {
    if (pageIdSet.has(preferredTargetId) && !rootPageIds.includes(preferredTargetId)) {
      rootPageIds.push(preferredTargetId);
    }
    if (
      databaseIdSet.has(preferredTargetId) &&
      !rootDatabaseIds.includes(preferredTargetId)
    ) {
      rootDatabaseIds.push(preferredTargetId);
    }
  }

  return { rootPageIds, rootDatabaseIds };
}

async function searchAllPagesAndDatabases(
  accessToken: string,
  query?: string
): Promise<SearchSnapshot> {
  const pages: NotionSearchObject[] = [];
  const databases: NotionSearchObject[] = [];
  let cursor: string | null = null;
  let partial = false;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    };

    const trimmedQuery = query?.trim();
    if (trimmedQuery) {
      body.query = trimmedQuery;
    }

    if (cursor) {
      body.start_cursor = cursor;
    }

    const data = await notionFetchJson<NotionSearchResponse>(
      accessToken,
      `${NOTION_API_BASE}/search`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    const results = Array.isArray(data.results) ? data.results : [];
    for (const item of results) {
      if (item.object === "page") pages.push(item);
      if (item.object === "database") databases.push(item);
    }

    cursor = data.has_more ? data.next_cursor || null : null;
    partial = Boolean(data.has_more && !data.next_cursor);
  } while (cursor);

  return {
    pages: dedupeById(pages),
    databases: dedupeById(databases),
    partial,
  };
}

async function searchNotionObjectsSinglePage(
  accessToken: string,
  objectType: NotionObjectType
): Promise<{ results: NotionSearchObject[]; partial: boolean }> {
  const data = await notionFetchJson<NotionSearchResponse>(
    accessToken,
    `${NOTION_API_BASE}/search`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "object",
          value: objectType,
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 100,
      }),
    }
  );

  const results = (Array.isArray(data.results) ? data.results : []).filter(
    (item) => item.object === objectType
  );
  return {
    results,
    partial: Boolean(data.has_more),
  };
}

async function listAllBlockChildren(
  accessToken: string,
  blockId: string,
  timeoutMs: number
): Promise<{ blocks: NotionBlock[]; partial: boolean }> {
  const blocks: NotionBlock[] = [];
  const deadline = createDeadline(timeoutMs);
  let cursor: string | null = null;
  let partial = false;

  while (deadline.hasTime()) {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);

    const perRequestTimeout = Math.max(250, Math.min(1500, deadline.remaining()));
    const data = await notionFetchJson<NotionBlockChildrenResponse>(
      accessToken,
      `${NOTION_API_BASE}/blocks/${blockId}/children?${query.toString()}`,
      { method: "GET" },
      perRequestTimeout
    );

    const results = Array.isArray(data.results) ? data.results : [];
    blocks.push(...results);

    if (!data.has_more) {
      cursor = null;
      break;
    }

    if (!data.next_cursor) {
      partial = true;
      cursor = null;
      break;
    }

    cursor = data.next_cursor;
  }

  if (cursor) {
    partial = true;
  }

  if (!deadline.hasTime()) {
    partial = true;
  }

  return { blocks, partial };
}

export async function queryDatabaseItemsForSearch(
  accessToken: string,
  databaseId: string,
  query: string,
  limit: number
): Promise<{ results: NotionSearchResult[]; partial: boolean }> {
  const results: NotionSearchResult[] = [];
  let cursor: string | null = null;
  let partial = false;
  const normalizedQuery = normalizeTitle(query);

  while (results.length < limit) {
    const body: Record<string, unknown> = {
      page_size: Math.min(100, limit * 2),
      sorts: [
        {
          direction: "descending",
          timestamp: "last_edited_time",
        },
      ],
    };
    if (cursor) body.start_cursor = cursor;

    const data = await notionFetchJson<NotionDatabaseQueryResponse>(
      accessToken,
      `${NOTION_API_BASE}/databases/${databaseId}/query`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    const rows = Array.isArray(data.results) ? data.results : [];
    for (const row of rows) {
      const mapped = mapDatabaseItemResult(row, databaseId);
      if (normalizeTitle(mapped.title).includes(normalizedQuery)) {
        results.push(mapped);
        if (results.length >= limit) break;
      }
    }

    if (!data.has_more) break;
    if (!data.next_cursor) {
      partial = true;
      break;
    }
    cursor = data.next_cursor;
  }

  return {
    results: results.slice(0, limit),
    partial,
  };
}

function buildSaveTargetsResult(
  mode: "fast" | "deep",
  pages: NotionPageSummary[],
  databases: NotionDatabaseSummary[],
  options?: {
    partial?: boolean;
    partialReason?: NotionPartialReason;
    progress?: NotionSaveTargetsProgress;
    rootPageIds?: string[];
    rootDatabaseIds?: string[];
  }
): NotionSaveTargetsResult {
  return {
    pages: sortByLastEditedDesc(dedupeById(pages)),
    databases: sortByLastEditedDesc(dedupeById(databases)),
    root_page_ids: options?.rootPageIds,
    root_database_ids: options?.rootDatabaseIds,
    meta: {
      mode,
      partial: Boolean(options?.partial),
      fetchedAt: new Date().toISOString(),
      scope: "descendants",
      partial_reason: options?.partialReason,
      progress: options?.progress || {
        roots: 0,
        visited_nodes: 0,
        pending_nodes: 0,
      },
    },
  };
}

export async function getNotionFastSaveTargets(
  accessToken: string,
  options?: NotionFastOptions
): Promise<NotionSaveTargetsResult> {
  const limit = Math.max(1, options?.limit ?? DEFAULT_FAST_LIMIT);

  const [databaseResult, pageResult] = await Promise.allSettled([
    searchNotionObjectsSinglePage(accessToken, "database"),
    searchNotionObjectsSinglePage(accessToken, "page"),
  ]);

  const databases =
    databaseResult.status === "fulfilled"
      ? databaseResult.value.results.map(mapDatabaseSummary)
      : [];
  const pages =
    pageResult.status === "fulfilled"
      ? pageResult.value.results.map(mapPageSummary)
      : [];

  if (databases.length === 0 && pages.length === 0) {
    throw new Error("Failed to fetch save targets");
  }

  const combined = [
    ...databases.map((database) => ({ ...database, type: "database" as const })),
    ...pages.map((page) => ({ ...page, type: "page" as const })),
  ];
  const limited = sortByLastEditedDesc(combined).slice(0, limit);

  return buildSaveTargetsResult(
    "fast",
    limited
      .filter((item) => item.type === "page")
      .map(({ type: _type, ...page }) => page),
    limited
      .filter((item) => item.type === "database")
      .map(({ type: _type, ...database }) => database),
    {
      partial:
        (databaseResult.status === "fulfilled" && databaseResult.value.partial) ||
        (pageResult.status === "fulfilled" && pageResult.value.partial) ||
        databaseResult.status === "rejected" ||
        pageResult.status === "rejected",
      partialReason:
        databaseResult.status === "rejected" || pageResult.status === "rejected"
          ? "notion_search_failed"
          : "budget_exhausted",
      progress: {
        roots: 0,
        visited_nodes: 0,
        pending_nodes: 0,
      },
    }
  );
}

function buildStateMaps(state?: NotionDeepSyncState): {
  pageMap: Map<string, NotionPageSummary>;
  databaseMap: Map<string, NotionDatabaseSummary>;
  queue: NotionBlockTask[];
  visited: Set<string>;
  rootPageIds: Set<string>;
  rootDatabaseIds: Set<string>;
  knownPageIds: Set<string>;
  knownDatabaseIds: Set<string>;
} {
  const pageMap = new Map<string, NotionPageSummary>();
  const databaseMap = new Map<string, NotionDatabaseSummary>();

  if (state) {
    for (const page of state.pages) {
      pageMap.set(page.id, page);
    }
    for (const database of state.databases) {
      databaseMap.set(database.id, database);
    }
  }

  return {
    pageMap,
    databaseMap,
    queue: state ? [...state.queue] : [],
    visited: new Set(state?.visited_block_ids || []),
    rootPageIds: new Set(state?.root_page_ids || []),
    rootDatabaseIds: new Set(state?.root_database_ids || []),
    knownPageIds: new Set(state?.known_page_ids || []),
    knownDatabaseIds: new Set(state?.known_database_ids || []),
  };
}

async function initializeDeepState(
  accessToken: string,
  preferredTargetId?: string | null
): Promise<{
  pageMap: Map<string, NotionPageSummary>;
  databaseMap: Map<string, NotionDatabaseSummary>;
  queue: NotionBlockTask[];
  visited: Set<string>;
  rootPageIds: Set<string>;
  rootDatabaseIds: Set<string>;
  knownPageIds: Set<string>;
  knownDatabaseIds: Set<string>;
  partial: boolean;
}> {
  const snapshot = await searchAllPagesAndDatabases(accessToken);
  const pageMap = new Map<string, NotionPageSummary>();
  const databaseMap = new Map<string, NotionDatabaseSummary>();

  for (const page of snapshot.pages) {
    pageMap.set(page.id, mapPageSummary(page));
  }
  for (const database of snapshot.databases) {
    databaseMap.set(database.id, mapDatabaseSummary(database));
  }

  const roots = inferRootContext(snapshot.pages, snapshot.databases, preferredTargetId);

  return {
    pageMap,
    databaseMap,
    queue: roots.rootPageIds.map((id) => ({ id, depth: 0 })),
    visited: new Set(),
    rootPageIds: new Set(roots.rootPageIds),
    rootDatabaseIds: new Set(roots.rootDatabaseIds),
    knownPageIds: new Set(snapshot.pages.map((page) => page.id)),
    knownDatabaseIds: new Set(snapshot.databases.map((database) => database.id)),
    partial: snapshot.partial,
  };
}

function snapshotState(input: {
  queue: NotionBlockTask[];
  visited: Set<string>;
  pageMap: Map<string, NotionPageSummary>;
  databaseMap: Map<string, NotionDatabaseSummary>;
  rootPageIds: Set<string>;
  rootDatabaseIds: Set<string>;
  knownPageIds: Set<string>;
  knownDatabaseIds: Set<string>;
  initializedAt?: string;
}): NotionDeepSyncState {
  return {
    queue: [...input.queue],
    visited_block_ids: Array.from(input.visited),
    pages: Array.from(input.pageMap.values()),
    databases: Array.from(input.databaseMap.values()),
    root_page_ids: Array.from(input.rootPageIds),
    root_database_ids: Array.from(input.rootDatabaseIds),
    known_page_ids: Array.from(input.knownPageIds),
    known_database_ids: Array.from(input.knownDatabaseIds),
    initialized_at: input.initializedAt || new Date().toISOString(),
  };
}

export async function getNotionDeepSaveTargetsTick(
  accessToken: string,
  options?: NotionDeepTickOptions
): Promise<NotionDeepTickResult> {
  const maxNodesPerTick = Math.max(
    20,
    options?.maxNodesPerTick ?? DEFAULT_DEEP_MAX_NODES_PER_TICK
  );
  const maxMsPerTick = Math.max(
    500,
    options?.maxMsPerTick ?? DEFAULT_DEEP_MAX_MS_PER_TICK
  );
  const maxDepth = Math.max(1, options?.maxDepth ?? DEFAULT_DEEP_MAX_DEPTH);
  const concurrency = Math.max(1, Math.min(8, options?.concurrency ?? DEFAULT_DEEP_CONCURRENCY));
  const deadline = createDeadline(maxMsPerTick);

  let partialReason: NotionPartialReason | undefined;
  let initializationPartial = false;

  let stateData = buildStateMaps(options?.state);

  if (!options?.state) {
    try {
      const initialized = await initializeDeepState(accessToken, options?.preferredTargetId);
      stateData = {
        pageMap: initialized.pageMap,
        databaseMap: initialized.databaseMap,
        queue: initialized.queue,
        visited: initialized.visited,
        rootPageIds: initialized.rootPageIds,
        rootDatabaseIds: initialized.rootDatabaseIds,
        knownPageIds: initialized.knownPageIds,
        knownDatabaseIds: initialized.knownDatabaseIds,
      };
      initializationPartial = initialized.partial;
    } catch {
      partialReason = "notion_search_failed";
    }
  }

  let processedNodes = 0;
  let childFetchFailed = false;
  let timeExceeded = false;

  const worker = async () => {
    while (
      deadline.hasTime() &&
      processedNodes < maxNodesPerTick &&
      stateData.queue.length > 0
    ) {
      const task = stateData.queue.shift();
      if (!task) break;
      if (task.depth > maxDepth || stateData.visited.has(task.id)) continue;

      stateData.visited.add(task.id);
      processedNodes += 1;

      try {
        const children = await listAllBlockChildren(
          accessToken,
          task.id,
          Math.max(250, Math.min(1200, deadline.remaining()))
        );

        if (children.partial) {
          childFetchFailed = true;
        }

        for (const block of children.blocks) {
          if (block.type === "child_page") {
            const mapped: NotionPageSummary = {
              id: block.id,
              title: block.child_page?.title || "Untitled",
              url: safeUrl(undefined, block.id),
              last_edited_time: toIsoDate(block.last_edited_time),
              parent_type: "page_id",
              parent_page_id: task.id,
            };
            stateData.pageMap.set(block.id, mapped);
            stateData.knownPageIds.add(block.id);
          }

          if (block.type === "child_database") {
            const mapped: NotionDatabaseSummary = {
              id: block.id,
              title: block.child_database?.title || "Untitled",
              url: safeUrl(undefined, block.id),
              last_edited_time: toIsoDate(block.last_edited_time),
              parent_type: "page_id",
              parent_page_id: task.id,
            };
            stateData.databaseMap.set(block.id, mapped);
            stateData.knownDatabaseIds.add(block.id);
          }

          if (
            block.has_children &&
            BLOCKS_WITH_CHILDREN.includes(block.type) &&
            task.depth < maxDepth
          ) {
            stateData.queue.push({ id: block.id, depth: task.depth + 1 });
          }
        }
      } catch {
        childFetchFailed = true;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (!deadline.hasTime() && stateData.queue.length > 0) {
    timeExceeded = true;
  }

  const pages = Array.from(stateData.pageMap.values());
  const databases = Array.from(stateData.databaseMap.values());

  if (pages.length === 0 && databases.length === 0) {
    throw new Error("Failed to fetch save targets");
  }

  const partial =
    stateData.queue.length > 0 || initializationPartial || childFetchFailed || timeExceeded;

  if (timeExceeded) {
    partialReason = "timeout";
  } else if (childFetchFailed) {
    partialReason = "notion_children_failed";
  } else if (initializationPartial) {
    partialReason = "notion_search_failed";
  } else if (stateData.queue.length > 0) {
    partialReason = "budget_exhausted";
  }

  const result = buildSaveTargetsResult("deep", pages, databases, {
    partial,
    partialReason,
    progress: {
      roots: stateData.rootPageIds.size + stateData.rootDatabaseIds.size,
      visited_nodes: stateData.visited.size,
      pending_nodes: stateData.queue.length,
    },
    rootPageIds: Array.from(stateData.rootPageIds),
    rootDatabaseIds: Array.from(stateData.rootDatabaseIds),
  });

  if (!partial) {
    return {
      result,
      nextState: null,
    };
  }

  const nextState = snapshotState({
    queue: stateData.queue,
    visited: stateData.visited,
    pageMap: stateData.pageMap,
    databaseMap: stateData.databaseMap,
    rootPageIds: stateData.rootPageIds,
    rootDatabaseIds: stateData.rootDatabaseIds,
    knownPageIds: stateData.knownPageIds,
    knownDatabaseIds: stateData.knownDatabaseIds,
    initializedAt: options?.state?.initialized_at,
  });

  return {
    result,
    nextState,
  };
}

export async function getNotionSaveTargets(
  accessToken: string,
  options: NotionSaveTargetsOptions
): Promise<NotionSaveTargetsResult> {
  if (options.mode === "fast") {
    return getNotionFastSaveTargets(accessToken, { limit: options.limit });
  }

  const tick = await getNotionDeepSaveTargetsTick(accessToken);
  return tick.result;
}

function buildScopeSets(indexSnapshot?: NotionSearchOptions["indexSnapshot"]): {
  knownPageIds: Set<string>;
  knownDatabaseIds: Set<string>;
  rootPageIds: Set<string>;
  rootDatabaseIds: Set<string>;
} | null {
  if (!indexSnapshot) return null;

  return {
    knownPageIds: new Set(indexSnapshot.pages.map((page) => page.id)),
    knownDatabaseIds: new Set(indexSnapshot.databases.map((database) => database.id)),
    rootPageIds: new Set(indexSnapshot.rootPageIds || []),
    rootDatabaseIds: new Set(indexSnapshot.rootDatabaseIds || []),
  };
}

function isInScope(
  item:
    | NotionSearchResult
    | (NotionPageSummary & { type?: "page" })
    | (NotionDatabaseSummary & { type?: "database" }),
  scope:
    | {
        knownPageIds: Set<string>;
        knownDatabaseIds: Set<string>;
        rootPageIds: Set<string>;
        rootDatabaseIds: Set<string>;
      }
    | null
): boolean {
  if (!scope) return true;

  if ("database_id" in item && item.database_id) {
    return scope.knownDatabaseIds.has(item.database_id);
  }

  if ("type" in item && item.type === "database") {
    if (scope.knownDatabaseIds.has(item.id)) return true;
    if (item.parent_page_id && scope.knownPageIds.has(item.parent_page_id)) return true;
    return scope.rootDatabaseIds.has(item.id);
  }

  if ("type" in item && item.type === "page") {
    if (scope.knownPageIds.has(item.id)) return true;
    if (item.parent_page_id && scope.knownPageIds.has(item.parent_page_id)) return true;
    return scope.rootPageIds.has(item.id);
  }

  if (item.type === "database") {
    if (scope.knownDatabaseIds.has(item.id)) return true;
    if (item.parent_page_id && scope.knownPageIds.has(item.parent_page_id)) return true;
    return scope.rootDatabaseIds.has(item.id);
  }

  if (item.type === "page") {
    if (scope.knownPageIds.has(item.id)) return true;
    if (item.parent_page_id && scope.knownPageIds.has(item.parent_page_id)) return true;
    return scope.rootPageIds.has(item.id);
  }

  return true;
}

function dedupeSearchResults(results: NotionSearchResult[]): NotionSearchResult[] {
  const seen = new Set<string>();
  const output: NotionSearchResult[] = [];

  for (const result of results) {
    const key = `${result.type}:${result.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
  }

  return output;
}

export async function searchNotionSaveTargets(
  accessToken: string,
  options: NotionSearchOptions
): Promise<NotionSearchResultsPayload> {
  const limit = Math.max(1, options.limit ?? DEFAULT_SEARCH_LIMIT);
  const includeDatabaseItems = options.includeDatabaseItems !== false;
  const query = options.query.trim();

  if (!query) {
    return {
      results: [],
      meta: {
        from_index: 0,
        from_remote_search: 0,
        from_db_query: 0,
        scope_filtered: Boolean(options.indexSnapshot),
        partial: Boolean(options.indexSnapshot?.partial),
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  const scope = buildScopeSets(options.indexSnapshot);
  const normalizedQuery = normalizeTitle(query);

  const indexResults: NotionSearchResult[] = [];
  if (options.indexSnapshot) {
    for (const page of options.indexSnapshot.pages) {
      if (!normalizeTitle(page.title).includes(normalizedQuery)) continue;
      indexResults.push({
        type: "page",
        id: page.id,
        title: page.title,
        url: page.url,
        source: "index",
        last_edited_time: page.last_edited_time,
        parent_type: page.parent_type,
        parent_page_id: page.parent_page_id ?? null,
      });
    }
    for (const database of options.indexSnapshot.databases) {
      if (!normalizeTitle(database.title).includes(normalizedQuery)) continue;
      indexResults.push({
        type: "database",
        id: database.id,
        title: database.title,
        url: database.url,
        source: "index",
        last_edited_time: database.last_edited_time,
        parent_type: database.parent_type,
        parent_page_id: database.parent_page_id ?? null,
      });
    }
  }

  const remoteSnapshot = await searchAllPagesAndDatabases(accessToken, query);
  const remoteResults = [
    ...remoteSnapshot.pages.map((page) => {
      const mapped = mapPageSummary(page);
      return {
        type: "page" as const,
        id: mapped.id,
        title: mapped.title,
        url: mapped.url,
        source: "remote_search" as const,
        last_edited_time: mapped.last_edited_time,
        parent_type: mapped.parent_type,
        parent_page_id: mapped.parent_page_id,
      };
    }),
    ...remoteSnapshot.databases.map((database) => {
      const mapped = mapDatabaseSummary(database);
      return {
        type: "database" as const,
        id: mapped.id,
        title: mapped.title,
        url: mapped.url,
        source: "remote_search" as const,
        last_edited_time: mapped.last_edited_time,
        parent_type: mapped.parent_type,
        parent_page_id: mapped.parent_page_id,
      };
    }),
  ].filter((item) => isInScope(item, scope));

  const dbQueryResults: NotionSearchResult[] = [];
  let dbQueryPartial = false;

  if (includeDatabaseItems) {
    const candidateDatabases = (
      options.indexSnapshot?.databases || remoteSnapshot.databases.map(mapDatabaseSummary)
    )
      .filter((database, index, list) => list.findIndex((d) => d.id === database.id) === index)
      .slice(0, DEFAULT_DATABASE_SEARCH_COUNT);

    const perDatabaseLimit = Math.max(
      3,
      Math.min(
        DEFAULT_DB_ITEMS_PER_DATABASE_LIMIT,
        Math.ceil(limit / Math.max(1, candidateDatabases.length))
      )
    );

    for (const database of candidateDatabases) {
      try {
        const dbQuery = await queryDatabaseItemsForSearch(
          accessToken,
          database.id,
          query,
          perDatabaseLimit
        );
        dbQueryPartial = dbQueryPartial || dbQuery.partial;
        for (const item of dbQuery.results) {
          if (!isInScope(item, scope)) continue;
          dbQueryResults.push(item);
        }
      } catch {
        dbQueryPartial = true;
      }
    }
  }

  const merged = dedupeSearchResults([
    ...indexResults,
    ...remoteResults,
    ...dbQueryResults,
  ]);

  const sorted = sortByLastEditedDesc(merged).slice(0, limit);

  return {
    results: sorted,
    meta: {
      from_index: indexResults.length,
      from_remote_search: remoteResults.length,
      from_db_query: dbQueryResults.length,
      scope_filtered: Boolean(scope),
      partial:
        remoteSnapshot.partial || dbQueryPartial || Boolean(options.indexSnapshot?.partial),
      fetchedAt: new Date().toISOString(),
    },
  };
}
