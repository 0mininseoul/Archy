-- Add name field to users table
-- This field stores the user's display name from Google OAuth

ALTER TABLE users
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN users.name IS 'User display name from Google OAuth';
