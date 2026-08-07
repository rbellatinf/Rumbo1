CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One credential table for every backoffice user. Passwords are never stored in plain text.
CREATE TABLE IF NOT EXISTS rumbo_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  password_hash text NOT NULL,
  role varchar(24) NOT NULL
    CHECK (role IN ('partner', 'retailer_owner', 'retailer_agent', 'wholesaler_admin')),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'blocked', 'disabled')),
  email_verified_at timestamptz,
  last_login_at timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lower(email))
);

CREATE TABLE IF NOT EXISTS rumbo_partner_profiles (
  account_id uuid PRIMARY KEY REFERENCES rumbo_accounts(id) ON DELETE CASCADE,
  associate_id uuid UNIQUE REFERENCES rumbo_associates(id) ON DELETE SET NULL,
  sponsor_partner_id uuid REFERENCES rumbo_partner_profiles(account_id) ON DELETE SET NULL,
  first_name varchar(100) NOT NULL,
  last_name varchar(120) NOT NULL,
  document_type varchar(12) NOT NULL DEFAULT 'DNI'
    CHECK (document_type IN ('DNI', 'CE', 'PASSPORT', 'RUC')),
  document_number varchar(24) NOT NULL,
  phone varchar(32),
  referral_code varchar(40) UNIQUE NOT NULL,
  public_slug varchar(80) UNIQUE,
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.0600
    CHECK (commission_rate >= 0 AND commission_rate <= 1),
  network_commission_rate numeric(5,4) NOT NULL DEFAULT 0.0000
    CHECK (network_commission_rate >= 0 AND network_commission_rate <= 1),
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_number),
  CHECK (sponsor_partner_id IS NULL OR sponsor_partner_id <> account_id)
);

CREATE TABLE IF NOT EXISTS rumbo_retailers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name varchar(180) NOT NULL,
  trade_name varchar(160) NOT NULL,
  tax_id varchar(24) UNIQUE NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'PE',
  address_line varchar(220),
  city varchar(100),
  phone varchar(32),
  contact_email varchar(254),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  commercial_discount_rate numeric(5,4) NOT NULL DEFAULT 0.0000
    CHECK (commercial_discount_rate >= 0 AND commercial_discount_rate <= 1),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.0000
    CHECK (commission_rate >= 0 AND commission_rate <= 1),
  approved_at timestamptz,
  approved_by uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_retailer_members (
  retailer_id uuid NOT NULL REFERENCES rumbo_retailers(id) ON DELETE CASCADE,
  account_id uuid NOT NULL UNIQUE REFERENCES rumbo_accounts(id) ON DELETE CASCADE,
  member_role varchar(20) NOT NULL DEFAULT 'agent'
    CHECK (member_role IN ('owner', 'manager', 'agent', 'finance')),
  first_name varchar(100) NOT NULL,
  last_name varchar(120) NOT NULL,
  phone varchar(32),
  is_primary_contact boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (retailer_id, account_id)
);

CREATE TABLE IF NOT EXISTS rumbo_referral_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_partner_id uuid NOT NULL REFERENCES rumbo_partner_profiles(account_id) ON DELETE RESTRICT,
  referred_partner_id uuid UNIQUE NOT NULL REFERENCES rumbo_partner_profiles(account_id) ON DELETE RESTRICT,
  referral_code varchar(40) NOT NULL,
  level smallint NOT NULL DEFAULT 1 CHECK (level = 1),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'disputed')),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (sponsor_partner_id <> referred_partner_id)
);

CREATE TABLE IF NOT EXISTS rumbo_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type varchar(20) NOT NULL
    CHECK (beneficiary_type IN ('partner', 'sponsor', 'retailer')),
  beneficiary_id uuid NOT NULL,
  sale_channel varchar(20) NOT NULL DEFAULT 'all'
    CHECK (sale_channel IN ('all', 'partner', 'retailer', 'direct')),
  rate numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  priority integer NOT NULL DEFAULT 100,
  active_from timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (active_until IS NULL OR active_until > active_from)
);

ALTER TABLE rumbo_sale_attributions
  ADD COLUMN IF NOT EXISTS source_channel varchar(20) NOT NULL DEFAULT 'partner'
    CHECK (source_channel IN ('partner', 'retailer', 'direct')),
  ADD COLUMN IF NOT EXISTS retailer_id uuid REFERENCES rumbo_retailers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_partner_id uuid REFERENCES rumbo_partner_profiles(account_id) ON DELETE SET NULL;

ALTER TABLE rumbo_commissions
  ADD COLUMN IF NOT EXISTS beneficiary_type varchar(20) NOT NULL DEFAULT 'partner'
    CHECK (beneficiary_type IN ('partner', 'sponsor', 'retailer')),
  ADD COLUMN IF NOT EXISTS beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES rumbo_commission_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS rumbo_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES rumbo_accounts(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  ip_address inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS rumbo_accounts_role_status_idx ON rumbo_accounts (role, status);
CREATE INDEX IF NOT EXISTS rumbo_partner_sponsor_idx ON rumbo_partner_profiles (sponsor_partner_id);
CREATE INDEX IF NOT EXISTS rumbo_retailers_status_idx ON rumbo_retailers (status);
CREATE INDEX IF NOT EXISTS rumbo_retailer_members_retailer_idx ON rumbo_retailer_members (retailer_id);
CREATE INDEX IF NOT EXISTS rumbo_referrals_sponsor_idx ON rumbo_referral_relationships (sponsor_partner_id);
CREATE INDEX IF NOT EXISTS rumbo_commission_rules_lookup_idx
  ON rumbo_commission_rules (beneficiary_type, beneficiary_id, is_active, priority);
CREATE INDEX IF NOT EXISTS rumbo_auth_sessions_account_idx ON rumbo_auth_sessions (account_id, expires_at);

CREATE OR REPLACE VIEW rumbo_partner_network_summary AS
SELECT
  p.account_id AS partner_account_id,
  p.first_name,
  p.last_name,
  p.referral_code,
  p.sponsor_partner_id,
  a.status AS account_status,
  p.commission_rate,
  p.network_commission_rate,
  count(r.referred_partner_id) FILTER (WHERE r.status = 'active') AS active_direct_referrals
FROM rumbo_partner_profiles p
JOIN rumbo_accounts a ON a.id = p.account_id
LEFT JOIN rumbo_referral_relationships r ON r.sponsor_partner_id = p.account_id
GROUP BY p.account_id, p.first_name, p.last_name, p.referral_code,
         p.sponsor_partner_id, a.status, p.commission_rate, p.network_commission_rate;

CREATE OR REPLACE VIEW rumbo_retailer_summary AS
SELECT
  r.id AS retailer_id,
  r.trade_name,
  r.legal_name,
  r.tax_id,
  r.status,
  r.commercial_discount_rate,
  r.commission_rate,
  count(m.account_id) AS member_count
FROM rumbo_retailers r
LEFT JOIN rumbo_retailer_members m ON m.retailer_id = r.id
GROUP BY r.id, r.trade_name, r.legal_name, r.tax_id, r.status,
         r.commercial_discount_rate, r.commission_rate;
