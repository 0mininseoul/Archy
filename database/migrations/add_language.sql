-- Migration: Add language column to users table
-- Default is 'ko' (Korean), can be 'en' (English)

ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(2) DEFAULT 'ko';

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);
