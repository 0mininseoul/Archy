const MEANINGFUL_TRANSCRIPT_CHAR_REGEX = /[\p{L}\p{N}]/u;

export function sanitizeTranscriptText(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return "";
  }

  return MEANINGFUL_TRANSCRIPT_CHAR_REGEX.test(trimmed) ? trimmed : "";
}

export function hasMeaningfulTranscript(value: string | null | undefined): boolean {
  return sanitizeTranscriptText(value).length > 0;
}
