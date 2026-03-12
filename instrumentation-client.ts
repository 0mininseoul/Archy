// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  getClientSentryDsn,
  getSentryEnvironment,
  sanitizeSentryUrl,
} from "@/lib/monitoring/sentry-config";

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

type RecorderContextWindow = Window & {
  __archyRecorderContext?: {
    action: RecorderAction | null;
    mediaRecorderState: RecordingState;
    recorderRuntimeState: RecorderRuntimeState;
    updatedAt: string;
  };
};

type EventShape = {
  breadcrumbs?: Array<{
    category?: string | null;
    data?: { url?: string | null } | null;
    message?: string | null;
  }> | null;
  contexts?: Record<string, Record<string, unknown>> | null;
  exception?: {
    values?: Array<{
      stacktrace?: {
        frames?: Array<{ filename?: string | null }> | null;
      } | null;
      type?: string | null;
      value?: string | null;
    }> | null;
  } | null;
  logentry?: { formatted?: string | null } | null;
  message?: string | null;
  request?: { url?: string | null } | null;
  tags?: Record<string, string> | null;
};

function getRecorderContext() {
  if (typeof window === "undefined") {
    return {
      action: null,
      mediaRecorderState: null,
      recorderRuntimeState: null,
      updatedAt: null,
    };
  }

  const context = (window as RecorderContextWindow).__archyRecorderContext;

  return {
    action: context?.action ?? null,
    mediaRecorderState: context?.mediaRecorderState ?? null,
    recorderRuntimeState: context?.recorderRuntimeState ?? null,
    updatedAt: context?.updatedAt ?? null,
  };
}

function getEventText(event: EventShape): string {
  const exceptionText =
    event.exception?.values
      ?.map((value) => `${value.type ?? ""} ${value.value ?? ""}`.trim())
      .filter(Boolean)
      .join("\n") ?? "";
  const frameText =
    event.exception?.values
      ?.flatMap((value) =>
        value.stacktrace?.frames?.map((frame) => frame.filename ?? "") ?? []
      )
      .filter(Boolean)
      .join("\n") ?? "";
  const breadcrumbText =
    event.breadcrumbs
      ?.map((breadcrumb) =>
        [breadcrumb.category, breadcrumb.message, breadcrumb.data?.url]
          .filter(Boolean)
          .join(" ")
      )
      .filter(Boolean)
      .join("\n") ?? "";

  return [
    event.message ?? "",
    event.logentry?.formatted ?? "",
    event.request?.url ?? "",
    exceptionText,
    frameText,
    breadcrumbText,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function isExternalExtensionEvent(event: EventShape): boolean {
  const text = getEventText(event);

  return (
    text.includes("chrome-extension://") ||
    text.includes("moz-extension://") ||
    text.includes("safari-web-extension://") ||
    text.includes("nkbihfbeogaeaoehlefnkodbefgpgknn") ||
    text.includes("metamask")
  );
}

function getClientErrorCategory(event: EventShape): string {
  if (isExternalExtensionEvent(event)) {
    return "external_extension";
  }

  const text = getEventText(event);
  if (
    text.includes("invalidstateerror") ||
    text.includes("mediarecorder") ||
    text.includes("state cannot be inactive")
  ) {
    return "recorder_state";
  }

  return "client_runtime";
}

const dsn = getClientSentryDsn();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: getSentryEnvironment(),
  sendDefaultPii: false,
  beforeSend(event) {
    const category = getClientErrorCategory(event as EventShape);
    if (category === "external_extension") {
      return null;
    }

    const recorderContext = getRecorderContext();
    const sanitizedUrl = sanitizeSentryUrl(event.request?.url);

    event.request = sanitizedUrl
      ? {
          ...event.request,
          url: sanitizedUrl,
        }
      : event.request;
    event.tags = {
      ...event.tags,
      archy_category: category,
      archy_origin: "app",
      archy_surface: "web",
    };

    if (recorderContext.recorderRuntimeState) {
      event.tags.archy_recorder_runtime_state =
        recorderContext.recorderRuntimeState;
    }

    if (recorderContext.mediaRecorderState) {
      event.tags.archy_media_recorder_state = recorderContext.mediaRecorderState;
    }

    if (recorderContext.action) {
      event.tags.archy_recorder_action = recorderContext.action;
    }

    event.contexts = {
      ...event.contexts,
      archy_recorder: {
        recorderRuntimeState: recorderContext.recorderRuntimeState,
        mediaRecorderState: recorderContext.mediaRecorderState,
        action: recorderContext.action,
        updatedAt: recorderContext.updatedAt,
      },
    };

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
