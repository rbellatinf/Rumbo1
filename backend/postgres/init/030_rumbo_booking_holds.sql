ALTER TABLE rumbo_booking_requests
  ADD COLUMN IF NOT EXISTS price_per_person numeric(14,2),
  ADD COLUMN IF NOT EXISTS price_total numeric(14,2),
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status varchar(20) NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS payment_reference varchar(120),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_status_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_status_check
  CHECK (status IN (
    'new',
    'validating',
    'quoted',
    'held',
    'payment_pending',
    'paid',
    'confirmed',
    'cancelled',
    'expired'
  ));

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_payment_status_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_payment_status_check
  CHECK (payment_status IN (
    'not_started',
    'pending',
    'paid',
    'failed',
    'cancelled',
    'expired'
  ));

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_price_per_person_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_price_per_person_check
  CHECK (price_per_person IS NULL OR price_per_person >= 0);

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_price_total_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_price_total_check
  CHECK (price_total IS NULL OR price_total >= 0);

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_hold_terms_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_hold_terms_check
  CHECK (
    status NOT IN ('held', 'payment_pending', 'paid') OR (
      price_per_person IS NOT NULL AND
      price_total IS NOT NULL AND
      currency IS NOT NULL AND
      hold_expires_at IS NOT NULL
    )
  );

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_paid_at_check;
ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_paid_at_check
  CHECK (payment_status <> 'paid' OR paid_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_active_hold_idx
  ON rumbo_booking_requests (hold_expires_at)
  WHERE status IN ('held', 'payment_pending');

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_payment_status_idx
  ON rumbo_booking_requests (payment_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS rumbo_booking_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id uuid NOT NULL
    REFERENCES rumbo_booking_requests(id) ON DELETE CASCADE,
  idempotency_key uuid UNIQUE NOT NULL,
  provider varchar(40) NOT NULL,
  provider_payment_id varchar(160),
  status varchar(20) NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'pending', 'approved', 'rejected', 'cancelled')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_booking_payment_attempts_booking_idx
  ON rumbo_booking_payment_attempts (booking_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_booking_payment_attempts_provider_idx
  ON rumbo_booking_payment_attempts (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION rumbo_booking_validate_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'new' AND NEW.status IN ('validating', 'held', 'cancelled')) OR
    (OLD.status = 'validating' AND NEW.status IN ('quoted', 'held', 'cancelled')) OR
    (OLD.status = 'quoted' AND NEW.status IN ('held', 'cancelled', 'expired')) OR
    (OLD.status = 'held' AND NEW.status IN ('payment_pending', 'paid', 'cancelled', 'expired')) OR
    (OLD.status = 'payment_pending' AND NEW.status IN ('paid', 'cancelled', 'expired')) OR
    (OLD.status = 'paid' AND NEW.status IN ('confirmed', 'cancelled')) OR
    (OLD.status = 'confirmed' AND NEW.status = 'cancelled') OR
    (OLD.status IN ('cancelled', 'expired') AND NEW.status IN ('validating', 'held'))
  ) THEN
    RAISE EXCEPTION 'Invalid Rumbo booking status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_expire_booking_holds()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE rumbo_booking_requests
  SET
    status = 'expired',
    payment_status = CASE
      WHEN payment_status = 'not_started' THEN 'expired'
      ELSE payment_status
    END
  WHERE status IN ('held', 'payment_pending')
    AND hold_expires_at <= now()
    AND payment_status <> 'paid';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

CREATE OR REPLACE VIEW rumbo_booking_hold_operations AS
SELECT
  b.reference,
  b.status,
  b.payment_status,
  b.product_name,
  b.country,
  b.departure_date,
  b.return_date,
  b.adults,
  b.children,
  b.price_per_person,
  b.price_total,
  b.price_display,
  b.currency,
  b.hold_expires_at,
  b.payment_reference,
  b.paid_at,
  b.confirmed_at,
  b.contact_name,
  b.contact_email,
  b.contact_phone,
  b.contact_channel,
  b.referral_code,
  b.provider,
  b.created_at,
  b.updated_at,
  b.version
FROM rumbo_booking_requests b;
