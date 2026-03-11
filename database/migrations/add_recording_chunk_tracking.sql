-- Lossless chunk transcription tracking.
-- 1) Persist per-chunk transcription state so out-of-order retries do not lose text.
-- 2) Store internal-only transcription quality metadata on recordings.

CREATE TABLE IF NOT EXISTS recording_chunks (
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transcript TEXT,
  provider_status_code INTEGER,
  provider_error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  avg_rms DOUBLE PRECISION,
  peak_rms DOUBLE PRECISION,
  last_error_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recording_id, chunk_index),
  CONSTRAINT recording_chunks_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_recording_status
ON recording_chunks (recording_id, status, chunk_index);

ALTER TABLE recording_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own recording chunks" ON recording_chunks;
CREATE POLICY "Users can manage their own recording chunks"
ON recording_chunks
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM recordings
    WHERE recordings.id = recording_chunks.recording_id
      AND recordings.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM recordings
    WHERE recordings.id = recording_chunks.recording_id
      AND recordings.user_id = auth.uid()
  )
);

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS expected_chunk_count INTEGER;

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS transcription_quality_status TEXT;

UPDATE recordings
SET transcription_quality_status = 'ok'
WHERE transcription_quality_status IS NULL;

ALTER TABLE recordings
ALTER COLUMN transcription_quality_status SET DEFAULT 'ok';

ALTER TABLE recordings
ALTER COLUMN transcription_quality_status SET NOT NULL;

ALTER TABLE recordings
DROP CONSTRAINT IF EXISTS recordings_transcription_quality_status_check;

ALTER TABLE recordings
ADD CONSTRAINT recordings_transcription_quality_status_check
CHECK (transcription_quality_status IN ('ok', 'degraded'));

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS transcription_warnings JSONB;

UPDATE recordings
SET transcription_warnings = '[]'::jsonb
WHERE transcription_warnings IS NULL;

ALTER TABLE recordings
ALTER COLUMN transcription_warnings SET DEFAULT '[]'::jsonb;

ALTER TABLE recordings
ALTER COLUMN transcription_warnings SET NOT NULL;
