import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import cron from "node-cron";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";

import {
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  buildDiscordMetricText,
  chooseChatModel,
  generateGeminiText,
  runDailyPipeline,
  toKstYmd,
} from "./daily-runner.mjs";
import {
  getConversationForSummary,
  getConversationMemory,
  getConversationMessageCount,
  saveConversationSummary,
  saveConversationTurn,
  upsertMemoryFacts,
} from "./memory-store.mjs";

function getEnv(name, { optional = false, fallback = undefined, aliases = [] } = {}) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  if (fallback !== undefined && fallback !== null && fallback !== "") {
    return fallback;
  }

  if (!optional) {
    const suffix = aliases.length ? ` (or ${aliases.join(", ")})` : "";
    throw new Error(`Missing required environment variable: ${name}${suffix}`);
  }

  return fallback;
}

function getPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function truncate(value, max = 400) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function stripCodeFenceJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return raw;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(stripCodeFenceJson(text));
  } catch {
    return null;
  }
}

function shouldUseToolWorkflow(question) {
  const text = String(question || "").toLowerCase();
  const keywords = [
    "웹",
    "리서치",
    "조사",
    "검색",
    "찾아",
    "노션",
    "notion",
    "데이터베이스",
    "database",
    "구글 시트",
    "google sheet",
    "spreadsheet",
    "sheet",
    "스프레드시트",
    "tab 추가",
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseSpreadsheetId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return raw;
}

function toPlainTextRichText(content) {
  const text = String(content || "").trim();
  if (!text) return [];
  return [{ type: "text", text: { content: text.slice(0, 1900) } }];
}

function markdownToNotionBlocks(markdown) {
  const text = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const blocks = [];

  const pushParagraph = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: toPlainTextRichText(trimmed),
      },
    });
  };

  let paragraphBuffer = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    pushParagraph(paragraphBuffer.join(" "));
    paragraphBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: toPlainTextRichText(h1[1]) },
      });
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: toPlainTextRichText(h2[1]) },
      });
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: toPlainTextRichText(h3[1]) },
      });
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)/);
    if (bullet) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: toPlainTextRichText(bullet[1]) },
      });
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)/);
    if (numbered) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: toPlainTextRichText(numbered[1]) },
      });
      continue;
    }

    const quote = trimmed.match(/^>\s+(.+)/);
    if (quote) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: toPlainTextRichText(quote[1]) },
      });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  return blocks.slice(0, 100);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function webSearchViaTavily(query, maxResults = 5) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.max(1, Math.min(maxResults, 10)),
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows.slice(0, maxResults).map((row) => ({
    title: String(row?.title || "(제목 없음)").trim(),
    url: normalizeUrl(row?.url || ""),
    snippet: String(row?.content || "").trim().slice(0, 300),
  }));
}

function extractDuckDuckGoResults(html, maxResults = 5) {
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links = [];
  const snippets = [];

  let linkMatch = null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const rawHref = linkMatch[1] || "";
    const href = rawHref.includes("uddg=")
      ? decodeURIComponent(rawHref.split("uddg=")[1].split("&")[0] || "")
      : rawHref;
    links.push({
      url: normalizeUrl(href),
      title: stripHtml(linkMatch[2] || ""),
    });
  }

  let snippetMatch = null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(snippetMatch[1] || ""));
  }

  return links.slice(0, maxResults).map((item, idx) => ({
    ...item,
    snippet: snippets[idx] || "",
  }));
}

async function webSearchViaDuckDuckGo(query, maxResults = 5) {
  const url = `https://duckduckgo.com/html/?${new URLSearchParams({ q: query }).toString()}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ArchyAgent/1.0; +https://www.archynotes.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`);
  }

  const html = await response.text();
  return extractDuckDuckGoResults(html, maxResults);
}

async function runWebSearch({ query, max_results = 5 }) {
  const q = String(query || "").trim();
  if (!q) throw new Error("web_search: query is required");

  const maxResults = Math.max(1, Math.min(Number(max_results) || 5, 10));
  let results = await webSearchViaTavily(q, maxResults);
  if (!results) {
    results = await webSearchViaDuckDuckGo(q, maxResults);
  }

  return {
    query: q,
    results,
  };
}

async function runWebRead({ url, max_chars = 5000 }) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("web_read: url is required");
  const maxChars = Math.max(500, Math.min(Number(max_chars) || 5000, 20_000));

  const noScheme = normalized.replace(/^https?:\/\//i, "");
  const jinaUrl = `https://r.jina.ai/http://${noScheme}`;

  let text = "";
  try {
    const response = await fetchWithTimeout(jinaUrl, {}, 30_000);
    if (!response.ok) throw new Error(`r.jina.ai failed: ${response.status}`);
    text = await response.text();
  } catch {
    const fallback = await fetchWithTimeout(normalized, {}, 30_000);
    if (!fallback.ok) {
      throw new Error(`web_read fallback failed: ${fallback.status}`);
    }
    text = stripHtml(await fallback.text());
  }

  return {
    url: normalized,
    excerpt: String(text || "").trim().slice(0, maxChars),
  };
}

let notionClientSingleton = null;
function getNotionToolClient() {
  if (notionClientSingleton) return notionClientSingleton;
  const auth =
    process.env.NOTION_INTERNAL_INTEGRATION_TOKEN || process.env.NOTION_API_TOKEN || process.env.NOTION_TOKEN;
  if (!auth) {
    throw new Error("Notion token is missing. Set NOTION_INTERNAL_INTEGRATION_TOKEN.");
  }
  notionClientSingleton = new NotionClient({ auth });
  return notionClientSingleton;
}

function buildNotionPropertyByField(field) {
  const name = String(field?.name || "").trim();
  const type = String(field?.type || "").trim().toLowerCase();
  if (!name || !type) return null;

  if (type === "title") return [name, { title: {} }];
  if (type === "rich_text") return [name, { rich_text: {} }];
  if (type === "number") return [name, { number: { format: field?.format || "number" } }];
  if (type === "date") return [name, { date: {} }];
  if (type === "checkbox") return [name, { checkbox: {} }];
  if (type === "url") return [name, { url: {} }];
  if (type === "email") return [name, { email: {} }];
  if (type === "phone_number") return [name, { phone_number: {} }];

  const options = Array.isArray(field?.options)
    ? field.options.map((opt) => ({ name: String(opt?.name || opt || "").trim(), color: opt?.color || "default" }))
    : [];
  const normalizedOptions = options.filter((opt) => opt.name);

  if (type === "select") return [name, { select: { options: normalizedOptions } }];
  if (type === "multi_select") return [name, { multi_select: { options: normalizedOptions } }];
  if (type === "status") return [name, { status: { options: normalizedOptions } }];

  return null;
}

async function runNotionCreatePage(args = {}) {
  const notion = getNotionToolClient();
  const title = String(args.title || "").trim();
  if (!title) throw new Error("notion_create_page: title is required");

  const parentPageId = String(args.parent_page_id || DEFAULT_NOTION_PARENT_PAGE_ID || "").trim();
  const parentDataSourceId = String(args.parent_data_source_id || DEFAULT_NOTION_DATA_SOURCE_ID || "").trim();
  const children = markdownToNotionBlocks(args.content_markdown || "");

  if (parentDataSourceId) {
    const titlePropertyName = String(args.title_property_name || "Name").trim();
    const created = await notion.pages.create({
      parent: { data_source_id: parentDataSourceId },
      properties: {
        [titlePropertyName]: {
          title: toPlainTextRichText(title),
        },
      },
      children,
    });
    return { id: created.id, url: created.url, parent: "data_source" };
  }

  if (!parentPageId) {
    throw new Error(
      "notion_create_page: parent_page_id or parent_data_source_id is required (or set NOTION_DEFAULT_PARENT_PAGE_ID)."
    );
  }

  const created = await notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: toPlainTextRichText(title),
      },
    },
    children,
  });

  return { id: created.id, url: created.url, parent: "page" };
}

async function runNotionAppendPage(args = {}) {
  const notion = getNotionToolClient();
  const pageId = String(args.page_id || "").trim();
  if (!pageId) throw new Error("notion_append_page: page_id is required");
  const children = markdownToNotionBlocks(args.content_markdown || "");
  if (children.length === 0) throw new Error("notion_append_page: content_markdown is required");

  await notion.blocks.children.append({
    block_id: pageId,
    children,
  });
  return { page_id: pageId, appended_blocks: children.length };
}

async function runNotionUpdatePageTitle(args = {}) {
  const notion = getNotionToolClient();
  const pageId = String(args.page_id || "").trim();
  const title = String(args.title || "").trim();
  if (!pageId || !title) throw new Error("notion_update_page_title: page_id and title are required");

  const page = await notion.pages.retrieve({ page_id: pageId });
  const titleProperty = Object.entries(page?.properties || {}).find(([, prop]) => prop?.type === "title");
  if (!titleProperty) {
    throw new Error("notion_update_page_title: title property not found");
  }

  const [titlePropertyName] = titleProperty;
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [titlePropertyName]: {
        title: toPlainTextRichText(title),
      },
    },
  });

  return { page_id: pageId, title };
}

async function runNotionCreateDatabase(args = {}) {
  const notion = getNotionToolClient();
  const title = String(args.title || "").trim();
  if (!title) throw new Error("notion_create_database: title is required");

  const parentPageId = String(args.parent_page_id || DEFAULT_NOTION_PARENT_PAGE_ID || "").trim();
  if (!parentPageId) {
    throw new Error("notion_create_database: parent_page_id is required (or set NOTION_DEFAULT_PARENT_PAGE_ID).");
  }

  const fields = Array.isArray(args.fields) ? args.fields : [];
  const properties = {};
  for (const field of fields) {
    const entry = buildNotionPropertyByField(field);
    if (entry) properties[entry[0]] = entry[1];
  }

  const hasTitle = Object.values(properties).some((prop) => prop && typeof prop === "object" && "title" in prop);
  if (!hasTitle) {
    properties.Name = { title: {} };
  }

  const created = await notion.databases.create({
    parent: { page_id: parentPageId },
    title: [{ type: "text", text: { content: title } }],
    properties,
  });

  return { id: created.id, url: created.url, title };
}

async function runNotionUpdateDatabase(args = {}) {
  const notion = getNotionToolClient();
  const databaseId = String(args.database_id || "").trim();
  if (!databaseId) throw new Error("notion_update_database: database_id is required");

  const payload = { database_id: databaseId };
  const title = String(args.title || "").trim();
  if (title) {
    payload.title = [{ type: "text", text: { content: title } }];
  }

  const addFields = Array.isArray(args.add_fields) ? args.add_fields : [];
  if (addFields.length > 0) {
    payload.properties = {};
    for (const field of addFields) {
      const entry = buildNotionPropertyByField(field);
      if (entry) payload.properties[entry[0]] = entry[1];
    }
  }

  const updated = await notion.databases.update(payload);
  return { id: updated.id, url: updated.url || null };
}

let sheetsClientPromise = null;
async function getSheetsToolClient() {
  if (sheetsClientPromise) return sheetsClientPromise;
  const clientEmail = getEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const rawKey = getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClientPromise = auth.authorize().then(() => google.sheets({ version: "v4", auth }));
  return sheetsClientPromise;
}

function normalizeSheetValues(values) {
  if (!Array.isArray(values)) return [[String(values ?? "")]];
  if (values.length === 0) return [[]];
  if (Array.isArray(values[0])) {
    return values.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : cell)));
  }
  return [values.map((cell) => (cell === null || cell === undefined ? "" : cell))];
}

function resolveSpreadsheetId(input) {
  const fromInput = parseSpreadsheetId(input);
  if (fromInput) return fromInput;
  const fromEnv = parseSpreadsheetId(DEFAULT_SPREADSHEET_ID);
  if (fromEnv) return fromEnv;
  throw new Error("spreadsheet_id is required (or set ARCHY_USER_SHEET_ID).");
}

async function runSheetsAddSheet(args = {}) {
  const sheets = await getSheetsToolClient();
  const spreadsheetId = resolveSpreadsheetId(args.spreadsheet_id);
  const title = String(args.title || "").trim();
  if (!title) throw new Error("sheets_add_sheet: title is required");

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              ...(Number.isInteger(args.index) ? { index: args.index } : {}),
            },
          },
        },
      ],
    },
  });

  const added = response.data.replies?.[0]?.addSheet?.properties || null;
  return { spreadsheet_id: spreadsheetId, title, sheet_id: added?.sheetId ?? null };
}

async function runSheetsUpdateCells(args = {}) {
  const sheets = await getSheetsToolClient();
  const spreadsheetId = resolveSpreadsheetId(args.spreadsheet_id);
  const range = String(args.range || "").trim();
  if (!range) throw new Error("sheets_update_cells: range is required");

  const values = normalizeSheetValues(args.values);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: String(args.value_input_option || "USER_ENTERED"),
    requestBody: { values },
  });
  return { spreadsheet_id: spreadsheetId, range, rows: values.length };
}

async function runSheetsAppendRows(args = {}) {
  const sheets = await getSheetsToolClient();
  const spreadsheetId = resolveSpreadsheetId(args.spreadsheet_id);
  const range = String(args.range || "").trim();
  if (!range) throw new Error("sheets_append_rows: range is required");

  const values = normalizeSheetValues(args.values);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: String(args.value_input_option || "USER_ENTERED"),
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return { spreadsheet_id: spreadsheetId, range, rows: values.length };
}

async function runSheetsRead(args = {}) {
  const sheets = await getSheetsToolClient();
  const spreadsheetId = resolveSpreadsheetId(args.spreadsheet_id);
  const range = String(args.range || "").trim();
  if (!range) throw new Error("sheets_read: range is required");
  const maxRows = Math.max(1, Math.min(Number(args.max_rows) || 30, 200));

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = Array.isArray(response.data.values) ? response.data.values.slice(0, maxRows) : [];
  return { spreadsheet_id: spreadsheetId, range, values };
}

const TOOL_DEFINITIONS = [
  {
    name: "web_search",
    description: "웹 검색 결과 목록 조회",
    args: { query: "string", max_results: "number(optional)" },
  },
  {
    name: "web_read",
    description: "특정 URL 본문 요약용 텍스트 읽기",
    args: { url: "string", max_chars: "number(optional)" },
  },
  {
    name: "notion_create_page",
    description: "노션 페이지 생성 + 본문 작성",
    args: {
      title: "string",
      content_markdown: "string(optional)",
      parent_page_id: "string(optional)",
      parent_data_source_id: "string(optional)",
      title_property_name: "string(optional)",
    },
  },
  {
    name: "notion_append_page",
    description: "노션 페이지 본문 추가",
    args: { page_id: "string", content_markdown: "string" },
  },
  {
    name: "notion_update_page_title",
    description: "노션 페이지 제목 수정",
    args: { page_id: "string", title: "string" },
  },
  {
    name: "notion_create_database",
    description: "노션 데이터베이스 생성",
    args: {
      title: "string",
      parent_page_id: "string(optional)",
      fields: 'array(optional): [{"name":"Name","type":"title"}]',
    },
  },
  {
    name: "notion_update_database",
    description: "노션 데이터베이스 제목/필드 업데이트",
    args: {
      database_id: "string",
      title: "string(optional)",
      add_fields: "array(optional)",
    },
  },
  {
    name: "sheets_add_sheet",
    description: "Google Sheet에 새 탭 추가",
    args: { spreadsheet_id: "string(optional)", title: "string", index: "number(optional)" },
  },
  {
    name: "sheets_update_cells",
    description: "Google Sheet 셀 범위 덮어쓰기",
    args: {
      spreadsheet_id: "string(optional)",
      range: "string (예: 시트1!A1:C3)",
      values: "2d array",
      value_input_option: "USER_ENTERED|RAW(optional)",
    },
  },
  {
    name: "sheets_append_rows",
    description: "Google Sheet 행 추가",
    args: {
      spreadsheet_id: "string(optional)",
      range: "string (예: 시트1!A:C)",
      values: "2d array",
      value_input_option: "USER_ENTERED|RAW(optional)",
    },
  },
  {
    name: "sheets_read",
    description: "Google Sheet 범위 읽기",
    args: { spreadsheet_id: "string(optional)", range: "string", max_rows: "number(optional)" },
  },
];

function normalizePlannedToolCalls(plan) {
  const toolCalls = Array.isArray(plan?.tool_calls) ? plan.tool_calls : [];
  return toolCalls
    .slice(0, TOOL_MAX_CALLS)
    .map((call) => {
      const tool = String(call?.tool || "").trim();
      const args = call?.args && typeof call.args === "object" ? call.args : {};
      if (!tool) return null;
      return { tool, args };
    })
    .filter(Boolean);
}

async function planToolCalls({ question, memoryContext }) {
  const plannerPrompt = [
    "사용자 요청을 보고 툴 실행 계획을 JSON으로만 출력해라.",
    "출력 형식:",
    '{"needs_tools":true|false,"assistant_brief":"string","tool_calls":[{"tool":"...","args":{}}]}',
    "규칙:",
    `1) tool_calls는 최대 ${TOOL_MAX_CALLS}개`,
    "2) tool은 제공된 목록만 사용",
    "3) 값이 불확실하면 assistant_brief에 어떤 값이 필요한지 짧게 작성",
    "4) 웹 조사 요청이면 web_search를 우선 사용하고, 필요하면 web_read를 추가",
    "5) 노션 페이지/DB 생성·수정 요청은 반드시 notion_* 툴 사용",
    "6) 구글시트 새 탭/편집 요청은 반드시 sheets_* 툴 사용",
    "7) JSON 외 텍스트 금지",
    "",
    "[기본 설정]",
    `- 기본 Google Spreadsheet ID: ${DEFAULT_SPREADSHEET_ID || "(미설정)"}`,
    `- 기본 Notion parent page id: ${DEFAULT_NOTION_PARENT_PAGE_ID || "(미설정)"}`,
    `- 기본 Notion data source id: ${DEFAULT_NOTION_DATA_SOURCE_ID || "(미설정)"}`,
    "",
    "[사용 가능 툴]",
    JSON.stringify(TOOL_DEFINITIONS, null, 2),
    "",
    "[대화 장기 메모 요약]",
    memoryContext?.summaryText || "(없음)",
    "",
    "[사용자 요청]",
    question,
  ].join("\n");

  const raw = await generateGeminiText({
    model: GEMINI_PRO_MODEL,
    systemInstruction:
      "너는 JSON 기반 실행계획 생성기다. 요청 수행에 필요한 최소 툴만 선택하고 JSON만 출력한다.",
    userPrompt: plannerPrompt,
    temperature: 0.1,
    maxOutputTokens: 1800,
  });

  return parseJsonSafe(raw);
}

async function executePlannedToolCall({ tool, args }) {
  if (tool === "web_search") return runWebSearch(args);
  if (tool === "web_read") return runWebRead(args);
  if (tool === "notion_create_page") return runNotionCreatePage(args);
  if (tool === "notion_append_page") return runNotionAppendPage(args);
  if (tool === "notion_update_page_title") return runNotionUpdatePageTitle(args);
  if (tool === "notion_create_database") return runNotionCreateDatabase(args);
  if (tool === "notion_update_database") return runNotionUpdateDatabase(args);
  if (tool === "sheets_add_sheet") return runSheetsAddSheet(args);
  if (tool === "sheets_update_cells") return runSheetsUpdateCells(args);
  if (tool === "sheets_append_rows") return runSheetsAppendRows(args);
  if (tool === "sheets_read") return runSheetsRead(args);
  throw new Error(`Unsupported tool: ${tool}`);
}

function compactToolResult(result) {
  const text = JSON.stringify(result);
  if (text.length <= 2500) return result;
  if (Array.isArray(result?.results)) {
    return {
      ...result,
      results: result.results.slice(0, 5),
      _truncated: true,
    };
  }
  if (typeof result?.excerpt === "string") {
    return {
      ...result,
      excerpt: result.excerpt.slice(0, 2000),
      _truncated: true,
    };
  }
  return { _truncated: true, preview: text.slice(0, 2000) };
}

async function buildToolWorkflowResponse({ question, systemInstruction, plan, executions }) {
  const executionJson = JSON.stringify(executions, null, 2);
  const responsePrompt = [
    "아래 사용자 요청과 툴 실행 결과를 바탕으로 최종 답변을 작성해라.",
    "요구사항:",
    "1) 실행 완료 항목/실패 항목을 분리해서 말해라.",
    "2) 생성된 Notion URL, Sheet 범위 등 핵심 결과를 빠짐없이 포함해라.",
    "3) 실패가 있으면 바로 필요한 추가 정보만 한 줄로 요청해라.",
    "4) 너무 장황하지 말고 실무 톤으로 작성해라.",
    "",
    "[사용자 요청]",
    question,
    "",
    "[플랜]",
    JSON.stringify(plan, null, 2),
    "",
    "[실행 결과]",
    executionJson,
  ].join("\n");

  const text = await generateGeminiText({
    model: GEMINI_PRO_MODEL,
    systemInstruction,
    userPrompt: responsePrompt,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });

  if (text?.trim()) return text.trim();

  const successCount = executions.filter((item) => item.ok).length;
  const failCount = executions.length - successCount;
  return `요청 작업 실행 결과: 성공 ${successCount}건, 실패 ${failCount}건`;
}

async function maybeHandleToolWorkflow({ question, memoryContext, systemInstruction }) {
  if (!shouldUseToolWorkflow(question)) {
    return { handled: false, response: null };
  }

  const plan = await planToolCalls({ question, memoryContext });
  const toolCalls = normalizePlannedToolCalls(plan);

  if (toolCalls.length === 0) {
    const brief = String(plan?.assistant_brief || "").trim();
    if (brief) {
      return { handled: true, response: brief };
    }
    return { handled: false, response: null };
  }

  const executions = [];
  for (const toolCall of toolCalls) {
    try {
      const result = await executePlannedToolCall(toolCall);
      executions.push({
        tool: toolCall.tool,
        args: toolCall.args,
        ok: true,
        result: compactToolResult(result),
      });
    } catch (error) {
      executions.push({
        tool: toolCall.tool,
        args: toolCall.args,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const response = await buildToolWorkflowResponse({
    question,
    systemInstruction,
    plan: {
      needs_tools: Boolean(plan?.needs_tools),
      assistant_brief: plan?.assistant_brief || "",
      tool_calls: toolCalls,
    },
    executions,
  });

  return { handled: true, response };
}

function isBusinessCriticalQuestion(question) {
  const text = String(question || "").toLowerCase();
  const keywords = [
    "지표",
    "전환",
    "리텐션",
    "활성화",
    "결제",
    "매출",
    "전략",
    "로드맵",
    "실험",
    "가설",
    "리스크",
    "우선순위",
    "온보딩",
    "퍼널",
    "cohort",
    "funnel",
    "retention",
    "activation",
    "conversion",
    "pricing",
    "revenue",
    "kpi",
    "okr",
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

function buildAdvisorSystemInstruction({ question, model }) {
  const businessCritical = isBusinessCriticalQuestion(question);

  const sharedRules = [
    "너는 Archy 서비스 운영 어시스턴트다.",
    "톤은 친근하고 캐주얼하게 유지하되, 중요한 내용은 전문가처럼 정확히 말한다.",
    "핵심 결론을 먼저 말하고, 근거/가정/리스크를 분명히 구분한다.",
    "문맥상 자연스러울 때만 가벼운 드립이나 ㅋㅋ를 0~1회 사용한다.",
    "중요한 업무 항목은 절대 생략하지 않는다.",
    "한국어로 답한다.",
    `기본 사용 모델은 ${GEMINI_PRO_MODEL}이며, 가벼운 요청만 ${GEMINI_FLASH_MODEL}로 처리한다. 이번 응답 모델은 ${model}이다.`,
  ];

  if (businessCritical) {
    sharedRules.push(
      "업무/전략 질문에서는 단정적 표현 전에 근거를 제시하고, 실행 액션을 우선순위로 제안한다.",
      "형식보다 내용 정확도를 우선하며, 필요 시 짧아도 빠짐없이 답한다."
    );
  } else {
    sharedRules.push(
      "가벼운 질문에는 부담 없는 톤으로 답하되, 도움되는 한 줄 액션을 함께 준다."
    );
  }

  return sharedRules.join(" ");
}

function buildAdvisorResponseGuide(question) {
  const businessCritical = isBusinessCriticalQuestion(question);
  if (businessCritical) {
    return [
      "답변 형식:",
      "1) 한 줄 결론",
      "2) 근거(숫자/사실/가정)",
      "3) 바로 실행 액션(1~3개, 우선순위 순)",
      "4) 추가 확인이 필요한 데이터(있으면만)",
    ].join("\n");
  }

  return [
    "답변 형식:",
    "1) 짧은 결론",
    "2) 이유 또는 맥락",
    "3) 다음 액션 1개",
  ].join("\n");
}

const DISCORD_BOT_TOKEN = getEnv("DISCORD_BOT_TOKEN", {
  aliases: ["DISCORD_TOKEN"],
});
const DAILY_CHANNEL_ID = getEnv("DISCORD_DAILY_CHANNEL_ID", {
  aliases: ["DISCORD_CHANNEL_ID"],
});
const GUILD_ID = getEnv("DISCORD_GUILD_ID", {
  optional: true,
  aliases: ["DISCORD_SERVER_ID"],
});
const CHAT_CHANNEL_IDS = new Set(
  (process.env.DISCORD_CHAT_CHANNEL_IDS || process.env.DISCORD_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const CHAT_REPORT_CACHE_SECONDS = getPositiveInt(process.env.ARCHY_CHAT_REPORT_CACHE_SECONDS, 300);
const MEMORY_RECENT_TURNS = getPositiveInt(process.env.ARCHY_MEMORY_RECENT_TURNS, 12);
const MEMORY_SUMMARY_MIN_TURNS = getPositiveInt(process.env.ARCHY_MEMORY_SUMMARY_MIN_TURNS, 24);
const MEMORY_SUMMARY_KEEP_RECENT_TURNS = getPositiveInt(
  process.env.ARCHY_MEMORY_SUMMARY_KEEP_RECENT_TURNS,
  10
);
const MEMORY_SUMMARY_MIN_INTERVAL_MINUTES = getPositiveInt(
  process.env.ARCHY_MEMORY_SUMMARY_MIN_INTERVAL_MINUTES,
  180
);
const TOOL_MAX_CALLS = getPositiveInt(process.env.ARCHY_TOOL_MAX_CALLS, 5);
const DEFAULT_SPREADSHEET_ID = process.env.ARCHY_USER_SHEET_ID || "";
const DEFAULT_NOTION_PARENT_PAGE_ID = process.env.NOTION_DEFAULT_PARENT_PAGE_ID || "";
const DEFAULT_NOTION_DATA_SOURCE_ID = process.env.NOTION_DEFAULT_DATA_SOURCE_ID || "";

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName("help").setDescription("사용 가능한 Archy 명령 안내"),
  new SlashCommandBuilder().setName("stats").setDescription("최신 Archy 핵심 지표 요약"),
  new SlashCommandBuilder().setName("daily").setDescription("데일리 배치를 즉시 실행"),
].map((command) => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

let dailyRunInFlight = null;
const quickReportCache = new Map();

function invalidateQuickReportCache() {
  quickReportCache.clear();
}

async function getCachedQuickReport({ targetYmd = null } = {}) {
  const now = Date.now();
  const key = targetYmd || "__default__";
  const cached = quickReportCache.get(key);

  if (cached?.report && now < cached.expiresAt) {
    return cached.report;
  }

  const report = await runDailyPipeline({
    runDate: new Date(),
    targetYmd,
    dryRun: true,
    skipStrategicReview: true,
  });

  quickReportCache.set(key, {
    report,
    expiresAt: now + CHAT_REPORT_CACHE_SECONDS * 1000,
  });

  return report;
}

function formatKstDateTime(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

function formatSignedInt(value) {
  if (!Number.isFinite(value)) return "0";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDeltaPctPoint(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return "비교값 없음";
  }
  const delta = (current - previous) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%p`;
}

function formatCountCard(current, previous) {
  if (!Number.isFinite(current)) return "데이터 없음";
  if (!Number.isFinite(previous)) return `${current}명\n전일 비교: -`;
  return `${current}명\n전일 대비 ${formatSignedInt(current - previous)}명`;
}

function formatRateCard(current, previous) {
  if (current === null || current === undefined) return "미조회\n전일 비교: -";
  return `${formatPercent(current)}\n전일 대비 ${formatDeltaPctPoint(current, previous)}`;
}

function truncateForField(value, max = 200) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatHeavyUserNamesOnly(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return "데이터 없음";
  return list
    .slice(0, 3)
    .map((item, idx) => `${idx + 1}. ${item.name || "이름 없음"}`)
    .join("\n");
}

function splitMessage(content, limit = 1800) {
  if (!content || content.length <= limit) return [content];
  const chunks = [];
  let remaining = String(content);

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let splitAt = -1;

    // Prefer splitting by paragraph, then line, then whitespace.
    splitAt = window.lastIndexOf("\n\n");
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = window.lastIndexOf("\n");
    }
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = window.lastIndexOf(" ");
    }
    if (splitAt < Math.floor(limit * 0.3)) {
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks.filter(Boolean);
}

async function sendLongMessage(channel, content, options = {}) {
  const { withSequence = false } = options;
  const chunks = splitMessage(content);
  const total = chunks.length;

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) continue;
    const decorated = withSequence && total > 1 ? `(${i + 1}/${total})\n${chunk}` : chunk;
    await channel.send({ content: decorated });
  }
}

function pickDailyStartMessage() {
  const candidates = [
    "데일리 리포트 보내드릴게요. 잠시만요.",
    "오늘자 데일리 지표 정리해서 바로 공유할게요.",
    "좋아요, 최신 데일리 리포트 지금 만들고 있어요.",
    "오케이, 데이터 집계해서 데일리 리포트 올릴게요.",
    "금방 끝나요. 데일리 리포트 준비 중입니다.",
  ];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function buildMetricComparisonContext(report) {
  const previous = report.previous?.notion;
  const fallbackRates = report.previous?.fallbackRates || {};
  const fallbackCounts = report.previous?.fallbackCounts || {};

  return {
    prevUserCount: previous?.totalSignups ?? fallbackCounts.totalSignups ?? null,
    prevOnboarding: previous?.onboardingRate ?? fallbackRates.onboarding ?? null,
    prevPwa: previous?.pwaRate ?? fallbackRates.pwa ?? null,
    prevIntegration: previous?.integrationRate ?? fallbackRates.integrationAny ?? null,
    prevActivation: previous?.activationRate ?? fallbackRates.activation30d ?? null,
    prevPayment: previous?.paymentRate ?? fallbackRates.payment ?? null,
    prevConversion: previous?.conversionRate ?? report.amplitudeConversion?.previousRate ?? null,
    conversionMissing: report.amplitudeConversion?.currentRate === null,
  };
}

function buildDailyEmbed({ report, asOfDate }) {
  const { amplitudeSourceText } = buildDiscordMetricText(report);
  const asOfKst = formatKstDateTime(asOfDate);
  const heavyUserText = formatHeavyUserNamesOnly(report.heavyUserTop3);
  const ctx = buildMetricComparisonContext(report);

  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle(`📊 Archy 데일리 리포트 · ${report.dailyLabel}`)
    .setDescription("KST 기준 데일리 운영 스냅샷")
    .addFields(
      { name: "🗓️ 집계기준", value: `${report.dailyLabel} (${report.targetYmd})`, inline: true },
      { name: "🕒 기준시각", value: asOfKst, inline: true },
      { name: "🧭 데이터 상태", value: ctx.conversionMissing ? "가입전환율 미조회" : "정상", inline: true },
      { name: "👥 유저 수", value: formatCountCard(report.counts.totalSignups, ctx.prevUserCount), inline: true },
      {
        name: "🔁 가입전환율",
        value: ctx.conversionMissing
          ? "미조회\n전일 비교: -"
          : formatRateCard(report.amplitudeConversion.currentRate, ctx.prevConversion),
        inline: true,
      },
      { name: "✅ 온보딩율", value: formatRateCard(report.rates.onboarding, ctx.prevOnboarding), inline: true },
      { name: "📲 PWA 설치율", value: formatRateCard(report.rates.pwa, ctx.prevPwa), inline: true },
      { name: "🔗 연동율", value: formatRateCard(report.rates.integrationAny, ctx.prevIntegration), inline: true },
      { name: "⚡ 활성화율(30일)", value: formatRateCard(report.rates.activation30d, ctx.prevActivation), inline: true },
      { name: "💳 결제율", value: formatRateCard(report.rates.payment, ctx.prevPayment), inline: true },
      { name: "🏆 헤비 유저 TOP3", value: heavyUserText, inline: false }
    )
    .setTimestamp(asOfDate instanceof Date ? asOfDate : new Date(asOfDate));

  if (ctx.conversionMissing) {
    embed.addFields({
      name: "🧪 가입전환율 진단",
      value: truncateForField(amplitudeSourceText || "원인 미상", 900),
      inline: false,
    });
  }

  return embed;
}

function buildStatsEmbed({ report, asOfDate }) {
  const { amplitudeSourceText } = buildDiscordMetricText(report);
  const asOfKst = formatKstDateTime(asOfDate);
  const heavyUserText = formatHeavyUserNamesOnly(report.heavyUserTop3);
  const ctx = buildMetricComparisonContext(report);

  const embed = new EmbedBuilder()
    .setColor(0x17a2d4)
    .setTitle("📈 Archy 실시간 지표")
    .setDescription("KST 기준 최신 운영 스냅샷")
    .addFields(
      { name: "🕒 기준시각", value: asOfKst, inline: true },
      { name: "🧭 데이터 상태", value: ctx.conversionMissing ? "가입전환율 미조회" : "정상", inline: true },
      { name: "👥 유저 수", value: formatCountCard(report.counts.totalSignups, ctx.prevUserCount), inline: true },
      {
        name: "🔁 가입전환율",
        value: ctx.conversionMissing
          ? "미조회\n전일 비교: -"
          : formatRateCard(report.amplitudeConversion.currentRate, ctx.prevConversion),
        inline: true,
      },
      { name: "✅ 온보딩율", value: formatRateCard(report.rates.onboarding, ctx.prevOnboarding), inline: true },
      { name: "📲 PWA 설치율", value: formatRateCard(report.rates.pwa, ctx.prevPwa), inline: true },
      { name: "🔗 연동율", value: formatRateCard(report.rates.integrationAny, ctx.prevIntegration), inline: true },
      { name: "⚡ 활성화율(30일)", value: formatRateCard(report.rates.activation30d, ctx.prevActivation), inline: true },
      { name: "💳 결제율", value: formatRateCard(report.rates.payment, ctx.prevPayment), inline: true },
      { name: "🏆 헤비 유저 TOP3", value: heavyUserText, inline: false }
    );

  if (ctx.conversionMissing) {
    embed.addFields({
      name: "🧪 가입전환율 진단",
      value: truncateForField(amplitudeSourceText || "원인 미상", 900),
      inline: false,
    });
  }

  return embed;
}

async function runDailyAndPost() {
  if (dailyRunInFlight) return dailyRunInFlight;

  dailyRunInFlight = (async () => {
    const channel = await client.channels.fetch(DAILY_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Daily channel is missing or not text-based");
    }

    await channel.send(pickDailyStartMessage());
    const report = await runDailyPipeline({
      runDate: new Date(),
      dryRun: false,
      runWeeklyWhenSunday: true,
      skipStrategicReview: false,
    });

    invalidateQuickReportCache();

    const embed = buildDailyEmbed({ report, asOfDate: new Date() });
    await channel.send({ embeds: [embed] });

    if (report.strategicReview) {
      await sendLongMessage(channel, `**🧠 오늘의 전략 리뷰**\n\n${report.strategicReview}`);
    }

    return report;
  })();

  try {
    return await dailyRunInFlight;
  } finally {
    dailyRunInFlight = null;
  }
}

function formatMemoryContext(memory) {
  const summaryText = memory?.summary ? truncate(memory.summary, 1400) : "(없음)";

  const factsText = (memory?.facts || [])
    .slice(0, 12)
    .map((fact, idx) => `${idx + 1}. [${fact.fact_type || "general"}] ${fact.fact_key}: ${fact.fact_value}`)
    .join("\n");

  const turnsText = (memory?.recentTurns || [])
    .slice(-MEMORY_RECENT_TURNS)
    .map((turn, idx) => {
      const role = turn.role === "assistant" ? "어시스턴트" : turn.role === "system" ? "시스템" : "사용자";
      return `${idx + 1}. ${role}: ${truncate(turn.content, 240)}`;
    })
    .join("\n");

  return {
    summaryText,
    factsText: factsText || "(없음)",
    turnsText: turnsText || "(없음)",
  };
}

async function maybeRefreshConversationSummary({ guildId, channelId, userId }) {
  try {
    const transcript = await getConversationForSummary({
      guildId,
      channelId,
      userId,
      limit: 80,
    });

    if (!transcript.enabled || !transcript.threadId) return;

    const totalTurns = transcript.messages.length;
    if (totalTurns < MEMORY_SUMMARY_MIN_TURNS) return;

    const summaryUpdatedAt = transcript.summaryUpdatedAt ? new Date(transcript.summaryUpdatedAt) : null;
    const ageMinutes = summaryUpdatedAt
      ? Math.floor((Date.now() - summaryUpdatedAt.getTime()) / (60 * 1000))
      : null;

    if (ageMinutes !== null && ageMinutes < MEMORY_SUMMARY_MIN_INTERVAL_MINUTES) {
      return;
    }

    const summarizeUntil = Math.max(0, totalTurns - MEMORY_SUMMARY_KEEP_RECENT_TURNS);
    const chunk = transcript.messages.slice(0, summarizeUntil);
    if (chunk.length < 10) return;

    const conversationText = chunk
      .map((item) => {
        const role = item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user";
        return `- ${role}: ${truncate(item.content, 320)}`;
      })
      .join("\n");

    const summaryPrompt = [
      "아래 대화를 장기 메모 형태로 압축하라.",
      "반드시 JSON만 출력.",
      "형식:",
      '{"summary":"...","facts":[{"key":"...","value":"...","type":"goal|constraint|preference|decision|status","confidence":0.0}]}',
      "규칙:",
      "1) summary는 6~10문장, 사실 중심",
      "2) facts는 최대 12개",
      "3) key는 짧고 중복 없는 식별자",
      "4) 확실하지 않으면 confidence를 낮춰라",
      "5) 한국어로 작성",
      "\n[대화]\n",
      conversationText,
    ].join("\n");

    const raw = await generateGeminiText({
      model: GEMINI_FLASH_MODEL,
      systemInstruction: "당신은 대화 메모리 압축기다. JSON 이외 텍스트를 출력하지 마라.",
      userPrompt: summaryPrompt,
      temperature: 0.1,
      maxOutputTokens: 1400,
    });

    const parsed = parseJsonSafe(raw);
    const summary = parsed?.summary ? String(parsed.summary).trim() : String(raw || "").trim();
    if (!summary) return;

    await saveConversationSummary({
      threadId: transcript.threadId,
      summary,
      sourceModel: GEMINI_FLASH_MODEL,
    });

    if (Array.isArray(parsed?.facts) && parsed.facts.length > 0) {
      await upsertMemoryFacts({
        guildId,
        userId,
        facts: parsed.facts,
      });
    }
  } catch (error) {
    console.warn("Memory summary refresh failed:", error);
  }
}

async function persistConversationExchange({ message, question, answer, model }) {
  try {
    await saveConversationTurn({
      guildId: message.guild.id,
      channelId: message.channelId,
      userId: message.author.id,
      userMessage: question,
      assistantMessage: answer,
      model,
    });

    const count = await getConversationMessageCount({
      guildId: message.guild.id,
      channelId: message.channelId,
      userId: message.author.id,
    });

    if (count >= MEMORY_SUMMARY_MIN_TURNS) {
      void maybeRefreshConversationSummary({
        guildId: message.guild.id,
        channelId: message.channelId,
        userId: message.author.id,
      });
    }
  } catch (error) {
    console.warn("Memory persistence failed:", error);
  }
}

async function answerAdvisorQuestion(message, question) {
  const model = chooseChatModel(question);
  const quickReport = await getCachedQuickReport();

  const memory = await getConversationMemory({
    guildId: message.guild.id,
    channelId: message.channelId,
    userId: message.author.id,
    recentLimit: MEMORY_RECENT_TURNS,
  });

  const memoryContext = formatMemoryContext(memory);

  const systemInstruction = buildAdvisorSystemInstruction({ question, model });

  const toolWorkflow = await maybeHandleToolWorkflow({
    question,
    memoryContext,
    systemInstruction,
  });
  if (toolWorkflow.handled && toolWorkflow.response) {
    await sendLongMessage(message.channel, toolWorkflow.response);
    await persistConversationExchange({
      message,
      question,
      answer: toolWorkflow.response,
      model,
    });
    return;
  }

  const prompt = [
    `현재 시각(KST): ${new Date().toISOString()} / KST 날짜: ${toKstYmd(new Date())}`,
    "아래 컨텍스트를 바탕으로 질문에 답해라.",
    buildAdvisorResponseGuide(question),
    "[장기 메모 요약]",
    memoryContext.summaryText,
    "[사용자/프로젝트 사실 메모]",
    memoryContext.factsText,
    "[최근 대화]",
    memoryContext.turnsText,
    "[최신 데일리 집계 요약(JSON)]",
    JSON.stringify(
      {
        targetYmd: quickReport.targetYmd,
        counts: quickReport.counts,
        rates: quickReport.rates,
        amplitudeConversion: quickReport.amplitudeConversion,
        heavyUserTop3: quickReport.heavyUserTop3,
        workProgress: {
          found: quickReport.workProgress?.found,
          completedCount: quickReport.workProgress?.completed?.length || 0,
          pendingCount: quickReport.workProgress?.pending?.length || 0,
          summary: quickReport.workProgress?.text || "",
        },
      },
      null,
      2
    ),
    "[질문]",
    question,
  ].join("\n\n");

  await message.channel.sendTyping();
  const answer = await generateGeminiText({
    model,
    systemInstruction,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: 2048,
  });

  if (!answer) {
    await message.reply("모델 응답이 비어 있습니다. 다시 질문해 주세요.");
    return;
  }

  await sendLongMessage(message.channel, answer);
  await persistConversationExchange({ message, question, answer, model });
}

function parseLegacyCommand(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!archy")) return null;
  return {
    name: "legacy",
  };
}

async function registerSlashCommands() {
  const appId = client.application?.id || client.user?.id;
  if (!appId) {
    console.warn("Slash command registration skipped: application id not found");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), {
      body: SLASH_COMMANDS,
    });
    console.log(`Registered guild slash commands (${GUILD_ID})`);
    return;
  }

  await rest.put(Routes.applicationCommands(appId), {
    body: SLASH_COMMANDS,
  });
  console.log("Registered global slash commands");
}

client.on(Events.ClientReady, async () => {
  console.log(`Discord bot ready: ${client.user?.tag}`);

  if (GUILD_ID) {
    console.log(`Scoped guild: ${GUILD_ID}`);
  }

  try {
    await registerSlashCommands();
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }

  cron.schedule(
      "0 0 * * *",
      async () => {
        try {
          await runDailyAndPost();
        } catch (error) {
          console.error("Scheduled daily run failed:", error);
        }
      },
    {
      timezone: "Asia/Seoul",
    }
  );

  console.log("Scheduled daily pipeline at 00:00 Asia/Seoul");
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (GUILD_ID && interaction.guildId !== GUILD_ID) return;

    if (interaction.commandName === "help") {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: [
          "Archy 명령:",
          "- `/daily` : 데일리 배치 즉시 실행",
          "- `/stats` : 최신 핵심 지표 요약",
          "- `/help` : 도움말",
          "채팅 질의는 봇 멘션으로 입력하세요.",
          "웹 조사, 노션 페이지/DB 생성·편집, Google Sheet 탭/셀 편집 요청도 멘션으로 처리할 수 있어요.",
          "예: `@봇 오늘 가입전환율 해석해줘`",
        ].join("\n"),
      });
      return;
    }

    if (interaction.commandName === "stats") {
      const now = new Date();
      const targetYmd = toKstYmd(now);
      await interaction.deferReply();
      const report = await getCachedQuickReport({ targetYmd });
      const embed = buildStatsEmbed({ report, asOfDate: now });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "daily") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await runDailyAndPost();
      await interaction.deleteReply().catch(() => {});
      return;
    }
  } catch (error) {
    console.error("Interaction handler error:", error);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (GUILD_ID && message.guild.id !== GUILD_ID) return;

    const legacyCommand = parseLegacyCommand(message.content);
    if (legacyCommand) {
      await message.reply(
        [
          "운영 명령은 슬래시를 사용해 주세요: `/help`, `/stats`, `/daily`",
          "전략 질문은 `!archy ask` 대신 봇 멘션으로 입력해 주세요.",
          `예: <@${client.user?.id}> 오늘 데이터 해석해줘`,
        ].join("\n")
      );
      return;
    }

    const isMentioned = message.mentions.has(client.user?.id || "");
    const inChatChannel = CHAT_CHANNEL_IDS.size === 0 || CHAT_CHANNEL_IDS.has(message.channelId);
    if (!isMentioned || !inChatChannel) return;

    const question = message.content.replace(new RegExp(`<@!?${client.user?.id}>`, "g"), "").trim();
    if (!question) {
      await message.reply("질문을 함께 남겨주세요.");
      return;
    }

    await answerAdvisorQuestion(message, question);
  } catch (error) {
    console.error("Message handler error:", error);
    try {
      await message.reply("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      // Ignore secondary send failures.
    }
  }
});

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error("Discord login failed:", error);
  process.exitCode = 1;
});
