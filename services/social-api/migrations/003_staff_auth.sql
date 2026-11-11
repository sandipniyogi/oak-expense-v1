-- Oak Social V3: additive schema only. Run on isolated staging after review.
CREATE TABLE IF NOT EXISTS oak_social_staff (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9._-]{2,39}$'),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','manager','creator','viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oak_social_staff_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES oak_social_staff(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oak_social_staff_sessions_staff_idx ON oak_social_staff_sessions(staff_id);
CREATE INDEX IF NOT EXISTS oak_social_staff_sessions_expiry_idx ON oak_social_staff_sessions(expires_at);
CREATE TABLE IF NOT EXISTS oak_social_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  source_hash CHAR(64),
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oak_social_login_attempts_recent_idx ON oak_social_login_attempts(username, attempted_at DESC);
CREATE TABLE IF NOT EXISTS oak_social_staff_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES oak_social_staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Intentionally no default admin or hard-coded password.
