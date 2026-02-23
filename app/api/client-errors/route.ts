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
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClientErrorPayload;
    const message = typeof body?.message === "string" ? body.message : "Unknown client error";

    console.error("[ClientError]", {
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
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ClientError] Failed to parse payload:", error);
    return NextResponse.json(
      { success: false, error: "invalid_payload" },
      { status: 400 }
    );
  }
}
