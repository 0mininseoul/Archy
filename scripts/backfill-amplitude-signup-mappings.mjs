#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const APPLY_FLAG = "--apply";
const DEFAULT_START_DATE = "2026-02-25";
const DEFAULT_END_DATE = "2026-03-06";
const MATCH_WINDOW_SECONDS = 10;
const SECOND_CANDIDATE_GAP_SECONDS = 60;

function printLine(message) {
  process.stdout.write(`${message}\n`);
}

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
    "Usage: node scripts/backfill-amplitude-signup-mappings.mjs [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--apply]\n" +
      "  (default: dry-run, start=2026-02-25, end=2026-03-06)"
  );
  process.exit(1);
}

function parseArgs() {
  const apply = process.argv.includes(APPLY_FLAG);
  const startArg = process.argv.find((arg) => arg.startsWith("--start="));
  const endArg = process.argv.find((arg) => arg.startsWith("--end="));
  const startDate = startArg ? startArg.slice("--start=".length) : DEFAULT_START_DATE;
  const endDate = endArg ? endArg.slice("--end=".length) : DEFAULT_END_DATE;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    printUsageAndExit("start/end must be in YYYY-MM-DD format.");
  }

  return { apply, startDate, endDate };
}

function normalizeIsoString(value, fallbackOffset = "") {
  const withOffset =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) || fallbackOffset === ""
      ? value
      : `${value}${fallbackOffset}`;

  return withOffset.replace(
    /\.(\d{3})\d+(?=(?:Z|[+-]\d{2}:\d{2})$)/,
    ".$1"
  );
}

function toUtcDateFromAmplitude(value) {
  return new Date(normalizeIsoString(value.replace(" ", "T") + "Z"));
}

function toUtcDateFromSupabaseKst(value) {
  return new Date(normalizeIsoString(value, "+09:00"));
}

function toKstBoundary(dateString, endOfDay = false) {
  return new Date(`${dateString}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+09:00`);
}

function formatAmplitudeHour(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}${month}${day}T${hour}`;
}

function getAmplitudeAuthHeader() {
  const apiKey = process.env.AMPLITUDE_DASHBOARD_REST_API_KEY;
  const apiSecret = process.env.AMPLITUDE_DASHBOARD_REST_SECRET;

  if (!apiKey || !apiSecret) {
    printUsageAndExit(
      "AMPLITUDE_DASHBOARD_REST_API_KEY or AMPLITUDE_DASHBOARD_REST_SECRET is missing."
    );
  }

  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

function requireUnzip() {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch (error) {
    printUsageAndExit(`unzip command is required: ${error}`);
  }
}

async function downloadAmplitudeExportZip(startDate, endDate) {
  const authHeader = getAmplitudeAuthHeader();
  const exportStart = formatAmplitudeHour(toKstBoundary(startDate, false));
  const exportEnd = formatAmplitudeHour(toKstBoundary(endDate, true));
  const url = `https://amplitude.com/api/2/export?start=${exportStart}&end=${exportEnd}`;

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    throw new Error(`Amplitude export failed: ${response.status}`);
  }

  const zipPath = path.join(os.tmpdir(), `amplitude-export-${Date.now()}.zip`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(zipPath, buffer);

  return zipPath;
}

function readSignupCompletedEvents(zipPath, startAtUtc, endAtUtc) {
  const listingRaw = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const entries = listingRaw.split(/\r?\n/).filter(Boolean);
  const events = [];

  for (const entry of entries) {
    const zippedGzip = execFileSync("unzip", ["-p", zipPath, entry]);
    const content = gunzipSync(zippedGzip).toString("utf8");

    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;

      const parsed = JSON.parse(line);
      if (parsed.event_type !== "signup_completed") continue;

      const pathValue = parsed.event_properties?.path;
      const pagePathValue =
        parsed.event_properties?.["[Amplitude] Page Path"] ??
        parsed.event_properties?.["Page Path"] ??
        parsed.event_properties?.page_path ??
        null;
      if (pathValue !== "/onboarding" || pagePathValue !== "/onboarding") {
        continue;
      }

      const eventTime = toUtcDateFromAmplitude(parsed.event_time);
      if (eventTime < startAtUtc || eventTime > endAtUtc) {
        continue;
      }

      events.push({
        event_time: parsed.event_time,
        event_time_iso: eventTime.toISOString(),
        amplitude_id: parsed.amplitude_id,
        amplitude_device_id: parsed.device_id,
        session_id: parsed.session_id ?? null,
        insert_id: parsed.$insert_id ?? null,
        path: pathValue,
        page_path: pagePathValue,
      });
    }
  }

  return events.sort((left, right) => left.event_time_iso.localeCompare(right.event_time_iso));
}

async function fetchUsersInRange(supabase, startDate, endDate) {
  const startIso = `${startDate}T00:00:00+09:00`;
  const endIso = `${endDate}T23:59:59.999+09:00`;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("users")
      .select("id,email,created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at")
      .range(from, from + 999);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));
    if (!data || data.length < 1000) {
      break;
    }

    from += 1000;
  }

  return rows.map((row) => ({
    ...row,
    created_at_iso: toUtcDateFromSupabaseKst(row.created_at).toISOString(),
  }));
}

async function fetchExistingMappings(supabase) {
  const { data, error } = await supabase
    .from("amplitude_signup_identity_mappings")
    .select("supabase_user_id,amplitude_id,amplitude_device_id");

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      error.message?.includes("Could not find the table")
    ) {
      return [];
    }
    throw error;
  }

  return data || [];
}

function rankCandidates(users, eventTimeIso) {
  const eventMs = Date.parse(eventTimeIso);

  return users
    .map((user) => ({
      user,
      diffSeconds: Math.round(Math.abs(Date.parse(user.created_at_iso) - eventMs) / 1000),
    }))
    .sort((left, right) => left.diffSeconds - right.diffSeconds)
    .slice(0, 2);
}

function summarizeCandidates(candidates) {
  const best = candidates[0] || null;
  const second = candidates[1] || null;
  const gapSeconds =
    best && second ? Math.max(0, second.diffSeconds - best.diffSeconds) : Number.POSITIVE_INFINITY;

  return { best, second, gapSeconds };
}

async function main() {
  ensureEnvLoaded();
  requireUnzip();

  const { apply, startDate, endDate } = parseArgs();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    printUsageAndExit("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const startAtUtc = toKstBoundary(startDate, false);
  const endAtUtc = toKstBoundary(endDate, true);

  printLine(`[AmplitudeSignupBackfill] mode: ${apply ? "apply" : "dry-run"}`);
  printLine(`[AmplitudeSignupBackfill] start_date_kst: ${startDate}`);
  printLine(`[AmplitudeSignupBackfill] end_date_kst: ${endDate}`);

  const zipPath = await downloadAmplitudeExportZip(startDate, endDate);

  try {
    const events = readSignupCompletedEvents(zipPath, startAtUtc, endAtUtc);
    const users = await fetchUsersInRange(supabase, startDate, endDate);
    const existingMappings = await fetchExistingMappings(supabase);

    const existingUserIds = new Set(existingMappings.map((row) => row.supabase_user_id));
    const existingProfiles = new Set(
      existingMappings.map((row) => `${row.amplitude_id}:${row.amplitude_device_id}`)
    );

    const pendingRows = [];
    const localUserIds = new Set();
    const localProfiles = new Set();
    const skipped = {
      ambiguous: 0,
      outside_match_window: 0,
      existing_user_mapping: 0,
      existing_profile_mapping: 0,
      duplicate_user_candidate: 0,
      duplicate_profile_candidate: 0,
    };

    for (const event of events) {
      const candidates = rankCandidates(users, event.event_time_iso);
      const { best, second, gapSeconds } = summarizeCandidates(candidates);

      if (!best) {
        skipped.outside_match_window += 1;
        continue;
      }

      if (best.diffSeconds > MATCH_WINDOW_SECONDS) {
        skipped.outside_match_window += 1;
        continue;
      }

      if (Number.isFinite(gapSeconds) && gapSeconds <= SECOND_CANDIDATE_GAP_SECONDS) {
        skipped.ambiguous += 1;
        continue;
      }

      const profileKey = `${event.amplitude_id}:${event.amplitude_device_id}`;
      if (existingUserIds.has(best.user.id)) {
        skipped.existing_user_mapping += 1;
        continue;
      }
      if (existingProfiles.has(profileKey)) {
        skipped.existing_profile_mapping += 1;
        continue;
      }
      if (localUserIds.has(best.user.id)) {
        skipped.duplicate_user_candidate += 1;
        continue;
      }
      if (localProfiles.has(profileKey)) {
        skipped.duplicate_profile_candidate += 1;
        continue;
      }

      localUserIds.add(best.user.id);
      localProfiles.add(profileKey);

      pendingRows.push({
        supabase_user_id: best.user.id,
        amplitude_id: event.amplitude_id,
        amplitude_device_id: event.amplitude_device_id,
        amplitude_event_time: event.event_time_iso,
        supabase_created_at: best.user.created_at_iso,
        match_type: "signup_completed_created_at",
        confidence: "strict",
        match_metadata: {
          session_id: event.session_id,
          insert_id: event.insert_id,
          path: event.path,
          page_path: event.page_path,
          best_diff_seconds: best.diffSeconds,
          second_diff_seconds: second?.diffSeconds ?? null,
          second_candidate_gap_seconds: Number.isFinite(gapSeconds) ? gapSeconds : null,
          source_event_time: event.event_time,
          source_user_created_at: best.user.created_at,
        },
      });
    }

    printLine(`[AmplitudeSignupBackfill] signup_completed_count: ${events.length}`);
    printLine(`[AmplitudeSignupBackfill] users_in_range: ${users.length}`);
    printLine(`[AmplitudeSignupBackfill] strict_match_count: ${pendingRows.length}`);
    printLine(`[AmplitudeSignupBackfill] skipped: ${JSON.stringify(skipped)}`);
    printLine(
      `[AmplitudeSignupBackfill] sample_matches: ${JSON.stringify(
        pendingRows.slice(0, 5).map((row) => ({
          supabase_user_id: row.supabase_user_id,
          amplitude_id: row.amplitude_id,
          amplitude_device_id: row.amplitude_device_id,
          amplitude_event_time: row.amplitude_event_time,
          best_diff_seconds: row.match_metadata.best_diff_seconds,
        })),
        null,
        2
      )}`
    );

    if (!apply) {
      printLine(`[AmplitudeSignupBackfill] Dry-run complete. Re-run with ${APPLY_FLAG} to apply.`);
      return;
    }

    if (pendingRows.length === 0) {
      printLine("[AmplitudeSignupBackfill] No rows to insert.");
      return;
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from("amplitude_signup_identity_mappings")
      .insert(pendingRows)
      .select("id");

    if (insertError) {
      throw insertError;
    }

    printLine(`[AmplitudeSignupBackfill] inserted_count: ${(insertedRows || []).length}`);
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}

main().catch((error) => {
  console.error("[AmplitudeSignupBackfill] Unexpected error:", error);
  process.exit(1);
});
