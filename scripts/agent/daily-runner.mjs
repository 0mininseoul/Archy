import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";

export const KST_TIMEZONE = "Asia/Seoul";
export const GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";
export const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
export const FIXED_EXCLUDED_USER_IDS = [
  "2018416a-14dc-4087-91aa-24cf68451366",
  "724261a2-8cdd-4318-9c99-fd8c7a39c5d8",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const PROJECT_CONTEXT_CACHE_MS = 60 * 60 * 1000;

let projectContextCache = {
  value: "",
  loadedAtMs: 0,
};

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

function isSundayKst(inputDate = new Date()) {
  const ymd = toKstYmd(inputDate);
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return weekday === 0;
}

function formatKoreanDayLabel(ymd) {
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

async function fetchSupabaseSnapshot() {
  const supabase = getSupabaseAdminClient();
  const selectWithPayment =
    "id,email,name,google_id,created_at,is_onboarded,pwa_installed_at,notion_access_token,google_access_token,slack_access_token,is_paid_user,paid_ever,promo_code_id,promo_expires_at";
  const selectWithoutPayment =
    "id,email,name,google_id,created_at,is_onboarded,pwa_installed_at,notion_access_token,google_access_token,slack_access_token,promo_code_id,promo_expires_at";

  const [initialUsersRes, recordingsRes, formatsRes, withdrawnRes] = await Promise.all([
    supabase.from("users").select(selectWithPayment),
    supabase.from("recordings").select("id,user_id,created_at,status"),
    supabase.from("custom_formats").select("id,user_id,created_at"),
    supabase.from("withdrawn_users").select("id,original_user_id,name,withdrawn_at"),
  ]);

  let usersRes = initialUsersRes;
  if (
    usersRes.error &&
    typeof usersRes.error?.message === "string" &&
    usersRes.error.message.includes("is_paid_user")
  ) {
    const fallback = await supabase.from("users").select(selectWithoutPayment);
    usersRes = fallback.error
      ? fallback
      : {
          data: (fallback.data || []).map((user) => ({
            ...user,
            is_paid_user: false,
            paid_ever: false,
          })),
          error: null,
        };
  }

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

function buildMetricsForDate(snapshot, targetYmd) {
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
  const totalSignups = activeUsersCount + withdrawnUsersCount;

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

function buildSheetRowForUser(user, header, derivedUserState) {
  const state = derivedUserState.get(user.id);

  return header.map((column) => {
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

    return toRowValue(user[column]);
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

  const usersToInsert = [...metrics.usersOnTargetDate]
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
    removedExcludedRows: rowsToDelete.filter((r) => r.reason === "excluded").length,
    removedDuplicateRows: rowsToDelete.filter((r) => r.reason === "duplicate").length,
    skippedExistingRows: metrics.usersOnTargetDate.length - rows.length,
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
    // Epoch milliseconds fallback.
    return toKstYmd(new Date(value));
  }

  if (typeof value === "string") {
    const datePrefix = value.match(/\d{4}-\d{2}-\d{2}/);
    if (datePrefix) return datePrefix[0];

    const date = parseDbTimestampAsKst(value);
    if (date) return toKstYmd(date);
  }

  return null;
}

function extractConversionSeries(payload) {
  const tryExtract = (root) => {
    if (!root || typeof root !== "object") return [];

    // Common pattern: { xValues: [...], series: [{ values: [...] }] }
    if (Array.isArray(root.xValues) && Array.isArray(root.series)) {
      const points = [];
      for (const series of root.series) {
        const values = series?.values || series?.data || [];
        for (let i = 0; i < Math.min(root.xValues.length, values.length); i += 1) {
          const ymd = toYmdFromUnknownDate(root.xValues[i]);
          const rate = Number(values[i]);
          if (!ymd || Number.isNaN(rate)) continue;
          points.push({ ymd, rate });
        }
      }
      if (points.length > 0) return points;
    }

    // Pattern: [{ date, value }]
    if (Array.isArray(root)) {
      const points = [];
      for (const item of root) {
        if (!item || typeof item !== "object") continue;
        const ymd =
          toYmdFromUnknownDate(item.date) ||
          toYmdFromUnknownDate(item.day) ||
          toYmdFromUnknownDate(item.x) ||
          toYmdFromUnknownDate(item.timestamp);
        const value = Number(item.rate ?? item.value ?? item.y ?? item.conversion_rate);
        if (!ymd || Number.isNaN(value)) continue;
        points.push({ ymd, rate: value });
      }
      if (points.length > 0) return points;
    }

    return [];
  };

  const roots = [payload, payload?.data, payload?.data?.series, payload?.series, payload?.results];
  for (const root of roots) {
    const points = tryExtract(root);
    if (points.length > 0) {
      return points;
    }
  }

  return [];
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
    return {
      source: customApiUrl ? "custom_api_unparsed" : "dashboard_unparsed",
      currentRate: null,
      previousRate: null,
      raw: payload,
    };
  }

  const byDate = new Map();
  for (const point of points) {
    byDate.set(point.ymd, point.rate);
  }

  return {
    source: customApiUrl ? "custom_api" : "dashboard_api",
    currentRate: byDate.get(targetYmd) ?? null,
    previousRate: byDate.get(previousYmd) ?? null,
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
  return getEnv("NOTION_USER_METRICS_DATABASE_ID", {
    fallback: "317bd55c-4778-80bb-9ae8-d597501f7dbe",
  });
}

const notionMetricsDataSourceCache = {
  key: null,
  dataSourceId: null,
};

async function resolveNotionMetricsDataSourceId(notion) {
  const configuredId = getNotionUserMetricsDatabaseId();
  if (notionMetricsDataSourceCache.key === configuredId && notionMetricsDataSourceCache.dataSourceId) {
    return notionMetricsDataSourceCache.dataSourceId;
  }

  // 1) Prefer direct data source id.
  try {
    const ds = await notion.dataSources.retrieve({
      data_source_id: configuredId,
    });
    if (ds?.id) {
      notionMetricsDataSourceCache.key = configuredId;
      notionMetricsDataSourceCache.dataSourceId = ds.id;
      return ds.id;
    }
  } catch {
    // Fall through to database lookup.
  }

  // 2) Fallback: configured id is database id -> use first data source.
  const database = await notion.databases.retrieve({
    database_id: configuredId,
  });

  const firstDataSourceId = database?.data_sources?.[0]?.id;
  if (!firstDataSourceId) {
    throw new Error(
      "NOTION_USER_METRICS_DATABASE_ID must be a data_source id, or a database id that contains at least one data source."
    );
  }

  notionMetricsDataSourceCache.key = configuredId;
  notionMetricsDataSourceCache.dataSourceId = firstDataSourceId;
  return firstDataSourceId;
}

async function findNotionPageByTitle(notion, dataSourceId, title) {
  const result = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "이름",
      title: {
        equals: title,
      },
    },
    page_size: 1,
  });

  return result.results?.[0] || null;
}

function buildNotionMetricProperties(label, metrics, conversionRate) {
  const properties = {
    이름: {
      title: [{ text: { content: label } }],
    },
    "유저 수": { number: metrics.counts.totalSignups },
    "가입전환율": { number: conversionRate ?? null },
    "온보딩율": { number: metrics.rates.onboarding },
    "PWA 설치율": { number: metrics.rates.pwa },
    "연동율": { number: metrics.rates.integrationAny },
    "활성화율": { number: metrics.rates.activation30d },
    "커스텀 포맷 이용률": { number: metrics.rates.customFormat },
    "노션 연동율": { number: metrics.rates.notionIntegration },
    "구글 독스 연동율": { number: metrics.rates.googleIntegration },
    "슬랙 연동율": { number: metrics.rates.slackIntegration },
    "결제율": { number: metrics.rates.payment },
  };

  return properties;
}

export async function upsertNotionMetricsRow({ label, metrics, conversionRate }) {
  const notion = getNotionClient();
  const dataSourceId = await resolveNotionMetricsDataSourceId(notion);
  const properties = buildNotionMetricProperties(label, metrics, conversionRate);

  const existing = await findNotionPageByTitle(notion, dataSourceId, label);
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

export async function getNotionMetricsByLabel(label) {
  const notion = getNotionClient();
  const dataSourceId = await resolveNotionMetricsDataSourceId(notion);
  const page = await findNotionPageByTitle(notion, dataSourceId, label);
  if (!page) return null;

  const getNumber = (name) => {
    const prop = page.properties?.[name];
    if (!prop || typeof prop !== "object") return null;
    if (prop.type !== "number") return null;
    return prop.number;
  };

  return {
    label,
    totalSignups: getNumber("유저 수"),
    conversionRate: getNumber("가입전환율"),
    onboardingRate: getNumber("온보딩율"),
    pwaRate: getNumber("PWA 설치율"),
    integrationRate: getNumber("연동율"),
    activationRate: getNumber("활성화율"),
    paymentRate: getNumber("결제율"),
  };
}

async function readWorkDbTargetPage(notion, targetYmd) {
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

  const token = targetYmd.slice(2).replaceAll("-", ""); // 2026-03-04 -> 260304
  let workDataSourceId = null;
  if (collection.object === "data_source") {
    workDataSourceId = collection.id;
  } else if (collection.object === "database") {
    const db = await notion.databases.retrieve({ database_id: collection.id });
    workDataSourceId = db?.data_sources?.[0]?.id || null;
  }
  if (!workDataSourceId) return null;

  const pages = await notion.dataSources.query({
    data_source_id: workDataSourceId,
    page_size: 30,
    sorts: [{ direction: "descending", timestamp: "created_time" }],
  });

  const extractTitle = (page) => {
    const titleProperty = Object.values(page.properties || {}).find(
      (property) => property && typeof property === "object" && property.type === "title"
    );
    const text = titleProperty?.title?.map((segment) => segment.plain_text).join("") || "";
    return text;
  };

  const candidate =
    pages.results.find((page) => extractTitle(page).includes(token)) ||
    pages.results[0] ||
    null;

  if (!candidate) return null;
  return { pageId: candidate.id, title: extractTitle(candidate), url: candidate.url };
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

export async function getWorkProgressContext(targetYmd) {
  const notion = getNotionClient();
  const page = await readWorkDbTargetPage(notion, targetYmd);
  if (!page) {
    return {
      found: false,
      text: "업무 DB 페이지를 찾지 못했습니다.",
      completed: [],
      pending: [],
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

  return {
    found: true,
    page,
    completed,
    pending,
    text: lines.join("\n"),
  };
}

async function loadProjectContext() {
  const now = Date.now();
  if (projectContextCache.value && now - projectContextCache.loadedAtMs < PROJECT_CONTEXT_CACHE_MS) {
    return projectContextCache.value;
  }

  const files = ["docs/prd.md", "docs/FEATURE_SPEC.md", "docs/SERVICE_FLOW.md", "docs/assistant-agent.md"];
  const chunks = [];

  for (const relativePath of files) {
    try {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      chunks.push(`## ${relativePath}\n${content.slice(0, 4000)}`);
    } catch {
      // Keep going with available files.
    }
  }

  const merged = chunks.join("\n\n");
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
}) {
  const apiKey = getEnv("GEMINI_API_KEY");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => part?.text)
    .filter(Boolean)
    .join("\n");

  return text || "";
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

export async function generateDailyStrategicReview({
  metrics,
  amplitudeConversion,
  previousMetrics,
  workProgress,
  targetYmd,
}) {
  const projectContext = await loadProjectContext();

  const reviewInput = {
    date: targetYmd,
    metrics: {
      totalSignups: metrics.counts.totalSignups,
      onboardingRate: metrics.rates.onboarding,
      pwaRate: metrics.rates.pwa,
      integrationRate: metrics.rates.integrationAny,
      activationRate30d: metrics.rates.activation30d,
      paymentRate: metrics.rates.payment,
      customFormatRate: metrics.rates.customFormat,
      dailyNewUsers: metrics.counts.dailyNewUsers,
      dailyRecordings: metrics.counts.dailyRecordings,
      heavyUsers: metrics.heavyUserTop3,
      signupConversionRate: amplitudeConversion.currentRate,
    },
    previous: previousMetrics,
    workProgress: {
      completedCount: workProgress.completed.length,
      pendingCount: workProgress.pending.length,
      completed: workProgress.completed.slice(0, 20),
      pending: workProgress.pending.slice(0, 20),
      pageSummary: workProgress.text,
    },
  };

  const systemInstruction = [
    "너는 Archy 서비스의 전략 자문 에이전트다.",
    "톤은 친근하고 캐주얼하게 유지하되, 내용은 숫자 기반으로 정확하고 빠짐없이 작성한다.",
    "핵심 결론을 먼저 말하고, 근거/가정/리스크/우선순위 액션을 명확히 구분한다.",
    "문맥상 자연스러울 때만 가벼운 표현(예: ㅋㅋ)을 0~1회 사용한다.",
    "중요한 업무 항목은 생략하지 않는다.",
    "출력은 한국어로 작성한다.",
  ].join(" ");

  const userPrompt = [
    "아래 프로젝트 맥락, 업무 진행상황, 데일리 지표를 종합해 오늘의 리뷰를 작성해줘.",
    "요구 형식:",
    "1) 오늘의 사업 상태 진단 (3~5줄)",
    "2) 잘된 점 (최대 3개)",
    "3) 리스크/병목 (최대 3개)",
    "4) 내일 바로 실행할 우선순위 액션 3개 (각 액션에 기대효과 1줄)",
    "5) 데이터 추가 확인 요청이 필요한 항목 (있으면만)",
    "\n[프로젝트 맥락]\n",
    projectContext,
    "\n[업무 진행상황]\n",
    workProgress.text,
    "\n[데이터(JSON)]\n",
    JSON.stringify(reviewInput, null, 2),
  ].join("\n");

  return generateGeminiText({
    model: GEMINI_PRO_MODEL,
    systemInstruction,
    userPrompt,
    temperature: 0.25,
    maxOutputTokens: 3072,
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
    static_env: "환경변수 고정값",
    not_configured: "미설정(차트 ID 없음)",
    dashboard_unparsed: "Dashboard 응답 파싱 실패",
    custom_api_unparsed: "커스텀 API 응답 파싱 실패",
    error: "조회 실패",
  };

  const base = map[source] || source;
  const error = amplitudeConversion?.error ? ` / ${String(amplitudeConversion.error).slice(0, 120)}` : "";
  return `${base}${error}`;
}

export async function runDailyPipeline({
  runDate = new Date(),
  targetYmd: forcedTargetYmd = null,
  dryRun = false,
  runWeeklyWhenSunday = true,
  skipStrategicReview = false,
} = {}) {
  const runYmd = toKstYmd(runDate);
  const targetYmd = forcedTargetYmd || addDays(runYmd, -1);
  const previousYmd = addDays(targetYmd, -1);

  const snapshot = await fetchSupabaseSnapshot();
  const metrics = buildMetricsForDate(snapshot, targetYmd);
  const previousMetrics = buildMetricsForDate(snapshot, previousYmd);

  let amplitudeConversion = null;
  try {
    amplitudeConversion = await fetchAmplitudeSignupConversion({
      targetYmd,
      previousYmd,
    });
  } catch (error) {
    amplitudeConversion = {
      source: "error",
      currentRate: null,
      previousRate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const dailyLabel = formatKoreanDayLabel(targetYmd);
  const previousLabel = formatKoreanDayLabel(previousYmd);

  let previousNotion = null;
  let previousNotionError = null;
  try {
    previousNotion = await getNotionMetricsByLabel(previousLabel);
  } catch (error) {
    previousNotionError = error instanceof Error ? error.message : String(error);
  }

  let sheetSync = null;
  let dailyNotionUpsert = null;
  let weeklyNotionUpsert = null;

  if (!dryRun) {
    sheetSync = await syncGoogleUserSheet({ metrics, targetYmd });
    dailyNotionUpsert = await upsertNotionMetricsRow({
      label: dailyLabel,
      metrics,
      conversionRate: amplitudeConversion.currentRate,
    });

    if (runWeeklyWhenSunday && isSundayKst(runDate)) {
      const weeklyLabel = formatKoreanDayLabel(runYmd);
      weeklyNotionUpsert = await upsertNotionMetricsRow({
        label: weeklyLabel,
        metrics,
        conversionRate: amplitudeConversion.currentRate,
      });
    }
  }

  let workProgress = null;
  let workProgressError = null;
  try {
    workProgress = await getWorkProgressContext(targetYmd);
  } catch (error) {
    workProgressError = error instanceof Error ? error.message : String(error);
    workProgress = {
      found: false,
      text: `업무 DB 조회 실패: ${workProgressError}`,
      completed: [],
      pending: [],
    };
  }
  const strategicReview = skipStrategicReview
    ? null
    : await generateDailyStrategicReview({
        metrics,
        amplitudeConversion,
        previousMetrics,
        workProgress,
        targetYmd,
      });

  const summary = {
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
    weeklyNotionUpsert,
    heavyUserTop3: metrics.heavyUserTop3,
    workProgress,
    workProgressError,
    strategicReview,
  };

  return summary;
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
