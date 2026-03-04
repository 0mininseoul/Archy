-- Speed up active recorder counting for Groq key routing.
-- Used by: status='recording' AND session_paused_at IS NULL
CREATE INDEX IF NOT EXISTS idx_recordings_active_recording_sessions
ON recordings (status, session_paused_at)
WHERE status = 'recording' AND session_paused_at IS NULL;
