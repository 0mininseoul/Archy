"use client";

import { useEffect } from "react";

interface ClientErrorPayload {
  type: "error" | "unhandledrejection";
  message: string;
  stack?: string | null;
  source?: string | null;
  lineno?: number | null;
  colno?: number | null;
  pathname: string;
  search: string;
  href: string;
  userAgent: string;
  isStandalone: boolean;
  timestamp: string;
  trace?: string | null;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function reportClientError(payload: ClientErrorPayload): void {
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((error) => {
      console.warn("[ClientErrorReporter] Failed to report error:", error);
    });
  } catch (error) {
    console.warn("[ClientErrorReporter] Failed to report error:", error);
  }
}

function buildBasePayload(): Omit<ClientErrorPayload, "type" | "message"> {
  const trace = new URLSearchParams(window.location.search).get("trace");
  return {
    stack: null,
    source: null,
    lineno: null,
    colno: null,
    pathname: window.location.pathname,
    search: window.location.search,
    href: window.location.href,
    userAgent: navigator.userAgent,
    isStandalone: isStandaloneMode(),
    timestamp: new Date().toISOString(),
    trace,
  };
}

export function ClientErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const payload: ClientErrorPayload = {
        ...buildBasePayload(),
        type: "error",
        message: event.message || "Unknown client error",
        stack: event.error?.stack || null,
        source: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
      };
      reportClientError(payload);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";

      const payload: ClientErrorPayload = {
        ...buildBasePayload(),
        type: "unhandledrejection",
        message,
        stack: reason instanceof Error ? reason.stack || null : null,
      };
      reportClientError(payload);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
