-- Password recovery tokens. Only SHA-256 token hashes are persisted.
CREATE TABLE IF NOT EXISTS rumbo_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES rumbo_accounts(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS rumbo_password_reset_tokens_account_idx
  ON rumbo_password_reset_tokens(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rumbo_password_reset_tokens_expiry_idx
  ON rumbo_password_reset_tokens(expires_at)
  WHERE used_at IS NULL;
