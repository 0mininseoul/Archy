-- Derived recording counters by user.
-- Use this view instead of mutating users.recording_count on every write.

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
