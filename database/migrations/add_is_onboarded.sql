-- Migration: Add is_onboarded flag to users table
-- This flag tracks whether the user has completed the onboarding process

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

-- Update existing users who have completed onboarding (have both Notion connected and database selected)
UPDATE users
SET is_onboarded = true
WHERE notion_access_token IS NOT NULL
  AND notion_database_id IS NOT NULL;

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_users_is_onboarded ON users(is_onboarded);
