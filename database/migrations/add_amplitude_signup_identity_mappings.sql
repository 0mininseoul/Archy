-- Add Amplitude signup identity mapping archive table
-- This stores strict matches between anonymous Amplitude signup events and Supabase users.

CREATE TABLE IF NOT EXISTS amplitude_signup_identity_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amplitude_id BIGINT NOT NULL,
  amplitude_device_id TEXT NOT NULL,
  amplitude_event_time TIMESTAMPTZ NOT NULL,
  supabase_created_at TIMESTAMPTZ NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'signup_completed_created_at',
  confidence TEXT NOT NULL DEFAULT 'strict',
  match_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_amplitude_signup_mappings_user
  ON amplitude_signup_identity_mappings(supabase_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_amplitude_signup_mappings_profile
  ON amplitude_signup_identity_mappings(amplitude_id, amplitude_device_id);

CREATE INDEX IF NOT EXISTS idx_amplitude_signup_mappings_event_time
  ON amplitude_signup_identity_mappings(amplitude_event_time DESC);

ALTER TABLE amplitude_signup_identity_mappings ENABLE ROW LEVEL SECURITY;

-- No public policies: service role access only.

COMMENT ON TABLE amplitude_signup_identity_mappings IS 'Archives strict matches between anonymous Amplitude signup_completed events and Supabase users.';
COMMENT ON COLUMN amplitude_signup_identity_mappings.match_metadata IS 'Backfill evidence such as insert_id, session_id, path, and timestamp deltas.';
