-- Migration: Add is_default column to custom_formats table
-- This column allows users to set one custom format as their default

ALTER TABLE custom_formats
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Create index for efficient default format lookup
CREATE INDEX IF NOT EXISTS idx_custom_formats_is_default ON custom_formats(user_id, is_default) WHERE is_default = true;
