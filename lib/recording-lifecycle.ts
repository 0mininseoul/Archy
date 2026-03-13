export const RECORDING_STALE_TIMEOUT_MINUTES = 30;
export const RECORDING_STALE_TIMEOUT_MS =
  RECORDING_STALE_TIMEOUT_MINUTES * 60 * 1000;

export const AUTO_PAUSE_NOTICE_STORAGE_KEY = "archy_auto_pause_notice";
export const AUTO_PAUSE_NOTICE_EVENT = "archy:auto-pause-notice";

export type PauseNotifyReason =
  | "visibility_hidden"
  | "route_unmount"
  | "manual_pause"
  | "system_interruption";

export type RecordingTerminationReason =
  | "user_stop"
  | "navigation_autopause"
  | "background_autopause"
  | "stale_timeout"
  | "manual_discard"
  | "processing_error";

export function getStaleRecordingCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - RECORDING_STALE_TIMEOUT_MS).toISOString();
}

export function mapPauseReasonToTerminationReason(
  reason: PauseNotifyReason
): RecordingTerminationReason {
  if (reason === "route_unmount") {
    return "navigation_autopause";
  }
  return "background_autopause";
}
