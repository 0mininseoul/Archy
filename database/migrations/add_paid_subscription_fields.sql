-- Add explicit payment tracking fields to users table.
-- promo_expires_at is still used for Pro usage gating, but payment analytics
-- should rely on dedicated columns below.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_paid_user BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS paid_ever BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS paid_started_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS paid_ended_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_paid_user ON users(is_paid_user) WHERE is_paid_user = true;
CREATE INDEX IF NOT EXISTS idx_users_paid_ever ON users(paid_ever) WHERE paid_ever = true;

COMMENT ON COLUMN users.is_paid_user IS 'Whether user currently has an active paid subscription';
COMMENT ON COLUMN users.paid_ever IS 'Whether user has ever completed at least one paid subscription activation';
COMMENT ON COLUMN users.paid_started_at IS 'Timestamp when current paid subscription became active';
COMMENT ON COLUMN users.paid_ended_at IS 'Timestamp when paid subscription ended/canceled';
COMMENT ON COLUMN users.polar_customer_id IS 'Polar customer ID for reconciliation';
COMMENT ON COLUMN users.polar_subscription_id IS 'Polar subscription ID for reconciliation';
