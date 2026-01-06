-- Add referral system fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER DEFAULT 0;

-- Create function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(8) := '';
  i INTEGER;
  exists_count INTEGER;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check if code already exists
    SELECT COUNT(*) INTO exists_count FROM users WHERE referral_code = result;
    EXIT WHEN exists_count = 0;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate referral code on user creation
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_referral_code ON users;
CREATE TRIGGER trigger_set_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_referral_code();

-- Update existing users with referral codes
UPDATE users SET referral_code = generate_referral_code() WHERE referral_code IS NULL;

-- Comment
COMMENT ON COLUMN users.referral_code IS 'Unique 8-character referral code for this user';
COMMENT ON COLUMN users.referred_by IS 'User ID of the person who referred this user';
COMMENT ON COLUMN users.bonus_minutes IS 'Bonus minutes earned from referrals (added to monthly limit)';
