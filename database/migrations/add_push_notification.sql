-- Add push notification fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true;

-- Comment
COMMENT ON COLUMN users.push_subscription IS 'Web Push subscription object (endpoint, keys)';
COMMENT ON COLUMN users.push_enabled IS 'Whether push notifications are enabled for this user';
