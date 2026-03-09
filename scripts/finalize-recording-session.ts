import { loadEnvConfig } from "@next/env";
import { finalizeRecordingSession } from "@/lib/services/recording-finalizer";
import { createServiceRoleClient } from "@/lib/supabase/admin";

async function main() {
  loadEnvConfig(process.cwd());

  const recordingId = process.argv[2];
  const durationOverride = Number.parseInt(process.argv[3] || "", 10);

  if (!recordingId) {
    console.error(
      "Usage: npx tsx scripts/finalize-recording-session.ts <recordingId> [totalDurationSeconds]"
    );
    process.exit(1);
  }

  const supabase = createServiceRoleClient();
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("id, user_id, duration_seconds")
    .eq("id", recordingId)
    .single();

  if (error) {
    throw error;
  }

  const totalDurationSeconds =
    Number.isFinite(durationOverride) && durationOverride > 0
      ? durationOverride
      : recording.duration_seconds;

  if (!totalDurationSeconds || totalDurationSeconds <= 0) {
    throw new Error("Recording has no usable duration_seconds value.");
  }

  const result = await finalizeRecordingSession({
    recordingId: recording.id,
    userId: recording.user_id,
    totalDurationSeconds,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
