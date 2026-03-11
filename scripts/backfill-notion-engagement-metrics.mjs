#!/usr/bin/env node

import process from "node:process";

import {
  buildMetricsForDate,
  fetchSupabaseSnapshot,
  formatKoreanDayLabel,
  updateNotionEngagementMetricsByLabel,
} from "./agent/daily-runner.mjs";

const APPLY_FLAG = "--apply";
const CREATE_MISSING_FLAG = "--create-missing";

function printLine(message) {
  process.stdout.write(`${message}\n`);
}

function printUsageAndExit(message) {
  if (message) {
    process.stderr.write(`${message}\n`);
  }

  process.stderr.write(
    "Usage: node scripts/backfill-notion-engagement-metrics.mjs --start=YYYY-MM-DD --end=YYYY-MM-DD [--apply] [--create-missing]\n" +
      "  default: dry-run preview only\n"
  );
  process.exit(1);
}

function isValidYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseArgs() {
  const startArg = process.argv.find((arg) => arg.startsWith("--start="));
  const endArg = process.argv.find((arg) => arg.startsWith("--end="));
  const apply = process.argv.includes(APPLY_FLAG);
  const createMissing = process.argv.includes(CREATE_MISSING_FLAG);

  const startDate = startArg ? startArg.slice("--start=".length) : "";
  const endDate = endArg ? endArg.slice("--end=".length) : "";

  if (!startDate || !endDate) {
    printUsageAndExit("Both --start and --end are required.");
  }
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
    printUsageAndExit("start/end must be valid YYYY-MM-DD dates.");
  }
  if (startDate > endDate) {
    printUsageAndExit("start must be on or before end.");
  }

  return { startDate, endDate, apply, createMissing };
}

function addDaysYmd(ymd, deltaDays) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const { startDate, endDate, apply, createMissing } = parseArgs();
  const snapshot = await fetchSupabaseSnapshot();
  const summary = {
    totalDates: 0,
    updated: 0,
    inserted: 0,
    missing: 0,
    skipped: 0,
  };

  printLine(
    `${apply ? "[APPLY]" : "[DRY-RUN]"} Backfilling Notion engagement metrics from ${startDate} to ${endDate}`
  );

  for (let current = startDate; current <= endDate; current = addDaysYmd(current, 1)) {
    summary.totalDates += 1;
    const metrics = buildMetricsForDate(snapshot, current);
    const label = formatKoreanDayLabel(current);
    const usageRate = formatPercent(metrics.rates.activationAllTime);
    const activationRate30d = formatPercent(metrics.rates.activation30d);

    if (!apply) {
      printLine(
        `${current} ${label} -> 이용률(누적) ${usageRate}, 활성화율(30일) ${activationRate30d}, 녹음 횟수 ${metrics.counts.dailyRecordings}회, 녹음 유저 ${metrics.counts.dailyRecordingUsers}명`
      );
      continue;
    }

    const result = await updateNotionEngagementMetricsByLabel({
      label,
      metrics,
      createIfMissing: createMissing,
    });

    if (result.mode === "update") summary.updated += 1;
    if (result.mode === "insert") summary.inserted += 1;
    if (result.mode === "missing") summary.missing += 1;
    if (result.mode === "skipped") summary.skipped += 1;

    const suffix = result.pageId ? ` pageId=${result.pageId}` : "";
    const reason = result.reason ? ` reason=${result.reason}` : "";
    printLine(`${current} ${label} -> ${result.mode}${suffix}${reason}`);
  }

  printLine(
    [
      "",
      `[SUMMARY] totalDates=${summary.totalDates}`,
      `updated=${summary.updated}`,
      `inserted=${summary.inserted}`,
      `missing=${summary.missing}`,
      `skipped=${summary.skipped}`,
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
