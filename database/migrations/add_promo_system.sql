-- Migration: Add Promo System
-- Description: Create promo_codes table and add promo fields to users table
-- This enables launch promotions where first N users get Pro benefits for a limited time

-- 1. Create promo_codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(32) UNIQUE NOT NULL,           -- e.g., "LAUNCH100"
  name TEXT NOT NULL,                          -- e.g., "Launch Promotion"
  max_redemptions INTEGER NOT NULL,            -- e.g., 100
  current_redemptions INTEGER DEFAULT 0,       -- Track how many have used it
  benefit_type TEXT NOT NULL CHECK (benefit_type IN ('pro_trial')),
  benefit_duration_days INTEGER DEFAULT 30,    -- How long the benefit lasts
  is_active BOOLEAN DEFAULT TRUE,              -- Can disable promo
  starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,         -- Optional expiry date for the promo itself
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = TRUE;

-- 3. Enable RLS on promo_codes (all access through service role)
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- 4. Add promo-related fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_applied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMP WITH TIME ZONE;

-- 5. Add index for checking active promos
CREATE INDEX IF NOT EXISTS idx_users_promo_expires ON users(promo_expires_at) WHERE promo_expires_at IS NOT NULL;

-- 6. Add comments for documentation
COMMENT ON TABLE promo_codes IS 'Promotional codes for limited-time offers (e.g., launch promotions)';
COMMENT ON COLUMN promo_codes.code IS 'The promo code users enter (e.g., LAUNCH100)';
COMMENT ON COLUMN promo_codes.max_redemptions IS 'Maximum number of users who can use this code';
COMMENT ON COLUMN promo_codes.current_redemptions IS 'Current number of users who have used this code';
COMMENT ON COLUMN promo_codes.benefit_type IS 'Type of benefit: pro_trial gives Pro features';
COMMENT ON COLUMN promo_codes.benefit_duration_days IS 'How many days the benefit lasts after activation';
COMMENT ON COLUMN promo_codes.is_active IS 'Whether this promo code is currently active';
COMMENT ON COLUMN promo_codes.starts_at IS 'When this promo code becomes valid';
COMMENT ON COLUMN promo_codes.expires_at IS 'When this promo code expires (null = never)';

COMMENT ON COLUMN users.promo_code_id IS 'Reference to the promo code that was applied to this user';
COMMENT ON COLUMN users.promo_applied_at IS 'When the promo was applied to this user';
COMMENT ON COLUMN users.promo_expires_at IS 'When the promo benefits expire for this user';

-- 7. Insert launch promo code (100 users, 30 days Pro trial)
-- Uncomment and run this when ready to launch:
-- INSERT INTO promo_codes (code, name, max_redemptions, benefit_type, benefit_duration_days)
-- VALUES ('LAUNCH100', '런칭 프로모션 - 선착순 100명', 100, 'pro_trial', 30);
