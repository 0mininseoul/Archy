-- Add 'recording' status for active recording sessions
-- This allows us to track in-progress recordings and resume them

-- Update status check constraint to include 'recording'
ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_status_check;
ALTER TABLE recordings ADD CONSTRAINT recordings_status_check
  CHECK (status IN ('recording', 'processing', 'completed', 'failed'));

-- Add last_chunk_index to track the latest chunk received
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS last_chunk_index INTEGER DEFAULT 0;

-- Add session_paused_at to track when recording was paused (for resume)
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS session_paused_at TIMESTAMP;

-- Index for finding active recording sessions
CREATE INDEX IF NOT EXISTS idx_recordings_active_session
  ON recordings(user_id, status)
  WHERE status = 'recording';
