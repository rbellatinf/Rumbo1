CREATE TABLE IF NOT EXISTS rumbo_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference varchar(24) UNIQUE NOT NULL,
  idempotency_key uuid UNIQUE NOT NULL,
  spree_store_id bigint,
  spree_product_id varchar(80) NOT NULL,
  spree_variant_id varchar(80),
  product_slug varchar(200) NOT NULL,
  product_name varchar(200) NOT NULL,
  provider varchar(40) NOT NULL DEFAULT 'Spree',
  provider_reference varchar(120),
  country varchar(100),
  origin_iata char(3),
  destination_iata char(3),
  departure_date date,
  return_date date,
  adults smallint NOT NULL DEFAULT 1 CHECK (adults BETWEEN 1 AND 9),
  children smallint NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 9),
  price_display varchar(80),
  currency char(3),
  contact_name varchar(160) NOT NULL,
  contact_email varchar(254) NOT NULL,
  contact_phone varchar(40) NOT NULL,
  contact_channel varchar(20) NOT NULL DEFAULT 'whatsapp'
    CHECK (contact_channel IN ('whatsapp', 'phone', 'email')),
  referral_code varchar(40),
  notes text,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'validating', 'quoted', 'confirmed', 'cancelled', 'expired')),
  consent_accepted_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (return_date IS NULL OR departure_date IS NULL OR return_date > departure_date),
  CHECK (origin_iata IS NULL OR origin_iata ~ '^[A-Z]{3}$'),
  CHECK (destination_iata IS NULL OR destination_iata ~ '^[A-Z]{3}$'),
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS rumbo_booking_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_request_id uuid NOT NULL
    REFERENCES rumbo_booking_requests(id) ON DELETE CASCADE,
  previous_status varchar(20),
  new_status varchar(20) NOT NULL,
  actor varchar(120) NOT NULL DEFAULT 'system',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_status_idx
  ON rumbo_booking_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_contact_email_idx
  ON rumbo_booking_requests (lower(contact_email), created_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_product_idx
  ON rumbo_booking_requests (spree_product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_referral_idx
  ON rumbo_booking_requests (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS rumbo_booking_status_history_request_idx
  ON rumbo_booking_status_history (booking_request_id, created_at DESC);

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
  NEW.status := COALESCE(NULLIF(trim(NEW.status), ''), 'new');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
  NEW.submitted_at := COALESCE(NEW.submitted_at, NEW.created_at);
  NEW.version := COALESCE(NEW.version, 1);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_touch_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  NEW.contact_email := lower(trim(NEW.contact_email));
  NEW.origin_iata := NULLIF(upper(trim(NEW.origin_iata)), '');
  NEW.destination_iata := NULLIF(upper(trim(NEW.destination_iata)), '');
  NEW.currency := NULLIF(upper(trim(NEW.currency)), '');
  NEW.referral_code := NULLIF(upper(trim(NEW.referral_code)), '');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_validate_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'new' AND NEW.status IN ('validating', 'cancelled')) OR
    (OLD.status = 'validating' AND NEW.status IN ('quoted', 'cancelled')) OR
    (OLD.status = 'quoted' AND NEW.status IN ('confirmed', 'cancelled', 'expired')) OR
    (OLD.status = 'confirmed' AND NEW.status = 'cancelled') OR
    (OLD.status IN ('cancelled', 'expired') AND NEW.status = 'validating')
  ) THEN
    RAISE EXCEPTION 'Invalid Rumbo booking status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_write_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_actor varchar(120);
BEGIN
  event_actor := COALESCE(NULLIF(current_setting('rumbo.actor', true), ''), 'system');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO rumbo_booking_status_history (
      booking_request_id,
      previous_status,
      new_status,
      actor
    ) VALUES (
      NEW.id,
      NULL,
      NEW.status,
      event_actor
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO rumbo_booking_status_history (
      booking_request_id,
      previous_status,
      new_status,
      actor
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      event_actor
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_write_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_actor varchar(120);
  booking_id varchar(80);
  event_details jsonb;
BEGIN
  event_actor := COALESCE(NULLIF(current_setting('rumbo.actor', true), ''), 'system');
  booking_id := COALESCE(NEW.reference, OLD.reference);

  IF TG_OP = 'INSERT' THEN
    event_details := jsonb_build_object(
      'status', NEW.status,
      'product_id', NEW.spree_product_id,
      'product_name', NEW.product_name,
      'version', NEW.version
    );
  ELSIF TG_OP = 'UPDATE' THEN
    event_details := jsonb_build_object(
      'previous_status', OLD.status,
      'status', NEW.status,
      'version', NEW.version
    );
  ELSE
    event_details := jsonb_build_object(
      'status', OLD.status,
      'version', OLD.version
    );
  END IF;

  INSERT INTO rumbo_audit_events (
    actor,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    event_actor,
    lower(TG_OP),
    'booking_request',
    booking_id,
    event_details
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rumbo_booking_prepare_insert_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_prepare_insert_trigger
BEFORE INSERT ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_prepare_insert();

DROP TRIGGER IF EXISTS rumbo_booking_validate_transition_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_validate_transition_trigger
BEFORE UPDATE OF status ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_validate_transition();

DROP TRIGGER IF EXISTS rumbo_booking_touch_update_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_touch_update_trigger
BEFORE UPDATE ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_touch_update();

DROP TRIGGER IF EXISTS rumbo_booking_write_history_insert_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_write_history_insert_trigger
AFTER INSERT ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_write_history();

DROP TRIGGER IF EXISTS rumbo_booking_write_history_update_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_write_history_update_trigger
AFTER UPDATE OF status ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_write_history();

DROP TRIGGER IF EXISTS rumbo_booking_write_audit_trigger
  ON rumbo_booking_requests;
CREATE TRIGGER rumbo_booking_write_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON rumbo_booking_requests
FOR EACH ROW EXECUTE FUNCTION rumbo_booking_write_audit();

CREATE OR REPLACE VIEW rumbo_booking_operations AS
SELECT
  b.reference,
  b.status,
  b.product_name,
  b.country,
  b.departure_date,
  b.return_date,
  b.adults,
  b.children,
  b.price_display,
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
