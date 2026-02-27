-- Add consent snapshot columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_14_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS service_quality_opt_in BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;

COMMENT ON COLUMN users.age_14_confirmed_at IS 'Timestamp when user confirmed they are age 14 or older';
COMMENT ON COLUMN users.terms_agreed_at IS 'Timestamp when user agreed to terms of service';
COMMENT ON COLUMN users.terms_version IS 'Version string of terms agreed by user';
COMMENT ON COLUMN users.privacy_agreed_at IS 'Timestamp when user agreed to privacy policy';
COMMENT ON COLUMN users.privacy_version IS 'Version string of privacy policy agreed by user';
COMMENT ON COLUMN users.service_quality_opt_in IS 'Optional consent for service quality improvement';
COMMENT ON COLUMN users.marketing_opt_in IS 'Optional consent for marketing and event notifications';
COMMENT ON COLUMN users.consented_at IS 'Timestamp when onboarding consents were recorded';

-- Add consent logs table for auditability
CREATE TABLE IF NOT EXISTS user_consent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  age_14_confirmed BOOLEAN NOT NULL DEFAULT true,
  service_quality_opt_in BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_consent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own consent logs" ON user_consent_logs;
CREATE POLICY "Users can view own consent logs" ON user_consent_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own consent logs" ON user_consent_logs;
CREATE POLICY "Users can insert own consent logs" ON user_consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_consent_logs_user_id ON user_consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_logs_consented_at ON user_consent_logs(consented_at DESC);
