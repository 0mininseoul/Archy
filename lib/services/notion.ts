// Notion API using fetch for Edge Runtime compatibility
const NOTION_VERSION = "2022-06-28";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_EXPLORE_BLOCK_TIMEOUT_MS = 1500;
const DEFAULT_DEEP_TIMEOUT_MS = 10000;
const DEFAULT_DEEP_MAX_DEPTH = 4;
const DEFAULT_DEEP_CONCURRENCY = 4;
const DEFAULT_FAST_LIMIT = 15;

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

export interface NotionDatabaseSummary {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
}

export interface NotionSaveTargetsResult {
  pages: NotionPageSummary[];
  databases: NotionDatabaseSummary[];
  meta: {
    mode: "fast" | "deep";
    partial: boolean;
    fetchedAt: string;
  };
}

interface NotionSaveTargetsOptions {
  mode: "fast" | "deep";
  limit?: number;
  timeoutMs?: number;
  maxDepth?: number;
  concurrency?: number;
}

interface Deadline {
  hasTime: () => boolean;
  remaining: () => number;
}

interface NotionBlockTask {
  id: string;
  depth: number;
}

interface MarkdownToBlocksOptions {
  maxListDepth?: number;
}

const DEFAULT_MARKDOWN_TO_BLOCKS_OPTIONS: Required<MarkdownToBlocksOptions> = {
  maxListDepth: 1,
};

const SAFE_MARKDOWN_TO_BLOCKS_OPTIONS: Required<MarkdownToBlocksOptions> = {
  maxListDepth: 0,
};

function getHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// Helper function to extract title from page properties
// Database items may have different title property names (e.g., "이름", "제목", "Name", etc.)
function extractPageTitle(properties: Record<string, any> | undefined): string {
  if (!properties) return "Untitled";

  // Find the property with type "title"
  for (const [, propValue] of Object.entries(properties)) {
    if (propValue?.type === "title" && propValue?.title?.length > 0) {
      return propValue.title[0]?.plain_text || "Untitled";
    }
  }

  return "Untitled";
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return new Date(0).toISOString();
}

function sortByLastEditedDesc<T extends { last_edited_time: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.last_edited_time).getTime() -
      new Date(a.last_edited_time).getTime()
  );
}

function createDeadline(timeoutMs: number): Deadline {
  const end = Date.now() + timeoutMs;
  return {
    hasTime: () => Date.now() < end,
    remaining: () => Math.max(0, end - Date.now()),
  };
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

async function searchNotionObjects(
  accessToken: string,
  objectType: "database" | "page",
  pageSize: number,
  timeoutMs?: number
): Promise<any[]> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify({
      filter: {
        property: "object",
        value: objectType,
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      page_size: pageSize,
    }),
  };

  const response = timeoutMs
    ? await fetchWithTimeout(`${NOTION_API_BASE}/search`, requestInit, timeoutMs)
    : await fetch(`${NOTION_API_BASE}/search`, requestInit);

  if (!response.ok) {
    throw new Error(`Failed to search Notion ${objectType}s`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function mapNotionDatabase(database: any): NotionDatabaseSummary {
  return {
    id: database.id,
    title: database.title?.[0]?.plain_text || "Untitled",
    url: database.url || `https://notion.so/${database.id.replace(/-/g, "")}`,
    last_edited_time: toIsoDate(database.last_edited_time),
  };
}

function mapNotionPage(page: any): NotionPageSummary {
  return {
    id: page.id,
    title: extractPageTitle(page.properties),
    url: page.url || `https://notion.so/${page.id.replace(/-/g, "")}`,
    last_edited_time: toIsoDate(page.last_edited_time),
  };
}

async function fetchBlockChildrenWithTimeout(
  accessToken: string,
  blockId: string,
  timeoutMs: number
): Promise<any[] | null> {
  try {
    const response = await fetchWithTimeout(
      `${NOTION_API_BASE}/blocks/${blockId}/children?page_size=100`,
      {
        method: "GET",
        headers: getHeaders(accessToken),
      },
      timeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return null;
  }
}

export async function createNotionPage(
  accessToken: string,
  targetId: string,
  title: string,
  content: string,
  format: string,
  duration: number,
  targetType: "database" | "page" = "database"
): Promise<string> {
  const createWithOptions = async (
    blockOptions: Required<MarkdownToBlocksOptions>
  ): Promise<string> => {
    const blocks = convertMarkdownToBlocks(content, blockOptions);

    if (targetType === "page") {
      const response = await fetch(`${NOTION_API_BASE}/pages`, {
        method: "POST",
        headers: getHeaders(accessToken),
        body: JSON.stringify({
          parent: { page_id: targetId },
          properties: {
            title: {
              title: [{ text: { content: title } }],
            },
          },
          children: blocks,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Notion API error: ${error.message || response.statusText}`);
      }

      const data = await response.json();
      return `https://notion.so/${data.id.replace(/-/g, "")}`;
    }

    try {
      const response = await fetch(`${NOTION_API_BASE}/pages`, {
        method: "POST",
        headers: getHeaders(accessToken),
        body: JSON.stringify({
          parent: { database_id: targetId },
          properties: {
            title: {
              title: [{ text: { content: title } }],
            },
            format: {
              select: { name: format },
            },
            duration: {
              number: duration,
            },
            created: {
              date: { start: new Date().toISOString() },
            },
          },
          children: blocks,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.message && error.message.includes("is not a property")) {
          console.log("Database properties not found, retrying with title only...");
          return await createNotionPageWithTitleOnly(accessToken, targetId, title, blocks);
        }
        throw new Error(`Notion API error: ${error.message || response.statusText}`);
      }

      const data = await response.json();
      return `https://notion.so/${data.id.replace(/-/g, "")}`;
    } catch (error) {
      if (error instanceof Error && error.message.includes("is not a property")) {
        console.log("Database properties not found, retrying with title only...");
        return await createNotionPageWithTitleOnly(accessToken, targetId, title, blocks);
      }
      throw error;
    }
  };

  try {
    return await createWithOptions(DEFAULT_MARKDOWN_TO_BLOCKS_OPTIONS);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("body failed validation") ||
        error.message.includes("children should be not present"))
    ) {
      console.warn(
        "[Notion] Validation failed with default markdown conversion, retrying in safe mode..."
      );
      return createWithOptions(SAFE_MARKDOWN_TO_BLOCKS_OPTIONS);
    }

    throw error;
  }
}

// title만으로 노션 페이지 생성 (기존 데이터베이스용)
async function createNotionPageWithTitleOnly(
  accessToken: string,
  databaseId: string,
  title: string,
  blocks: any[]
): Promise<string> {
  // 먼저 데이터베이스의 title 속성 이름을 확인
  const dbResponse = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  if (!dbResponse.ok) {
    throw new Error("Failed to fetch database schema");
  }

  const dbData = await dbResponse.json();

  // title 타입의 속성 이름 찾기 (기본값: "title" 또는 "Name" 또는 "이름")
  let titlePropertyName = "title";
  for (const [propName, propValue] of Object.entries(dbData.properties)) {
    if ((propValue as any).type === "title") {
      titlePropertyName = propName;
      break;
    }
  }

  const response = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        [titlePropertyName]: {
          title: [{ text: { content: title } }],
        },
      },
      children: blocks,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  return `https://notion.so/${data.id.replace(/-/g, "")}`;
}

// Helper to parse inline formatting (currently only bold)
function parseRichText(text: string): any[] {
  const parts: any[] = [];
  let currentText = "";
  let isBold = false;
  let i = 0;

  while (i < text.length) {
    if (text.slice(i, i + 2) === "**") {
      if (currentText) {
        parts.push({
          text: { content: currentText },
          annotations: { bold: isBold },
        });
        currentText = "";
      }
      isBold = !isBold;
      i += 2;
    } else {
      currentText += text[i];
      i++;
    }
  }

  if (currentText) {
    parts.push({
      text: { content: currentText },
      annotations: { bold: isBold },
    });
  }

  return parts.length > 0 ? parts : [{ text: { content: text } }];
}

function normalizeCodeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized) return "plain text";

  const supportedLanguages = new Set([
    "abap",
    "arduino",
    "bash",
    "basic",
    "c",
    "clojure",
    "coffeescript",
    "c++",
    "c#",
    "css",
    "dart",
    "diff",
    "docker",
    "elixir",
    "elm",
    "erlang",
    "flow",
    "fortran",
    "f#",
    "gherkin",
    "glsl",
    "go",
    "graphql",
    "groovy",
    "haskell",
    "html",
    "java",
    "javascript",
    "json",
    "julia",
    "kotlin",
    "latex",
    "less",
    "lisp",
    "livescript",
    "lua",
    "makefile",
    "markdown",
    "markup",
    "matlab",
    "mermaid",
    "nix",
    "objective-c",
    "ocaml",
    "pascal",
    "perl",
    "php",
    "plain text",
    "powershell",
    "prolog",
    "protobuf",
    "python",
    "r",
    "reason",
    "ruby",
    "rust",
    "sass",
    "scala",
    "scheme",
    "scss",
    "shell",
    "sql",
    "swift",
    "typescript",
    "vb.net",
    "verilog",
    "vhdl",
    "visual basic",
    "webassembly",
    "xml",
    "yaml",
    "java/c/c++/c#",
  ]);

  return supportedLanguages.has(normalized) ? normalized : "plain text";
}

function createParagraphBlock(text: string): any {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: parseRichText(text),
    },
  };
}

function createCodeBlock(code: string, language: string): any {
  return {
    type: "code",
    code: {
      rich_text: [
        {
          type: "text",
          text: { content: code || " " },
          annotations: { bold: false },
        },
      ],
      language: normalizeCodeLanguage(language),
    },
  };
}

function convertMarkdownToBlocks(
  markdown: string,
  options: MarkdownToBlocksOptions = DEFAULT_MARKDOWN_TO_BLOCKS_OPTIONS
): any[] {
  const lines = markdown.split("\n");
  const blocks: any[] = [];
  const listStack: Array<{ depth: number; block: any }> = [];
  let inTable = false;
  let tableRows: any[] = [];
  let inCodeBlock = false;
  let codeBlockLanguage = "";
  let codeBlockLines: string[] = [];
  const maxListDepth = Math.max(0, options.maxListDepth ?? DEFAULT_MARKDOWN_TO_BLOCKS_OPTIONS.maxListDepth);

  const getIndentWidth = (rawLine: string): number => {
    const leadingWhitespace = rawLine.match(/^[\t ]*/)?.[0] || "";
    return leadingWhitespace.replace(/\t/g, "    ").length;
  };

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) {
      inTable = false;
      tableRows = [];
      return;
    }

    blocks.push({
      type: "table",
      table: {
        table_width: tableRows[0].table_row.cells.length,
        has_column_header: true,
        has_row_header: false,
        children: tableRows,
      },
    });
    inTable = false;
    tableRows = [];
  };

  const appendNonListBlock = (block: any) => {
    listStack.length = 0;
    blocks.push(block);
  };

  const appendListBlock = (block: any, indent: number) => {
    const rawDepth = Math.max(0, Math.floor(indent / 4));
    const depth = Math.min(rawDepth, maxListDepth);

    while (listStack.length > 0 && depth <= listStack[listStack.length - 1].depth) {
      listStack.pop();
    }

    if (listStack.length === 0 || depth === 0) {
      blocks.push(block);
    } else {
      const parent = listStack[listStack.length - 1].block;
      const parentPayload = parent[parent.type];
      if (!parentPayload.children) {
        parentPayload.children = [];
      }
      parentPayload.children.push(block);
    }

    listStack.push({ depth, block });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      if (inTable) flushTable();
      if (!inCodeBlock) {
        listStack.length = 0;
        inCodeBlock = true;
        codeBlockLanguage = line.slice(3).trim();
        codeBlockLines = [];
      } else {
        appendNonListBlock(createCodeBlock(codeBlockLines.join("\n"), codeBlockLanguage));
        inCodeBlock = false;
        codeBlockLanguage = "";
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine.replace(/\r$/, ""));
      continue;
    }

    if (!line) {
      if (inTable) flushTable();
      listStack.length = 0;
      continue;
    }

    // Table detection
    if (line.startsWith("|")) {
      listStack.length = 0;

      // Table separator row (ignore |---|)
      if (line.match(/^\|[\s-]+\|/)) {
        continue;
      }

      const cells = line
        .split("|")
        .filter((cell, index, arr) => index !== 0 && index !== arr.length - 1)
        .map((cell) => ({
          type: "text",
          text: { content: cell.trim() },
          annotations: { bold: false },
        }));

      if (cells.length > 0) {
        const rowBlock = {
          type: "table_row",
          table_row: {
            cells: cells.map((cell) => [cell]),
          },
        };
        inTable = true;
        tableRows.push(rowBlock);
      }
      continue;
    }

    if (inTable) flushTable();

    const indentWidth = getIndentWidth(rawLine);

    if (line.startsWith("## ")) {
      appendNonListBlock({
        type: "heading_2",
        heading_2: {
          rich_text: parseRichText(line.replace("## ", "")),
        },
      });
      continue;
    }

    if (line.startsWith("### ")) {
      appendNonListBlock({
        type: "heading_3",
        heading_3: {
          rich_text: parseRichText(line.replace("### ", "")),
        },
      });
      continue;
    }

    const checkboxMatch = line.match(/^- \[(x|X| )\] (.+)$/);
    if (checkboxMatch) {
      appendListBlock(
        {
          type: "to_do",
          to_do: {
            rich_text: parseRichText(checkboxMatch[2]),
            checked: checkboxMatch[1].toLowerCase() === "x",
          },
        },
        indentWidth
      );
      continue;
    }

    const bulletMatch = line.match(/^[-*] (.+)$/);
    if (bulletMatch) {
      appendListBlock(
        {
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: parseRichText(bulletMatch[1]),
          },
        },
        indentWidth
      );
      continue;
    }

    const numberedMatch = line.match(/^\d+\. (.+)$/);
    if (numberedMatch) {
      appendListBlock(
        {
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: parseRichText(numberedMatch[1]),
          },
        },
        indentWidth
      );
      continue;
    }

    appendNonListBlock(createParagraphBlock(line));
  }

  if (inCodeBlock) {
    appendNonListBlock(createCodeBlock(codeBlockLines.join("\n"), codeBlockLanguage));
  }

  if (inTable) flushTable();

  return blocks;
}

async function getFastNotionSaveTargets(
  accessToken: string,
  limit: number
): Promise<NotionSaveTargetsResult> {
  let partial = false;
  const databaseMap = new Map<string, NotionDatabaseSummary>();
  const pageMap = new Map<string, NotionPageSummary>();

  const [databaseSearchResult, pageSearchResult] = await Promise.allSettled([
    searchNotionObjects(accessToken, "database", 100),
    searchNotionObjects(accessToken, "page", 100),
  ]);

  if (databaseSearchResult.status === "fulfilled") {
    databaseSearchResult.value.forEach((database) => {
      const mapped = mapNotionDatabase(database);
      databaseMap.set(mapped.id, mapped);
    });
  } else {
    partial = true;
    console.warn("[Notion] Fast database search failed:", databaseSearchResult.reason);
  }

  if (pageSearchResult.status === "fulfilled") {
    pageSearchResult.value.forEach((page) => {
      const mapped = mapNotionPage(page);
      pageMap.set(mapped.id, mapped);
    });
  } else {
    partial = true;
    console.warn("[Notion] Fast page search failed:", pageSearchResult.reason);
  }

  const combined = [
    ...Array.from(databaseMap.values()).map((database) => ({ ...database, type: "database" as const })),
    ...Array.from(pageMap.values()).map((page) => ({ ...page, type: "page" as const })),
  ];

  const limited = sortByLastEditedDesc(combined).slice(0, limit);

  return {
    databases: limited
      .filter((item) => item.type === "database")
      .map(({ type: _type, ...database }) => database),
    pages: limited
      .filter((item) => item.type === "page")
      .map(({ type: _type, ...page }) => page),
    meta: {
      mode: "fast",
      partial,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function getDeepNotionSaveTargets(
  accessToken: string,
  options?: Pick<NotionSaveTargetsOptions, "timeoutMs" | "maxDepth" | "concurrency">
): Promise<NotionSaveTargetsResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DEEP_TIMEOUT_MS;
  const maxDepth = options?.maxDepth ?? DEFAULT_DEEP_MAX_DEPTH;
  const concurrency = options?.concurrency ?? DEFAULT_DEEP_CONCURRENCY;
  const deadline = createDeadline(timeoutMs);
  const databaseMap = new Map<string, NotionDatabaseSummary>();
  const pageMap = new Map<string, NotionPageSummary>();
  const visitedBlocks = new Set<string>();
  const queue: NotionBlockTask[] = [];
  let partial = false;

  const searchTimeout = Math.max(300, Math.min(2500, deadline.remaining()));
  const [databaseSearchResult, pageSearchResult] = await Promise.allSettled([
    searchNotionObjects(accessToken, "database", 100, searchTimeout),
    searchNotionObjects(accessToken, "page", 100, searchTimeout),
  ]);

  if (databaseSearchResult.status === "fulfilled") {
    databaseSearchResult.value.forEach((database) => {
      const mapped = mapNotionDatabase(database);
      databaseMap.set(mapped.id, mapped);
    });
  } else {
    partial = true;
    console.warn("[Notion] Deep database search failed:", databaseSearchResult.reason);
  }

  if (pageSearchResult.status === "fulfilled") {
    pageSearchResult.value.forEach((page) => {
      const mapped = mapNotionPage(page);
      pageMap.set(mapped.id, mapped);
      queue.push({ id: mapped.id, depth: 0 });
    });
  } else {
    partial = true;
    console.warn("[Notion] Deep page search failed:", pageSearchResult.reason);
  }

  const workerCount = Math.max(1, Math.min(concurrency, DEFAULT_DEEP_CONCURRENCY));

  const workers = Array.from({ length: workerCount }, async () => {
    while (deadline.hasTime()) {
      const task = queue.shift();
      if (!task) break;

      if (task.depth > maxDepth || visitedBlocks.has(task.id)) {
        continue;
      }
      visitedBlocks.add(task.id);

      const blockTimeout = Math.max(
        200,
        Math.min(NOTION_EXPLORE_BLOCK_TIMEOUT_MS, deadline.remaining())
      );
      if (blockTimeout <= 0) {
        partial = true;
        break;
      }

      const blocks = await fetchBlockChildrenWithTimeout(
        accessToken,
        task.id,
        blockTimeout
      );
      if (!blocks) {
        partial = true;
        continue;
      }

      for (const block of blocks) {
        if (block.type === "child_database") {
          databaseMap.set(block.id, {
            id: block.id,
            title: block.child_database?.title || "Untitled",
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
            last_edited_time: toIsoDate(block.last_edited_time),
          });
          continue;
        }

        if (block.type === "child_page") {
          pageMap.set(block.id, {
            id: block.id,
            title: block.child_page?.title || "Untitled",
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
            last_edited_time: toIsoDate(block.last_edited_time),
          });
        }

        if (
          block.has_children &&
          BLOCKS_WITH_CHILDREN.includes(block.type) &&
          task.depth < maxDepth
        ) {
          queue.push({ id: block.id, depth: task.depth + 1 });
        }
      }
    }
  });

  await Promise.all(workers);

  if (!deadline.hasTime() || queue.length > 0) {
    partial = true;
  }

  const databases = sortByLastEditedDesc(Array.from(databaseMap.values()));
  const pages = sortByLastEditedDesc(Array.from(pageMap.values()));

  return {
    databases,
    pages,
    meta: {
      mode: "deep",
      partial,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function getNotionSaveTargets(
  accessToken: string,
  options: NotionSaveTargetsOptions
): Promise<NotionSaveTargetsResult> {
  if (options.mode === "fast") {
    const limit = options.limit ?? DEFAULT_FAST_LIMIT;
    return getFastNotionSaveTargets(accessToken, Math.max(1, limit));
  }

  return getDeepNotionSaveTargets(accessToken, options);
}

// Get user's databases
export async function getNotionDatabases(accessToken: string): Promise<NotionDatabaseSummary[]> {
  try {
    const result = await getNotionSaveTargets(accessToken, {
      mode: "deep",
      timeoutMs: DEFAULT_DEEP_TIMEOUT_MS,
      maxDepth: DEFAULT_DEEP_MAX_DEPTH,
      concurrency: DEFAULT_DEEP_CONCURRENCY,
    });
    return result.databases;
  } catch (error) {
    console.error("Failed to fetch Notion databases:", error);
    throw new Error("Failed to fetch databases");
  }
}

// Create a new database in a page
export async function createNotionDatabase(
  accessToken: string,
  pageId: string,
  title: string = "Archy Recordings"
): Promise<string> {
  try {
    const response = await fetch(`${NOTION_API_BASE}/databases`, {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({
        parent: {
          type: "page_id",
          page_id: pageId,
        },
        title: [
          {
            type: "text",
            text: {
              content: title,
            },
          },
        ],
        properties: {
          title: {
            title: {},
          },
          format: {
            select: {
              options: [
                { name: "meeting", color: "blue" },
                { name: "interview", color: "green" },
                { name: "lecture", color: "purple" },
                { name: "custom", color: "gray" },
              ],
            },
          },
          duration: {
            number: {
              format: "number",
            },
          },
          created: {
            date: {},
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("Failed to create Notion database:", error);
    throw new Error("Failed to create database");
  }
}

// Create a new standalone page in the workspace
export async function createNotionStandalonePage(
  accessToken: string,
  title: string
): Promise<string> {
  try {
    // First, find the first accessible page to use as parent
    const searchResponse = await fetch(`${NOTION_API_BASE}/search`, {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({
        filter: {
          property: "object",
          value: "page",
        },
        page_size: 1,
      }),
    });

    if (!searchResponse.ok) {
      throw new Error("Failed to search Notion");
    }

    const searchData = await searchResponse.json();

    let parentId: string | undefined;
    if (searchData.results.length > 0) {
      parentId = searchData.results[0].id;
    }

    if (!parentId) {
      throw new Error("No accessible pages found in workspace");
    }

    const response = await fetch(`${NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({
        parent: {
          type: "page_id",
          page_id: parentId,
        },
        properties: {
          title: {
            title: [{ text: { content: title } }],
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("Failed to create Notion page:", error);
    throw new Error("Failed to create page");
  }
}

// Get user's pages (for creating database)
export async function getNotionPages(accessToken: string): Promise<NotionPageSummary[]> {
  try {
    const result = await getNotionSaveTargets(accessToken, {
      mode: "deep",
      timeoutMs: DEFAULT_DEEP_TIMEOUT_MS,
      maxDepth: DEFAULT_DEEP_MAX_DEPTH,
      concurrency: DEFAULT_DEEP_CONCURRENCY,
    });
    return result.pages;
  } catch (error) {
    console.error("Failed to fetch Notion pages:", error);
    throw new Error("Failed to fetch pages");
  }
}

// OAuth helpers
export function getNotionAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.NOTION_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
  });

  if (state) {
    params.append("state", state);
  }

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

export async function exchangeNotionCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; workspace_id: string }> {
  // Use btoa for Edge Runtime compatibility instead of Buffer
  const credentials = `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`;
  const auth = btoa(credentials);

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Notion code");
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    workspace_id: data.workspace_id,
  };
}
