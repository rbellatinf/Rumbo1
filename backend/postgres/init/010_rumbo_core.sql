CREATE TABLE IF NOT EXISTS rumbo_associates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spree_customer_id varchar(64) UNIQUE NOT NULL,
  referral_code varchar(40) UNIQUE NOT NULL,
  membership_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (membership_status IN ('pending', 'active', 'suspended', 'expired')),
  direct_commission_rate numeric(5, 4) NOT NULL DEFAULT 0.0600
    CHECK (direct_commission_rate >= 0 AND direct_commission_rate <= 1),
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  associate_id uuid REFERENCES rumbo_associates(id) ON DELETE SET NULL,
  license_code varchar(64) UNIQUE NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'assigned', 'revoked', 'expired')),
  assigned_by varchar(120),
  assigned_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_sale_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spree_order_id varchar(64) UNIQUE NOT NULL,
  associate_id uuid NOT NULL REFERENCES rumbo_associates(id),
  referral_code varchar(40) NOT NULL,
  currency varchar(3) NOT NULL,
  gross_amount numeric(14, 2) NOT NULL CHECK (gross_amount >= 0),
  payment_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_attribution_id uuid UNIQUE NOT NULL
    REFERENCES rumbo_sale_attributions(id) ON DELETE RESTRICT,
  rate numeric(5, 4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  base_amount numeric(14, 2) NOT NULL CHECK (base_amount >= 0),
  commission_amount numeric(14, 2) NOT NULL CHECK (commission_amount >= 0),
  currency varchar(3) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'reversed')),
  approved_by varchar(120),
  approved_at timestamptz,
  paid_by varchar(120),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor varchar(120) NOT NULL,
  action varchar(80) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id varchar(80) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_associates_membership_status_idx
  ON rumbo_associates (membership_status);

CREATE INDEX IF NOT EXISTS rumbo_sale_attributions_associate_id_idx
  ON rumbo_sale_attributions (associate_id);

CREATE INDEX IF NOT EXISTS rumbo_sale_attributions_payment_status_idx
  ON rumbo_sale_attributions (payment_status);

CREATE INDEX IF NOT EXISTS rumbo_commissions_status_idx
  ON rumbo_commissions (status);

CREATE INDEX IF NOT EXISTS rumbo_audit_events_entity_idx
  ON rumbo_audit_events (entity_type, entity_id);

CREATE OR REPLACE VIEW rumbo_commission_review AS
SELECT
  c.id AS commission_id,
  s.spree_order_id,
  a.referral_code,
  s.currency,
  c.base_amount,
  c.rate,
  c.commission_amount,
  s.payment_status,
  c.status AS commission_status,
  c.created_at
FROM rumbo_commissions c
JOIN rumbo_sale_attributions s ON s.id = c.sale_attribution_id
JOIN rumbo_associates a ON a.id = s.associate_id;

