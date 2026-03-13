import { NextRequest, NextResponse } from "next/server";

interface ClientErrorPayload {
  type?: "error" | "unhandledrejection";
  message?: string;
  stack?: string | null;
  source?: string | null;
  lineno?: number | null;
  colno?: number | null;
  pathname?: string;
  search?: string;
  href?: string;
  userAgent?: string;
  isStandalone?: boolean;
  timestamp?: string;
  trace?: string | null;
  fingerprint?: string;
  category?:
    | "recorder_state"
    | "external_extension"
    | "client_runtime"
    | "recorder_interruption";
  origin?: "app" | "external_extension";
  sampled?: boolean;
  sessionId?: string | null;
  interruptionSource?: string | null;
  interruptionClassification?: string | null;
  interruptionConfidence?: "heuristic" | "confirmed" | null;
  visibilityState?: DocumentVisibilityState | null;
  pageHadFocus?: boolean | null;
  pageWasVisible?: boolean | null;
  isIOS?: boolean | null;
  recorderRuntimeState?:
    | "idle"
    | "starting"
    | "recording"
    | "pausing"
    | "paused"
    | "resuming"
    | "stopping"
    | "inactive_unexpected"
    | "error"
    | null;
  mediaRecorderState?: RecordingState | null;
  action?:
    | "start"
    | "pause"
    | "resume"
    | "stop"
    | "background_transition"
    | "route_unmount_autopause"
    | "chunk_restart"
    | "state_sync"
    | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClientErrorPayload;
    const message = typeof body?.message === "string" ? body.message : "Unknown client error";
    const category = body?.category || "client_runtime";
    const logPayload = {
      type: body?.type || "error",
      message,
      stack: body?.stack || null,
      source: body?.source || null,
      lineno: body?.lineno ?? null,
      colno: body?.colno ?? null,
      pathname: body?.pathname || null,
      search: body?.search || null,
      href: body?.href || null,
      userAgent: body?.userAgent || request.headers.get("user-agent"),
      isStandalone: body?.isStandalone ?? null,
      timestamp: body?.timestamp || new Date().toISOString(),
      trace: body?.trace || null,
      fingerprint: body?.fingerprint || null,
      category,
      origin: body?.origin || "app",
      sampled: body?.sampled ?? true,
      sessionId: body?.sessionId ?? null,
      interruptionSource: body?.interruptionSource ?? null,
      interruptionClassification: body?.interruptionClassification ?? null,
      interruptionConfidence: body?.interruptionConfidence ?? null,
      visibilityState: body?.visibilityState ?? null,
      pageHadFocus: body?.pageHadFocus ?? null,
      pageWasVisible: body?.pageWasVisible ?? null,
      isIOS: body?.isIOS ?? null,
      recorderRuntimeState: body?.recorderRuntimeState ?? null,
      mediaRecorderState: body?.mediaRecorderState ?? null,
      action: body?.action ?? null,
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown",
    };

    if (category === "external_extension") {
      console.warn("[ClientError]", logPayload);
    } else {
      console.error("[ClientError]", logPayload);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ClientError] Failed to parse payload:", error);
    return NextResponse.json(
      { success: false, error: "invalid_payload" },
      { status: 400 }
    );
  }
}
