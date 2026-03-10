CREATE TABLE IF NOT EXISTS groq_audio_usage_buckets (
  key_source TEXT NOT NULL CHECK (key_source IN ('primary', 'tier_2', 'tier_3')),
  window_start TIMESTAMPTZ NOT NULL,
  audio_seconds INTEGER NOT NULL DEFAULT 0 CHECK (audio_seconds >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (key_source, window_start)
);

CREATE INDEX IF NOT EXISTS idx_groq_audio_usage_buckets_window_start
ON groq_audio_usage_buckets (window_start DESC);

CREATE TABLE IF NOT EXISTS groq_key_health (
  key_source TEXT PRIMARY KEY CHECK (key_source IN ('primary', 'tier_2', 'tier_3')),
  aspd_cooldown_until TIMESTAMPTZ,
  last_rate_limited_at TIMESTAMPTZ,
  last_known_audio_limit_seconds INTEGER,
  last_known_audio_used_seconds INTEGER,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION increment_groq_audio_usage(
  p_key_source TEXT,
  p_window_start TIMESTAMPTZ,
  p_audio_seconds INTEGER,
  p_request_count INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  INSERT INTO groq_audio_usage_buckets (
    key_source,
    window_start,
    audio_seconds,
    request_count
  )
  VALUES (
    p_key_source,
    p_window_start,
    GREATEST(p_audio_seconds, 0),
    GREATEST(p_request_count, 0)
  )
  ON CONFLICT (key_source, window_start)
  DO UPDATE SET
    audio_seconds = groq_audio_usage_buckets.audio_seconds + GREATEST(EXCLUDED.audio_seconds, 0),
    request_count = groq_audio_usage_buckets.request_count + GREATEST(EXCLUDED.request_count, 0),
    updated_at = timezone('utc', now());
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upsert_groq_key_health(
  p_key_source TEXT,
  p_aspd_cooldown_until TIMESTAMPTZ,
  p_last_rate_limited_at TIMESTAMPTZ,
  p_last_known_audio_limit_seconds INTEGER,
  p_last_known_audio_used_seconds INTEGER,
  p_last_error_message TEXT
)
RETURNS void AS $$
BEGIN
  INSERT INTO groq_key_health (
    key_source,
    aspd_cooldown_until,
    last_rate_limited_at,
    last_known_audio_limit_seconds,
    last_known_audio_used_seconds,
    last_error_message
  )
  VALUES (
    p_key_source,
    p_aspd_cooldown_until,
    p_last_rate_limited_at,
    p_last_known_audio_limit_seconds,
    p_last_known_audio_used_seconds,
    p_last_error_message
  )
  ON CONFLICT (key_source)
  DO UPDATE SET
    aspd_cooldown_until = EXCLUDED.aspd_cooldown_until,
    last_rate_limited_at = EXCLUDED.last_rate_limited_at,
    last_known_audio_limit_seconds = COALESCE(
      EXCLUDED.last_known_audio_limit_seconds,
      groq_key_health.last_known_audio_limit_seconds
    ),
    last_known_audio_used_seconds = COALESCE(
      EXCLUDED.last_known_audio_used_seconds,
      groq_key_health.last_known_audio_used_seconds
    ),
    last_error_message = EXCLUDED.last_error_message,
    updated_at = timezone('utc', now());
END;
$$ LANGUAGE plpgsql;
