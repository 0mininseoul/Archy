-- Track recording session lifecycle to prevent stale "recording" sessions.
-- 1) Add activity + termination metadata.
-- 2) Expand error_step constraint for abandoned sessions.
-- 3) Add index for active/stale session lookups.

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE recordings
SET last_activity_at = COALESCE(session_paused_at, created_at, NOW())
WHERE last_activity_at IS NULL;

ALTER TABLE recordings
ALTER COLUMN last_activity_at SET DEFAULT NOW();

ALTER TABLE recordings
ALTER COLUMN last_activity_at SET NOT NULL;

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS termination_reason TEXT;

ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_termination_reason_check;
ALTER TABLE recordings
ADD CONSTRAINT recordings_termination_reason_check
CHECK (
  termination_reason IS NULL
  OR termination_reason IN (
    'user_stop',
    'navigation_autopause',
    'background_autopause',
    'stale_timeout',
    'manual_discard',
    'processing_error'
  )
);

ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_error_step_check;
ALTER TABLE recordings
ADD CONSTRAINT recordings_error_step_check
CHECK (
  error_step IS NULL
  OR error_step IN (
    'upload',
    'transcription',
    'formatting',
    'notion',
    'google',
    'slack',
    'abandoned'
  )
);

CREATE INDEX IF NOT EXISTS idx_recordings_active_recording_with_activity
ON recordings (status, session_paused_at, last_activity_at)
WHERE status = 'recording';

COMMENT ON COLUMN recordings.last_activity_at IS 'Last timestamp when this recording session showed activity (start/chunk/pause/finalize).';
COMMENT ON COLUMN recordings.termination_reason IS 'Internal lifecycle reason when a session ends or transitions out of active recording.';
