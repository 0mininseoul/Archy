-- Add Notion save target icon fields to users table

ALTER TABLE users
ADD COLUMN IF NOT EXISTS notion_save_target_icon_emoji TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS notion_save_target_icon_url TEXT;

COMMENT ON COLUMN users.notion_save_target_icon_emoji IS 'Emoji icon for selected Notion save target';
COMMENT ON COLUMN users.notion_save_target_icon_url IS 'Image URL icon for selected Notion save target';
