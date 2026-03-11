import { loadEnvConfig } from "@next/env";
import { createServiceRoleClient } from "@/lib/supabase/admin";

async function main() {
  loadEnvConfig(process.cwd());

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("recordings")
    .select(
      [
        "id",
        "user_id",
        "title",
        "status",
        "duration_seconds",
        "termination_reason",
        "error_step",
        "formatted_content",
        "transcript",
        "created_at",
      ].join(",")
    )
    .eq("status", "failed")
    .eq("termination_reason", "stale_timeout")
    .is("formatted_content", null)
    .not("transcript", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = ((data as unknown as Array<{ transcript: string | null }> | null) ?? []).filter(
    (row) => (row.transcript?.trim().length ?? 0) > 0
  );
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
