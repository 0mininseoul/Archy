import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";

export const KST_TIMEZONE = "Asia/Seoul";
export const GEMINI_FLASH_MODEL = "gemini-3-flash-preview";
export const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
export const FIXED_EXCLUDED_USER_IDS = [
  "2018416a-14dc-4087-91aa-24cf68451366",
  "724261a2-8cdd-4318-9c99-fd8c7a39c5d8",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const PROJECT_CONTEXT_CACHE_MS = 60 * 60 * 1000;
const STRATEGIC_CONTEXT_PRIMARY_FILE = "docs/STRATEGIC_REVIEW_CONTEXT.md";
const STRATEGIC_CONTEXT_FALLBACK_FILES = [
  "docs/prd.md",
  "docs/FEATURE_SPEC.md",
  "docs/SERVICE_FLOW.md",
  "docs/assistant-agent.md",
];
const STRATEGIC_REVIEW_MIN_LENGTH = 450;
const THINKING_LEVELS = new Set(["minimal", "low", "medium", "high"]);
const STRATEGIC_REVIEW_ERROR_CODES = Object.freeze({
  MAX_TOKENS_REPEATED: "max_tokens_repeated",
  SCHEMA_INVALID: "schema_invalid",
  TIMEOUT_EXHAUSTED: "timeout_exhausted",
  VALIDATION_FAILED: "validation_failed",
  UNKNOWN: "unknown",
});
const STRATEGIC_REVIEW_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    business_state: {
      type: "string",
      description: "오늘 데이터와 업무 맥락을 종합한 핵심 결론과 함의",
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
    risks: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
    priority_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          expected_effect: { type: "string" },
          why_now: { type: ["string", "null"] },
        },
        required: ["action", "expected_effect"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 5,
    },
    data_check_requests: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 3,
    },
  },
  required: ["business_state", "strengths", "risks", "priority_actions", "data_check_requests"],
  additionalProperties: false,
});
const STRATEGIC_CONTEXT_COMPRESSION_PROFILES = Object.freeze({
  full: {
    projectContextChars: 7000,
    completedLimit: 5,
    pendingLimit: 8,
    editLimit: 4,
    editChars: 140,
    workSummaryChars: 2000,
  },
  compact: {
    projectContextChars: 3200,
    completedLimit: 5,
    pendingLimit: 8,
    editLimit: 4,
    editChars: 120,
    workSummaryChars: 1200,
  },
  ultra: {
    projectContextChars: 2000,
    completedLimit: 5,
    pendingLimit: 8,
    editLimit: 4,
    editChars: 100,
    workSummaryChars: 800,
  },
});

let projectContextCache = {
  value: "",
  loadedAtMs: 0,
};

function safeErrorMessage(error) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message;
  return String(error);
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toPositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Math.floor(toFiniteNumber(value, NaN));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function clipText(text, maxChars) {
  const body = String(text || "").trim();
  if (!body) return "";
  if (!Number.isFinite(maxChars) || maxChars <= 0) return body;
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}...`;
}

function getThoughtTokens(usageMetadata) {
  if (!usageMetadata || typeof usageMetadata !== "object") return null;
  const direct = toFiniteNumber(
    usageMetadata.thoughtsTokenCount ?? usageMetadata.thoughtTokenCount,
    NaN
  );
  if (Number.isFinite(direct)) return direct;

  const prompt = toFiniteNumber(usageMetadata.promptTokenCount, NaN);
  const candidate = toFiniteNumber(usageMetadata.candidatesTokenCount, NaN);
  const total = toFiniteNumber(usageMetadata.totalTokenCount, NaN);
  if (!Number.isFinite(prompt) || !Number.isFinite(candidate) || !Number.isFinite(total)) return null;
  const estimated = total - prompt - candidate;
  return estimated > 0 ? estimated : 0;
}

function createStrategicReviewError(code, message, extras = {}) {
  const error = new Error(message);
  error.name = "StrategicReviewError";
  error.code = Object.values(STRATEGIC_REVIEW_ERROR_CODES).includes(code)
    ? code
    : STRATEGIC_REVIEW_ERROR_CODES.UNKNOWN;
  Object.assign(error, extras);
  return error;
}

export function getStrategicReviewErrorCode(error) {
  const code = error?.code;
  if (Object.values(STRATEGIC_REVIEW_ERROR_CODES).includes(code)) return code;
  return STRATEGIC_REVIEW_ERROR_CODES.UNKNOWN;
}

function normalizeThinkingLevel(value, fallback = null) {
  if (!value && fallback) return normalizeThinkingLevel(fallback, null);
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!THINKING_LEVELS.has(normalized)) {
    return fallback ? normalizeThinkingLevel(fallback, null) : null;
  }
  return normalized;
}

function logDailyEvent(event, payload = {}) {
  const line = {
    ts: new Date().toISOString(),
    scope: "daily-runner",
    event,
    ...payload,
    level: "info",
    message: `daily-runner.${event}`,
  };
  console.log(JSON.stringify(line));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiFailure(error, statusCode = null) {
  if (statusCode && [408, 429, 500, 502, 503, 504].includes(statusCode)) return true;

  const code = error?.cause?.code || error?.code || "";
  if (typeof code === "string") {
    const retryableCodes = new Set([
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
    ]);
    if (retryableCodes.has(code)) return true;
  }

  const message = safeErrorMessage(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("headers timeout") ||
    message.includes("timeout")
  );
}

function getGeminiRetryDelayMs(attempt) {
  const baseMs = Number(process.env.GEMINI_REQUEST_RETRY_BASE_MS || 1500);
  const capMs = Number(process.env.GEMINI_REQUEST_RETRY_CAP_MS || 12000);
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 1500;
  const safeCap = Number.isFinite(capMs) && capMs > 0 ? capMs : 12000;
  const expo = Math.min(safeCap, safeBase * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * 350);
  return expo + jitter;
}

function loadDotenvFile(filepath) {
  if (!fsSync.existsSync(filepath)) return;

  const raw = fsSync.readFileSync(filepath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotenvFile(path.join(REPO_ROOT, ".env.local"));
loadDotenvFile(path.join(REPO_ROOT, ".env"));

function getEnv(name, { optional = false, fallback = undefined } = {}) {
  const value = process.env[name] ?? fallback;
  if (!optional && (value === undefined || value === null || value === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getExcludedUserIdSet() {
  return new Set(FIXED_EXCLUDED_USER_IDS);
}

function toKstParts(inputDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(inputDate)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function toKstYmd(inputDate = new Date()) {
  const { year, month, day } = toKstParts(inputDate);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 0, 0, 0);
  return toKstYmd(new Date(utc));
}

export function formatKoreanDayLabel(ymd) {
  const weekdayKo = ["일", "월", "화", "수", "목", "금", "토"];
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return `${m}/${d}(${weekdayKo[weekday]})`;
}

function parseDbTimestampAsKst(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value);
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasTimezone ? raw : `${raw}+09:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toKstYmdFromTimestamp(value) {
  const date = parseDbTimestampAsKst(value);
  if (!date) return null;
  return toKstYmd(date);
}

function formatSheetTimestamp(value) {
  const date = parseDbTimestampAsKst(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
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

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function signedNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

function signedPercentDelta(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const pct = (value * 100).toFixed(1);
  return value > 0 ? `+${pct}%` : `${pct}%`;
}

function summarizeDiffCount(current, previous) {
  if (previous === null || previous === undefined) return `${current}명`;
  return `${current}명 (${signedNumber(current - previous)}명)`;
}

function summarizeDiffRate(current, previous) {
  if (current === null || current === undefined) return "-";
  if (previous === null || previous === undefined) return `${percent(current)}`;
  return `${percent(current)} (${signedPercentDelta(current - previous)})`;
}

function toColumnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function getSupabaseAdminClient() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function fetchSupabaseSnapshot() {
  const supabase = getSupabaseAdminClient();
  const [usersRes, recordingsRes, formatsRes, withdrawnRes] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("recordings").select("id,user_id,created_at,status"),
    supabase.from("custom_formats").select("id,user_id,created_at"),
    supabase.from("withdrawn_users").select("id,original_user_id,name,withdrawn_at"),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (recordingsRes.error) throw recordingsRes.error;
  if (formatsRes.error) throw formatsRes.error;
  if (withdrawnRes.error) throw withdrawnRes.error;

  return {
    users: usersRes.data || [],
    recordings: recordingsRes.data || [],
    customFormats: formatsRes.data || [],
    withdrawnUsers: withdrawnRes.data || [],
  };
}

function filterExcludedUsers(snapshot) {
  const excluded = getExcludedUserIdSet();

  const users = snapshot.users.filter((u) => !excluded.has(u.id));
  const userIdSet = new Set(users.map((u) => u.id));

  const recordings = snapshot.recordings.filter((r) => userIdSet.has(r.user_id));
  const customFormats = snapshot.customFormats.filter((f) => userIdSet.has(f.user_id));
  const withdrawnUsers = snapshot.withdrawnUsers.filter((w) => !excluded.has(w.original_user_id));

  return { users, recordings, customFormats, withdrawnUsers, userIdSet };
}

export function buildMetricsForDate(snapshot, targetYmd) {
  const filtered = filterExcludedUsers(snapshot);
  const { users, recordings, customFormats, withdrawnUsers } = filtered;

  const isOnOrBeforeTarget = (timestamp) => {
    const ymd = toKstYmdFromTimestamp(timestamp);
    if (!ymd) return false;
    return ymd <= targetYmd;
  };

  const usersAsOf = users.filter((u) => isOnOrBeforeTarget(u.created_at));
  const asOfUserIdSet = new Set(usersAsOf.map((u) => u.id));
  const recordingsAsOf = recordings.filter(
    (r) => asOfUserIdSet.has(r.user_id) && isOnOrBeforeTarget(r.created_at)
  );
  const customFormatsAsOf = customFormats.filter(
    (f) => asOfUserIdSet.has(f.user_id) && isOnOrBeforeTarget(f.created_at)
  );
  const withdrawnUsersAsOf = withdrawnUsers.filter((w) => isOnOrBeforeTarget(w.withdrawn_at));

  const recordingsByUser = new Map();
  for (const recording of recordingsAsOf) {
    const list = recordingsByUser.get(recording.user_id) || [];
    list.push(recording);
    recordingsByUser.set(recording.user_id, list);
  }

  const customFormatUsers = new Set(customFormatsAsOf.map((f) => f.user_id));
  const recordedUsersAllTime = new Set(recordingsAsOf.map((r) => r.user_id));

  const last30Start = addDays(targetYmd, -29);
  const recordedUsers30d = new Set(
    recordingsAsOf
      .filter((r) => {
        const ymd = toKstYmdFromTimestamp(r.created_at);
        if (!ymd) return false;
        return ymd >= last30Start && ymd <= targetYmd;
      })
      .map((r) => r.user_id)
  );

  const activeUsersCount = usersAsOf.length;
  const withdrawnUsersCount = withdrawnUsersAsOf.length;
  // "유저 수" is reported as active accounts only; withdrawn users are tracked separately.
  const totalSignups = activeUsersCount;

  const onboardedCount = usersAsOf.filter((u) => u.is_onboarded).length;
  const pwaCount = usersAsOf.filter((u) => Boolean(u.pwa_installed_at)).length;
  const notionCount = usersAsOf.filter((u) => Boolean(u.notion_access_token)).length;
  const googleCount = usersAsOf.filter((u) => Boolean(u.google_access_token)).length;
  const slackCount = usersAsOf.filter((u) => Boolean(u.slack_access_token)).length;
  const integrationAnyCount = usersAsOf.filter(
    (u) => Boolean(u.notion_access_token || u.google_access_token || u.slack_access_token)
  ).length;
  const activation30dCount = recordedUsers30d.size;
  const activationAllTimeCount = recordedUsersAllTime.size;
  const customFormatCount = customFormatUsers.size;
  const paidCount = usersAsOf.filter((u) => Boolean(u.is_paid_user)).length;

  const usersOnTargetDate = usersAsOf.filter((u) => toKstYmdFromTimestamp(u.created_at) === targetYmd);
  const recordingsOnTargetDate = recordingsAsOf.filter(
    (r) => toKstYmdFromTimestamp(r.created_at) === targetYmd
  );
  const customFormatsOnTargetDate = customFormatsAsOf.filter(
    (f) => toKstYmdFromTimestamp(f.created_at) === targetYmd
  );
  const withdrawnOnTargetDate = withdrawnUsersAsOf.filter(
    (w) => toKstYmdFromTimestamp(w.withdrawn_at) === targetYmd
  );

  const heavyUserTop3 = [...recordingsByUser.entries()]
    .map(([userId, rows]) => {
      const user = usersAsOf.find((u) => u.id === userId);
      return {
        userId,
        name: user?.name || user?.email || userId,
        count: rows.length,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const derivedUserState = new Map();
  for (const user of usersAsOf) {
    const hasNotion = Boolean(user.notion_access_token);
    const hasGoogle = Boolean(user.google_access_token);
    const hasSlack = Boolean(user.slack_access_token);
    const hasIntegration = hasNotion || hasGoogle || hasSlack;
    const hasRecording = recordedUsersAllTime.has(user.id);
    const hasCustomFormat = customFormatUsers.has(user.id);

    derivedUserState.set(user.id, {
      hasNotion,
      hasGoogle,
      hasSlack,
      hasIntegration,
      hasRecording,
      hasCustomFormat,
      isOnboarded: Boolean(user.is_onboarded),
      hasPwa: Boolean(user.pwa_installed_at),
    });
  }

  const rate = (numerator, denominator) => {
    if (!denominator) return 0;
    return numerator / denominator;
  };

  return {
    targetYmd,
    dailyLabel: formatKoreanDayLabel(targetYmd),
    counts: {
      activeUsers: activeUsersCount,
      withdrawnUsers: withdrawnUsersCount,
      totalSignups,
      onboarded: onboardedCount,
      pwaInstalled: pwaCount,
      integrationsAny: integrationAnyCount,
      notionIntegrations: notionCount,
      googleIntegrations: googleCount,
      slackIntegrations: slackCount,
      activated30d: activation30dCount,
      activatedAllTime: activationAllTimeCount,
      customFormatUsers: customFormatCount,
      paidUsers: paidCount,
      dailyNewUsers: usersOnTargetDate.length,
      dailyRecordings: recordingsOnTargetDate.length,
      dailyRecordingUsers: new Set(recordingsOnTargetDate.map((r) => r.user_id)).size,
      dailyCustomFormatUsers: new Set(customFormatsOnTargetDate.map((f) => f.user_id)).size,
      dailyWithdrawnUsers: withdrawnOnTargetDate.length,
    },
    rates: {
      onboarding: rate(onboardedCount, activeUsersCount),
      pwa: rate(pwaCount, activeUsersCount),
      integrationAny: rate(integrationAnyCount, activeUsersCount),
      activation30d: rate(activation30dCount, activeUsersCount),
      activationAllTime: rate(activationAllTimeCount, activeUsersCount),
      customFormat: rate(customFormatCount, activeUsersCount),
      notionIntegration: rate(notionCount, activeUsersCount),
      googleIntegration: rate(googleCount, activeUsersCount),
      slackIntegration: rate(slackCount, activeUsersCount),
      payment: rate(paidCount, activeUsersCount),
    },
    users: usersAsOf,
    usersOnTargetDate,
    recordings: recordingsAsOf,
    heavyUserTop3,
    derivedUserState,
  };
}

async function getGoogleSheetsClient() {
  const clientEmail = getEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const rawKey = getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

function resolveHeaderMetricKey(header) {
  const prefixes = [
    "온보딩",
    "PWA",
    "연동",
    "노션 연동",
    "구글독스 연동",
    "슬랙 연동",
    "이용",
    "커스텀 포맷",
  ];

  return prefixes.find((prefix) => header.startsWith(prefix)) || null;
}

function toRowValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeSheetCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function rowsAreEquivalent(currentRow, nextRow, width) {
  for (let i = 0; i < width; i += 1) {
    const a = normalizeSheetCell(currentRow?.[i]);
    const b = normalizeSheetCell(nextRow?.[i]);
    if (a !== b) return false;
  }
  return true;
}

function buildSheetRowForUser(user, header, derivedUserState, currentRow = []) {
  const state = derivedUserState.get(user.id);

  return header.map((column, index) => {
    const metricPrefix = resolveHeaderMetricKey(column);
    if (metricPrefix) {
      if (metricPrefix === "온보딩") return state?.isOnboarded ? "O" : "X";
      if (metricPrefix === "PWA") return state?.hasPwa ? "O" : "X";
      if (metricPrefix === "연동") return state?.hasIntegration ? "O" : "X";
      if (metricPrefix === "노션 연동") return state?.hasNotion ? "O" : "X";
      if (metricPrefix === "구글독스 연동") return state?.hasGoogle ? "O" : "X";
      if (metricPrefix === "슬랙 연동") return state?.hasSlack ? "O" : "X";
      if (metricPrefix === "이용") return state?.hasRecording ? "O" : "X";
      if (metricPrefix === "커스텀 포맷") return state?.hasCustomFormat ? "O" : "X";
    }

    if (column === "이름") return toRowValue(user.name);
    if (column === "이메일 주소") return toRowValue(user.email);
    if (column === "가입일") return formatSheetTimestamp(user.created_at);
    if (Object.hasOwn(user, column)) return toRowValue(user[column]);
    return normalizeSheetCell(currentRow?.[index]);
  });
}

function buildSheetHeaderRow(header, metrics) {
  const replacementMap = {
    "온보딩": metrics.rates.onboarding,
    "PWA": metrics.rates.pwa,
    "연동": metrics.rates.integrationAny,
    "노션 연동": metrics.rates.notionIntegration,
    "구글독스 연동": metrics.rates.googleIntegration,
    "슬랙 연동": metrics.rates.slackIntegration,
    "이용": metrics.rates.activationAllTime,
    "커스텀 포맷": metrics.rates.customFormat,
  };

  return header.map((column) => {
    const prefix = resolveHeaderMetricKey(column);
    if (!prefix) return column;
    const rateValue = replacementMap[prefix];
    return `${prefix} (${(rateValue * 100).toFixed(1)}%)`;
  });
}

export async function syncGoogleUserSheet({
  metrics,
  targetYmd,
  syncAllUsers = String(process.env.ARCHY_SHEET_SYNC_ALL_USERS || "true").toLowerCase() !== "false",
  spreadsheetId = getEnv("ARCHY_USER_SHEET_ID", {
    fallback: "1f2bD-9h46UMPtbw836-45bd73__FeiKxEaPdcCUue20",
  }),
  worksheetName = getEnv("ARCHY_USER_SHEET_TAB_NAME", {
    optional: true,
    fallback: "유저 데이터 최종",
  }),
}) {
  const sheets = await getGoogleSheetsClient();

  const [metaRes, valueRes] = await Promise.all([
    sheets.spreadsheets.get({ spreadsheetId }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${worksheetName}'!A1:ZZ`,
    }),
  ]);

  const sheetMeta = metaRes.data.sheets?.find((s) => s.properties?.title === worksheetName);
  if (!sheetMeta || !sheetMeta.properties?.sheetId) {
    throw new Error(`Could not find worksheet: ${worksheetName}`);
  }
  const sheetId = sheetMeta.properties.sheetId;

  const values = valueRes.data.values || [];
  if (values.length === 0) {
    throw new Error(`Worksheet ${worksheetName} has no header row`);
  }

  const header = values[0];
  const idColumnIndex = header.indexOf("id");
  if (idColumnIndex < 0) {
    throw new Error(`Worksheet ${worksheetName} must include an 'id' column`);
  }

  const excluded = getExcludedUserIdSet();
  const rowsToDelete = [];
  const seenIds = new Set();

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i] || [];
    const rowId = (row[idColumnIndex] || "").trim();
    if (!rowId) continue;

    if (excluded.has(rowId)) {
      rowsToDelete.push({ rowNumber: i + 1, reason: "excluded" });
      continue;
    }

    if (seenIds.has(rowId)) {
      rowsToDelete.push({ rowNumber: i + 1, reason: "duplicate" });
      continue;
    }

    seenIds.add(rowId);
  }

  if (rowsToDelete.length > 0) {
    const requests = rowsToDelete
      .sort((a, b) => b.rowNumber - a.rowNumber)
      .map(({ rowNumber }) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  const refreshed = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${worksheetName}'!A1:ZZ`,
  });
  const refreshedValues = refreshed.data.values || [];
  const refreshedHeader = refreshedValues[0] || header;

  const refreshedIdIndex = refreshedHeader.indexOf("id");
  const existingIds = new Set(
    refreshedValues
      .slice(1)
      .map((row) => (row[refreshedIdIndex] || "").trim())
      .filter(Boolean)
  );
  const existingRowsById = new Map();
  for (let i = 1; i < refreshedValues.length; i += 1) {
    const row = refreshedValues[i] || [];
    const rowId = (row[refreshedIdIndex] || "").trim();
    if (!rowId) continue;
    existingRowsById.set(rowId, {
      rowNumber: i + 1,
      row,
    });
  }

  const sourceUsers = syncAllUsers ? metrics.users : metrics.usersOnTargetDate;
  const sampleUser = sourceUsers[0] || {};
  const nonMappedHeaders = refreshedHeader.filter((column) => {
    if (resolveHeaderMetricKey(column)) return false;
    if (column === "이름" || column === "이메일 주소" || column === "가입일") return false;
    return !Object.hasOwn(sampleUser, column);
  });
  const usersToUpdate = [];
  for (const user of sourceUsers) {
    const existingRow = existingRowsById.get(user.id);
    if (!existingRow) continue;
    const rowValues = buildSheetRowForUser(user, refreshedHeader, metrics.derivedUserState, existingRow.row);
    if (!rowsAreEquivalent(existingRow.row, rowValues, refreshedHeader.length)) {
      usersToUpdate.push({
        rowNumber: existingRow.rowNumber,
        rowValues,
      });
    }
  }

  if (usersToUpdate.length > 0) {
    const lastColumn = toColumnLetter(refreshedHeader.length - 1);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: usersToUpdate.map((item) => ({
          range: `'${worksheetName}'!A${item.rowNumber}:${lastColumn}${item.rowNumber}`,
          values: [item.rowValues],
        })),
      },
    });
  }

  const usersToInsert = [...sourceUsers]
    .sort((a, b) => {
      const aTs = parseDbTimestampAsKst(a.created_at)?.getTime() || 0;
      const bTs = parseDbTimestampAsKst(b.created_at)?.getTime() || 0;
      return bTs - aTs;
    })
    .filter((u) => !existingIds.has(u.id));

  const rows = usersToInsert.map((user) => buildSheetRowForUser(user, refreshedHeader, metrics.derivedUserState));

  if (rows.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: 1,
                endIndex: 1 + rows.length,
              },
              inheritFromBefore: false,
            },
          },
        ],
      },
    });

    const lastColumn = toColumnLetter(refreshedHeader.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${worksheetName}'!A2:${lastColumn}${rows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    });
  }

  const updatedHeader = buildSheetHeaderRow(refreshedHeader, metrics);
  const headerLastColumn = toColumnLetter(updatedHeader.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${worksheetName}'!A1:${headerLastColumn}1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [updatedHeader],
    },
  });

  return {
    targetYmd,
    insertedRows: rows.length,
    updatedRows: usersToUpdate.length,
    removedExcludedRows: rowsToDelete.filter((r) => r.reason === "excluded").length,
    removedDuplicateRows: rowsToDelete.filter((r) => r.reason === "duplicate").length,
    skippedExistingRows: sourceUsers.length - rows.length,
    syncMode: syncAllUsers ? "all_users" : "daily_new_users",
    nonMappedHeaders,
  };
}

function getAmplitudeAuthHeader() {
  const apiKey = process.env.AMPLITUDE_DASHBOARD_REST_API_KEY;
  const apiSecret = process.env.AMPLITUDE_DASHBOARD_REST_SECRET;

  if (!apiKey || !apiSecret) return null;
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

function toYmdFromUnknownDate(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Treat small epoch numbers as seconds.
    const ms = value < 100_000_000_000 ? value * 1000 : value;
    return toKstYmd(new Date(ms));
  }

  if (typeof value === "string") {
    const datePrefix = value.match(/\d{4}-\d{2}-\d{2}/);
    if (datePrefix) return datePrefix[0];

    const date = parseDbTimestampAsKst(value);
    if (date) return toKstYmd(date);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const ymd = toYmdFromUnknownDate(item);
      if (ymd) return ymd;
    }
    return null;
  }

  if (typeof value === "object") {
    const candidates = [
      value.date,
      value.day,
      value.x,
      value.timestamp,
      value.time,
      value.label,
      value.bucket,
      value.key,
      value.start,
      value.value,
    ];
    for (const candidate of candidates) {
      const ymd = toYmdFromUnknownDate(candidate);
      if (ymd) return ymd;
    }
  }

  return null;
}

function toNumberFromUnknown(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const isPercent = cleaned.endsWith("%");
    const parsed = Number(isPercent ? cleaned.slice(0, -1) : cleaned);
    if (Number.isNaN(parsed)) return null;
    return isPercent ? parsed / 100 : parsed;
  }
  if (typeof value === "object") {
    const keys = ["rate", "value", "y", "conversion_rate", "metric", "count", "v", "current"];
    for (const key of keys) {
      const parsed = toNumberFromUnknown(value[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function normalizeRateValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  // Conversion rates are commonly returned as 0~1 or 0~100.
  if (value > 1 && value <= 100) return value / 100;
  return value;
}

function pickRateFromUnknown(value) {
  const parsed = toNumberFromUnknown(value);
  if (parsed === null) return null;
  return normalizeRateValue(parsed);
}

function extractConversionSeries(payload) {
  const findRateInObject = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    for (const [key, raw] of Object.entries(obj)) {
      if (/(conversion|rate|ratio|percent)/i.test(key)) {
        const parsed = pickRateFromUnknown(raw);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  };

  const getColumnLabel = (column) => {
    if (typeof column === "string") return column;
    if (!column || typeof column !== "object") return "";
    return String(column.name || column.title || column.label || column.key || "");
  };

  const tryExtract = (root) => {
    if (!root || typeof root !== "object") return [];

    // Common pattern: { xValues: [...], series: [{ values: [...] }] }
    if (Array.isArray(root.xValues) && Array.isArray(root.series)) {
      const points = [];
      for (const rawSeries of root.series) {
        const values = Array.isArray(rawSeries)
          ? rawSeries
          : rawSeries?.values || rawSeries?.data || rawSeries?.yValues || rawSeries?.points || [];
        for (let i = 0; i < Math.min(root.xValues.length, values.length); i += 1) {
          const ymd = toYmdFromUnknownDate(root.xValues[i]);
          const rate = pickRateFromUnknown(values[i]);
          if (!ymd || rate === null) continue;
          points.push({ ymd, rate });
        }
      }
      if (points.length > 0) return points;
    }

    // Pattern: { xValues: [...], series: { "<label>": [...] } }
    if (Array.isArray(root.xValues) && root.series && typeof root.series === "object" && !Array.isArray(root.series)) {
      const points = [];
      for (const rawSeries of Object.values(root.series)) {
        if (!Array.isArray(rawSeries)) continue;
        for (let i = 0; i < Math.min(root.xValues.length, rawSeries.length); i += 1) {
          const ymd = toYmdFromUnknownDate(root.xValues[i]);
          const rate = pickRateFromUnknown(rawSeries[i]);
          if (!ymd || rate === null) continue;
          points.push({ ymd, rate });
        }
      }
      if (points.length > 0) return points;
    }

    // Data table style: { columns: [...], rows: [[...], ...] }
    if (Array.isArray(root.columns) && Array.isArray(root.rows)) {
      const columnLabels = root.columns.map((column) => getColumnLabel(column).toLowerCase());
      const dateIndex = columnLabels.findIndex((label) => /(date|day|time|interval|bucket)/i.test(label));
      const rateIndex = columnLabels.findIndex((label) => /(conversion|rate|ratio|percent|signup)/i.test(label));

      const points = [];
      for (const row of root.rows) {
        if (!Array.isArray(row)) continue;
        const ymd = toYmdFromUnknownDate(dateIndex >= 0 ? row[dateIndex] : row[0]);
        let rate = pickRateFromUnknown(rateIndex >= 0 ? row[rateIndex] : null);
        if (rate === null) {
          for (const cell of row) {
            rate = pickRateFromUnknown(cell);
            if (rate !== null) break;
          }
        }
        if (!ymd || rate === null) continue;
        points.push({ ymd, rate });
      }
      if (points.length > 0) return points;
    }

    // Pattern: [{ date, value }]
    if (Array.isArray(root)) {
      // If array items themselves contain chart structures, recurse first.
      for (const item of root) {
        if (!item || typeof item !== "object") continue;
        const nested = tryExtract(item);
        if (nested.length > 0) return nested;
      }

      const points = [];
      for (const item of root) {
        if (!item || typeof item !== "object") continue;
        const ymd =
          toYmdFromUnknownDate(item.date) ||
          toYmdFromUnknownDate(item.day) ||
          toYmdFromUnknownDate(item.x) ||
          toYmdFromUnknownDate(item.timestamp) ||
          toYmdFromUnknownDate(item.time) ||
          toYmdFromUnknownDate(item.bucket) ||
          toYmdFromUnknownDate(item);
        const rate =
          pickRateFromUnknown(item.rate ?? item.value ?? item.y ?? item.conversion_rate ?? item.metric) ??
          findRateInObject(item);
        if (!ymd || rate === null) continue;
        points.push({ ymd, rate });
      }
      if (points.length > 0) return points;
    }

    return [];
  };

  const roots = [
    payload,
    payload?.data,
    payload?.data?.[0],
    payload?.data?.series,
    payload?.data?.rows,
    payload?.data?.result,
    payload?.series,
    payload?.results,
    payload?.rows,
    payload?.chart,
    payload?.chart?.data,
  ];

  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      roots.push(value);
      if (Array.isArray(value) && value.length > 0) {
        roots.push(value[0]);
      }
    }
  }

  for (const root of roots) {
    const points = tryExtract(root);
    if (points.length > 0) {
      return points;
    }
  }

  return [];
}

function extractFirstNumberDeep(value, depth = 0) {
  if (depth > 6) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const preferredKeys = [
    "count",
    "value",
    "raw",
    "users",
    "numUsers",
    "propsum",
    "cumulative",
    "total",
  ];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const parsed = extractFirstNumberDeep(value[key], depth + 1);
    if (parsed !== null) return parsed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = extractFirstNumberDeep(item, depth + 1);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  for (const nested of Object.values(value)) {
    const parsed = extractFirstNumberDeep(nested, depth + 1);
    if (parsed !== null) return parsed;
  }
  return null;
}

function toStepCounts(candidate) {
  if (!candidate) return [];
  if (Array.isArray(candidate)) {
    if (candidate.every((item) => typeof item === "number" && Number.isFinite(item))) {
      return [...candidate];
    }

    const counts = [];
    for (const item of candidate) {
      const parsed = extractFirstNumberDeep(item);
      if (parsed !== null) counts.push(parsed);
    }
    return counts;
  }
  return [];
}

function conversionRateFromStepCounts(counts) {
  if (!Array.isArray(counts) || counts.length < 2) return null;
  const first = counts[0];
  const last = counts[counts.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
  return normalizeRateValue(last / first);
}

function extractConversionSeriesFromFunnelPayload(payload) {
  const points = [];
  const aggregateRates = [];
  const visited = new Set();

  const candidatesFromObject = (obj) => {
    if (!obj || typeof obj !== "object") return [];
    const keys = [
      "cumulativeRaw",
      "cumulative",
      "events",
      "propsum",
      "dayPropsum",
      "stepByStep",
      "steps",
    ];

    const out = [];
    for (const key of keys) {
      if (!(key in obj)) continue;
      out.push(...toStepCounts(obj[key]));
      if (out.length >= 2) break;
    }
    return out;
  };

  const normalizeDayBuckets = (rawBuckets) => {
    if (!rawBuckets) return [];
    if (Array.isArray(rawBuckets)) return rawBuckets;
    if (typeof rawBuckets === "object") {
      return Object.entries(rawBuckets).map(([bucketKey, bucketValue]) => ({
        __bucketKey: bucketKey,
        __bucketValue: bucketValue,
      }));
    }
    return [];
  };

  const stepCountsFromUnknown = (value, depth = 0) => {
    if (!value || depth > 6) return [];

    if (Array.isArray(value)) {
      const values = [...value];
      if (values.length > 0 && toYmdFromUnknownDate(values[0])) {
        values.shift();
      }

      const counts = [];
      for (const item of values) {
        const parsed = extractFirstNumberDeep(item);
        if (parsed !== null) counts.push(parsed);
      }
      return counts;
    }

    if (typeof value === "object") {
      const fromObject = candidatesFromObject(value);
      if (fromObject.length >= 2) return fromObject;
      for (const nested of Object.values(value)) {
        const parsedNested = stepCountsFromUnknown(nested, depth + 1);
        if (parsedNested.length >= 2) return parsedNested;
      }
    }

    return [];
  };

  const walk = (node, depth = 0) => {
    if (!node || depth > 8) return;
    if (typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const dayBuckets = normalizeDayBuckets(node.dayFunnels || node.dailyFunnels || node.days || null);

    if (dayBuckets.length > 0) {
      for (const bucket of dayBuckets) {
        const rawBucket =
          bucket && typeof bucket === "object" && "__bucketValue" in bucket ? bucket.__bucketValue : bucket;
        const bucketKey =
          bucket && typeof bucket === "object" && "__bucketKey" in bucket ? bucket.__bucketKey : null;
        if (!rawBucket) continue;

        const ymd =
          toYmdFromUnknownDate(rawBucket) ||
          toYmdFromUnknownDate(bucketKey) ||
          toYmdFromUnknownDate(rawBucket?.day) ||
          toYmdFromUnknownDate(rawBucket?.date) ||
          toYmdFromUnknownDate(rawBucket?.time) ||
          toYmdFromUnknownDate(rawBucket?.timestamp);

        const directRate =
          pickRateFromUnknown(
            rawBucket?.conversionRate ??
              rawBucket?.conversion_rate ??
              rawBucket?.conversion ??
              rawBucket?.ratio ??
              rawBucket?.rate ??
              rawBucket?.percent ??
              rawBucket?.value
          ) ?? null;

        const derivedRate = conversionRateFromStepCounts(stepCountsFromUnknown(rawBucket));
        const rate = directRate ?? derivedRate;
        if (ymd && rate !== null) {
          points.push({ ymd, rate });
        }
      }
    }

    const aggregateRate = conversionRateFromStepCounts(candidatesFromObject(node));
    if (aggregateRate !== null) {
      aggregateRates.push(aggregateRate);
    }

    for (const value of Object.values(node)) {
      walk(value, depth + 1);
    }
  };

  walk(payload, 0);

  if (points.length > 0) return { points, aggregateRate: null };
  if (aggregateRates.length > 0) return { points: [], aggregateRate: aggregateRates[0] };
  return { points: [], aggregateRate: null };
}

function selectRatesByTargetDate(points, targetYmd, previousYmd) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      currentRate: null,
      previousRate: null,
      effectiveYmd: null,
      previousEffectiveYmd: null,
    };
  }

  const byDate = new Map();
  for (const point of points) {
    if (!point?.ymd || point?.rate === null || point?.rate === undefined) continue;
    byDate.set(point.ymd, point.rate);
  }

  const currentRate = byDate.get(targetYmd) ?? null;
  const previousRate = byDate.get(previousYmd) ?? null;

  if (currentRate !== null) {
    return {
      currentRate,
      previousRate,
      effectiveYmd: targetYmd,
      previousEffectiveYmd: previousYmd,
    };
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) {
    return {
      currentRate: null,
      previousRate: null,
      effectiveYmd: null,
      previousEffectiveYmd: null,
    };
  }

  let effectiveIndex = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i][0] <= targetYmd) effectiveIndex = i;
  }
  if (effectiveIndex < 0) {
    effectiveIndex = sorted.length - 1;
  }

  const [effectiveYmd, effectiveRate] = sorted[effectiveIndex];
  const previousFromSequence = effectiveIndex > 0 ? sorted[effectiveIndex - 1] : null;
  let previousEffectiveYmd = previousFromSequence ? previousFromSequence[0] : null;
  let previousFallbackRate = previousFromSequence ? previousFromSequence[1] : null;

  if (previousRate !== null && previousYmd && previousYmd < effectiveYmd) {
    previousEffectiveYmd = previousYmd;
    previousFallbackRate = previousRate;
  }

  return {
    currentRate: effectiveRate ?? null,
    previousRate: previousFallbackRate,
    effectiveYmd,
    previousEffectiveYmd: previousEffectiveYmd ?? previousYmd,
  };
}

function describePayloadShape(payload) {
  if (payload === null || payload === undefined) return "empty";
  if (Array.isArray(payload)) return `array(len=${payload.length})`;
  if (typeof payload === "object") {
    const keys = Object.keys(payload).slice(0, 12).join(", ");
    const dataKeys =
      payload?.data && typeof payload.data === "object"
        ? Object.keys(payload.data).slice(0, 12).join(", ")
        : "";
    const data0Shape =
      Array.isArray(payload?.data) && payload.data.length > 0 ? describePayloadShape(payload.data[0]) : "";
    const pieces = [`keys=${keys || "-"}`];
    if (dataKeys) pieces.push(`dataKeys=${dataKeys || "-"}`);
    if (data0Shape) pieces.push(`data0=${data0Shape}`);
    return `object(${pieces.join("; ")})`;
  }
  return typeof payload;
}

export async function fetchAmplitudeSignupConversion({ targetYmd, previousYmd }) {
  const staticRate = process.env.AMPLITUDE_SIGNUP_CONVERSION_STATIC_RATE;
  if (staticRate) {
    const parsed = Number(staticRate);
    if (!Number.isNaN(parsed)) {
      return {
        source: "static_env",
        currentRate: parsed,
        previousRate: null,
      };
    }
  }

  const customApiUrl = process.env.AMPLITUDE_SIGNUP_CONVERSION_CHART_API_URL;
  let payload = null;

  if (customApiUrl) {
    const response = await fetch(customApiUrl, {
      headers: {
        ...(process.env.AMPLITUDE_SIGNUP_CONVERSION_API_BEARER
          ? { Authorization: `Bearer ${process.env.AMPLITUDE_SIGNUP_CONVERSION_API_BEARER}` }
          : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Amplitude custom chart API failed: ${response.status}`);
    }
    payload = await response.json();
  } else {
    const chartId = process.env.AMPLITUDE_SIGNUP_CONVERSION_CHART_ID;
    if (!chartId) {
      return {
        source: "not_configured",
        currentRate: null,
        previousRate: null,
      };
    }

    const authHeader = getAmplitudeAuthHeader();
    if (!authHeader) {
      throw new Error(
        "Missing AMPLITUDE_DASHBOARD_REST_API_KEY / AMPLITUDE_DASHBOARD_REST_SECRET for dashboard chart query"
      );
    }

    const baseUrl = process.env.AMPLITUDE_DASHBOARD_API_BASE_URL || "https://amplitude.com";
    const url = `${baseUrl}/api/3/chart/${chartId}/query`;

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Amplitude dashboard API failed: ${response.status}`);
    }

    payload = await response.json();
  }

  const points = extractConversionSeries(payload);
  if (points.length === 0) {
    const funnelDerived = extractConversionSeriesFromFunnelPayload(payload);
    if (funnelDerived.points.length > 0) {
      const selected = selectRatesByTargetDate(funnelDerived.points, targetYmd, previousYmd);
      return {
        source: customApiUrl ? "custom_api_funnel_derived" : "dashboard_funnel_derived",
        currentRate: selected.currentRate,
        previousRate: selected.previousRate,
        effectiveYmd: selected.effectiveYmd,
        previousEffectiveYmd: selected.previousEffectiveYmd,
      };
    }

    if (funnelDerived.aggregateRate !== null) {
      return {
        source: customApiUrl ? "custom_api_funnel_aggregate" : "dashboard_funnel_aggregate",
        currentRate: funnelDerived.aggregateRate,
        previousRate: null,
      };
    }

    return {
      source: customApiUrl ? "custom_api_unparsed" : "dashboard_unparsed",
      currentRate: null,
      previousRate: null,
      rawShape: describePayloadShape(payload),
    };
  }

  const selected = selectRatesByTargetDate(points, targetYmd, previousYmd);

  return {
    source: customApiUrl ? "custom_api" : "dashboard_api",
    currentRate: selected.currentRate,
    previousRate: selected.previousRate,
    effectiveYmd: selected.effectiveYmd,
    previousEffectiveYmd: selected.previousEffectiveYmd,
  };
}

function getNotionClient() {
  const auth =
    process.env.NOTION_INTERNAL_INTEGRATION_TOKEN ||
    process.env.NOTION_API_TOKEN ||
    process.env.NOTION_TOKEN;

  if (!auth) {
    throw new Error("Missing Notion token. Set NOTION_INTERNAL_INTEGRATION_TOKEN.");
  }

  return new NotionClient({ auth });
}

function getNotionUserMetricsDatabaseId() {
  return getEnv("NOTION_USER_METRICS_DATABASE_ID");
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

function extractNotionPageTitle(page) {
  const titleProperty = Object.values(page?.properties || {}).find(
    (property) => property && typeof property === "object" && property.type === "title"
  );
  return titleProperty?.title?.map((segment) => segment.plain_text).join("") || "";
}

const notionMetricsDataSourceCache = {
  key: null,
  dataSourceId: null,
  properties: null,
};

const NOTION_METRIC_PROPERTY_ALIASES = Object.freeze({
  totalSignups: ["유저 수"],
  conversionRate: ["가입전환율"],
  onboarding: ["온보딩율"],
  pwa: ["PWA 설치율"],
  integrationAny: ["연동율"],
  activation30d: ["활성화율(30일)", "활성화율"],
  activationAllTime: ["이용률(누적)", "이용률"],
  customFormat: ["커스텀 포맷 이용률"],
  notionIntegration: ["노션 연동율"],
  googleIntegration: ["구글 독스 연동율"],
  slackIntegration: ["슬랙 연동율"],
  payment: ["결제율"],
});

function getNotionPropertySchemaEntries(properties = {}) {
  return Object.entries(properties).filter(([, property]) => property && typeof property === "object");
}

function findNotionPropertyNameByType(properties = {}, type) {
  const match = getNotionPropertySchemaEntries(properties).find(([, property]) => property.type === type);
  return match?.[0] || null;
}

function findMatchingNotionPropertyName(properties = {}, aliases = [], { expectedType = null } = {}) {
  for (const alias of aliases) {
    const property = properties?.[alias];
    if (!property || typeof property !== "object") continue;
    if (expectedType && property.type !== expectedType) continue;
    return alias;
  }
  return null;
}

function getConfiguredNotionMetricPropertyName(properties = {}, key, fallbackAliases = []) {
  const aliases =
    NOTION_METRIC_PROPERTY_ALIASES[key] ||
    (Array.isArray(fallbackAliases) ? fallbackAliases : [fallbackAliases]).filter(Boolean);
  const matched = findMatchingNotionPropertyName(properties, aliases, { expectedType: "number" });
  if (matched) return matched;
  return Object.keys(properties || {}).length > 0 ? null : aliases[0] || null;
}

function assignNotionNumberMetric(properties, propertyName, value) {
  if (!propertyName) return;
  properties[propertyName] = { number: value ?? null };
}

async function resolveNotionMetricsDataSource(notion) {
  const configuredId = getNotionUserMetricsDatabaseId();
  if (
    notionMetricsDataSourceCache.key === configuredId &&
    notionMetricsDataSourceCache.dataSourceId &&
    notionMetricsDataSourceCache.properties
  ) {
    return {
      dataSourceId: notionMetricsDataSourceCache.dataSourceId,
      properties: notionMetricsDataSourceCache.properties,
    };
  }

  let dataSource = null;

  // 1) Prefer direct data source id.
  try {
    dataSource = await notion.dataSources.retrieve({
      data_source_id: configuredId,
    });
  } catch {
    // Fall through to database lookup.
  }

  // 2) Fallback: configured id is database id -> use first data source.
  if (!dataSource?.id) {
    let database = null;
    try {
      database = await notion.databases.retrieve({
        database_id: configuredId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `NOTION_USER_METRICS_DATABASE_ID 접근 실패: ${configuredId}. ` +
          `해당 DB(또는 데이터소스)를 Notion integration에 공유했는지 확인하세요. 원인: ${message}`
      );
    }

    const firstDataSourceId = database?.data_sources?.[0]?.id;
    if (!firstDataSourceId) {
      throw new Error(
        "NOTION_USER_METRICS_DATABASE_ID must be a data_source id, or a database id that contains at least one data source."
      );
    }

    try {
      dataSource = await notion.dataSources.retrieve({
        data_source_id: firstDataSourceId,
      });
    } catch {
      dataSource = {
        id: firstDataSourceId,
        properties: database?.properties || {},
      };
    }
  }

  notionMetricsDataSourceCache.key = configuredId;
  notionMetricsDataSourceCache.dataSourceId = dataSource.id;
  notionMetricsDataSourceCache.properties = dataSource.properties || {};

  return {
    dataSourceId: dataSource.id,
    properties: dataSource.properties || {},
  };
}

async function findNotionPageByTitle(notion, dataSourceId, title, titlePropertyName = "이름") {
  const result = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: titlePropertyName,
      title: {
        equals: title,
      },
    },
    page_size: 1,
  });

  return result.results?.[0] || null;
}

function buildNotionMetricProperties(label, metrics, conversionRate, notionProperties = {}) {
  const titlePropertyName = findNotionPropertyNameByType(notionProperties, "title") || "이름";
  const properties = {
    [titlePropertyName]: {
      title: [{ text: { content: label } }],
    },
  };

  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "totalSignups"),
    metrics.counts.totalSignups
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "conversionRate"),
    conversionRate
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "onboarding"),
    metrics.rates.onboarding
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "pwa"),
    metrics.rates.pwa
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "integrationAny"),
    metrics.rates.integrationAny
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "activation30d"),
    metrics.rates.activation30d
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "activationAllTime"),
    metrics.rates.activationAllTime
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "customFormat"),
    metrics.rates.customFormat
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "notionIntegration"),
    metrics.rates.notionIntegration
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "googleIntegration"),
    metrics.rates.googleIntegration
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "slackIntegration"),
    metrics.rates.slackIntegration
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "payment"),
    metrics.rates.payment
  );

  return properties;
}

function buildNotionEngagementMetricProperties(metrics, notionProperties = {}) {
  const properties = {};

  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "activation30d"),
    metrics.rates.activation30d
  );
  assignNotionNumberMetric(
    properties,
    getConfiguredNotionMetricPropertyName(notionProperties, "activationAllTime"),
    metrics.rates.activationAllTime
  );

  return properties;
}

export async function upsertNotionMetricsRow({ label, metrics, conversionRate }) {
  const notion = getNotionClient();
  const { dataSourceId, properties: notionProperties } = await resolveNotionMetricsDataSource(notion);
  const titlePropertyName = findNotionPropertyNameByType(notionProperties, "title") || "이름";
  const properties = buildNotionMetricProperties(label, metrics, conversionRate, notionProperties);

  const existing = await findNotionPageByTitle(notion, dataSourceId, label, titlePropertyName);
  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties,
    });
    return { mode: "update", pageId: existing.id };
  }

  const created = await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties,
  });

  return { mode: "insert", pageId: created.id };
}

export async function updateNotionEngagementMetricsByLabel({
  label,
  metrics,
  createIfMissing = false,
} = {}) {
  const notion = getNotionClient();
  const { dataSourceId, properties: notionProperties } = await resolveNotionMetricsDataSource(notion);
  const titlePropertyName = findNotionPropertyNameByType(notionProperties, "title") || "이름";
  const properties = buildNotionEngagementMetricProperties(metrics, notionProperties);

  if (Object.keys(properties).length === 0) {
    return {
      mode: "skipped",
      reason: "no_matching_properties",
      label,
    };
  }

  const existing = await findNotionPageByTitle(notion, dataSourceId, label, titlePropertyName);
  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties,
    });
    return {
      mode: "update",
      pageId: existing.id,
      label,
    };
  }

  if (!createIfMissing) {
    return {
      mode: "missing",
      label,
    };
  }

  const fullProperties = buildNotionMetricProperties(label, metrics, null, notionProperties);
  const created = await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: fullProperties,
  });

  return {
    mode: "insert",
    pageId: created.id,
    label,
  };
}

export async function getNotionMetricsByLabel(label) {
  const notion = getNotionClient();
  const { dataSourceId, properties: notionProperties } = await resolveNotionMetricsDataSource(notion);
  const titlePropertyName = findNotionPropertyNameByType(notionProperties, "title") || "이름";
  const page = await findNotionPageByTitle(notion, dataSourceId, label, titlePropertyName);
  if (!page) return null;

  const getNumber = (key, fallbackAliases = []) => {
    const propertyName = getConfiguredNotionMetricPropertyName(
      notionProperties,
      key,
      fallbackAliases
    );
    if (!propertyName) return null;
    const prop = page.properties?.[propertyName];
    if (!prop || typeof prop !== "object") return null;
    if (prop.type !== "number") return null;
    return prop.number;
  };

  return {
    label,
    totalSignups: getNumber("totalSignups", ["유저 수"]),
    conversionRate: getNumber("conversionRate", ["가입전환율"]),
    onboardingRate: getNumber("onboarding", ["온보딩율"]),
    pwaRate: getNumber("pwa", ["PWA 설치율"]),
    integrationRate: getNumber("integrationAny", ["연동율"]),
    activationRate: getNumber("activation30d", ["활성화율(30일)", "활성화율"]),
    usageRate: getNumber("activationAllTime", ["이용률(누적)", "이용률"]),
    paymentRate: getNumber("payment", ["결제율"]),
  };
}

async function readWorkDbTargetPage(notion, targetYmd) {
  const resolveWorkDataSourceId = async () => {
    const configured = normalizeNotionId(getEnv("NOTION_WORK_DB_DATA_SOURCE_ID", { optional: true, fallback: "" }));
    if (configured) {
      try {
        const dataSource = await notion.dataSources.retrieve({ data_source_id: configured });
        if (dataSource?.id) return dataSource.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `NOTION_WORK_DB_DATA_SOURCE_ID 접근 실패: ${configured}. integration 공유 여부 확인 필요. 원인: ${message}`
        );
      }
    }

    const searchWithObjectType = async (objectType) =>
      notion.search({
        query: "업무 DB",
        filter: { property: "object", value: objectType },
        page_size: 10,
      });

    let search = null;
    try {
      // Newer Notion API object filter prefers "data_source".
      search = await searchWithObjectType("data_source");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("body failed validation")) throw error;

      // Backward-compatible fallback for older API behavior.
      search = await searchWithObjectType("database");
    }

    const collection =
      search?.results?.find((item) => item.object === "data_source") ||
      search?.results?.find((item) => item.object === "database") ||
      null;
    if (!collection) return null;

    if (collection.object === "data_source") return collection.id;
    if (collection.object === "database") {
      const db = await notion.databases.retrieve({ database_id: collection.id });
      return db?.data_sources?.[0]?.id || null;
    }
    return null;
  };

  const token = targetYmd.slice(2).replaceAll("-", ""); // 2026-03-04 -> 260304
  const workDataSourceId = await resolveWorkDataSourceId();
  if (!workDataSourceId) return null;

  const pages = await notion.dataSources.query({
    data_source_id: workDataSourceId,
    page_size: 30,
    sorts: [{ direction: "descending", timestamp: "created_time" }],
  });

  const candidate =
    pages.results.find((page) => extractNotionPageTitle(page).includes(token)) ||
    pages.results[0] ||
    null;

  if (!candidate) return null;
  return { pageId: candidate.id, title: extractNotionPageTitle(candidate), url: candidate.url };
}

async function collectTodoBlocks(notion, blockId, out = []) {
  let cursor = undefined;

  while (true) {
    const result = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    for (const block of result.results) {
      if (block.type === "to_do") {
        const text = (block.to_do.rich_text || []).map((segment) => segment.plain_text).join("").trim();
        if (text) {
          out.push({ text, checked: Boolean(block.to_do.checked) });
        }
      }

      if (block.has_children) {
        await collectTodoBlocks(notion, block.id, out);
      }
    }

    if (!result.has_more || !result.next_cursor) break;
    cursor = result.next_cursor;
  }

  return out;
}

function extractBlockText(block) {
  if (!block || !block.type) return "";

  const typed = block[block.type];
  if (typed && Array.isArray(typed.rich_text)) {
    const richText = typed.rich_text.map((segment) => segment.plain_text).join("").trim();
    if (richText) return richText;
  }

  if (block.type === "child_page") return block.child_page?.title || "";
  if (block.type === "to_do") {
    return (block.to_do?.rich_text || []).map((segment) => segment.plain_text).join("").trim();
  }
  if (block.type === "code") {
    const codeText = (block.code?.rich_text || []).map((segment) => segment.plain_text).join("").trim();
    return codeText;
  }
  return "";
}

async function collectRecentEditedBlocks(
  notion,
  rootBlockId,
  { limit = 8, maxBlocks = 400, maxDepth = 6 } = {}
) {
  const queue = [{ blockId: rootBlockId, depth: 0 }];
  const collected = [];
  let scanned = 0;

  while (queue.length > 0 && scanned < maxBlocks) {
    const current = queue.shift();
    if (!current) break;

    let cursor = undefined;
    while (scanned < maxBlocks) {
      const result = await notion.blocks.children.list({
        block_id: current.blockId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const block of result.results) {
        scanned += 1;
        const text = extractBlockText(block);
        collected.push({
          id: block.id,
          type: block.type,
          text: text || `(텍스트 없음: ${block.type})`,
          lastEdited: block.last_edited_time || null,
        });

        if (block.has_children && current.depth < maxDepth && scanned < maxBlocks) {
          queue.push({ blockId: block.id, depth: current.depth + 1 });
        }
        if (scanned >= maxBlocks) break;
      }

      if (!result.has_more || !result.next_cursor || scanned >= maxBlocks) break;
      cursor = result.next_cursor;
    }
  }

  const seen = new Set();
  return collected
    .filter((item) => Boolean(item.lastEdited))
    .sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}

async function resolveAscentumPage(notion) {
  const configured = normalizeNotionId(getEnv("NOTION_ASCENTUM_PAGE_ID", { optional: true, fallback: "" }));
  if (configured) {
    const page = await notion.pages.retrieve({ page_id: configured });
    return {
      id: page.id,
      title: extractNotionPageTitle(page) || "Ascentum",
      url: page.url || "",
      lastEdited: page.last_edited_time || null,
    };
  }

  const search = await notion.search({
    query: "Ascentum",
    filter: { property: "object", value: "page" },
    page_size: 10,
  });
  const candidate =
    search.results.find((item) => extractNotionPageTitle(item).toLowerCase().includes("ascentum")) ||
    search.results[0] ||
    null;
  if (!candidate) return null;

  return {
    id: candidate.id,
    title: extractNotionPageTitle(candidate) || "Ascentum",
    url: candidate.url || "",
    lastEdited: candidate.last_edited_time || null,
  };
}

async function getAscentumRecentEditContext(notion) {
  try {
    const page = await resolveAscentumPage(notion);
    if (!page) {
      return {
        found: false,
        text: "Ascentum 페이지를 찾지 못했습니다.",
        edits: [],
      };
    }

    const recentEdits = await collectRecentEditedBlocks(notion, page.id, {
      limit: 8,
      maxBlocks: 350,
      maxDepth: 6,
    });

    const lines = [];
    lines.push(`Ascentum 페이지: ${page.title}`);
    if (page.lastEdited) {
      lines.push(`Ascentum 페이지 최근 수정: ${page.lastEdited}`);
    }
    if (recentEdits.length > 0) {
      lines.push("Ascentum 최근 편집 블록:");
      lines.push(
        ...recentEdits.map(
          (edit, idx) =>
            `${idx + 1}. [${edit.lastEdited}] (${edit.type}) ${String(edit.text || "").slice(0, 140)}`
        )
      );
    } else {
      lines.push("Ascentum 최근 편집 블록을 찾지 못했습니다.");
    }

    return {
      found: true,
      page,
      edits: recentEdits,
      text: lines.join("\n"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      found: false,
      text: `Ascentum 최근 편집 조회 실패: ${message}`,
      edits: [],
    };
  }
}

export async function getWorkProgressContext(targetYmd) {
  const notion = getNotionClient();
  const page = await readWorkDbTargetPage(notion, targetYmd);
  const ascentum = await getAscentumRecentEditContext(notion);
  if (!page) {
    const missingText = ["업무 DB 페이지를 찾지 못했습니다.", "", `[Ascentum 맥락]\n${ascentum.text}`].join("\n");
    return {
      found: false,
      text: missingText,
      completed: [],
      pending: [],
      ascentum,
    };
  }

  const todos = await collectTodoBlocks(notion, page.pageId, []);
  const completed = todos.filter((todo) => todo.checked).map((todo) => todo.text);
  const pending = todos.filter((todo) => !todo.checked).map((todo) => todo.text);

  const lines = [
    `업무 페이지: ${page.title || "(제목 없음)"}`,
    `완료 업무: ${completed.length}개`,
    `미완료 업무: ${pending.length}개`,
  ];

  if (completed.length > 0) {
    lines.push("완료 업무 목록:");
    lines.push(...completed.slice(0, 20).map((item, idx) => `${idx + 1}. ${item}`));
  }

  if (pending.length > 0) {
    lines.push("미완료 업무 목록:");
    lines.push(...pending.slice(0, 20).map((item, idx) => `${idx + 1}. ${item}`));
  }

  lines.push("");
  lines.push("[Ascentum 맥락]");
  lines.push(ascentum.text);

  return {
    found: true,
    page,
    completed,
    pending,
    ascentum,
    text: lines.join("\n"),
  };
}

async function loadProjectContext() {
  const now = Date.now();
  if (projectContextCache.value && now - projectContextCache.loadedAtMs < PROJECT_CONTEXT_CACHE_MS) {
    return projectContextCache.value;
  }

  try {
    const primaryPath = path.join(REPO_ROOT, STRATEGIC_CONTEXT_PRIMARY_FILE);
    const primaryContent = (await fs.readFile(primaryPath, "utf8")).trim();
    if (primaryContent) {
      const merged = `## ${STRATEGIC_CONTEXT_PRIMARY_FILE}\n${primaryContent.slice(0, 8000)}`;
      projectContextCache = {
        value: merged,
        loadedAtMs: now,
      };
      return merged;
    }
  } catch {
    // Fallback to legacy multi-document context loading.
  }

  const chunks = [];
  let budget = 8000;
  for (const relativePath of STRATEGIC_CONTEXT_FALLBACK_FILES) {
    if (budget <= 0) break;
    try {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      const snippet = content.trim().slice(0, 1800);
      if (!snippet) continue;
      const chunk = `## ${relativePath}\n${snippet}`;
      chunks.push(chunk.slice(0, budget));
      budget -= chunk.length + 2;
    } catch {
      // Keep going with available files.
    }
  }

  const merged = chunks.join("\n\n") || "프로젝트 맥락 문서를 찾지 못했습니다.";
  projectContextCache = {
    value: merged,
    loadedAtMs: now,
  };

  return merged;
}

export async function generateGeminiText({
  model,
  systemInstruction,
  userPrompt,
  temperature = 0.2,
  maxOutputTokens = 2048,
  thinkingLevel = null,
  responseMimeType = null,
  responseJsonSchema = null,
  timeoutMs = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000),
  maxRetries = Number(process.env.GEMINI_REQUEST_MAX_RETRIES || 1),
  onResponseMeta = null,
}) {
  const apiKey = getEnv("GEMINI_API_KEY");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;
  const retries = Number.isFinite(maxRetries) && maxRetries >= 0 ? Math.floor(maxRetries) : 1;
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel, null);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let statusCode = null;
    try {
      const generationConfig = {
        temperature,
        maxOutputTokens,
      };
      if (normalizedThinkingLevel) {
        generationConfig.thinkingConfig = {
          thinkingLevel: normalizedThinkingLevel,
        };
      }
      if (responseMimeType) {
        generationConfig.responseMimeType = responseMimeType;
      }
      if (responseJsonSchema) {
        generationConfig.responseJsonSchema = responseJsonSchema;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig,
        }),
      });

      statusCode = response.status;
      if (!response.ok) {
        const body = await response.text();
        const httpError = new Error(`Gemini API failed (${response.status}): ${body}`);
        if (attempt < retries && isRetryableGeminiFailure(httpError, response.status)) {
          const retryDelayMs = getGeminiRetryDelayMs(attempt);
          logDailyEvent("gemini.retry", {
            model,
            attempt: attempt + 1,
            maxAttempts: retries + 1,
            statusCode: response.status,
            retryDelayMs,
          });
          await sleep(retryDelayMs);
          continue;
        }
        throw httpError;
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts
        .map((part) => part?.text)
        .filter(Boolean)
        .join("\n");
      const finishReason = data?.candidates?.[0]?.finishReason || null;
      const usageMetadata = data?.usageMetadata || null;
      if (typeof onResponseMeta === "function") {
        try {
          onResponseMeta({
            model,
            attempt: attempt + 1,
            finishReason,
            usageMetadata,
            textLength: (text || "").length,
          });
        } catch {
          // Never fail the request because of logging callbacks.
        }
      }

      return text || "";
    } catch (error) {
      if (attempt < retries && isRetryableGeminiFailure(error, statusCode)) {
        const retryDelayMs = getGeminiRetryDelayMs(attempt);
        logDailyEvent("gemini.retry", {
          model,
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          statusCode,
          error: safeErrorMessage(error),
          retryDelayMs,
        });
        await sleep(retryDelayMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Gemini API request failed: exhausted retries");
}

export function chooseChatModel(messageText) {
  const text = (messageText || "").trim();
  const lowered = text.toLowerCase();

  const lightweightPrefixes = ["!help", "!ping", "!stats", "!daily", "도움말", "상태"];
  if (lightweightPrefixes.some((prefix) => lowered.startsWith(prefix))) {
    return GEMINI_FLASH_MODEL;
  }

  // Keep routing pro-first for advisory quality.
  return GEMINI_PRO_MODEL;
}

async function generateStrategicReviewText({
  model,
  systemInstruction,
  userPrompt,
  temperature,
  maxOutputTokens,
  thinkingLevel,
  responseMimeType = "application/json",
  responseJsonSchema = STRATEGIC_REVIEW_RESPONSE_JSON_SCHEMA,
  timeoutMs,
  maxRetries,
  stageLabel = "strategic_review",
  profileId = "unknown",
}) {
  let responseMeta = null;
  const text = await generateGeminiText({
    model,
    systemInstruction,
    userPrompt,
    temperature,
    maxOutputTokens,
    thinkingLevel,
    responseMimeType,
    responseJsonSchema,
    timeoutMs,
    maxRetries,
    onResponseMeta: (meta) => {
      responseMeta = meta;
      logDailyEvent("strategic_review.gemini_response", {
        stage: stageLabel,
        profileId,
        model: meta.model,
        attempt: meta.attempt,
        finishReason: meta.finishReason,
        promptTokens: meta?.usageMetadata?.promptTokenCount ?? null,
        candidateTokens: meta?.usageMetadata?.candidatesTokenCount ?? null,
        thoughtTokens: getThoughtTokens(meta?.usageMetadata),
        totalTokens: meta?.usageMetadata?.totalTokenCount ?? null,
        textLength: meta.textLength,
        maxOutputTokens,
        timeoutMs,
        thinkingLevel: normalizeThinkingLevel(thinkingLevel, null),
        responseMimeType,
      });
    },
  });

  const usageMetadata = responseMeta?.usageMetadata || null;
  return {
    text: text || "",
    model,
    finishReason: responseMeta?.finishReason ?? null,
    usageMetadata,
    promptTokens: usageMetadata?.promptTokenCount ?? null,
    candidateTokens: usageMetadata?.candidatesTokenCount ?? null,
    thoughtTokens: getThoughtTokens(usageMetadata),
    totalTokens: usageMetadata?.totalTokenCount ?? null,
  };
}

function buildStrategicReviewDeltaSnapshot(current, previous) {
  const cur = Number.isFinite(Number(current)) ? Number(current) : null;
  const prev = Number.isFinite(Number(previous)) ? Number(previous) : null;
  const delta = cur !== null && prev !== null ? cur - prev : null;
  return {
    current: cur,
    previous: prev,
    delta,
  };
}

function buildStrategicReviewInput({
  metrics,
  amplitudeConversion,
  previousMetrics,
  workProgress,
  targetYmd,
  projectContext,
  contextProfile = "full",
}) {
  const profile =
    STRATEGIC_CONTEXT_COMPRESSION_PROFILES[contextProfile] ||
    STRATEGIC_CONTEXT_COMPRESSION_PROFILES.full;
  const previousCounts = previousMetrics?.counts || {};
  const previousRates = previousMetrics?.rates || {};
  const completed = Array.isArray(workProgress?.completed) ? workProgress.completed : [];
  const pending = Array.isArray(workProgress?.pending) ? workProgress.pending : [];
  const ascentumEdits = Array.isArray(workProgress?.ascentum?.edits)
    ? workProgress.ascentum.edits
    : [];

  const compactEdits = ascentumEdits.slice(0, profile.editLimit).map((edit) => {
    const when = edit?.lastEdited ? String(edit.lastEdited) : "";
    const text = clipText(edit?.text || "", profile.editChars);
    return when ? `[${when}] ${text}` : text;
  });

  const input = {
    date: targetYmd,
    kpis: {
      totalSignups: buildStrategicReviewDeltaSnapshot(
        metrics?.counts?.totalSignups,
        previousCounts.totalSignups
      ),
      signupConversionRate: buildStrategicReviewDeltaSnapshot(
        amplitudeConversion?.currentRate,
        amplitudeConversion?.previousRate
      ),
      onboardingRate: buildStrategicReviewDeltaSnapshot(
        metrics?.rates?.onboarding,
        previousRates.onboarding
      ),
      pwaRate: buildStrategicReviewDeltaSnapshot(metrics?.rates?.pwa, previousRates.pwa),
      integrationRate: buildStrategicReviewDeltaSnapshot(
        metrics?.rates?.integrationAny,
        previousRates.integrationAny
      ),
      activationRate30d: buildStrategicReviewDeltaSnapshot(
        metrics?.rates?.activation30d,
        previousRates.activation30d
      ),
      paymentRate: buildStrategicReviewDeltaSnapshot(metrics?.rates?.payment, previousRates.payment),
    },
    activity: {
      dailyNewUsers: metrics?.counts?.dailyNewUsers ?? null,
      dailyRecordings: metrics?.counts?.dailyRecordings ?? null,
      heavyUsersTop3: (metrics?.heavyUserTop3 || []).slice(0, 3).map((item) => ({
        name: item?.name || "unknown",
        count: item?.count ?? 0,
      })),
    },
    workProgress: {
      completedCount: completed.length,
      pendingCount: pending.length,
      completedTop: completed.slice(0, profile.completedLimit),
      pendingTop: pending.slice(0, profile.pendingLimit),
      recentEditsTop: compactEdits,
      summary: clipText(workProgress?.text || "", profile.workSummaryChars),
    },
  };

  return {
    contextProfile,
    projectContext: clipText(projectContext, profile.projectContextChars),
    input,
  };
}

function buildStrategicReviewPrompt({ strategicInput }) {
  const lines = [
    "[프로젝트 맥락]",
    strategicInput.projectContext || "(없음)",
    "",
    "[운영 데이터(JSON)]",
    JSON.stringify(strategicInput.input, null, 2),
    "",
    "[출력 규칙]",
    "아래 스키마의 JSON 객체만 출력해라. 코드펜스/설명문 금지.",
    "{",
    '  "business_state": "string (2~5문장, 핵심 결론 + 근거 + 함의 + 우선순위 판단)",',
    '  "strengths": ["string", "... 최대 3개, 형식: 핵심포인트: 근거/해석"],',
    '  "risks": ["string", "... 최대 3개, 형식: 리스크명: 영향/근거"],',
    '  "priority_actions": [',
    '    { "action": "string", "expected_effect": "string", "why_now": "string (optional)" }',
    "  ],",
    '  "data_check_requests": ["string", "... 최대 3개"]',
    "}",
    "제약:",
    "- priority_actions는 1~5개",
    "- strengths/risks는 각 1~3개",
    "- data_check_requests는 0~3개",
    "- 과장 표현/추측 금지, 수치 근거 중심으로 명확하게 작성",
    "- 지나친 단문 압축 금지: 각 항목은 핵심 판단 + 근거를 함께 제시",
    "- 단순 나열 금지: 최소 2개 이상 지표를 서로 연결해 원인-결과 형태로 설명",
    "- 업무 진행상황(summary/완료/미완료/최근편집)에서 최소 1개 이상을 근거로 반영",
    "- 가능하면 완료/미완료 작업의 고유 작업명(또는 최근 편집 키워드)을 1개 이상 직접 언급",
    "- 상투적 표현(예: '지속 개선 필요')만 단독 사용 금지, 반드시 오늘 데이터 근거를 붙일 것",
  ];
  return lines.join("\n");
}

function extractJsonCandidate(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fence?.[1] ? fence[1].trim() : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return source;
  return source.slice(start, end + 1);
}

function normalizeStringArray(value, { min = 0, max = 5 } = {}) {
  const arr = Array.isArray(value) ? value : [];
  const normalized = arr
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
  if (normalized.length < min) return null;
  return normalized;
}

function normalizePriorityActions(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
  .map((item) => {
      const action = String(item?.action || "").trim();
      const expectedEffect = String(item?.expected_effect || item?.expectedEffect || "").trim();
      if (!action || !expectedEffect) return null;
      const whyNow = String(item?.why_now || item?.whyNow || "").trim();
      return {
        action,
        expectedEffect,
        whyNow: whyNow || null,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  if (normalized.length < 1) return null;
  return normalized;
}

function parseStrategicReviewJson(rawText) {
  const candidate = extractJsonCandidate(rawText);
  let parsed = null;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      ok: false,
      reason: "json_parse_failed",
      candidate,
    };
  }

  const businessState = String(parsed?.business_state || parsed?.businessState || "").trim();
  if (!businessState) {
    return { ok: false, reason: "missing_business_state", candidate };
  }

  const strengths = normalizeStringArray(parsed?.strengths, { min: 1, max: 3 });
  if (!strengths) {
    return { ok: false, reason: "invalid_strengths", candidate };
  }

  const risks = normalizeStringArray(parsed?.risks, { min: 1, max: 3 });
  if (!risks) {
    return { ok: false, reason: "invalid_risks", candidate };
  }

  const priorityActions = normalizePriorityActions(parsed?.priority_actions || parsed?.priorityActions);
  if (!priorityActions) {
    return { ok: false, reason: "invalid_priority_actions", candidate };
  }

  const dataCheckRequests =
    normalizeStringArray(parsed?.data_check_requests || parsed?.dataCheckRequests, {
      min: 0,
      max: 3,
    }) || [];

  return {
    ok: true,
    value: {
      businessState,
      strengths,
      risks,
      priorityActions,
      dataCheckRequests,
    },
  };
}

function renderStrategicReviewMarkdown(data) {
  const strengths = data?.strengths || [];
  const risks = data?.risks || [];
  const priorityActions = data?.priorityActions || [];
  const dataCheckRequests = data?.dataCheckRequests || [];
  const emphasizeLead = (text) => {
    const body = String(text || "").trim();
    if (!body) return "-";
    const colonIndex = body.indexOf(":");
    if (colonIndex > 0 && colonIndex <= 24) {
      const head = body.slice(0, colonIndex).trim();
      const tail = body.slice(colonIndex + 1).trim();
      if (!tail) return `**${head}**`;
      return `**${head}**: ${tail}`;
    }
    const commaIndex = body.indexOf(",");
    if (commaIndex > 0 && commaIndex <= 20) {
      const head = body.slice(0, commaIndex).trim();
      const tail = body.slice(commaIndex + 1).trim();
      if (!tail) return `**${head}**`;
      return `**${head}**, ${tail}`;
    }
    if (body.length <= 30) return `**${body}**`;
    return body;
  };

  const lines = [
    "**1) Archy 오늘 상태 진단**",
    `**핵심 결론:** ${String(data?.businessState || "-").trim()}`,
    "",
    "**2) 잘된 점**",
    ...strengths.map((item) => `- ${emphasizeLead(item)}`),
    "",
    "**3) 리스크/병목**",
    ...risks.map((item) => `- ${emphasizeLead(item)}`),
    "",
    "**4) 내일 바로 실행할 우선순위 액션**",
    ...priorityActions.flatMap((item, idx) => {
      const actionLine = `${idx + 1}. **${item.action}** (기대효과: ${item.expectedEffect})`;
      if (!item?.whyNow) return [actionLine];
      return [actionLine, `   - **왜 지금:** ${item.whyNow}`];
    }),
    "",
    "**5) 데이터 추가 확인 요청**",
    ...(dataCheckRequests.length > 0
      ? dataCheckRequests.map((item) => `- ${emphasizeLead(item)}`)
      : ["- 현재 추가 확인 요청 없음"]),
  ];

  return lines.join("\n").trim();
}

export const strategicReviewInternals = Object.freeze({
  buildStrategicReviewInput,
  buildStrategicReviewPrompt,
  parseStrategicReviewJson,
  renderStrategicReviewMarkdown,
  analyzeStrategicReview,
});

function analyzeStrategicReview(text) {
  const body = String(text || "").trim();
  const reasons = [];

  if (!body) {
    reasons.push("empty");
    return {
      needsContinuation: true,
      reasons,
      length: 0,
      actionCount: 0,
    };
  }
  const tailCheckBody = body.replace(/\*{1,2}/g, "").trim();
  if (/[0-9]\.\s*$/.test(tailCheckBody)) reasons.push("ends_with_numbered_prefix");
  if (/[:,;(\-]\s*$/.test(tailCheckBody)) reasons.push("ends_with_incomplete_tail");

  const sectionChecks = [
    { index: 1, keyword: "상태 진단" },
    { index: 2, keyword: "잘된 점" },
    { index: 3, keyword: "리스크" },
    { index: 4, keyword: "우선순위 액션" },
  ];
  for (const { index, keyword } of sectionChecks) {
    const pattern = new RegExp(`(^|\\n)\\s*(?:\\*{1,2})?${index}[\\)\\.]\\s*[^\\n]*${keyword}`);
    if (!pattern.test(body)) {
      reasons.push(`missing_section_${index}`);
    }
  }

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\*{1,2}\s*/, "").replace(/\s*\*{1,2}$/, ""))
    .filter(Boolean);

  if (lines.some((line) => /^[1-5]\.\s*$/.test(line))) reasons.push("incomplete_numbered_line");

  const actionHeaderIndex = lines.findIndex(
    (line) => /^[4][\)\.]\s*/.test(line) && line.includes("우선순위 액션")
  );
  if (actionHeaderIndex < 0) {
    reasons.push("missing_action_header");
    return {
      needsContinuation: true,
      reasons,
      length: body.length,
      actionCount: 0,
    };
  }

  const restAfterActionHeader = lines.slice(actionHeaderIndex + 1);
  const nextSectionIndex = restAfterActionHeader.findIndex((line) => /^[5][\)\.]\s*/.test(line));
  const actionSectionLines =
    nextSectionIndex >= 0 ? restAfterActionHeader.slice(0, nextSectionIndex) : restAfterActionHeader;

  const actionLines = actionSectionLines.filter((line) => /^[1-5][\)\.]\s+\S/.test(line));
  if (actionLines.length < 1 || actionLines.length > 5) reasons.push("invalid_action_count");
  if (body.length < STRATEGIC_REVIEW_MIN_LENGTH) reasons.push("below_min_length");

  return {
    needsContinuation: reasons.length > 0,
    reasons,
    length: body.length,
    actionCount: actionLines.length,
  };
}

export async function generateDailyStrategicReview({
  metrics,
  amplitudeConversion,
  previousMetrics,
  workProgress,
  targetYmd,
}) {
  const startedAtMs = Date.now();
  const slaMs = toPositiveInt(process.env.GEMINI_STRATEGIC_REVIEW_SLA_MS, 300000, {
    min: 60000,
    max: 600000,
  });
  const deadlineMs = startedAtMs + slaMs;
  const temperature = toFiniteNumber(process.env.GEMINI_STRATEGIC_REVIEW_TEMPERATURE, 1.0);
  const maxRetries = toPositiveInt(process.env.GEMINI_STRATEGIC_REVIEW_MAX_RETRIES, 0, {
    min: 0,
    max: 2,
  });
  const minCandidateTokens = toPositiveInt(
    process.env.GEMINI_STRATEGIC_REVIEW_MIN_CANDIDATE_TOKENS,
    180,
    { min: 1, max: 2000 }
  );
  const proMaxOutputTokens = toPositiveInt(
    process.env.GEMINI_STRATEGIC_REVIEW_PRO_MAX_OUTPUT_TOKENS,
    5120,
    { min: 512, max: 8192 }
  );
  const proRetryMaxOutputTokens = toPositiveInt(
    process.env.GEMINI_STRATEGIC_REVIEW_PRO_RETRY_MAX_OUTPUT_TOKENS,
    Math.max(proMaxOutputTokens, 6144),
    { min: 512, max: 8192 }
  );
  const flashMaxOutputTokens = toPositiveInt(
    process.env.GEMINI_STRATEGIC_REVIEW_FLASH_MAX_OUTPUT_TOKENS,
    2048,
    { min: 512, max: 8192 }
  );
  const proTimeoutMs = toPositiveInt(process.env.GEMINI_STRATEGIC_REVIEW_PRO_TIMEOUT_MS, 90000, {
    min: 10000,
    max: 180000,
  });
  const flashTimeoutMs = toPositiveInt(
    process.env.GEMINI_STRATEGIC_REVIEW_FLASH_TIMEOUT_MS,
    60000,
    {
      min: 10000,
      max: 180000,
    }
  );
  const proThinkingLevel = normalizeThinkingLevel(
    process.env.GEMINI_STRATEGIC_REVIEW_FORCE_THINKING_LEVEL_PRO,
    "high"
  );
  const flashThinkingLevel = normalizeThinkingLevel(
    process.env.GEMINI_STRATEGIC_REVIEW_FORCE_THINKING_LEVEL_FLASH,
    "high"
  );
  const projectContext = await loadProjectContext();
  const systemInstruction = [
    "너는 Archy 서비스의 전략 자문 에이전트다.",
    "숫자 근거 중심으로 판단하며 과장/추측을 금지한다.",
    "출력은 지정된 JSON 스키마만 반환한다.",
  ].join(" ");

  const profiles = [
    {
      id: "pro_full",
      model: GEMINI_PRO_MODEL,
      contextProfile: "full",
      maxOutputTokens: proMaxOutputTokens,
      timeoutMs: proTimeoutMs,
      thinkingLevel: proThinkingLevel,
      allowJsonRetryBoost: true,
    },
    {
      id: "pro_compact",
      model: GEMINI_PRO_MODEL,
      contextProfile: "compact",
      maxOutputTokens: proMaxOutputTokens,
      timeoutMs: proTimeoutMs,
      thinkingLevel: proThinkingLevel,
      allowJsonRetryBoost: true,
    },
    {
      id: "flash_compact",
      model: GEMINI_FLASH_MODEL,
      contextProfile: "compact",
      maxOutputTokens: flashMaxOutputTokens,
      timeoutMs: flashTimeoutMs,
      thinkingLevel: flashThinkingLevel,
      allowJsonRetryBoost: false,
    },
    {
      id: "flash_ultra",
      model: GEMINI_FLASH_MODEL,
      contextProfile: "ultra",
      maxOutputTokens: flashMaxOutputTokens,
      timeoutMs: 45000,
      thinkingLevel: flashThinkingLevel,
      allowJsonRetryBoost: false,
    },
  ];

  let maxTokensShortCount = 0;
  let schemaInvalidCount = 0;
  let validationFailureCount = 0;
  let timeoutCount = 0;
  let lastFailure = null;
  let lastValidationReasons = [];

  for (const profile of profiles) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 1500) {
      timeoutCount += 1;
      lastFailure = "deadline_exceeded_before_attempt";
      break;
    }

    const strategicInput = buildStrategicReviewInput({
      metrics,
      amplitudeConversion,
      previousMetrics,
      workProgress,
      targetYmd,
      projectContext,
      contextProfile: profile.contextProfile,
    });
    const userPrompt = buildStrategicReviewPrompt({ strategicInput });
    const effectiveTimeoutMs = Math.max(1000, Math.min(profile.timeoutMs, remainingMs - 500));

    logDailyEvent("strategic_review.profile_start", {
      profileId: profile.id,
      model: profile.model,
      contextProfile: profile.contextProfile,
      timeoutMs: effectiveTimeoutMs,
      maxOutputTokens: profile.maxOutputTokens,
      thinkingLevel: profile.thinkingLevel,
      remainingMs,
    });

    let modelResult = null;
    try {
      modelResult = await generateStrategicReviewText({
        model: profile.model,
        systemInstruction,
        userPrompt,
        temperature,
        maxOutputTokens: profile.maxOutputTokens,
        thinkingLevel: profile.thinkingLevel,
        timeoutMs: effectiveTimeoutMs,
        maxRetries,
        stageLabel: `strategic_review.${profile.id}`,
        profileId: profile.id,
      });
    } catch (error) {
      const message = safeErrorMessage(error).toLowerCase();
      if (message.includes("timeout") || message.includes("aborted")) {
        timeoutCount += 1;
      }
      lastFailure = safeErrorMessage(error);
      logDailyEvent("strategic_review.profile_error", {
        profileId: profile.id,
        model: profile.model,
        reason: safeErrorMessage(error).slice(0, 180),
      });
      continue;
    }

    const candidateTokens = toFiniteNumber(modelResult?.candidateTokens, null);
    if (
      modelResult?.finishReason === "MAX_TOKENS" &&
      candidateTokens !== null &&
      candidateTokens < minCandidateTokens
    ) {
      maxTokensShortCount += 1;
      lastFailure = `max_tokens_short_output(${candidateTokens})`;
      logDailyEvent("strategic_review.profile_short_output", {
        profileId: profile.id,
        finishReason: modelResult.finishReason,
        candidateTokens,
        minCandidateTokens,
      });
      continue;
    }

    const parsed = parseStrategicReviewJson(modelResult?.text || "");
    if (!parsed.ok) {
      schemaInvalidCount += 1;
      lastFailure = parsed.reason;
      logDailyEvent("strategic_review.profile_schema_invalid", {
        profileId: profile.id,
        reason: parsed.reason,
        finishReason: modelResult?.finishReason || null,
        candidateTokens: candidateTokens ?? null,
      });

      const shouldRetryWithBoost =
        profile.allowJsonRetryBoost &&
        profile.model === GEMINI_PRO_MODEL &&
        parsed.reason === "json_parse_failed" &&
        modelResult?.finishReason === "MAX_TOKENS" &&
        profile.maxOutputTokens < proRetryMaxOutputTokens;
      if (shouldRetryWithBoost) {
        const retryRemainingMs = deadlineMs - Date.now();
        if (retryRemainingMs > 1500) {
          const retryTimeoutMs = Math.max(1000, Math.min(profile.timeoutMs, retryRemainingMs - 500));
          logDailyEvent("strategic_review.profile_retry_start", {
            profileId: profile.id,
            retryKind: "json_parse_after_max_tokens",
            retryMaxOutputTokens: proRetryMaxOutputTokens,
            retryTimeoutMs,
            remainingMs: retryRemainingMs,
          });
          try {
            const retryResult = await generateStrategicReviewText({
              model: profile.model,
              systemInstruction,
              userPrompt,
              temperature,
              maxOutputTokens: proRetryMaxOutputTokens,
              thinkingLevel: profile.thinkingLevel,
              timeoutMs: retryTimeoutMs,
              maxRetries,
              stageLabel: `strategic_review.${profile.id}.retry_boost`,
              profileId: `${profile.id}_retry`,
            });
            const retryCandidateTokens = toFiniteNumber(retryResult?.candidateTokens, null);
            if (
              retryResult?.finishReason === "MAX_TOKENS" &&
              retryCandidateTokens !== null &&
              retryCandidateTokens < minCandidateTokens
            ) {
              maxTokensShortCount += 1;
              lastFailure = `max_tokens_short_output_retry(${retryCandidateTokens})`;
              logDailyEvent("strategic_review.profile_short_output", {
                profileId: `${profile.id}_retry`,
                finishReason: retryResult.finishReason,
                candidateTokens: retryCandidateTokens,
                minCandidateTokens,
              });
              continue;
            }

            const retryParsed = parseStrategicReviewJson(retryResult?.text || "");
            if (!retryParsed.ok) {
              schemaInvalidCount += 1;
              lastFailure = `retry:${retryParsed.reason}`;
              logDailyEvent("strategic_review.profile_schema_invalid", {
                profileId: `${profile.id}_retry`,
                reason: retryParsed.reason,
                finishReason: retryResult?.finishReason || null,
                candidateTokens: retryCandidateTokens ?? null,
              });
              continue;
            }

            const retryRendered = renderStrategicReviewMarkdown(retryParsed.value);
            const retryAnalysis = analyzeStrategicReview(retryRendered);
            if (retryAnalysis.needsContinuation) {
              validationFailureCount += 1;
              lastValidationReasons = retryAnalysis.reasons;
              lastFailure = `validation_retry:${retryAnalysis.reasons.join(",")}`;
              logDailyEvent("strategic_review.profile_validation_failed", {
                profileId: `${profile.id}_retry`,
                reasons: retryAnalysis.reasons,
                reviewLength: retryAnalysis.length,
                actionCount: retryAnalysis.actionCount,
              });
              continue;
            }

            logDailyEvent("strategic_review.profile_success", {
              profileId: `${profile.id}_retry`,
              durationMs: Date.now() - startedAtMs,
              reviewLength: retryRendered.length,
            });
            return retryRendered;
          } catch (error) {
            const message = safeErrorMessage(error).toLowerCase();
            if (message.includes("timeout") || message.includes("aborted")) {
              timeoutCount += 1;
            }
            lastFailure = `retry_error:${safeErrorMessage(error)}`;
            logDailyEvent("strategic_review.profile_error", {
              profileId: `${profile.id}_retry`,
              model: profile.model,
              reason: safeErrorMessage(error).slice(0, 180),
            });
          }
        }
      }
      continue;
    }

    const rendered = renderStrategicReviewMarkdown(parsed.value);
    const analysis = analyzeStrategicReview(rendered);
    if (analysis.needsContinuation) {
      validationFailureCount += 1;
      lastValidationReasons = analysis.reasons;
      lastFailure = `validation:${analysis.reasons.join(",")}`;
      logDailyEvent("strategic_review.profile_validation_failed", {
        profileId: profile.id,
        reasons: analysis.reasons,
        reviewLength: analysis.length,
        actionCount: analysis.actionCount,
      });
      continue;
    }

    logDailyEvent("strategic_review.profile_success", {
      profileId: profile.id,
      durationMs: Date.now() - startedAtMs,
      reviewLength: rendered.length,
    });
    return rendered;
  }

  let errorCode = STRATEGIC_REVIEW_ERROR_CODES.UNKNOWN;
  if (maxTokensShortCount >= 2) {
    errorCode = STRATEGIC_REVIEW_ERROR_CODES.MAX_TOKENS_REPEATED;
  } else if (timeoutCount > 0 && Date.now() >= deadlineMs) {
    errorCode = STRATEGIC_REVIEW_ERROR_CODES.TIMEOUT_EXHAUSTED;
  } else if (schemaInvalidCount > 0) {
    errorCode = STRATEGIC_REVIEW_ERROR_CODES.SCHEMA_INVALID;
  } else if (validationFailureCount > 0) {
    errorCode = STRATEGIC_REVIEW_ERROR_CODES.VALIDATION_FAILED;
  } else if (timeoutCount > 0) {
    errorCode = STRATEGIC_REVIEW_ERROR_CODES.TIMEOUT_EXHAUSTED;
  }

  const reason = [
    `code=${errorCode}`,
    `maxTokensShort=${maxTokensShortCount}`,
    `schemaInvalid=${schemaInvalidCount}`,
    `validationFailed=${validationFailureCount}`,
    `timeout=${timeoutCount}`,
    `lastFailure=${lastFailure || "-"}`,
    `validationReasons=${lastValidationReasons.join("|") || "-"}`,
  ].join(", ");

  logDailyEvent("strategic_review.validation_failed", {
    code: errorCode,
    reason,
    minLength: STRATEGIC_REVIEW_MIN_LENGTH,
    durationMs: Date.now() - startedAtMs,
  });
  throw createStrategicReviewError(errorCode, reason, {
    maxTokensShortCount,
    schemaInvalidCount,
    validationFailureCount,
    timeoutCount,
    lastFailure,
    validationReasons: lastValidationReasons,
  });
}

function compareNotionMetric(currentValue, previousValue) {
  return summarizeDiffRate(currentValue, previousValue);
}

function describeAmplitudeSource(amplitudeConversion) {
  const source = amplitudeConversion?.source;
  if (!source) return "-";

  const map = {
    dashboard_api: "Amplitude Dashboard API",
    custom_api: "커스텀 API",
    dashboard_funnel_derived: "Amplitude Funnel 응답(일별 추정)",
    custom_api_funnel_derived: "커스텀 Funnel 응답(일별 추정)",
    dashboard_funnel_aggregate: "Amplitude Funnel 응답(집계 추정)",
    custom_api_funnel_aggregate: "커스텀 Funnel 응답(집계 추정)",
    static_env: "환경변수 고정값",
    not_configured: "미설정(차트 ID 없음)",
    dashboard_unparsed: "Dashboard 응답 파싱 실패(포맷 불일치)",
    custom_api_unparsed: "커스텀 API 응답 파싱 실패(포맷 불일치)",
    error: "조회 실패",
  };

  const base = map[source] || source;
  const diagnostics = [
    amplitudeConversion?.error ? `error=${String(amplitudeConversion.error).slice(0, 120)}` : null,
    amplitudeConversion?.rawShape ? `shape=${amplitudeConversion.rawShape}` : null,
    amplitudeConversion?.effectiveYmd ? `effectiveYmd=${amplitudeConversion.effectiveYmd}` : null,
    amplitudeConversion?.previousEffectiveYmd ? `previousYmd=${amplitudeConversion.previousEffectiveYmd}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return diagnostics ? `${base} (${diagnostics})` : base;
}

export async function runDailyPipeline({
  runDate = new Date(),
  targetYmd: forcedTargetYmd = null,
  dryRun = false,
  skipStrategicReview = false,
} = {}) {
  const runStartedAtMs = Date.now();
  const runYmd = toKstYmd(runDate);
  const runId = `daily_${runYmd}_${randomUUID().slice(0, 8)}`;
  const targetYmd = forcedTargetYmd || addDays(runYmd, -1);
  const previousYmd = addDays(targetYmd, -1);

  logDailyEvent("run.start", {
    runId,
    runYmd,
    targetYmd,
    dryRun,
    skipStrategicReview,
  });

  try {
    const supabaseStartedAt = Date.now();
    const snapshot = await fetchSupabaseSnapshot();
    logDailyEvent("step.done", {
      runId,
      step: "fetch_supabase_snapshot",
      durationMs: Date.now() - supabaseStartedAt,
      users: snapshot?.users?.length ?? 0,
      recordings: snapshot?.recordings?.length ?? 0,
      customFormats: snapshot?.customFormats?.length ?? 0,
      withdrawnUsers: snapshot?.withdrawnUsers?.length ?? 0,
    });

    const metrics = buildMetricsForDate(snapshot, targetYmd);
    const previousMetrics = buildMetricsForDate(snapshot, previousYmd);

    let amplitudeConversion = null;
    const amplitudeStartedAt = Date.now();
    try {
      amplitudeConversion = await fetchAmplitudeSignupConversion({
        targetYmd,
        previousYmd,
      });
      logDailyEvent("step.done", {
        runId,
        step: "fetch_amplitude_signup_conversion",
        durationMs: Date.now() - amplitudeStartedAt,
        source: amplitudeConversion?.source ?? null,
      });
    } catch (error) {
      amplitudeConversion = {
        source: "error",
        currentRate: null,
        previousRate: null,
        error: safeErrorMessage(error),
      };
      logDailyEvent("step.error", {
        runId,
        step: "fetch_amplitude_signup_conversion",
        durationMs: Date.now() - amplitudeStartedAt,
        error: safeErrorMessage(error),
      });
    }

    const dailyLabel = formatKoreanDayLabel(targetYmd);
    const previousLabel = formatKoreanDayLabel(previousYmd);

    let previousNotion = null;
    let previousNotionError = null;
    if (!dryRun) {
      const previousNotionStartedAt = Date.now();
      try {
        previousNotion = await getNotionMetricsByLabel(previousLabel);
        logDailyEvent("step.done", {
          runId,
          step: "get_previous_notion_metrics",
          durationMs: Date.now() - previousNotionStartedAt,
          found: Boolean(previousNotion),
        });
      } catch (error) {
        previousNotionError = safeErrorMessage(error);
        logDailyEvent("step.error", {
          runId,
          step: "get_previous_notion_metrics",
          durationMs: Date.now() - previousNotionStartedAt,
          error: previousNotionError,
        });
      }
    }

    let sheetSync = null;
    let dailyNotionUpsert = null;

    if (!dryRun) {
      const sheetSyncStartedAt = Date.now();
      sheetSync = await syncGoogleUserSheet({ metrics, targetYmd });
      logDailyEvent("step.done", {
        runId,
        step: "sync_google_sheet",
        durationMs: Date.now() - sheetSyncStartedAt,
        insertedRows: sheetSync?.insertedRows ?? 0,
        updatedRows: sheetSync?.updatedRows ?? 0,
        removedExcludedRows: sheetSync?.removedExcludedRows ?? 0,
        removedDuplicateRows: sheetSync?.removedDuplicateRows ?? 0,
        nonMappedHeaderCount: sheetSync?.nonMappedHeaders?.length ?? 0,
        nonMappedHeadersPreview: (sheetSync?.nonMappedHeaders || []).slice(0, 8),
      });

      const dailyNotionStartedAt = Date.now();
      dailyNotionUpsert = await upsertNotionMetricsRow({
        label: dailyLabel,
        metrics,
        conversionRate: amplitudeConversion.currentRate,
      });
      logDailyEvent("step.done", {
        runId,
        step: "upsert_notion_daily",
        durationMs: Date.now() - dailyNotionStartedAt,
        mode: dailyNotionUpsert?.mode ?? null,
      });
    }

    let workProgress = null;
    let workProgressError = null;
    const workProgressStartedAt = Date.now();
    try {
      workProgress = await getWorkProgressContext(targetYmd);
      logDailyEvent("step.done", {
        runId,
        step: "load_work_progress",
        durationMs: Date.now() - workProgressStartedAt,
        found: Boolean(workProgress?.found),
        completedCount: workProgress?.completed?.length ?? 0,
        pendingCount: workProgress?.pending?.length ?? 0,
      });
    } catch (error) {
      workProgressError = safeErrorMessage(error);
      workProgress = {
        found: false,
        text: `업무 DB 조회 실패: ${workProgressError}`,
        completed: [],
        pending: [],
      };
      logDailyEvent("step.error", {
        runId,
        step: "load_work_progress",
        durationMs: Date.now() - workProgressStartedAt,
        error: workProgressError,
      });
    }

    let strategicReview = null;
    let strategicReviewError = null;
    let strategicReviewErrorCode = null;
    if (!skipStrategicReview) {
      const strategicReviewStartedAt = Date.now();
      try {
        strategicReview = await generateDailyStrategicReview({
          metrics,
          amplitudeConversion,
          previousMetrics,
          workProgress,
          targetYmd,
        });
        logDailyEvent("step.done", {
          runId,
          step: "generate_strategic_review",
          durationMs: Date.now() - strategicReviewStartedAt,
          reviewLength: strategicReview?.length ?? 0,
        });
      } catch (error) {
        strategicReviewError = safeErrorMessage(error);
        strategicReviewErrorCode = getStrategicReviewErrorCode(error);
        strategicReview = null;
        logDailyEvent("step.error", {
          runId,
          step: "generate_strategic_review",
          durationMs: Date.now() - strategicReviewStartedAt,
          errorCode: strategicReviewErrorCode,
          error: strategicReviewError,
        });
      }
    }

    const summary = {
      runId,
      runYmd,
      targetYmd,
      dailyLabel,
      counts: metrics.counts,
      rates: metrics.rates,
      amplitudeConversion,
      previous: {
        label: previousLabel,
        notion: previousNotion,
        notionError: previousNotionError,
        fallbackRates: previousMetrics.rates,
        fallbackCounts: previousMetrics.counts,
      },
      sheetSync,
      dailyNotionUpsert,
      heavyUserTop3: metrics.heavyUserTop3,
      workProgress,
      workProgressError,
      strategicReview,
      strategicReviewError,
      strategicReviewErrorCode,
    };

    logDailyEvent("run.done", {
      runId,
      targetYmd,
      durationMs: Date.now() - runStartedAtMs,
      strategicReviewGenerated: Boolean(strategicReview),
      strategicReviewErrorCode,
      strategicReviewError: strategicReviewError ? String(strategicReviewError).slice(0, 180) : null,
    });

    return summary;
  } catch (error) {
    logDailyEvent("run.error", {
      runId,
      targetYmd,
      durationMs: Date.now() - runStartedAtMs,
      error: safeErrorMessage(error),
    });
    throw error;
  }
}

export function buildDiscordMetricText(report) {
  const previous = report.previous?.notion;
  const previousRates = report.previous?.fallbackRates || {};
  const previousCounts = report.previous?.fallbackCounts || {};

  const prevUserCount = previous?.totalSignups ?? previousCounts.totalSignups ?? null;
  const prevOnboarding = previous?.onboardingRate ?? previousRates.onboarding ?? null;
  const prevPwa = previous?.pwaRate ?? previousRates.pwa ?? null;
  const prevIntegration = previous?.integrationRate ?? previousRates.integrationAny ?? null;
  const prevActivation = previous?.activationRate ?? previousRates.activation30d ?? null;
  const prevPayment = previous?.paymentRate ?? previousRates.payment ?? null;
  const prevConversion = previous?.conversionRate ?? report.amplitudeConversion.previousRate ?? null;
  const conversionSourceText = describeAmplitudeSource(report.amplitudeConversion);
  const conversionUnavailableSuffix =
    report.amplitudeConversion?.currentRate === null ? ` (미조회: ${conversionSourceText})` : "";

  const lines = [
    `**유저 수**: ${summarizeDiffCount(report.counts.totalSignups, prevUserCount)}`,
    `**가입전환율**: ${compareNotionMetric(report.amplitudeConversion.currentRate, prevConversion)}${conversionUnavailableSuffix}`,
    `**온보딩율**: ${compareNotionMetric(report.rates.onboarding, prevOnboarding)}`,
    `**PWA 설치율**: ${compareNotionMetric(report.rates.pwa, prevPwa)}`,
    `**연동율**: ${compareNotionMetric(report.rates.integrationAny, prevIntegration)}`,
    `**활성화율(30일)**: ${compareNotionMetric(report.rates.activation30d, prevActivation)}`,
    `**결제율**: ${compareNotionMetric(report.rates.payment, prevPayment)}`,
  ];

  const heavy = report.heavyUserTop3
    .map((item, idx) => `${idx + 1}. ${item.name} (${item.count}회)`)
    .join("\n");

  return {
    overviewText: lines.join("\n"),
    heavyUserText: heavy || "데이터 없음",
    amplitudeSourceText: conversionSourceText,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const dryRun = process.argv.includes("--dry-run");
  const skipReview = process.argv.includes("--skip-review") || dryRun;
  const targetYmd = dateArg ? dateArg.split("=")[1] : null;

  runDailyPipeline({ targetYmd, dryRun, skipStrategicReview: skipReview })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
