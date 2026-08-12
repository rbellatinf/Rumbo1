CREATE TABLE IF NOT EXISTS rumbo_integration_configs (
  integration_code varchar(80) PRIMARY KEY,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  secret_iv varchar(64),
  secret_tag varchar(64),
  secret_mask jsonb NOT NULL DEFAULT '{}'::jsonb,
  configured_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  configured_at timestamptz,
  last_tested_at timestamptz,
  last_test_success boolean,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_integration_configs_updated_idx
  ON rumbo_integration_configs(updated_at DESC);
