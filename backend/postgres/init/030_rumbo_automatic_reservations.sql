CREATE TABLE IF NOT EXISTS rumbo_offer_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spree_store_id bigint NOT NULL,
  spree_product_id varchar(80) NOT NULL,
  spree_variant_id varchar(80),
  departure_date date,
  return_date date,
  total_capacity integer NOT NULL CHECK (total_capacity > 0),
  price_amount numeric(12, 2) NOT NULL CHECK (price_amount >= 0),
  price_display varchar(80) NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT true,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (return_date IS NULL OR departure_date IS NULL OR return_date > departure_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_offer_inventory_offer_idx
  ON rumbo_offer_inventory (
    spree_store_id,
    spree_product_id,
    departure_date,
    return_date
  ) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS rumbo_offer_inventory_active_idx
  ON rumbo_offer_inventory (active, valid_until, departure_date);

ALTER TABLE rumbo_booking_requests
  ADD COLUMN IF NOT EXISTS inventory_id uuid
    REFERENCES rumbo_offer_inventory(id),
  ADD COLUMN IF NOT EXISTS unit_price_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS total_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

ALTER TABLE rumbo_booking_requests
  DROP CONSTRAINT IF EXISTS rumbo_booking_requests_status_check;

ALTER TABLE rumbo_booking_requests
  ADD CONSTRAINT rumbo_booking_requests_status_check
  CHECK (
    status IN (
      'new',
      'validating',
      'quoted',
      'payment_pending',
      'payment_failed',
      'confirmed',
      'cancelled',
      'expired'
    )
  );

ALTER TABLE rumbo_booking_requests
  ALTER COLUMN status SET DEFAULT 'payment_pending';

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_inventory_idx
  ON rumbo_booking_requests (inventory_id, status, hold_expires_at);

CREATE TABLE IF NOT EXISTS rumbo_booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id uuid UNIQUE NOT NULL
    REFERENCES rumbo_booking_requests(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL
    REFERENCES rumbo_offer_inventory(id),
  units smallint NOT NULL CHECK (units BETWEEN 1 AND 18),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'converted', 'released', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_booking_holds_capacity_idx
  ON rumbo_booking_holds (inventory_id, status, expires_at);

CREATE TABLE IF NOT EXISTS rumbo_booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id uuid UNIQUE NOT NULL
    REFERENCES rumbo_booking_requests(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL DEFAULT 'unconfigured',
  provider_payment_id varchar(160),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'authorized',
        'paid',
        'failed',
        'cancelled',
        'refunded'
      )
    ),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_url text,
  authorized_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_booking_payments_provider_reference_idx
  ON rumbo_booking_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rumbo_booking_payments_status_idx
  ON rumbo_booking_payments (status, updated_at DESC);

CREATE OR REPLACE FUNCTION rumbo_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_inventory_guard_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed_units integer;
BEGIN
  SELECT COALESCE(sum(h.units), 0)::integer
    INTO committed_units
  FROM rumbo_booking_holds h
  WHERE h.inventory_id = NEW.id
    AND (
      h.status = 'converted' OR
      (h.status = 'active' AND h.expires_at > now())
    );

  IF NEW.total_capacity < committed_units THEN
    RAISE EXCEPTION 'RUMBO_CAPACITY_BELOW_COMMITTED'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_prepare_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reference := COALESCE(
    NULLIF(upper(trim(NEW.reference)), ''),
    'RUM-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );
  NEW.contact_email := lower(trim(NEW.contact_email));
  NEW.origin_iata := NULLIF(upper(trim(NEW.origin_iata)), '');
  NEW.destination_iata := NULLIF(upper(trim(NEW.destination_iata)), '');
  NEW.currency := NULLIF(upper(trim(NEW.currency)), '');
  NEW.referral_code := NULLIF(upper(trim(NEW.referral_code)), '');
  NEW.provider := COALESCE(NULLIF(trim(NEW.provider), ''), 'Spree');
  NEW.status := 'payment_pending';
  NEW.hold_expires_at := now() + interval '15 minutes';
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
  NEW.submitted_at := COALESCE(NEW.submitted_at, NEW.created_at);
  NEW.version := COALESCE(NEW.version, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_reserve_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inventory_capacity integer;
  inventory_price numeric(12, 2);
  inventory_price_display varchar(80);
  inventory_currency char(3);
  committed_units integer;
  requested_units integer;
BEGIN
  IF NEW.inventory_id IS NULL THEN
    RAISE EXCEPTION 'RUMBO_INVENTORY_REQUIRED'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    i.total_capacity,
    i.price_amount,
    i.price_display,
    i.currency
  INTO
    inventory_capacity,
    inventory_price,
    inventory_price_display,
    inventory_currency
  FROM rumbo_offer_inventory i
  WHERE i.id = NEW.inventory_id
    AND i.active = true
    AND (i.valid_until IS NULL OR i.valid_until > now())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUMBO_OFFER_UNAVAILABLE'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(h.units), 0)::integer
    INTO committed_units
  FROM rumbo_booking_holds h
  WHERE h.inventory_id = NEW.inventory_id
    AND (
      h.status = 'converted' OR
      (h.status = 'active' AND h.expires_at > now())
    );

  requested_units := NEW.adults + NEW.children;

  IF inventory_capacity - committed_units < requested_units THEN
    RAISE EXCEPTION 'RUMBO_INSUFFICIENT_CAPACITY'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.unit_price_amount := inventory_price;
  NEW.total_amount := inventory_price * requested_units;
  NEW.price_display := inventory_price_display;
  NEW.currency := inventory_currency;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_create_hold_and_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO rumbo_booking_holds (
    booking_request_id,
    inventory_id,
    units,
    status,
    expires_at
  ) VALUES (
    NEW.id,
    NEW.inventory_id,
    NEW.adults + NEW.children,
    'active',
    NEW.hold_expires_at
  )
  ON CONFLICT (booking_request_id) DO NOTHING;

  INSERT INTO rumbo_booking_payments (
    booking_request_id,
    status,
    amount,
    currency
  ) VALUES (
    NEW.id,
    'pending',
    NEW.total_amount,
    NEW.currency
  )
  ON CONFLICT (booking_request_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_validate_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_is_complete boolean;
  hold_is_valid boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' THEN
    SELECT EXISTS (
      SELECT 1
      FROM rumbo_booking_payments p
      WHERE p.booking_request_id = OLD.id
        AND p.status = 'paid'
    ) INTO payment_is_complete;

    IF NOT payment_is_complete THEN
      RAISE EXCEPTION 'RUMBO_PAYMENT_REQUIRED_FOR_CONFIRMATION'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM rumbo_booking_holds h
      WHERE h.booking_request_id = OLD.id
        AND h.status = 'active'
        AND h.expires_at > now()
    ) INTO hold_is_valid;

    IF NOT hold_is_valid THEN
      RAISE EXCEPTION 'RUMBO_ACTIVE_HOLD_REQUIRED_FOR_CONFIRMATION'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT (
    (OLD.status = 'new' AND NEW.status IN ('validating', 'payment_pending', 'cancelled')) OR
    (OLD.status = 'validating' AND NEW.status IN ('quoted', 'payment_pending', 'cancelled')) OR
    (OLD.status = 'quoted' AND NEW.status IN ('payment_pending', 'confirmed', 'cancelled', 'expired')) OR
    (OLD.status = 'payment_pending' AND NEW.status IN ('payment_failed', 'confirmed', 'cancelled', 'expired')) OR
    (OLD.status = 'payment_failed' AND NEW.status IN ('payment_pending', 'confirmed', 'cancelled', 'expired')) OR
    (OLD.status = 'confirmed' AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid Rumbo booking status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_sync_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    UPDATE rumbo_booking_holds
    SET status = 'converted'
    WHERE booking_request_id = NEW.id
      AND status = 'active';
  ELSIF NEW.status = 'expired' THEN
    UPDATE rumbo_booking_holds
    SET status = 'expired'
    WHERE booking_request_id = NEW.id
      AND status = 'active';
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE rumbo_booking_holds
    SET status = 'released'
    WHERE booking_request_id = NEW.id
      AND status IN ('active', 'converted');
  END IF;

  IF NEW.status IN ('cancelled', 'expired') THEN
    UPDATE rumbo_booking_payments
    SET status = 'cancelled'
    WHERE booking_request_id = NEW.id
      AND status IN ('pending', 'authorized', 'failed');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_payment_sync_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_can_complete boolean;
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM 1
    FROM rumbo_offer_inventory i
    JOIN rumbo_booking_requests b
      ON b.inventory_id = i.id
    WHERE b.id = NEW.booking_request_id
    FOR UPDATE OF i;

    SELECT EXISTS (
      SELECT 1
      FROM rumbo_booking_requests b
      JOIN rumbo_booking_holds h
        ON h.booking_request_id = b.id
      WHERE b.id = NEW.booking_request_id
        AND b.status IN ('payment_pending', 'payment_failed', 'quoted')
        AND h.status = 'active'
        AND h.expires_at > now()
        AND b.total_amount = NEW.amount
        AND b.currency = NEW.currency
    ) INTO payment_can_complete;

    IF NOT payment_can_complete THEN
      RAISE EXCEPTION 'RUMBO_PAYMENT_CANNOT_COMPLETE'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'authorized' AND NEW.authorized_at IS NULL THEN
    NEW.authorized_at := now();
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'failed' AND NEW.failed_at IS NULL THEN
    NEW.failed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_payment_apply_booking_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    UPDATE rumbo_booking_requests
    SET status = 'confirmed'
    WHERE id = NEW.booking_request_id
      AND status IN ('payment_pending', 'payment_failed', 'quoted');
  ELSIF NEW.status = 'failed' THEN
    UPDATE rumbo_booking_requests
    SET status = 'payment_failed'
    WHERE id = NEW.booking_request_id
      AND status = 'payment_pending';
  ELSIF NEW.status IN ('cancelled', 'refunded') THEN
    UPDATE rumbo_booking_requests
    SET status = 'cancelled'
    WHERE id = NEW.booking_request_id
      AND status IN ('payment_pending', 'payment_failed', 'confirmed');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_expire_stale_booking_holds()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired_holds AS (
    UPDATE rumbo_booking_holds
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at <= now()
    RETURNING booking_request_id
  ), expired_bookings AS (
    UPDATE rumbo_booking_requests b
    SET status = 'expired'
    WHERE b.id IN (SELECT booking_request_id FROM expired_holds)
      AND b.status IN ('payment_pending', 'payment_failed')
    RETURNING b.id
  )
  SELECT count(*)::integer
    INTO expired_count
  FROM expired_bookings;

  RETURN expired_count;
END;
$$;

DROP TRIGGER IF EXISTS rumbo_offer_inventory_guard_trigger
  ON rumbo_offer_inventory;
CREATE TRIGGER rumbo_offer_inventory_guard_trigger
BEFORE UPDATE OF total_capacity ON rumbo_offer_inventory
FOR EACH ROW EXECUTE FUNCTION rumbo_inventory_guard_capacity();

DROP TRIGGER IF EXISTS rumbo_offer_inventory_touch_trigger
  ON rumbo_offer_inventory;
CREATE TRIGGER rumbo_offer_inventory_touch_trigger
BEFORE UPDATE ON rumbo_offer_inventory
FOR EACH ROW EXECUTE FUNCTION rumbo_touch_updated_at();

DROP TRIGGER IF EXISTS rumbo_booking_reserve_capacity_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_reserve_capacity_trigger
BEFORE INSERT ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_reserve_capacity();

DROP TRIGGER IF EXISTS rumbo_booking_create_hold_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_create_hold_trigger
AFTER INSERT ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_create_hold_and_payment();

DROP TRIGGER IF EXISTS rumbo_booking_sync_hold_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_sync_hold_trigger
AFTER UPDATE OF status ON rumbo_booking_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION rumbo_booking_sync_hold();

DROP TRIGGER IF EXISTS rumbo_booking_holds_touch_trigger
  ON rumbo_booking_holds;
CREATE TRIGGER rumbo_booking_holds_touch_trigger
BEFORE UPDATE ON rumbo_booking_holds
FOR EACH ROW EXECUTE FUNCTION rumbo_touch_updated_at();

DROP TRIGGER IF EXISTS rumbo_booking_payments_prepare_trigger
  ON rumbo_booking_payments;
CREATE TRIGGER rumbo_booking_payments_prepare_trigger
BEFORE UPDATE OF status ON rumbo_booking_payments
FOR EACH ROW EXECUTE FUNCTION rumbo_payment_sync_booking();

DROP TRIGGER IF EXISTS rumbo_booking_payments_touch_trigger
  ON rumbo_booking_payments;
CREATE TRIGGER rumbo_booking_payments_touch_trigger
BEFORE UPDATE ON rumbo_booking_payments
FOR EACH ROW EXECUTE FUNCTION rumbo_touch_updated_at();

DROP TRIGGER IF EXISTS rumbo_booking_payments_apply_trigger
  ON rumbo_booking_payments;
CREATE TRIGGER rumbo_booking_payments_apply_trigger
AFTER UPDATE OF status ON rumbo_booking_payments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION rumbo_payment_apply_booking_status();

CREATE OR REPLACE VIEW rumbo_offer_availability AS
SELECT
  i.id,
  i.spree_store_id,
  i.spree_product_id,
  i.spree_variant_id,
  i.departure_date,
  i.return_date,
  i.total_capacity,
  COALESCE(committed.units, 0)::integer AS committed_capacity,
  GREATEST(i.total_capacity - COALESCE(committed.units, 0), 0)::integer
    AS remaining_capacity,
  i.price_amount,
  i.price_display,
  i.currency,
  i.active,
  i.valid_until,
  i.updated_at
FROM rumbo_offer_inventory i
LEFT JOIN LATERAL (
  SELECT sum(h.units)::integer AS units
  FROM rumbo_booking_holds h
  WHERE h.inventory_id = i.id
    AND (
      h.status = 'converted' OR
      (h.status = 'active' AND h.expires_at > now())
    )
) committed ON true;

DROP VIEW IF EXISTS rumbo_booking_operations;
CREATE VIEW rumbo_booking_operations AS
SELECT
  b.reference,
  b.status,
  b.product_name,
  b.country,
  b.departure_date,
  b.return_date,
  b.adults,
  b.children,
  b.unit_price_amount,
  b.total_amount,
  b.price_display,
  b.currency,
  b.hold_expires_at,
  p.status AS payment_status,
  p.provider AS payment_provider,
  b.contact_name,
  b.contact_email,
  b.contact_phone,
  b.contact_channel,
  b.referral_code,
  b.provider,
  b.created_at,
  b.updated_at,
  b.version
FROM rumbo_booking_requests b
LEFT JOIN rumbo_booking_payments p
  ON p.booking_request_id = b.id;
