import * as Sentry from "@sentry/nextjs";

type ScopeTagValue = string | number | boolean | null | undefined;

interface CaptureExceptionOptions {
  extras?: Record<string, unknown>;
  fingerprint?: string[];
  tags?: Record<string, ScopeTagValue>;
}

function normalizeTagValue(value: ScopeTagValue): string | undefined {
  if (value === null || typeof value === "undefined") {
    return undefined;
  }

  return String(value);
}

export function captureExceptionWithScope(
  error: unknown,
  options: CaptureExceptionOptions = {}
): string {
  return Sentry.withScope((scope) => {
    if (options.fingerprint?.length) {
      scope.setFingerprint(options.fingerprint);
    }

    for (const [key, value] of Object.entries(options.tags ?? {})) {
      const normalizedValue = normalizeTagValue(value);
      if (normalizedValue) {
        scope.setTag(key, normalizedValue);
      }
    }

    for (const [key, value] of Object.entries(options.extras ?? {})) {
      if (typeof value !== "undefined") {
        scope.setExtra(key, value);
      }
    }

    return Sentry.captureException(error);
  });
}
