import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleRecordings } from "@/lib/services/stale-recordings";

export const runtime = "nodejs";

function getProvidedCronSecrets(request: NextRequest): string[] {
  const providedSecrets: string[] = [];
  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) {
      providedSecrets.push(bearerToken);
    }
  }

  if (headerSecret?.trim()) {
    providedSecrets.push(headerSecret.trim());
  }

  return providedSecrets;
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    console.error("[StaleRecordingsCron] CRON_SECRET is not configured.");
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  const providedSecrets = getProvidedCronSecrets(request);
  if (!providedSecrets.some((providedSecret) => providedSecret === expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordings, error, staleCutoffIso } = await cleanupStaleRecordings();

  if (error) {
    console.error("[StaleRecordingsCron] Failed to cleanup stale sessions:", error);
    return NextResponse.json(
      { error: "Failed to cleanup stale sessions." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    staleCutoffIso,
    updatedCount: recordings.length,
    sessionIds: recordings.map((recording) => recording.id),
  });
}
