#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const STALE_TIMEOUT_MINUTES = 30;
const APPLY_FLAG = "--apply";

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
    "Usage: node scripts/backfill-stale-recordings.mjs [--apply]\n" +
      "  (default: dry-run)"
  );
  process.exit(1);
}

async function main() {
  ensureEnvLoaded();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    printUsageAndExit(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  const apply = process.argv.includes(APPLY_FLAG);
  const cutoffIso = new Date(
    Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000
  ).toISOString();
  const supabase = createClient(url, serviceRoleKey);

  const { data: staleRows, error: staleQueryError } = await supabase
    .from("recordings")
    .select(
      "id,user_id,status,duration_seconds,last_chunk_index,last_activity_at,session_paused_at,created_at"
    )
    .eq("status", "recording")
    .lt("last_activity_at", cutoffIso)
    .order("last_activity_at", { ascending: true })
    .limit(5000);

  if (staleQueryError) {
    console.error("[BackfillStaleRecordings] Failed to load stale sessions:", staleQueryError);
    if (
      staleQueryError.code === "42703" &&
      String(staleQueryError.message || "").includes("last_activity_at")
    ) {
      console.error(
        "[BackfillStaleRecordings] Migration is not applied. Run add_recording_lifecycle_tracking.sql first."
      );
    }
    process.exit(1);
  }

  const rows = staleRows || [];
  console.log("[BackfillStaleRecordings] mode:", apply ? "apply" : "dry-run");
  console.log("[BackfillStaleRecordings] cutoff:", cutoffIso);
  console.log("[BackfillStaleRecordings] stale_count:", rows.length);

  if (rows.length === 0) {
    return;
  }

  const sample = rows.slice(0, 20).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    duration_seconds: row.duration_seconds,
    last_chunk_index: row.last_chunk_index,
    last_activity_at: row.last_activity_at,
    created_at: row.created_at,
  }));
  console.log("[BackfillStaleRecordings] sample:", JSON.stringify(sample, null, 2));

  if (!apply) {
    console.log(
      `[BackfillStaleRecordings] Dry-run complete. Re-run with ${APPLY_FLAG} to apply.`
    );
    return;
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("recordings")
    .update({
      status: "failed",
      processing_step: null,
      error_step: "abandoned",
      error_message: "Session ended due to inactivity timeout.",
      termination_reason: "stale_timeout",
      last_activity_at: nowIso,
    })
    .eq("status", "recording")
    .lt("last_activity_at", cutoffIso)
    .select("id");

  if (updateError) {
    console.error("[BackfillStaleRecordings] Failed to apply updates:", updateError);
    process.exit(1);
  }

  console.log(
    "[BackfillStaleRecordings] updated_count:",
    (updatedRows || []).length
  );
}

main().catch((error) => {
  console.error("[BackfillStaleRecordings] Unexpected error:", error);
  process.exit(1);
});
