-- Normalize recordings timestamps so paused and created times are stored with timezone.
-- created_at has historically been stored as local KST wall-clock time.
-- session_paused_at has historically been written from toISOString(), so existing values
-- should be interpreted as UTC instants before being converted.

DROP VIEW IF EXISTS user_recording_stats;

ALTER TABLE recordings
ALTER COLUMN created_at TYPE TIMESTAMPTZ
USING created_at AT TIME ZONE 'Asia/Seoul';

ALTER TABLE recordings
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE recordings
ALTER COLUMN session_paused_at TYPE TIMESTAMPTZ
USING (
  CASE
    WHEN session_paused_at IS NULL THEN NULL
    ELSE session_paused_at AT TIME ZONE 'UTC'
  END
);

UPDATE recordings
SET session_paused_at = last_activity_at
WHERE session_paused_at IS NOT NULL
  AND last_activity_at IS NOT NULL
  AND ABS(EXTRACT(EPOCH FROM (last_activity_at - session_paused_at)) - 32400) <= 300;

CREATE OR REPLACE VIEW user_recording_stats AS
SELECT
  u.id AS user_id,
  COUNT(r.id)::INTEGER AS recording_count_total,
  COUNT(r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days')::INTEGER AS recording_count_last_30d,
  MAX(r.created_at) AS last_recorded_at
FROM users u
LEFT JOIN recordings r ON r.user_id = u.id
GROUP BY u.id;

COMMENT ON VIEW user_recording_stats IS 'Per-user recording counters (total and last 30 days) derived from recordings table';
