import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";

import {
  FIXED_EXCLUDED_USER_IDS,
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  buildDiscordMetricText,
  chooseChatModel,
  generateGeminiText,
  getWorkProgressContext,
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
import {
  classifyStrategicReviewFeedback,
  parseStrategicReviewProposalDecision,
  runStrategicReviewOptimizationCycle,
} from "./strategic-review-optimizer.mjs";
import {
  applyStrategicReviewProposal,
  attachStrategicReviewDiscordMessages,
  findProposalByDiscordMessageId,
  getLatestCompletedStrategicReviewRun,
  getLatestStrategicReviewEvaluation,
  getOpenStrategicReviewProposal,
  getStrategicReviewProposalById,
  getStrategicReviewRunByPrimaryMessageId,
  getStrategicReviewRunById,
  markStrategicReviewProposalMessage,
  saveStrategicReviewFeedback,
  updateStrategicReviewProposalStatus,
} from "./strategic-review-store.mjs";
import {
  buildStrategicReviewProposalButtonCustomId,
  getStrategicReviewProposalStatusMeta,
  parseStrategicReviewProposalButtonCustomId,
} from "./strategic-review-proposal-ui.mjs";

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

function getNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return fallback;
  return Math.floor(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseAdminClient() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function logBotEvent(event, payload = {}) {
  const line = {
    ts: new Date().toISOString(),
    scope: "discord-bot",
    event,
    ...payload,
    level: "info",
    message: `discord-bot.${event}`,
  };
  console.log(JSON.stringify(line));
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

const NOTION_WRITING_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    title: { type: "string" },
    content_markdown: { type: "string" },
    discord_summary: { type: "string" },
  },
  required: ["title", "content_markdown", "discord_summary"],
  additionalProperties: false,
});

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
    "할 일",
    "할일",
    "todo",
    "업무",
    "작업",
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

function normalizeNotionId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const fromUuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (fromUuid) return fromUuid[0].toLowerCase();

  const compact = raw.match(/[0-9a-f]{32}/i);
  if (compact) {
    const s = compact[0].toLowerCase();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }

  return raw;
}

function kstNowParts(input = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
    .formatToParts(input)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatYmd(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(ymd, deltaDays) {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((n) => Number(n));
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function detectTaskKeyword(question) {
  const text = String(question || "").toLowerCase();
  const taskKeywords = ["해야", "해야 할", "할 일", "할일", "업무", "작업", "todo"];
  return taskKeywords.some((keyword) => text.includes(keyword));
}

function isNotionCreationRequest(question) {
  const text = String(question || "");
  const lowered = text.toLowerCase();
  const hasCreateVerb = ["만들", "생성", "올려", "등록", "추가", "작성", "정리"].some((keyword) =>
    lowered.includes(keyword)
  );
  const hasNotionTarget =
    lowered.includes("노션") ||
    lowered.includes("notion") ||
    [...NOTION_MAIN_PAGE_ALIASES].some((alias) => alias && lowered.includes(alias));
  const looksLikeDatedTask = detectTaskKeyword(text) && detectDateExpression(text);
  return hasCreateVerb && (hasNotionTarget || looksLikeDatedTask);
}

function isLongformWritingRequest(question) {
  const lowered = String(question || "").toLowerCase();
  const writingKeywords = [
    "메일",
    "이메일",
    "email",
    "e-mail",
    "문안",
    "초안",
    "draft",
    "작성",
    "써줘",
    "써 줘",
    "정중",
    "격식",
    "공손",
    "안내문",
    "공지문",
    "제안서",
    "소개글",
    "카피",
    "copy",
  ];
  return writingKeywords.some((keyword) => lowered.includes(keyword));
}

function wantsDraftPreview(question) {
  const lowered = String(question || "").toLowerCase();
  const previewKeywords = [
    "미리보기",
    "본문도",
    "본문 보여",
    "내용도 보여",
    "내용도 보내",
    "디스코드에도",
    "여기에도",
    "채널에도",
    "복붙해서",
    "붙여서 보여",
  ];
  return previewKeywords.some((keyword) => lowered.includes(keyword));
}

function needsHeavyUserContext(question) {
  const lowered = String(question || "").toLowerCase();
  return (
    lowered.includes("헤비 유저") ||
    lowered.includes("heavy user") ||
    (lowered.includes("상위") && lowered.includes("유저"))
  );
}

function detectDateExpression(question) {
  const text = String(question || "");
  const lowered = text.toLowerCase();
  if (
    lowered.includes("오늘") ||
    lowered.includes("내일") ||
    lowered.includes("모레") ||
    lowered.includes("이번주") ||
    lowered.includes("다음주")
  ) {
    return true;
  }

  const patterns = [
    /\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?/i,
    /\d{1,2}\s*월\s*\d{1,2}\s*일/i,
    /(?:^|[^0-9])\d{1,2}\s*\/\s*\d{1,2}(?!\d)/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function parseDueDateFromQuestion(question, now = new Date()) {
  const text = String(question || "");
  const lowered = text.toLowerCase();
  const nowKst = kstNowParts(now);
  const todayYmd = formatYmd(nowKst.year, nowKst.month, nowKst.day);

  if (lowered.includes("오늘")) return { ymd: todayYmd, source: "today" };
  if (lowered.includes("내일")) return { ymd: addDaysYmd(todayYmd, 1), source: "tomorrow" };
  if (lowered.includes("모레")) return { ymd: addDaysYmd(todayYmd, 2), source: "day_after_tomorrow" };
  if (lowered.includes("이번주")) {
    const daysUntilSunday = (7 - nowKst.weekday) % 7;
    return { ymd: addDaysYmd(todayYmd, daysUntilSunday), source: "this_week" };
  }
  if (lowered.includes("다음주")) {
    const daysUntilSunday = (7 - nowKst.weekday) % 7;
    return { ymd: addDaysYmd(todayYmd, daysUntilSunday + 7), source: "next_week" };
  }

  const explicitYmdPatterns = [/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/i];
  for (const pattern of explicitYmdPatterns) {
    const matched = text.match(pattern);
    if (!matched) continue;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return { ymd: formatYmd(year, month, day), source: "explicit_ymd" };
  }

  const explicitMonthDayPatterns = [
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일/i,
    /(?:^|[^0-9])(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/,
  ];
  for (const pattern of explicitMonthDayPatterns) {
    const matched = text.match(pattern);
    if (!matched) continue;
    const month = Number(matched[1]);
    const day = Number(matched[2]);
    const year = nowKst.year;
    if (!isValidDateParts(year, month, day)) return null;
    return { ymd: formatYmd(year, month, day), source: "explicit_md" };
  }

  return null;
}

function extractTitleFromQuestion(question, fallback = "업무 항목") {
  const text = String(question || "").trim();
  if (!text) return fallback;

  const explicitTitle = text.match(/제목(?:은|:)?\s*([^\n,]+)/i);
  if (explicitTitle?.[1]) return explicitTitle[1].trim().slice(0, 120);

  const taskTail = text.match(/(?:할\s*일|업무|작업|todo)\s*[:：]\s*(.+)$/i);
  if (taskTail?.[1]) return taskTail[1].trim().slice(0, 120);

  return text
    .replace(/노션|notion|페이지|문서|만들어줘|만들어 줘|생성해줘|생성해 줘|올려줘|올려 줘/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function formatHeavyUserContext(items = []) {
  const rows = Array.isArray(items) ? items.slice(0, 3) : [];
  if (rows.length === 0) return "헤비 유저 상위 데이터 없음";
  return rows.map((item, idx) => `${idx + 1}. ${item.name || "이름 없음"} (${item.count || 0}회)`).join("\n");
}

let heavyUserContextCache = {
  value: [],
  expiresAt: 0,
};

async function getCachedHeavyUserTop3() {
  const now = Date.now();
  if (heavyUserContextCache.expiresAt > now && Array.isArray(heavyUserContextCache.value)) {
    return heavyUserContextCache.value;
  }

  const supabase = getSupabaseAdminClient();
  const excluded = new Set(FIXED_EXCLUDED_USER_IDS);
  const [usersRes, recordingsRes] = await Promise.all([
    supabase.from("users").select("id,name,email"),
    supabase.from("recordings").select("user_id"),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (recordingsRes.error) throw recordingsRes.error;

  const users = (usersRes.data || []).filter((user) => !excluded.has(user.id));
  const activeUserIds = new Set(users.map((user) => user.id));
  const counts = new Map();

  for (const row of recordingsRes.data || []) {
    const userId = row.user_id;
    if (!activeUserIds.has(userId)) continue;
    counts.set(userId, (counts.get(userId) || 0) + 1);
  }

  const top3 = [...counts.entries()]
    .map(([userId, count]) => {
      const user = users.find((item) => item.id === userId);
      return {
        userId,
        name: user?.name || user?.email || userId,
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  heavyUserContextCache = {
    value: top3,
    expiresAt: now + 5 * 60 * 1000,
  };

  return top3;
}

async function maybeGenerateDraftForToolCall({ question, toolCall, traceId }) {
  if (toolCall?.tool !== "notion_create_page" || !isLongformWritingRequest(question)) {
    return toolCall;
  }

  const currentTitle = String(toolCall.args?.title || "").trim() || extractTitleFromQuestion(question, "새 노션 페이지");
  let contextText = "";

  if (needsHeavyUserContext(question)) {
    try {
      const heavyUserTop3 = await getCachedHeavyUserTop3();
      contextText = [
        "현재 운영 지표 참고:",
        `- 기준 날짜(KST): ${toKstYmd(new Date())}`,
        "- 헤비 유저 상위 3명",
        formatHeavyUserContext(heavyUserTop3),
      ].join("\n");
    } catch (error) {
      logBotEvent("tool.draft.context.fail", {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const prompt = [
    "사용자 요청을 바탕으로 Notion 페이지 제목과 본문 초안을 JSON으로 작성해라.",
    '출력 형식: {"title":"string","content_markdown":"string","discord_summary":"string"}',
    "규칙:",
    "1) 한국어로 작성",
    "2) content_markdown은 Notion에 바로 넣을 수 있는 markdown만 사용",
    "3) 메일/이메일/문안 요청이면 `# 메일 초안`, `## 메일 제목`, `## 메일 본문`, `## 개인화 포인트` 구조를 포함",
    "4) 문체는 정중하고 자연스럽게, 과장하거나 확인되지 않은 사실을 꾸며내지 말 것",
    "5) 불확실한 개인 정보는 [이름], [최근 사용 포인트] 같은 placeholder로 처리",
    "6) 여러 명에게 보낼 내용이면 재사용 가능한 공통 초안으로 작성",
    "7) title은 Notion 페이지 제목으로 자연스럽고 짧게 작성",
    "8) discord_summary는 1~2문장, 120자 이내",
    "",
    "[현재 기본 제목]",
    currentTitle,
    "",
    "[추가 운영 컨텍스트]",
    contextText || "(없음)",
    "",
    "[사용자 요청]",
    question,
  ].join("\n");

  logBotEvent("tool.draft.start", {
    traceId,
    tool: toolCall.tool,
    model: GEMINI_PRO_MODEL,
    titlePreview: truncate(currentTitle, 120),
  });

  const raw = await generateGeminiText({
    model: GEMINI_PRO_MODEL,
    systemInstruction:
      "너는 Archy 운영팀의 한국어 문안 작성기다. 실제 발송 가능한 수준으로 정중하고 명확하게 쓰고, JSON만 출력한다.",
    userPrompt: prompt,
    temperature: 0.3,
    maxOutputTokens: 1800,
    thinkingLevel: "medium",
    responseMimeType: "application/json",
    responseJsonSchema: NOTION_WRITING_RESPONSE_JSON_SCHEMA,
  });

  const parsed = parseJsonSafe(raw);
  const title = String(parsed?.title || currentTitle).trim() || currentTitle;
  const contentMarkdown = String(parsed?.content_markdown || "").trim();
  const discordSummary = String(parsed?.discord_summary || "").trim();

  logBotEvent("tool.draft.done", {
    traceId,
    tool: toolCall.tool,
    model: GEMINI_PRO_MODEL,
    titlePreview: truncate(title, 120),
    contentLength: contentMarkdown.length,
    discordSummaryPreview: truncate(discordSummary, 160),
  });

  if (!contentMarkdown) {
    return toolCall;
  }

  return {
    ...toolCall,
    args: {
      ...toolCall.args,
      title,
      content_markdown: contentMarkdown,
      discord_summary: discordSummary,
    },
  };
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

function pickDatePropertyName(properties = {}) {
  const entries = Object.entries(properties || {});
  const preferred = ["날짜", "일자", "마감", "마감일", "due date", "due", "date"];
  const preferredEntry = entries.find(([name, prop]) => {
    if (prop?.type !== "date") return false;
    const lowered = String(name).toLowerCase();
    return preferred.some((keyword) => lowered.includes(keyword));
  });
  if (preferredEntry) return preferredEntry[0];
  const fallback = entries.find(([, prop]) => prop?.type === "date");
  return fallback?.[0] || null;
}

function pickStatusDefault(statusProperty) {
  const options = statusProperty?.status?.options || statusProperty?.select?.options || [];
  if (!Array.isArray(options) || options.length === 0) return null;

  const preferredNames = ["Not started", "Todo", "To do", "미착수", "대기", "백로그"];
  const found = options.find((option) =>
    preferredNames.some((keyword) => String(option?.name || "").toLowerCase() === keyword.toLowerCase())
  );
  if (found?.name) return found.name;
  return String(options[0]?.name || "").trim() || null;
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

async function runNotionCreateWorkItem(args = {}) {
  const notion = getNotionToolClient();
  const dataSourceId = normalizeNotionId(
    String(args.parent_data_source_id || process.env.NOTION_WORK_DB_DATA_SOURCE_ID || "").trim()
  );
  if (!dataSourceId) {
    throw new Error("workdb_create_item: NOTION_WORK_DB_DATA_SOURCE_ID is required.");
  }

  const title = String(args.title || "").trim();
  if (!title) throw new Error("workdb_create_item: title is required");

  const dueDate = String(args.due_date || "").trim();
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("workdb_create_item: due_date(YYYY-MM-DD) is required");
  }

  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const properties = dataSource?.properties || {};
  const titleEntry = Object.entries(properties).find(([, prop]) => prop?.type === "title");
  const titlePropertyName = titleEntry?.[0] || null;
  const datePropertyName = pickDatePropertyName(properties);

  if (!titlePropertyName) {
    throw new Error("workdb_create_item: title property not found in 업무 DB schema.");
  }
  if (!datePropertyName) {
    throw new Error("workdb_create_item: date property not found in 업무 DB schema.");
  }

  const pageProperties = {
    [titlePropertyName]: { title: toPlainTextRichText(title) },
    [datePropertyName]: { date: { start: dueDate } },
  };

  const statusEntry = Object.entries(properties).find(([, prop]) => prop?.type === "status" || prop?.type === "select");
  if (statusEntry) {
    const [statusPropertyName, statusProperty] = statusEntry;
    const defaultStatus = pickStatusDefault(statusProperty);
    if (defaultStatus) {
      if (statusProperty?.type === "status") {
        pageProperties[statusPropertyName] = { status: { name: defaultStatus } };
      } else if (statusProperty?.type === "select") {
        pageProperties[statusPropertyName] = { select: { name: defaultStatus } };
      }
    }
  }

  const created = await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: pageProperties,
  });

  return {
    id: created.id,
    url: created.url,
    data_source_id: dataSourceId,
    due_date: dueDate,
    title,
    title_property: titlePropertyName,
    date_property: datePropertyName,
  };
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
    name: "notion_create_work_item",
    description: "업무 DB에 날짜 기반 업무 아이템 생성",
    args: {
      title: "string",
      due_date: "YYYY-MM-DD",
      parent_data_source_id: "string(optional)",
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

function resolveMainNotionPageId() {
  const fromMainUrl = normalizeNotionId(NOTION_MAIN_PAGE_URL);
  if (fromMainUrl) return fromMainUrl;

  const fromLegacyDefault = normalizeNotionId(DEFAULT_NOTION_PARENT_PAGE_ID);
  if (fromLegacyDefault) return fromLegacyDefault;

  throw new Error("ARCHY_NOTION_MAIN_PAGE_URL is invalid. Set a valid Notion page URL or page ID.");
}

function classifyNotionTargetRoute(question) {
  const text = String(question || "");
  const lowered = text.toLowerCase();
  const aliasMatched = [...NOTION_MAIN_PAGE_ALIASES].some((alias) => alias && lowered.includes(alias));
  const hasTask = detectTaskKeyword(text);
  const hasDate = detectDateExpression(text);

  if (hasTask && hasDate) {
    const parsed = parseDueDateFromQuestion(text);
    if (!parsed?.ymd) {
      return {
        route: "workdb_error",
        aliasMatched,
        reason: "dated_task_without_parseable_date",
        errorMessage: "날짜를 인식하지 못했습니다. 예: 2026-03-10, 3월 10일, 내일, 이번주",
      };
    }
    return {
      route: "workdb",
      aliasMatched,
      reason: "dated_task",
      dueDate: parsed.ymd,
      dateSource: parsed.source,
    };
  }

  return {
    route: "main_page",
    aliasMatched,
    reason: aliasMatched ? "main_page_alias" : "default_main_page",
  };
}

function applyNotionAutoRouting({ question, toolCalls, traceId }) {
  const hasNotionCreate = toolCalls.some(
    (call) =>
      call.tool === "notion_create_page" ||
      call.tool === "notion_create_database" ||
      call.tool === "notion_create_work_item"
  );
  if (!hasNotionCreate) {
    if (isNotionCreationRequest(question)) {
      return applyNotionAutoRouting({
        question,
        toolCalls: [{ tool: "notion_create_page", args: { title: extractTitleFromQuestion(question, "새 노션 페이지") } }],
        traceId,
      });
    }
    return { toolCalls, route: null };
  }

  const route = classifyNotionTargetRoute(question);
  const nextToolCalls = [];

  if (route.route === "workdb_error") {
    logBotEvent("notion.route.selected", {
      traceId,
      route: route.route,
      reason: route.reason,
      aliasMatched: route.aliasMatched,
    });
    return {
      error: `업무 DB 생성 요청으로 해석했지만 ${route.errorMessage}`,
      toolCalls: [],
      route,
    };
  }

  if (route.route === "workdb" && !String(process.env.NOTION_WORK_DB_DATA_SOURCE_ID || "").trim()) {
    return {
      error: "업무 DB 생성 요청으로 해석했지만 NOTION_WORK_DB_DATA_SOURCE_ID 설정이 없습니다.",
      toolCalls: [],
      route,
    };
  }

  let mainPageId = null;
  const ensureMainPageId = () => {
    if (!mainPageId) {
      mainPageId = resolveMainNotionPageId();
    }
    return mainPageId;
  };

  for (const call of toolCalls) {
    if (call.tool === "notion_create_work_item") {
      if (route.route === "workdb") {
        nextToolCalls.push({
          tool: "notion_create_work_item",
          args: {
            ...call.args,
            title: String(call.args?.title || "").trim() || extractTitleFromQuestion(question, "업무 항목"),
            due_date: String(call.args?.due_date || route.dueDate || "").trim(),
            parent_data_source_id:
              String(call.args?.parent_data_source_id || process.env.NOTION_WORK_DB_DATA_SOURCE_ID || "").trim(),
          },
        });
      } else {
        nextToolCalls.push({
          tool: "notion_create_page",
          args: {
            title: String(call.args?.title || "").trim() || extractTitleFromQuestion(question, "새 노션 페이지"),
            content_markdown: String(call.args?.content_markdown || "").trim(),
            parent_page_id: ensureMainPageId(),
          },
        });
      }
      continue;
    }

    if (call.tool === "notion_create_page") {
      if (route.route === "workdb") {
        const title = String(call.args?.title || "").trim() || extractTitleFromQuestion(question, "업무 항목");
        nextToolCalls.push({
          tool: "notion_create_work_item",
          args: {
            title,
            due_date: route.dueDate,
            parent_data_source_id: process.env.NOTION_WORK_DB_DATA_SOURCE_ID || "",
          },
        });
        continue;
      }

      nextToolCalls.push({
        tool: "notion_create_page",
        args: {
          ...call.args,
          title: String(call.args?.title || "").trim() || extractTitleFromQuestion(question, "새 노션 페이지"),
          parent_page_id: ensureMainPageId(),
          parent_data_source_id: "",
        },
      });
      continue;
    }

    if (call.tool === "notion_create_database") {
      nextToolCalls.push({
        tool: "notion_create_database",
        args: {
          ...call.args,
          parent_page_id: ensureMainPageId(),
        },
      });
      continue;
    }

    nextToolCalls.push(call);
  }

  logBotEvent("notion.route.selected", {
    traceId,
    route: route.route,
    reason: route.reason,
    aliasMatched: route.aliasMatched,
    dueDate: route.dueDate || null,
  });

  return { toolCalls: nextToolCalls, route };
}

function summarizeSingleToolExecution(item) {
  if (!item?.ok) {
    return `- [실패] ${item.tool}: ${item.error || "알 수 없는 오류"}`;
  }

  const result = item.result || {};
  if (item.tool === "notion_create_page") {
    return `- [성공] 노션 페이지 생성: ${result.url || result.id || "(url 없음)"}`;
  }
  if (item.tool === "notion_create_work_item") {
    return `- [성공] 업무 DB 아이템 생성: ${result.url || result.id || "(url 없음)"} (마감 ${result.due_date || "-"})`;
  }
  if (item.tool === "notion_create_database") {
    return `- [성공] 노션 데이터베이스 생성: ${result.url || result.id || "(url 없음)"}`;
  }
  if (item.tool === "notion_append_page") {
    return `- [성공] 노션 페이지 본문 추가: ${result.page_id || "-"}`;
  }
  if (item.tool === "notion_update_page_title") {
    return `- [성공] 노션 페이지 제목 수정: ${result.page_id || "-"}`;
  }
  if (item.tool === "sheets_update_cells" || item.tool === "sheets_append_rows" || item.tool === "sheets_read") {
    return `- [성공] ${item.tool}: ${result.range || "-"}`;
  }
  if (item.tool === "sheets_add_sheet") {
    return `- [성공] 시트 탭 생성: ${result.title || "-"}`;
  }
  if (item.tool === "web_search") {
    const count = Array.isArray(result.results) ? result.results.length : 0;
    return `- [성공] 웹 검색: 결과 ${count}건`;
  }
  if (item.tool === "web_read") {
    return `- [성공] 웹 본문 읽기: ${result.url || "-"}`;
  }
  return `- [성공] ${item.tool}`;
}

function inferFollowupLineFromFailures(executions) {
  const failed = executions.filter((item) => !item.ok);
  if (failed.length === 0) return null;
  const errorText = failed.map((item) => String(item.error || "")).join(" ").toLowerCase();

  if (errorText.includes("notion_work_db_data_source_id")) {
    return "추가 확인: NOTION_WORK_DB_DATA_SOURCE_ID 환경변수와 Notion integration 공유 권한을 확인해 주세요.";
  }
  if (errorText.includes("date property not found")) {
    return "추가 확인: 업무 DB에 날짜(Date) 타입 속성이 있는지 확인해 주세요.";
  }
  if (errorText.includes("title property not found")) {
    return "추가 확인: 업무 DB에 제목(Title) 타입 속성이 있는지 확인해 주세요.";
  }
  if (errorText.includes("날짜를 인식하지")) {
    return "추가 확인: 날짜를 명확히 적어 주세요. 예: 2026-03-10, 3월 10일, 내일";
  }

  return "추가 확인: 실패 항목의 오류 메시지를 확인한 뒤 같은 요청을 다시 보내 주세요.";
}

async function planToolCalls({ question, memoryContext, workProgressText }) {
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
    "7) 날짜+업무 요청이면 notion_create_work_item을 우선 사용",
    "8) JSON 외 텍스트 금지",
    "",
    "[기본 설정]",
    `- 기본 Google Spreadsheet ID: ${DEFAULT_SPREADSHEET_ID || "(미설정)"}`,
    `- 기본 Notion parent page id: ${DEFAULT_NOTION_PARENT_PAGE_ID || "(미설정)"}`,
    `- 기본 Notion data source id: ${DEFAULT_NOTION_DATA_SOURCE_ID || "(미설정)"}`,
    `- 메인 Notion 페이지 URL: ${NOTION_MAIN_PAGE_URL || "(미설정)"}`,
    `- 업무 DB data source id: ${process.env.NOTION_WORK_DB_DATA_SOURCE_ID || "(미설정)"}`,
    "",
    "[사용 가능 툴]",
    JSON.stringify(TOOL_DEFINITIONS, null, 2),
    "",
    "[대화 장기 메모 요약]",
    memoryContext?.summaryText || "(없음)",
    "",
    "[실시간 업무 진행상황]",
    workProgressText || "(없음)",
    "",
    "[사용자 요청]",
    question,
  ].join("\n");

  const raw = await generateGeminiText({
    model: GEMINI_FLASH_MODEL,
    systemInstruction:
      "너는 JSON 기반 실행계획 생성기다. 요청 수행에 필요한 최소 툴만 선택하고 JSON만 출력한다.",
    userPrompt: plannerPrompt,
    temperature: 0.1,
    maxOutputTokens: 1800,
    timeoutMs: TOOL_PLANNER_TIMEOUT_MS,
    maxRetries: TOOL_PLANNER_MAX_RETRIES,
  });

  return parseJsonSafe(raw);
}

async function executePlannedToolCall({ tool, args }) {
  if (tool === "web_search") return runWebSearch(args);
  if (tool === "web_read") return runWebRead(args);
  if (tool === "notion_create_page") return runNotionCreatePage(args);
  if (tool === "notion_create_work_item") return runNotionCreateWorkItem(args);
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

async function buildToolWorkflowResponse({ question, plan, executions }) {
  const successCount = executions.filter((item) => item.ok).length;
  const failCount = executions.length - successCount;
  const lines = [
    `요청 작업 실행 결과: 성공 ${successCount}건, 실패 ${failCount}건`,
    "",
    "실행 항목",
    ...executions.map(summarizeSingleToolExecution),
  ];

  const followup = inferFollowupLineFromFailures(executions);
  if (followup) {
    lines.push("", followup);
  }

  const previewRequested = wantsDraftPreview(question);
  const draftPreviews = executions
    .filter((item) => item.ok && item.tool === "notion_create_page")
    .map((item) => {
      const contentMarkdown = String(item.args?.content_markdown || "").trim();
      if (!contentMarkdown) return null;
      return {
        title: String(item.args?.title || "").trim(),
        discordSummary: String(item.args?.discord_summary || "").trim(),
        contentMarkdown,
      };
    })
    .filter(Boolean);

  if (draftPreviews.length > 0 && !previewRequested) {
    const successfulCreates = executions.filter((item) => item.ok && item.tool === "notion_create_page");
    if (successfulCreates.length === 1 && failCount === 0) {
      const result = successfulCreates[0].result || {};
      return `노션 페이지 생성 완료: ${result.url || result.id || "(url 없음)"}`;
    }
    return lines.join("\n");
  }

  if (draftPreviews.length > 0) {
    for (let i = 0; i < draftPreviews.length; i += 1) {
      const draft = draftPreviews[i];
      lines.push("", draftPreviews.length > 1 ? `작성 초안 미리보기 ${i + 1}` : "작성 초안 미리보기");
      if (draft.title) {
        lines.push(`페이지 제목: ${draft.title}`);
      }
      if (draft.discordSummary) {
        lines.push(draft.discordSummary);
      }
      lines.push("", draft.contentMarkdown);
    }
    lines.push("", "전체 내용은 생성된 Notion 페이지에도 저장했습니다.");
    return lines.join("\n");
  }

  const addendumPrompt = [
    "아래 결과 요약을 2~4문장으로 부연해라.",
    "반드시 사실만 요약하고, 실행되지 않은 작업을 꾸며내지 마라.",
    "실패 항목이 있으면 마지막 문장에 재시도 방법을 한 줄로 안내해라.",
    "",
    "[사용자 요청]",
    question,
    "",
    "[실행 계획]",
    JSON.stringify(plan),
    "",
    "[고정 요약]",
    lines.join("\n"),
  ].join("\n");

  try {
    const addendum = await generateGeminiText({
      model: GEMINI_FLASH_MODEL,
      systemInstruction: "너는 실행 결과 요약기다. 사실만 간결하게 작성한다.",
      userPrompt: addendumPrompt,
      temperature: 0.1,
      maxOutputTokens: 220,
      timeoutMs: TOOL_SUMMARY_TIMEOUT_MS,
      maxRetries: TOOL_SUMMARY_MAX_RETRIES,
    });
    if (addendum?.trim()) {
      lines.push("", addendum.trim());
    }
  } catch {
    // Keep deterministic response when LLM addendum fails.
  }

  return lines.join("\n");
}

async function maybeHandleToolWorkflow({ question, memoryContext, workProgressText, traceId }) {
  if (!shouldUseToolWorkflow(question)) {
    return { handled: false, response: null };
  }

  logBotEvent("tool.plan.start", { traceId });
  const plan = await planToolCalls({ question, memoryContext, workProgressText });
  const normalized = normalizePlannedToolCalls(plan);
  const routed = applyNotionAutoRouting({
    question,
    toolCalls: normalized,
    traceId,
  });
  const toolCalls = routed.toolCalls;
  logBotEvent("tool.plan.done", {
    traceId,
    toolCallCount: toolCalls.length,
    needsTools: Boolean(plan?.needs_tools),
  });

  if (routed.error) {
    return { handled: true, response: routed.error };
  }

  if (toolCalls.length === 0) {
    const brief = String(plan?.assistant_brief || "").trim();
    if (brief) {
      return { handled: true, response: brief };
    }
    return { handled: false, response: null };
  }

  const executions = [];
  for (let i = 0; i < toolCalls.length; i += 1) {
    const toolCall = await maybeGenerateDraftForToolCall({
      question,
      toolCall: toolCalls[i],
      traceId,
    });
    logBotEvent("tool.exec.start", {
      traceId,
      index: i + 1,
      total: toolCalls.length,
      tool: toolCall.tool,
    });
    try {
      const result = await executePlannedToolCall(toolCall);
      logBotEvent("tool.exec.done", {
        traceId,
        index: i + 1,
        total: toolCalls.length,
        tool: toolCall.tool,
        ok: true,
      });
      if (toolCall.tool === "notion_create_page") {
        logBotEvent("notion.create.success", { traceId, url: result?.url || null });
      }
      if (toolCall.tool === "notion_create_work_item") {
        logBotEvent("workdb.create.success", {
          traceId,
          url: result?.url || null,
          dueDate: result?.due_date || null,
        });
      }
      executions.push({
        tool: toolCall.tool,
        args: toolCall.args,
        ok: true,
        result: compactToolResult(result),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logBotEvent("tool.exec.done", {
        traceId,
        index: i + 1,
        total: toolCalls.length,
        tool: toolCall.tool,
        ok: false,
        error: errorMessage,
      });
      if (toolCall.tool === "notion_create_page") {
        logBotEvent("notion.create.fail", { traceId, error: errorMessage });
      }
      if (toolCall.tool === "notion_create_work_item") {
        logBotEvent("workdb.create.fail", { traceId, error: errorMessage });
      }
      executions.push({
        tool: toolCall.tool,
        args: toolCall.args,
        ok: false,
        error: errorMessage,
      });
    }
  }

  const response = await buildToolWorkflowResponse({
    question,
    plan: {
      needs_tools: Boolean(plan?.needs_tools),
      assistant_brief: plan?.assistant_brief || "",
      tool_calls: toolCalls,
    },
    executions,
  });

  logBotEvent("tool.response.built", {
    traceId,
    responseLength: response.length,
    chunkCount: splitMessage(response).length,
    includesDraftPreview: executions.some(
      (item) => item.ok && item.tool === "notion_create_page" && String(item.args?.content_markdown || "").trim()
    ),
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
const WORK_CONTEXT_CACHE_SECONDS = getPositiveInt(process.env.ARCHY_WORK_CONTEXT_CACHE_SECONDS, 300);
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
const TOOL_PLANNER_TIMEOUT_MS = getPositiveInt(process.env.ARCHY_TOOL_PLANNER_TIMEOUT_MS, 45_000);
const TOOL_PLANNER_MAX_RETRIES = getNonNegativeInt(process.env.ARCHY_TOOL_PLANNER_MAX_RETRIES, 1);
const TOOL_SUMMARY_TIMEOUT_MS = getPositiveInt(process.env.ARCHY_TOOL_SUMMARY_TIMEOUT_MS, 30_000);
const TOOL_SUMMARY_MAX_RETRIES = getNonNegativeInt(process.env.ARCHY_TOOL_SUMMARY_MAX_RETRIES, 1);
const STRATEGIC_REVIEW_OPTIMIZATION_ENABLED =
  String(process.env.ARCHY_STRATEGIC_REVIEW_OPTIMIZATION_ENABLED || "true").toLowerCase() !==
  "false";
const STRATEGIC_REVIEW_FEEDBACK_WINDOW_HOURS = getPositiveInt(
  process.env.ARCHY_STRATEGIC_REVIEW_FEEDBACK_WINDOW_HOURS,
  23
);
const DEFAULT_SPREADSHEET_ID = process.env.ARCHY_USER_SHEET_ID || "";
const DEFAULT_NOTION_PARENT_PAGE_ID = process.env.NOTION_DEFAULT_PARENT_PAGE_ID || "";
const DEFAULT_NOTION_DATA_SOURCE_ID = process.env.NOTION_DEFAULT_DATA_SOURCE_ID || "";
const NOTION_MAIN_PAGE_URL =
  process.env.ARCHY_NOTION_MAIN_PAGE_URL ||
  "https://www.notion.so/0-min/Archy-AI-2e9bd55c477880bda196c1fbf4f74ca7?source=copy_link";
const NOTION_MAIN_PAGE_ALIASES = new Set(
  String(process.env.ARCHY_NOTION_MAIN_PAGE_ALIASES || "아키 페이지,archy 페이지,메인 페이지")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

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
const workProgressCache = new Map();

function invalidateQuickReportCache() {
  quickReportCache.clear();
}

function invalidateWorkProgressCache() {
  workProgressCache.clear();
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

async function getCachedWorkProgress({ targetYmd = null } = {}) {
  const key = targetYmd || "__today__";
  const now = Date.now();
  const cached = workProgressCache.get(key);
  if (cached?.value && now < cached.expiresAt) {
    return cached.value;
  }

  const value = await getWorkProgressContext(targetYmd || toKstYmd(new Date()));
  workProgressCache.set(key, {
    value,
    expiresAt: now + WORK_CONTEXT_CACHE_SECONDS * 1000,
  });
  return value;
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

function formatCountCard(current, previous, unit = "명") {
  if (!Number.isFinite(current)) return "데이터 없음";
  if (!Number.isFinite(previous)) return `${current}${unit}\n전일 비교: -`;
  return `${current}${unit}\n전일 대비 ${formatSignedInt(current - previous)}${unit}`;
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
  const { withSequence = false, maxSendRetries = 2, traceId = null } = options;
  const chunks = splitMessage(content);
  const total = chunks.length;
  const sentMessages = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) continue;
    const decorated = withSequence && total > 1 ? `(${i + 1}/${total})\n${chunk}` : chunk;
    let sent = false;
    let lastError = null;
    for (let attempt = 0; attempt <= maxSendRetries; attempt += 1) {
      try {
        const sentMessage = await channel.send({ content: decorated });
        sentMessages.push(sentMessage);
        logBotEvent("reply.chunk.sent", {
          traceId,
          chunkIndex: i + 1,
          chunkCount: total,
          chunkLength: decorated.length,
        });
        sent = true;
        break;
      } catch (error) {
        logBotEvent("reply.chunk.fail", {
          traceId,
          chunkIndex: i + 1,
          chunkCount: total,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        lastError = error;
        if (attempt >= maxSendRetries) break;
        await sleep(500 * (attempt + 1));
      }
    }
    if (!sent && lastError) {
      throw lastError;
    }
  }

  return {
    chunkCount: total,
    textLength: String(content || "").length,
    primaryMessageId: sentMessages[0]?.id || null,
    messageIds: sentMessages.map((item) => item.id),
  };
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
    prevDailyRecordings: previous?.dailyRecordings ?? fallbackCounts.dailyRecordings ?? null,
    prevDailyRecordingUsers:
      previous?.dailyRecordingUsers ?? fallbackCounts.dailyRecordingUsers ?? null,
    prevMau: previous?.mau ?? fallbackCounts.mau ?? fallbackCounts.activated30d ?? null,
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
        name: "🎙️ 금일 녹음 횟수",
        value: formatCountCard(report.counts.dailyRecordings, ctx.prevDailyRecordings, "회"),
        inline: true,
      },
      {
        name: "🙋 금일 녹음한 유저 수",
        value: formatCountCard(report.counts.dailyRecordingUsers, ctx.prevDailyRecordingUsers),
        inline: true,
      },
      { name: "📅 MAU", value: formatCountCard(report.counts.mau, ctx.prevMau), inline: true },
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
        name: "🎙️ 금일 녹음 횟수",
        value: formatCountCard(report.counts.dailyRecordings, ctx.prevDailyRecordings, "회"),
        inline: true,
      },
      {
        name: "🙋 금일 녹음한 유저 수",
        value: formatCountCard(report.counts.dailyRecordingUsers, ctx.prevDailyRecordingUsers),
        inline: true,
      },
      { name: "📅 MAU", value: formatCountCard(report.counts.mau, ctx.prevMau), inline: true },
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

function truncateProposalField(value, max = 280) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function hasStrategicReviewProposalAuthorityFromPermissions(permissions) {
  return Boolean(permissions?.has?.(PermissionsBitField.Flags.Administrator));
}

function hasStrategicReviewProposalAuthorityForMessage(message) {
  return hasStrategicReviewProposalAuthorityFromPermissions(message?.member?.permissions);
}

function hasStrategicReviewProposalAuthorityForInteraction(interaction) {
  return hasStrategicReviewProposalAuthorityFromPermissions(interaction?.memberPermissions);
}

function buildStrategicReviewProposalComponents(proposal, { disabled = false } = {}) {
  const buttonsDisabled = disabled || String(proposal?.status || "pending") !== "pending";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildStrategicReviewProposalButtonCustomId("apply", proposal.id))
        .setLabel("승인")
        .setStyle(ButtonStyle.Success)
        .setDisabled(buttonsDisabled),
      new ButtonBuilder()
        .setCustomId(buildStrategicReviewProposalButtonCustomId("hold", proposal.id))
        .setLabel("보류")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(buttonsDisabled),
      new ButtonBuilder()
        .setCustomId(buildStrategicReviewProposalButtonCustomId("reject", proposal.id))
        .setLabel("반려")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(buttonsDisabled)
    ),
  ];
}

function buildStrategicReviewProposalEmbed({ proposal, reviewRun, evaluation }) {
  const statusMeta = getStrategicReviewProposalStatusMeta(proposal?.status);
  const score = evaluation?.total_score ?? proposal?.evaluation_score ?? null;
  const evidence = Array.isArray(proposal?.evidence) ? proposal.evidence : [];
  const embed = new EmbedBuilder()
    .setColor(statusMeta.color)
    .setTitle(`🛠 전략 리뷰 프롬프트 개선 제안 #${proposal.id}`)
    .setDescription(`상태: **${statusMeta.label}**\n내일 데일리 전략 리뷰에 반영할지 확인해 주세요.`)
    .addFields(
      {
        name: "문제",
        value: truncateProposalField(proposal.problem_summary, 320),
        inline: false,
      },
      {
        name: "As-Is",
        value: truncateProposalField(proposal.as_is, 260),
        inline: false,
      },
      {
        name: "To-Be",
        value: truncateProposalField(proposal.to_be, 260),
        inline: false,
      },
      {
        name: "기대효과",
        value: truncateProposalField(proposal.expected_effect, 260),
        inline: false,
      },
      {
        name: "근거",
        value:
          evidence.length > 0
            ? truncateProposalField(evidence.slice(0, 3).join("\n"), 320)
            : truncateProposalField(evaluation?.summary || "운영 로그와 사용자 피드백 기반", 320),
        inline: false,
      }
    )
    .setFooter({
      text: [
        `상태 ${statusMeta.label}`,
        score !== null ? `평가점수 ${score}점` : null,
        reviewRun?.target_ymd ? `대상일 ${reviewRun.target_ymd}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })
    .setTimestamp(new Date());

  return embed;
}

function buildStrategicReviewProposalMessagePayload({
  proposal,
  reviewRun = null,
  evaluation = null,
  botUserId = null,
} = {}) {
  const statusMeta = getStrategicReviewProposalStatusMeta(proposal?.status);
  const lines = [`전략 리뷰 프롬프트 개선 제안 상태: **${statusMeta.label}**`];
  if (String(proposal?.status || "pending") === "pending" && botUserId) {
    lines.push("버튼으로 결정하거나 아래 텍스트 명령을 사용할 수 있어요.");
    lines.push(`<@${botUserId}> 제안 승인 ${proposal.id}`);
    lines.push(`<@${botUserId}> 제안 보류 ${proposal.id}`);
    lines.push(`<@${botUserId}> 제안 반려 ${proposal.id}`);
  } else if (String(proposal?.status || "") === "held" && botUserId) {
    lines.push("버튼은 잠겼고, 필요하면 텍스트 명령으로 다시 결정할 수 있어요.");
    lines.push(`<@${botUserId}> 제안 승인 ${proposal.id}`);
    lines.push(`<@${botUserId}> 제안 반려 ${proposal.id}`);
  }

  return {
    content: lines.join("\n"),
    embeds: [
      buildStrategicReviewProposalEmbed({
        proposal,
        reviewRun,
        evaluation,
      }),
    ],
    components: buildStrategicReviewProposalComponents(proposal),
  };
}

async function resolveStrategicReviewProposalForDecision({
  proposalId = null,
  replyMessageId = null,
} = {}) {
  return (
    (proposalId ? await getStrategicReviewProposalById(proposalId) : null) ||
    (replyMessageId ? await findProposalByDiscordMessageId(replyMessageId) : null) ||
    (await getOpenStrategicReviewProposal())
  );
}

async function syncStrategicReviewProposalMessage({
  proposal,
  reviewRun = null,
  evaluation = null,
} = {}) {
  if (!proposal?.discord_channel_id || !proposal?.discord_message_id) return null;

  const channel = await client.channels.fetch(proposal.discord_channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  const message = await channel.messages.fetch(proposal.discord_message_id).catch(() => null);
  if (!message) return null;

  const resolvedReviewRun =
    reviewRun || (proposal.review_run_id ? await getStrategicReviewRunById(proposal.review_run_id) : null);
  const resolvedEvaluation =
    evaluation ||
    (proposal.review_run_id ? await getLatestStrategicReviewEvaluation(proposal.review_run_id) : null);
  const payload = buildStrategicReviewProposalMessagePayload({
    proposal,
    reviewRun: resolvedReviewRun,
    evaluation: resolvedEvaluation,
    botUserId: client.user?.id || null,
  });
  await message.edit(payload);
  return message;
}

async function executeStrategicReviewProposalDecision({
  proposal,
  action,
  approvedByUserId,
  decisionReason = null,
  traceId = null,
} = {}) {
  if (!proposal) {
    return {
      handled: true,
      changed: false,
      replyText: "처리할 전략 리뷰 개선 제안을 찾지 못했어요.",
      proposal: null,
      version: null,
    };
  }

  const normalizedAction = String(action || "").trim().toLowerCase();
  const desiredStatus =
    normalizedAction === "apply" ? "applied" : normalizedAction === "hold" ? "held" : "rejected";

  if (proposal.status === desiredStatus) {
    return {
      handled: true,
      changed: false,
      replyText: `전략 리뷰 개선 제안 #${proposal.id} 는 이미 ${getStrategicReviewProposalStatusMeta(
        proposal.status
      ).label} 상태예요.`,
      proposal,
      version: null,
    };
  }

  if (["applied", "rejected"].includes(String(proposal.status || ""))) {
    return {
      handled: true,
      changed: false,
      replyText: `전략 리뷰 개선 제안 #${proposal.id} 는 이미 ${getStrategicReviewProposalStatusMeta(
        proposal.status
      ).label} 상태라 다시 처리하지 않았어요.`,
      proposal,
      version: null,
    };
  }

  if (normalizedAction === "apply") {
    const version = await applyStrategicReviewProposal({
      proposalId: proposal.id,
      approvedByUserId,
      decisionReason,
    });
    const updatedProposal = await getStrategicReviewProposalById(proposal.id);
    logBotEvent("strategic_review.proposal_applied", {
      traceId,
      proposalId: proposal.id,
      promptVersionLabel: version?.version_label || null,
    });
    return {
      handled: true,
      changed: true,
      proposal: updatedProposal || proposal,
      version,
      replyText: `전략 리뷰 프롬프트 개선안을 적용했어요. 새 버전: \`${version?.version_label || "unknown"}\``,
    };
  }

  if (normalizedAction === "hold") {
    const updatedProposal = await updateStrategicReviewProposalStatus({
      proposalId: proposal.id,
      status: "held",
      approvedByUserId,
      decisionReason,
    });
    logBotEvent("strategic_review.proposal_held", {
      traceId,
      proposalId: updatedProposal?.id || proposal.id,
    });
    return {
      handled: true,
      changed: true,
      proposal: updatedProposal || proposal,
      version: null,
      replyText: `전략 리뷰 개선 제안 #${proposal.id} 를 보류했어요.`,
    };
  }

  const updatedProposal = await updateStrategicReviewProposalStatus({
    proposalId: proposal.id,
    status: "rejected",
    approvedByUserId,
    decisionReason,
  });
  logBotEvent("strategic_review.proposal_rejected", {
    traceId,
    proposalId: updatedProposal?.id || proposal.id,
  });
  return {
    handled: true,
    changed: true,
    proposal: updatedProposal || proposal,
    version: null,
    replyText: `전략 리뷰 개선 제안 #${proposal.id} 를 반려했어요.`,
  };
}

function buildStrategicReviewSkipMessage(errorCode, errorMessage) {
  const code = String(errorCode || "unknown");
  const safeReason = String(errorMessage || "").slice(0, 220);
  if (code === "max_tokens_repeated") {
    return `전략 리뷰는 모델 출력이 반복적으로 짧게 종료되어(토큰 상한 반복) 이번 배치에서 생략됐어요. 코드: \`${code}\` / 사유: ${safeReason}`;
  }
  if (code === "schema_invalid") {
    return `전략 리뷰는 모델 응답 형식이 요구 스키마를 충족하지 못해 생략됐어요. 코드: \`${code}\` / 사유: ${safeReason}`;
  }
  if (code === "timeout_exhausted") {
    return `전략 리뷰는 지연 재시도(최대 300초)까지 진행했지만 제한시간을 초과해 생략됐어요. 코드: \`${code}\` / 사유: ${safeReason}`;
  }
  if (code === "validation_failed") {
    return `전략 리뷰는 형식/품질 검증을 통과하지 못해 생략됐어요. 코드: \`${code}\` / 사유: ${safeReason}`;
  }
  return `전략 리뷰는 내부 생성 오류로 이번 배치에서 생략됐어요. 코드: \`${code}\` / 사유: ${safeReason}`;
}

async function resolveStrategicReviewRunForMessage(message) {
  const replyMessageId =
    message.reference?.messageId || message.reference?.message_id || message.reference?.messageID || null;
  if (replyMessageId) {
    const byReply = await getStrategicReviewRunByPrimaryMessageId(replyMessageId);
    if (byReply) return byReply;
  }
  return getLatestCompletedStrategicReviewRun({
    withinHours: STRATEGIC_REVIEW_FEEDBACK_WINDOW_HOURS,
  });
}

async function maybeHandleStrategicReviewFeedbackMessage(message, question, { traceId = null } = {}) {
  const reviewRun = await resolveStrategicReviewRunForMessage(message);
  if (!reviewRun) return { handled: false };

  const isReplyToReview = Boolean(
    message.reference?.messageId || message.reference?.message_id || message.reference?.messageID
  );
  const classification = await classifyStrategicReviewFeedback({
    text: question,
    reviewRun,
    isReplyToReview,
  });
  if (!classification?.isFeedback) return { handled: false };

  const saved = await saveStrategicReviewFeedback({
    reviewRunId: reviewRun.id,
    guildId: message.guild.id,
    channelId: message.channelId,
    userId: message.author.id,
    sourceMessageId: message.id,
    feedbackText: question,
    sentiment: classification.sentiment,
    feedbackSummary: classification.summary,
    classification: {
      categories: classification.categories,
      requestedChanges: classification.requestedChanges,
      confidence: classification.confidence,
      raw: classification.raw,
    },
  });

  logBotEvent("strategic_review.feedback_saved", {
    traceId,
    reviewRunId: reviewRun.id,
    saved: Boolean(saved),
    sentiment: classification.sentiment,
    categories: classification.categories,
  });

  await message.reply(
    [
      "전략 리뷰 피드백으로 저장했어요.",
      classification.summary ? `요약: ${classification.summary}` : null,
      STRATEGIC_REVIEW_OPTIMIZATION_ENABLED
        ? "오늘 23:15 KST 개선 평가에 반영할게요."
        : "다음 전략 리뷰 개선 작업에 참고할 수 있도록 남겨둘게요.",
    ]
      .filter(Boolean)
      .join("\n")
  );
  return { handled: true, reviewRun, classification };
}

async function maybeHandleStrategicReviewProposalDecision(message, question, { traceId = null } = {}) {
  const decision = parseStrategicReviewProposalDecision(question);
  if (!decision?.action) return { handled: false };
  if (!hasStrategicReviewProposalAuthorityForMessage(message)) {
    await message.reply("전략 리뷰 개선 제안 승인/보류/반려는 서버 관리자만 할 수 있어요.");
    return { handled: true, unauthorized: true };
  }

  const replyMessageId =
    message.reference?.messageId || message.reference?.message_id || message.reference?.messageID || null;
  const proposal = await resolveStrategicReviewProposalForDecision({
    proposalId: decision.proposalId,
    replyMessageId,
  });
  const result = await executeStrategicReviewProposalDecision({
    proposal,
    action: decision.action,
    approvedByUserId: message.author.id,
    decisionReason: decision.reason,
    traceId,
  });
  if (result?.proposal) {
    await syncStrategicReviewProposalMessage({ proposal: result.proposal }).catch((error) => {
      console.warn("strategic review proposal sync failed:", error);
    });
  }
  await message.reply(result?.replyText || "전략 리뷰 개선 제안을 처리했어요.");
  return {
    handled: true,
    proposalId: result?.proposal?.id || proposal?.id || null,
    version: result?.version || null,
  };
}

let strategicReviewOptimizationInFlight = null;

async function runStrategicReviewOptimizationAndPost({ trigger = "schedule" } = {}) {
  if (!STRATEGIC_REVIEW_OPTIMIZATION_ENABLED) {
    return { status: "skipped", reason: "optimization_disabled" };
  }
  if (strategicReviewOptimizationInFlight) {
    return strategicReviewOptimizationInFlight;
  }

  strategicReviewOptimizationInFlight = (async () => {
    logBotEvent("strategic_review.optimization_start", { trigger });
    const result = await runStrategicReviewOptimizationCycle();

    if (result?.status === "proposal_created" && result?.proposal) {
      const channel = await client.channels.fetch(DAILY_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Daily channel is missing or not text-based");
      }

      const payload = buildStrategicReviewProposalMessagePayload({
        proposal: result.proposal,
        reviewRun: result.reviewRun,
        evaluation: result.evaluation,
        botUserId: client.user?.id || null,
      });
      const sentMessage = await channel.send(payload);
      await markStrategicReviewProposalMessage({
        proposalId: result.proposal.id,
        channelId: channel.id,
        messageId: sentMessage.id,
      });
      logBotEvent("strategic_review.proposal_sent", {
        trigger,
        proposalId: result.proposal.id,
        reviewRunId: result.reviewRun?.id || null,
        channelId: channel.id,
        messageId: sentMessage.id,
      });
    } else {
      logBotEvent("strategic_review.optimization_done", {
        trigger,
        status: result?.status || "unknown",
        reason: result?.reason || null,
      });
    }

    return result;
  })().finally(() => {
    strategicReviewOptimizationInFlight = null;
  });

  return strategicReviewOptimizationInFlight;
}

async function runDailyAndPost({ trigger = "unknown", requestedBy = null } = {}) {
  if (dailyRunInFlight) {
    logBotEvent("daily.already_in_flight", { trigger, requestedBy });
    return dailyRunInFlight;
  }

  dailyRunInFlight = (async () => {
    const startedAtMs = Date.now();
    logBotEvent("daily.start", { trigger, requestedBy });

    const channel = await client.channels.fetch(DAILY_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Daily channel is missing or not text-based");
    }

    const kickoffMessage = pickDailyStartMessage();
    await channel.send(kickoffMessage);
    logBotEvent("daily.kickoff_message_sent", { trigger, requestedBy, message: kickoffMessage });

    const report = await runDailyPipeline({
      runDate: new Date(),
      dryRun: false,
      skipStrategicReview: false,
    });
    logBotEvent("daily.pipeline_done", {
      trigger,
      requestedBy,
      runId: report?.runId ?? null,
      targetYmd: report?.targetYmd ?? null,
      durationMs: Date.now() - startedAtMs,
    });

    invalidateQuickReportCache();
    invalidateWorkProgressCache();

    const embed = buildDailyEmbed({ report, asOfDate: new Date() });
    await channel.send({ embeds: [embed] });
    logBotEvent("daily.embed_sent", {
      trigger,
      requestedBy,
      runId: report?.runId ?? null,
      targetYmd: report?.targetYmd ?? null,
    });

    if (report.strategicReview) {
      try {
        const reviewSend = await sendLongMessage(channel, `**🧠 오늘의 전략 리뷰**\n\n${report.strategicReview}`, {
          withSequence: true,
          traceId: report?.runId ?? null,
        });
        if (report?.strategicReviewRunId) {
          await attachStrategicReviewDiscordMessages({
            runId: report.runId,
            channelId: channel.id,
            primaryMessageId: reviewSend?.primaryMessageId || null,
            messageIds: reviewSend?.messageIds || [],
          });
        }
        logBotEvent("daily.review_sent", {
          trigger,
          requestedBy,
          runId: report?.runId ?? null,
          reviewLength: report?.strategicReview?.length ?? 0,
          chunkCount: reviewSend?.chunkCount ?? 1,
          reviewRunId: report?.strategicReviewRunId ?? null,
        });
      } catch (error) {
        logBotEvent("daily.review_send_error", {
          trigger,
          requestedBy,
          runId: report?.runId ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
        await channel.send("전략 리뷰 전송 중 일부 메시지가 누락됐어요. `/daily`로 다시 요청해주면 재전송할게요.");
      }
    } else if (report.strategicReviewError) {
      await channel.send(
        buildStrategicReviewSkipMessage(report?.strategicReviewErrorCode, report?.strategicReviewError)
      );
      logBotEvent("daily.review_skipped", {
        trigger,
        requestedBy,
        runId: report?.runId ?? null,
        errorCode: report?.strategicReviewErrorCode ?? null,
        reason: report.strategicReviewError,
      });
    }

    logBotEvent("daily.complete", {
      trigger,
      requestedBy,
      runId: report?.runId ?? null,
      targetYmd: report?.targetYmd ?? null,
      totalDurationMs: Date.now() - startedAtMs,
    });

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

async function answerAdvisorQuestion(message, question, { traceId = null } = {}) {
  const model = chooseChatModel(question);
  const toolCandidate = shouldUseToolWorkflow(question);
  const businessCritical = isBusinessCriticalQuestion(question);
  logBotEvent("mention.classified", {
    traceId,
    model,
    toolCandidate,
    businessCritical,
  });

  const memory = await getConversationMemory({
    guildId: message.guild.id,
    channelId: message.channelId,
    userId: message.author.id,
    recentLimit: MEMORY_RECENT_TURNS,
  });

  const memoryContext = formatMemoryContext(memory);

  const systemInstruction = buildAdvisorSystemInstruction({ question, model });

  if (toolCandidate) {
    const toolWorkflow = await maybeHandleToolWorkflow({
      question,
      memoryContext,
      workProgressText: "",
      traceId,
    });
    if (toolWorkflow.handled && toolWorkflow.response) {
      await sendLongMessage(message.channel, toolWorkflow.response, {
        traceId,
        withSequence: true,
      });
      await persistConversationExchange({
        message,
        question,
        answer: toolWorkflow.response,
        model,
      });
      return;
    }
  }

  const liveWorkYmd = toKstYmd(new Date());
  const shouldLoadOperationalContext = businessCritical;
  let quickReport = {
    targetYmd: liveWorkYmd,
    counts: {},
    rates: {},
    amplitudeConversion: {},
    heavyUserTop3: [],
    workProgress: {
      found: false,
      completed: [],
      pending: [],
      text: "업무 진행상황 미조회",
    },
  };
  let liveWorkProgress = {
    found: false,
    text: "실시간 업무 진행상황 미조회",
    completed: [],
    pending: [],
    ascentum: { edits: [] },
  };

  if (shouldLoadOperationalContext) {
    quickReport = await getCachedQuickReport();
    try {
      liveWorkProgress = await getCachedWorkProgress({ targetYmd: liveWorkYmd });
    } catch (error) {
      console.warn("live work progress lookup failed:", error);
      liveWorkProgress = {
        found: false,
        text: `실시간 업무 진행상황 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
        completed: [],
        pending: [],
        ascentum: { edits: [] },
      };
    }
  }

  if (liveWorkProgress?.found) {
    const liveEdits = (liveWorkProgress?.ascentum?.edits || [])
      .slice(0, 3)
      .map((item) => `${item.type}:${String(item.text || "").slice(0, 40)}`)
      .join(" | ");
    void upsertMemoryFacts({
      guildId: message.guild.id,
      userId: message.author.id,
      facts: [
        {
          key: "work_progress_target_ymd",
          value: liveWorkYmd,
          type: "status",
          confidence: 0.95,
        },
        {
          key: "work_progress_page_title",
          value: liveWorkProgress?.page?.title || "(제목 없음)",
          type: "status",
          confidence: 0.9,
        },
        {
          key: "work_progress_completed_count",
          value: String(liveWorkProgress?.completed?.length || 0),
          type: "status",
          confidence: 0.9,
        },
        {
          key: "work_progress_pending_count",
          value: String(liveWorkProgress?.pending?.length || 0),
          type: "status",
          confidence: 0.9,
        },
        ...(liveEdits
          ? [
              {
                key: "ascentum_recent_edits",
                value: liveEdits,
                type: "status",
                confidence: 0.7,
              },
            ]
          : []),
      ],
    }).catch((error) => {
      console.warn("work progress memory upsert failed:", error);
    });
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
    "[실시간 업무 진행상황]",
    liveWorkProgress?.text || "업무 진행상황 조회 실패",
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
        liveWorkProgress: {
          targetYmd: liveWorkYmd,
          found: liveWorkProgress?.found || false,
          completedCount: liveWorkProgress?.completed?.length || 0,
          pendingCount: liveWorkProgress?.pending?.length || 0,
          summary: liveWorkProgress?.text || "",
          ascentumRecentEditCount: liveWorkProgress?.ascentum?.edits?.length || 0,
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

  await sendLongMessage(message.channel, answer, { traceId });
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
  logBotEvent("bot.ready", {
    userTag: client.user?.tag || null,
    scheduleKst: "00:05",
  });

  if (GUILD_ID) {
    console.log(`Scoped guild: ${GUILD_ID}`);
  }

  try {
    await registerSlashCommands();
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }

  cron.schedule(
      "5 0 * * *",
      async () => {
        try {
          await runDailyAndPost({ trigger: "schedule" });
        } catch (error) {
          console.error("Scheduled daily run failed:", error);
        }
      },
    {
      timezone: "Asia/Seoul",
    }
  );

  if (STRATEGIC_REVIEW_OPTIMIZATION_ENABLED) {
    cron.schedule(
      "15 23 * * *",
      async () => {
        try {
          await runStrategicReviewOptimizationAndPost({ trigger: "schedule" });
        } catch (error) {
          console.error("Scheduled strategic review optimization failed:", error);
        }
      },
      {
        timezone: "Asia/Seoul",
      }
    );
  }

  console.log("Scheduled daily pipeline at 00:05 Asia/Seoul");
  if (STRATEGIC_REVIEW_OPTIMIZATION_ENABLED) {
    console.log("Scheduled strategic review optimization at 23:15 Asia/Seoul");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (GUILD_ID && interaction.guildId !== GUILD_ID) return;

    if (interaction.isButton()) {
      const parsed = parseStrategicReviewProposalButtonCustomId(interaction.customId);
      if (!parsed) return;

      if (!hasStrategicReviewProposalAuthorityForInteraction(interaction)) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "전략 리뷰 개선 제안 승인/보류/반려는 서버 관리자만 할 수 있어요.",
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const proposal = await getStrategicReviewProposalById(parsed.proposalId);
      if (proposal && String(proposal.status || "pending") !== "pending") {
        await interaction.editReply(
          `전략 리뷰 개선 제안 #${proposal.id} 는 이미 ${getStrategicReviewProposalStatusMeta(
            proposal.status
          ).label} 상태예요.`
        );
        return;
      }
      const result = await executeStrategicReviewProposalDecision({
        proposal,
        action: parsed.action,
        approvedByUserId: interaction.user?.id || null,
        decisionReason: `button:${interaction.customId}`,
        traceId: randomUUID(),
      });
      if (result?.proposal) {
        await syncStrategicReviewProposalMessage({ proposal: result.proposal }).catch((error) => {
          console.warn("strategic review proposal button sync failed:", error);
        });
      }
      await interaction.editReply(result?.replyText || "전략 리뷰 개선 제안을 처리했어요.");
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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
      logBotEvent("daily.command_received", {
        trigger: "slash",
        requestedBy: interaction.user?.id || null,
        guildId: interaction.guildId || null,
        channelId: interaction.channelId || null,
      });
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "데일리 리포트 보내드릴게요.",
      });

      runDailyAndPost({
        trigger: "slash",
        requestedBy: interaction.user?.id || null,
      }).catch(async (error) => {
        console.error("Manual daily run failed:", error);
        await interaction
          .editReply("데일리 배치 중 오류가 발생했어요. Railway 로그를 확인해 주세요.")
          .catch(() => {});
      });
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
  let traceId = null;
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
    if (!isMentioned) return;

    const question = message.content.replace(new RegExp(`<@!?${client.user?.id}>`, "g"), "").trim();
    if (!question) {
      await message.reply("질문을 함께 남겨주세요.");
      return;
    }

    traceId = randomUUID();
    logBotEvent("mention.received", {
      traceId,
      guildId: message.guild.id,
      channelId: message.channelId,
      userId: message.author.id,
      questionLength: question.length,
      questionPreview: truncate(question, 120),
    });

    const proposalDecision = await maybeHandleStrategicReviewProposalDecision(message, question, {
      traceId,
    });
    if (proposalDecision?.handled) return;

    const feedbackSave = await maybeHandleStrategicReviewFeedbackMessage(message, question, {
      traceId,
    });
    if (feedbackSave?.handled) return;

    const inChatChannel = CHAT_CHANNEL_IDS.size === 0 || CHAT_CHANNEL_IDS.has(message.channelId);
    if (!inChatChannel) {
      await message.reply("전략 리뷰 피드백/개선 제안 처리는 됐어요. 일반 질의는 지정된 채팅 채널에서만 답변할게요.");
      return;
    }

    await answerAdvisorQuestion(message, question, { traceId });
  } catch (error) {
    logBotEvent("mention.error", {
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
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
