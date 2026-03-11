#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const APPLY_FLAG = "--apply";
const SOURCE_ARG_MAP = new Map([
  ["--primary", "primary"],
  ["--tier-2", "tier_2"],
  ["--tier_2", "tier_2"],
  ["--tier-3", "tier_3"],
  ["--tier_3", "tier_3"],
]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureEnvLoaded() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));
}

function printUsageAndExit(message) {
  if (message) {
    console.error(message);
  }

  console.error(
    [
      "Usage:",
      "  node scripts/backfill-groq-audio-budget.mjs [--apply] --primary <csv> [--tier-2 <csv>] [--tier-3 <csv>]",
      "",
      "Examples:",
      "  node scripts/backfill-groq-audio-budget.mjs --primary /path/primary.csv --tier-2 /path/tier2.csv",
      "  node scripts/backfill-groq-audio-budget.mjs --apply --primary /path/primary.csv --tier-2 /path/tier2.csv",
    ].join("\n")
  );
  process.exit(1);
}

function parsePositiveNumber(rawValue, fallback, { min = 0, max } = {}) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.max(min, parsed);
  return typeof max === "number" ? Math.min(max, bounded) : bounded;
}

function getBudgetConfig() {
  return {
    aspdCooldownMinutes: parsePositiveNumber(
      process.env.GROQ_ASPD_RATE_LIMIT_COOLDOWN_MINUTES,
      60,
      { min: 1, max: 1_440 }
    ),
    bucketMinutes: parsePositiveNumber(
      process.env.GROQ_AUDIO_SECONDS_BUCKET_MINUTES,
      5,
      { min: 1, max: 60 }
    ),
  };
}

function parseArgs(argv) {
  const fileBySource = {};
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === APPLY_FLAG) {
      apply = true;
      continue;
    }

    const source = SOURCE_ARG_MAP.get(token);
    if (source) {
      const filePath = argv[index + 1];
      if (!filePath) {
        printUsageAndExit(`Missing CSV path after ${token}.`);
      }
      fileBySource[source] = filePath;
      index += 1;
      continue;
    }

    printUsageAndExit(`Unknown argument: ${token}`);
  }

  if (Object.keys(fileBySource).length === 0) {
    printUsageAndExit("At least one Groq CSV is required.");
  }

  return { apply, fileBySource };
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inQuotes) {
      if (char === "\\") {
        const nextChar = raw[index + 1];
        if (typeof nextChar === "string") {
          field += nextChar;
          index += 1;
          continue;
        }
      }

      if (char === '"') {
        if (raw[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function toRecordRows(csvRows) {
  const [headers, ...dataRows] = csvRows;
  if (!headers || headers.length === 0) {
    return [];
  }

  return dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function parseAspdUsage(errorText) {
  const matched = String(errorText || "").match(
    /(?:Audio Seconds per Day|seconds of audio per day)\s*\(ASPD\):\s*Limit (\d+),\s*Used (\d+)/i
  );
  if (!matched) {
    return {};
  }

  const limitSeconds = Number.parseInt(matched[1] || "", 10);
  const usedSeconds = Number.parseInt(matched[2] || "", 10);
  return {
    limitSeconds: Number.isFinite(limitSeconds) ? limitSeconds : undefined,
    usedSeconds: Number.isFinite(usedSeconds) ? usedSeconds : undefined,
  };
}

function getBucketStartIso(createdAtMs, bucketMinutes) {
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketStartMs = Math.floor(createdAtMs / bucketMs) * bucketMs;
  return new Date(bucketStartMs).toISOString();
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function aggregateSourceCsv(source, filePath, config) {
  const raw = fs.readFileSync(filePath, "utf8");
  const records = toRecordRows(parseCsv(raw));
  const bucketMap = new Map();
  const statusCounts = new Map();
  let latestAspd = null;
  let successAudioSeconds = 0;

  for (const row of records) {
    const statusCode = Number.parseInt(row.status_code || "", 10);
    const createdAtMs = Number.parseInt(row.created_at || "", 10);
    const inputAudioSeconds = Number.parseInt(row.input_audio_seconds || "", 10);
    const errorText = row.error || "";

    statusCounts.set(statusCode, (statusCounts.get(statusCode) || 0) + 1);

    if (statusCode === 200 && Number.isFinite(createdAtMs) && Number.isFinite(inputAudioSeconds)) {
      const windowStart = getBucketStartIso(createdAtMs, config.bucketMinutes);
      const current =
        bucketMap.get(windowStart) || { audioSeconds: 0, keySource: source, requestCount: 0 };
      current.audioSeconds += Math.max(0, inputAudioSeconds);
      current.requestCount += 1;
      bucketMap.set(windowStart, current);
      successAudioSeconds += Math.max(0, inputAudioSeconds);
    }

    if (statusCode === 429 && /Audio Seconds per Day|ASPD/i.test(errorText)) {
      const aspdUsage = parseAspdUsage(errorText);
      if (
        Number.isFinite(createdAtMs) &&
        (!latestAspd || createdAtMs > latestAspd.createdAtMs)
      ) {
        latestAspd = {
          createdAtMs,
          errorText,
          limitSeconds: aspdUsage.limitSeconds ?? null,
          usedSeconds: aspdUsage.usedSeconds ?? null,
        };
      }
    }
  }

  return {
    bucketRows: Array.from(bucketMap.entries()).map(([windowStart, value]) => ({
      key_source: source,
      window_start: windowStart,
      audio_seconds: value.audioSeconds,
      request_count: value.requestCount,
    })),
    latestAspd,
    source,
    statusCounts: Object.fromEntries(
      Array.from(statusCounts.entries()).sort((a, b) => a[0] - b[0])
    ),
    successAudioSeconds,
    totalRows: records.length,
  };
}

async function loadExistingBuckets(supabase, sources, windowStarts) {
  if (sources.length === 0 || windowStarts.length === 0) {
    return new Map();
  }

  const sortedStarts = [...windowStarts].sort();
  const { data, error } = await supabase
    .from("groq_audio_usage_buckets")
    .select("key_source,window_start,audio_seconds,request_count")
    .in("key_source", sources)
    .gte("window_start", sortedStarts[0])
    .lte("window_start", sortedStarts[sortedStarts.length - 1]);

  if (error) {
    throw error;
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(`${row.key_source}:${row.window_start}`, row);
  }
  return map;
}

async function applyBackfill(supabase, aggregatedSources, config) {
  const allBucketRows = aggregatedSources.flatMap((entry) => entry.bucketRows);
  const windowStarts = Array.from(new Set(allBucketRows.map((row) => row.window_start)));
  const sources = Array.from(new Set(allBucketRows.map((row) => row.key_source)));
  const existingBuckets = await loadExistingBuckets(supabase, sources, windowStarts);
  const currentBucketStartIso = getBucketStartIso(Date.now(), config.bucketMinutes);

  const upsertRows = allBucketRows.map((row) => {
    const existing = existingBuckets.get(`${row.key_source}:${row.window_start}`);
    if (row.window_start === currentBucketStartIso && existing) {
      return {
        ...row,
        audio_seconds: Math.max(existing.audio_seconds || 0, row.audio_seconds),
        request_count: Math.max(existing.request_count || 0, row.request_count),
      };
    }

    return row;
  });

  for (const batch of chunkArray(upsertRows, 200)) {
    const { error } = await supabase
      .from("groq_audio_usage_buckets")
      .upsert(batch, { onConflict: "key_source,window_start" });

    if (error) {
      throw error;
    }
  }

  for (const entry of aggregatedSources) {
    if (!entry.latestAspd) {
      continue;
    }

    const cooldownUntilIso = new Date(
      entry.latestAspd.createdAtMs + config.aspdCooldownMinutes * 60 * 1000
    ).toISOString();
    const { error } = await supabase.rpc("upsert_groq_key_health", {
      p_aspd_cooldown_until: cooldownUntilIso,
      p_key_source: entry.source,
      p_last_error_message: entry.latestAspd.errorText,
      p_last_known_audio_limit_seconds: entry.latestAspd.limitSeconds,
      p_last_known_audio_used_seconds: entry.latestAspd.usedSeconds,
      p_last_rate_limited_at: new Date(entry.latestAspd.createdAtMs).toISOString(),
    });

    if (error) {
      throw error;
    }
  }
}

async function main() {
  ensureEnvLoaded();
  const { apply, fileBySource } = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    printUsageAndExit("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  const config = getBudgetConfig();
  const aggregatedSources = Object.entries(fileBySource).map(([source, filePath]) =>
    aggregateSourceCsv(source, filePath, config)
  );

  console.log("[BackfillGroqAudioBudget] mode:", apply ? "apply" : "dry-run");
  console.log("[BackfillGroqAudioBudget] bucket_minutes:", config.bucketMinutes);
  console.log("[BackfillGroqAudioBudget] aspd_cooldown_minutes:", config.aspdCooldownMinutes);

  for (const entry of aggregatedSources) {
    console.log(
      "[BackfillGroqAudioBudget] summary:",
      JSON.stringify(
        {
          source: entry.source,
          totalRows: entry.totalRows,
          bucketCount: entry.bucketRows.length,
          statusCounts: entry.statusCounts,
          successAudioSeconds: entry.successAudioSeconds,
          latestAspd: entry.latestAspd
            ? {
                createdAt: new Date(entry.latestAspd.createdAtMs).toISOString(),
                limitSeconds: entry.latestAspd.limitSeconds,
                usedSeconds: entry.latestAspd.usedSeconds,
              }
            : null,
        },
        null,
        2
      )
    );
  }

  if (!apply) {
    console.log(
      `[BackfillGroqAudioBudget] Dry-run complete. Re-run with ${APPLY_FLAG} to apply.`
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await applyBackfill(supabase, aggregatedSources, config);
  console.log("[BackfillGroqAudioBudget] Apply complete.");
}

main().catch((error) => {
  console.error("[BackfillGroqAudioBudget] Unexpected error:", error);
  process.exit(1);
});
