-- Add save_audio_enabled field to users table
-- Default is false (opt-in) so new users don't have audio storage enabled by default
ALTER TABLE users ADD COLUMN IF NOT EXISTS save_audio_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.save_audio_enabled IS 'Whether audio files should be saved to storage (opt-in, default false)';
