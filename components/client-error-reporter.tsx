"use client";

import { useEffect } from "react";

type ClientErrorType = "error" | "unhandledrejection";
type ClientErrorCategory = "recorder_state" | "external_extension" | "client_runtime";
type ClientErrorOrigin = "app" | "external_extension";
type RecorderRuntimeState =
  | "idle"
  | "starting"
  | "recording"
  | "pausing"
  | "paused"
  | "resuming"
  | "stopping"
  | "inactive_unexpected"
  | "error";
type RecorderAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "background_transition"
  | "route_unmount_autopause"
  | "chunk_restart"
  | "state_sync";

interface ClientErrorPayload {
  type: ClientErrorType;
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
  fingerprint: string;
  category: ClientErrorCategory;
  origin: ClientErrorOrigin;
  sampled: boolean;
  recorderRuntimeState?: RecorderRuntimeState | null;
  mediaRecorderState?: RecordingState | null;
  action?: RecorderAction | null;
}

type RecorderContextWindow = Window & {
  __archyRecorderContext?: {
    recorderRuntimeState: RecorderRuntimeState;
    mediaRecorderState: RecordingState;
    action: RecorderAction | null;
    updatedAt: string;
  };
  __archyErrorSessionId?: string;
};

const DEDUPE_WINDOW_MS = 5000;
const EXTENSION_SAMPLE_RATE = 0.1;
const dedupeTimestamps = new Map<string, number>();
const extensionSentCount = new Map<string, number>();

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getErrorSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const targetWindow = window as RecorderContextWindow;
  if (targetWindow.__archyErrorSessionId) {
    return targetWindow.__archyErrorSessionId;
  }

  const generatedId =
    (globalThis.crypto?.randomUUID?.() ??
      `fallback-${Math.random().toString(36).slice(2)}`) +
    `-${Date.now()}`;
  targetWindow.__archyErrorSessionId = generatedId;
  return generatedId;
}

function getRecorderContext() {
  if (typeof window === "undefined") {
    return {
      recorderRuntimeState: null,
      mediaRecorderState: null,
      action: null,
    };
  }
  const context = (window as RecorderContextWindow).__archyRecorderContext;
  return {
    recorderRuntimeState: context?.recorderRuntimeState ?? null,
    mediaRecorderState: context?.mediaRecorderState ?? null,
    action: context?.action ?? null,
  };
}

function classifyError(
  message: string,
  stack: string | null | undefined,
  source: string | null | undefined
): { category: ClientErrorCategory; origin: ClientErrorOrigin } {
  const lowerMessage = message.toLowerCase();
  const lowerStack = (stack || "").toLowerCase();
  const lowerSource = (source || "").toLowerCase();
  const isExtensionError =
    lowerStack.includes("chrome-extension://") ||
    lowerSource.includes("chrome-extension://") ||
    lowerStack.includes("nkbihfbeogaeaoehlefnkodbefgpgknn") ||
    lowerSource.includes("nkbihfbeogaeaoehlefnkodbefgpgknn") ||
    lowerMessage.includes("metamask");

  if (isExtensionError) {
    return { category: "external_extension", origin: "external_extension" };
  }

  const isRecorderStateError =
    lowerMessage.includes("invalidstateerror") ||
    lowerMessage.includes("mediarecorder") ||
    lowerMessage.includes("state cannot be inactive");

  if (isRecorderStateError) {
    return { category: "recorder_state", origin: "app" };
  }

  return { category: "client_runtime", origin: "app" };
}

function shouldSampleExtensionError(): boolean {
  const sessionId = getErrorSessionId();
  const sentCount = extensionSentCount.get(sessionId) ?? 0;
  const shouldSend = sentCount === 0 || Math.random() < EXTENSION_SAMPLE_RATE;
  if (shouldSend) {
    extensionSentCount.set(sessionId, sentCount + 1);
  }
  return shouldSend;
}

function shouldSendByDedupe(fingerprint: string): boolean {
  const now = Date.now();
  const lastSentAt = dedupeTimestamps.get(fingerprint);
  if (lastSentAt && now - lastSentAt < DEDUPE_WINDOW_MS) {
    return false;
  }
  dedupeTimestamps.set(fingerprint, now);
  return true;
}

function reportClientError(payload: ClientErrorPayload): void {
  if (!payload.sampled) return;

  if (!shouldSendByDedupe(payload.fingerprint)) return;

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

function buildBasePayload(
  type: ClientErrorType,
  message: string
): Omit<ClientErrorPayload, "type" | "message" | "sampled"> {
  const trace = new URLSearchParams(window.location.search).get("trace");
  const recorderContext = getRecorderContext();
  const { category, origin } = classifyError(message, null, null);
  const fingerprintSeed = [
    type,
    message,
    window.location.pathname,
    window.location.search,
  ].join("|");
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
    fingerprint: stableHash(fingerprintSeed),
    category,
    origin,
    recorderRuntimeState: recorderContext.recorderRuntimeState,
    mediaRecorderState: recorderContext.mediaRecorderState,
    action: recorderContext.action,
  };
}

export function ClientErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message || "Unknown client error";
      const stack = event.error?.stack || null;
      const source = event.filename || null;
      const { category, origin } = classifyError(message, stack, source);
      const fingerprintSeed = [
        "error",
        message,
        source || "",
        String(event.lineno || ""),
        String(event.colno || ""),
        window.location.pathname,
      ].join("|");
      const fingerprint = stableHash(fingerprintSeed);
      const sampled =
        category === "external_extension"
          ? shouldSampleExtensionError()
          : true;

      const payload: ClientErrorPayload = {
        ...buildBasePayload("error", message),
        type: "error",
        message,
        stack,
        source,
        lineno: event.lineno || null,
        colno: event.colno || null,
        category,
        origin,
        fingerprint,
        sampled,
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
      const stack = reason instanceof Error ? reason.stack || null : null;
      const source =
        reason instanceof Error && reason.stack
          ? reason.stack.split("\n")[1]?.trim() || null
          : null;
      const { category, origin } = classifyError(message, stack, source);
      const fingerprintSeed = [
        "unhandledrejection",
        message,
        source || "",
        window.location.pathname,
      ].join("|");
      const fingerprint = stableHash(fingerprintSeed);
      const sampled =
        category === "external_extension"
          ? shouldSampleExtensionError()
          : true;

      const payload: ClientErrorPayload = {
        ...buildBasePayload("unhandledrejection", message),
        type: "unhandledrejection",
        message,
        stack,
        source,
        category,
        origin,
        fingerprint,
        sampled,
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
