import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvValue(name) {
  const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const match = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : "";
}

function cleanText(value) {
  return (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim();
}

function countBullets(value) {
  return (value.match(/^\s*[-*]\s+/gm) || []).length;
}

function countHeadings(value) {
  return (value.match(/^#{1,6}\s+/gm) || []).length;
}

function average(rows, key) {
  if (rows.length === 0) return 0;
  return Number((rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length).toFixed(3));
}

function median(rows, key) {
  if (rows.length === 0) return 0;
  const values = rows.map((row) => row[key]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function percentile(rows, key, p) {
  if (rows.length === 0) return 0;
  const values = rows.map((row) => row[key]).sort((a, b) => a - b);
  const index = Math.min(values.length - 1, Math.floor((values.length - 1) * p));
  return values[index] ?? 0;
}

function isLectureLike(text) {
  return /(강의|수업|설명|원리|개념|공식|함수|코드|프레임워크|모델|알고리즘|데이터|전략|회로|전자기학|프로그래밍)/.test(
    text
  );
}

function isMeetingLike(text) {
  return /(회의|미팅|논의|결정|액션|일정|담당|보고|브리핑|프로젝트|서비스 개발)/.test(text);
}

async function fetchAllRecordings(supabase) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("recordings")
      .select(
        [
          "id",
          "created_at",
          "duration_seconds",
          "title",
          "status",
          "format",
          "transcript",
          "formatted_content",
          "transcription_quality_status",
          "transcription_warnings",
        ].join(", ")
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function buildStats(rows, includeSamples) {
  const completed = rows
    .filter((row) => cleanText(row.transcript).length > 0)
    .filter((row) => cleanText(row.formatted_content).length > 0)
    .map((row) => {
      const transcript = cleanText(row.transcript);
      const formatted = cleanText(row.formatted_content);
      const transcriptLength = transcript.length;
      const formattedLength = formatted.length;
      const combinedText = `${row.title ?? ""} ${transcript.slice(0, 300)}`;

      return {
        id: row.id,
        created_at: row.created_at,
        duration_seconds: row.duration_seconds ?? 0,
        title: row.title,
        status: row.status,
        format: row.format,
        transcription_quality_status: row.transcription_quality_status,
        warning_count: Array.isArray(row.transcription_warnings)
          ? row.transcription_warnings.length
          : 0,
        transcript_length: transcriptLength,
        formatted_length: formattedLength,
        ratio: transcriptLength > 0 ? Number((formattedLength / transcriptLength).toFixed(3)) : 0,
        headings: countHeadings(row.formatted_content ?? ""),
        bullets: countBullets(row.formatted_content ?? ""),
        lecture_like: isLectureLike(combinedText),
        meeting_like: isMeetingLike(combinedText),
        transcript_preview: transcript.slice(0, 240),
        formatted_preview: formatted.slice(0, 240),
      };
    });

  const longRows = completed.filter((row) => row.transcript_length >= 1500);
  const veryLongRows = completed.filter((row) => row.transcript_length >= 6000);
  const longLowRatioRows = longRows.filter((row) => row.ratio < 0.2);
  const lectureLikeRows = completed.filter((row) => row.lecture_like);
  const meetingLikeRows = completed.filter((row) => row.meeting_like);

  const lengthBuckets = [
    { label: "<500", min: 0, max: 499 },
    { label: "500-1499", min: 500, max: 1499 },
    { label: "1500-2999", min: 1500, max: 2999 },
    { label: "3000-5999", min: 3000, max: 5999 },
    { label: "6000+", min: 6000, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => {
    const bucketRows = completed.filter(
      (row) => row.transcript_length >= bucket.min && row.transcript_length <= bucket.max
    );

    return {
      bucket: bucket.label,
      count: bucketRows.length,
      avg_transcript_length: average(bucketRows, "transcript_length"),
      avg_formatted_length: average(bucketRows, "formatted_length"),
      avg_ratio: average(bucketRows, "ratio"),
      median_ratio: median(bucketRows, "ratio"),
    };
  });

  return {
    total_rows: rows.length,
    with_transcript: rows.filter((row) => cleanText(row.transcript).length > 0).length,
    with_formatted_content: completed.length,
    ratio_percentiles: {
      p10: percentile(completed, "ratio", 0.1),
      p25: percentile(completed, "ratio", 0.25),
      p50: percentile(completed, "ratio", 0.5),
      p75: percentile(completed, "ratio", 0.75),
      p90: percentile(completed, "ratio", 0.9),
    },
    length_buckets: lengthBuckets,
    long_rows_1500: longRows.length,
    long_rows_6000: veryLongRows.length,
    long_rows_ratio_below_0_2: longLowRatioRows.length,
    long_rows_under_900_chars: longRows.filter((row) => row.formatted_length < 900).length,
    long_rows_under_1200_chars: longRows.filter((row) => row.formatted_length < 1200).length,
    long_rows_with_core_summary_template: longRows.filter((row) =>
      /핵심 요약|3줄 핵심 요약/.test(row.formatted_preview)
    ).length,
    avg_formatted_length_long: average(longRows, "formatted_length"),
    avg_ratio_long: average(longRows, "ratio"),
    lecture_like: {
      count: lectureLikeRows.length,
      avg_ratio: average(lectureLikeRows, "ratio"),
      avg_formatted_length: average(lectureLikeRows, "formatted_length"),
    },
    meeting_like: {
      count: meetingLikeRows.length,
      avg_ratio: average(meetingLikeRows, "ratio"),
      avg_formatted_length: average(meetingLikeRows, "formatted_length"),
    },
    most_compressed_long_rows: longLowRatioRows
      .sort((a, b) => a.ratio - b.ratio || b.transcript_length - a.transcript_length)
      .slice(0, 15)
      .map((row) => {
        const base = {
          id: row.id,
          created_at: row.created_at,
          duration_seconds: row.duration_seconds,
          title: row.title,
          transcript_length: row.transcript_length,
          formatted_length: row.formatted_length,
          ratio: row.ratio,
          headings: row.headings,
          bullets: row.bullets,
          transcription_quality_status: row.transcription_quality_status,
          warning_count: row.warning_count,
        };

        if (!includeSamples) {
          return base;
        }

        return {
          ...base,
          transcript_preview: row.transcript_preview,
          formatted_preview: row.formatted_preview,
        };
      }),
  };
}

async function main() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase credentials are missing from .env.local");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const includeSamples = process.argv.includes("--samples");
  const rows = await fetchAllRecordings(supabase);
  const stats = buildStats(rows, includeSamples);

  process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
}

main().catch((error) => {
  console.error("[analyze-recording-summary-compression] Failed:", error);
  process.exitCode = 1;
});
