CREATE TABLE IF NOT EXISTS rumbo_global_commission_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  partner_rate numeric(5,4) NOT NULL DEFAULT 0.0600 CHECK (partner_rate >= 0 AND partner_rate <= 1),
  sponsor_rate numeric(5,4) NOT NULL DEFAULT 0.0000 CHECK (sponsor_rate >= 0 AND sponsor_rate <= 1),
  retailer_rate numeric(5,4) NOT NULL DEFAULT 0.0000 CHECK (retailer_rate >= 0 AND retailer_rate <= 1),
  updated_by uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rumbo_global_commission_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION rumbo_touch_global_commission_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rumbo_global_commission_settings_touch ON rumbo_global_commission_settings;
CREATE TRIGGER rumbo_global_commission_settings_touch
BEFORE UPDATE ON rumbo_global_commission_settings
FOR EACH ROW EXECUTE FUNCTION rumbo_touch_global_commission_settings();
