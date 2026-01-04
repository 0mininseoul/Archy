-- Add Google Docs integration fields to users table
-- These fields store Google OAuth tokens and folder preferences

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_access_token TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_folder_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_folder_name TEXT;

-- Add Google Doc URL field to recordings table
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS google_doc_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users.google_access_token IS 'Google OAuth access token for Docs/Drive API';
COMMENT ON COLUMN users.google_refresh_token IS 'Google OAuth refresh token for token renewal';
COMMENT ON COLUMN users.google_token_expires_at IS 'Expiration timestamp for Google access token';
COMMENT ON COLUMN users.google_folder_id IS 'Google Drive folder ID to save documents';
COMMENT ON COLUMN users.google_folder_name IS 'Display name of the selected Google Drive folder';
COMMENT ON COLUMN recordings.google_doc_url IS 'URL of the created Google Doc';
