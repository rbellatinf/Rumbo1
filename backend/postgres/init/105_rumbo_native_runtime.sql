-- Rumbo native runtime cutover. Legacy columns remain read-compatible for history.
ALTER TABLE rumbo_booking_requests ALTER COLUMN provider SET DEFAULT 'Rumbo';

CREATE OR REPLACE FUNCTION rumbo_booking_prepare_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.reference := COALESCE(NULLIF(upper(trim(NEW.reference)), ''), 'RUM-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));
  NEW.contact_email := lower(trim(NEW.contact_email));
  NEW.origin_iata := NULLIF(upper(trim(NEW.origin_iata)), '');
  NEW.destination_iata := NULLIF(upper(trim(NEW.destination_iata)), '');
  NEW.currency := NULLIF(upper(trim(NEW.currency)), '');
  NEW.referral_code := NULLIF(upper(trim(NEW.referral_code)), '');
  NEW.provider := COALESCE(NULLIF(trim(NEW.provider), ''), 'Rumbo');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
  NEW.submitted_at := COALESCE(NEW.submitted_at, NEW.created_at);
  NEW.version := COALESCE(NEW.version, 1);
  IF NEW.catalog_product_id IS NOT NULL THEN
    NEW.status := 'payment_pending';
    NEW.hold_expires_at := COALESCE(NEW.hold_expires_at, now() + interval '15 minutes');
  ELSE
    NEW.status := COALESCE(NULLIF(trim(NEW.status), ''), 'new');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_reserve_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  departure rumbo_catalog_departures%ROWTYPE;
  requested_units integer;
  inventory_capacity integer;
  inventory_price numeric(12,2);
  inventory_price_display varchar(80);
  inventory_currency char(3);
  committed_units integer;
BEGIN
  requested_units := NEW.adults + NEW.children;
  IF NEW.catalog_product_id IS NOT NULL THEN
    IF NEW.catalog_departure_id IS NULL THEN RAISE EXCEPTION 'RUMBO_CATALOG_DEPARTURE_REQUIRED' USING ERRCODE='check_violation'; END IF;
    SELECT d.* INTO departure FROM rumbo_catalog_departures d
    WHERE d.id=NEW.catalog_departure_id AND d.product_id=NEW.catalog_product_id AND d.status='active'
      AND (d.sale_deadline IS NULL OR d.sale_deadline>=now()) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RUMBO_CATALOG_DEPARTURE_UNAVAILABLE' USING ERRCODE='check_violation'; END IF;
    IF requested_units < departure.min_passengers_per_booking OR requested_units > departure.max_passengers_per_booking THEN RAISE EXCEPTION 'RUMBO_PASSENGER_LIMIT' USING ERRCODE='check_violation'; END IF;
    IF departure.available_capacity IS NOT NULL AND departure.available_capacity < requested_units THEN RAISE EXCEPTION 'RUMBO_INSUFFICIENT_CAPACITY' USING ERRCODE='check_violation'; END IF;
    NEW.unit_price_amount := departure.price_amount;
    NEW.total_amount := departure.price_amount * requested_units;
    NEW.price_display := departure.currency || ' ' || to_char(departure.price_amount,'FM999999990.00');
    NEW.currency := departure.currency;
    NEW.origin_iata := COALESCE(departure.origin_iata,NEW.origin_iata);
    RETURN NEW;
  END IF;

  IF NEW.inventory_id IS NULL THEN RAISE EXCEPTION 'RUMBO_INVENTORY_REQUIRED' USING ERRCODE='check_violation'; END IF;
  SELECT i.total_capacity,i.price_amount,i.price_display,i.currency INTO inventory_capacity,inventory_price,inventory_price_display,inventory_currency
  FROM rumbo_offer_inventory i WHERE i.id=NEW.inventory_id AND i.active=true AND (i.valid_until IS NULL OR i.valid_until>now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RUMBO_OFFER_UNAVAILABLE' USING ERRCODE='check_violation'; END IF;
  SELECT COALESCE(sum(h.units),0)::integer INTO committed_units FROM rumbo_booking_holds h WHERE h.inventory_id=NEW.inventory_id AND (h.status='converted' OR (h.status='active' AND h.expires_at>now()));
  IF inventory_capacity-committed_units<requested_units THEN RAISE EXCEPTION 'RUMBO_INSUFFICIENT_CAPACITY' USING ERRCODE='check_violation'; END IF;
  NEW.unit_price_amount:=inventory_price; NEW.total_amount:=inventory_price*requested_units; NEW.price_display:=inventory_price_display; NEW.currency:=inventory_currency;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_create_hold_and_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.catalog_product_id IS NOT NULL THEN
    INSERT INTO rumbo_booking_payments(booking_request_id,provider,status,amount,currency)
    VALUES(NEW.id,'unconfigured','pending',NEW.total_amount,NEW.currency)
    ON CONFLICT(booking_request_id) DO NOTHING;
    RETURN NEW;
  END IF;
  INSERT INTO rumbo_booking_holds(booking_request_id,inventory_id,units,status,expires_at)
  VALUES(NEW.id,NEW.inventory_id,NEW.adults+NEW.children,'active',NEW.hold_expires_at)
  ON CONFLICT(booking_request_id) DO NOTHING;
  INSERT INTO rumbo_booking_payments(booking_request_id,status,amount,currency)
  VALUES(NEW.id,'pending',NEW.total_amount,NEW.currency)
  ON CONFLICT(booking_request_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_validate_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment_ok boolean; hold_ok boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status='confirmed' THEN
    SELECT EXISTS(SELECT 1 FROM rumbo_booking_payments p WHERE p.booking_request_id=OLD.id AND p.status='paid') INTO payment_ok;
    IF NOT payment_ok THEN RAISE EXCEPTION 'RUMBO_PAYMENT_REQUIRED_FOR_CONFIRMATION' USING ERRCODE='check_violation'; END IF;
    IF OLD.catalog_product_id IS NOT NULL THEN hold_ok:=OLD.hold_expires_at IS NOT NULL AND OLD.hold_expires_at>now();
    ELSE SELECT EXISTS(SELECT 1 FROM rumbo_booking_holds h WHERE h.booking_request_id=OLD.id AND h.status='active' AND h.expires_at>now()) INTO hold_ok; END IF;
    IF NOT hold_ok THEN RAISE EXCEPTION 'RUMBO_ACTIVE_HOLD_REQUIRED_FOR_CONFIRMATION' USING ERRCODE='check_violation'; END IF;
  END IF;
  IF NOT ((OLD.status='new' AND NEW.status IN('validating','payment_pending','cancelled')) OR (OLD.status='validating' AND NEW.status IN('quoted','payment_pending','cancelled')) OR (OLD.status='quoted' AND NEW.status IN('payment_pending','confirmed','cancelled','expired')) OR (OLD.status='payment_pending' AND NEW.status IN('payment_failed','confirmed','cancelled','expired')) OR (OLD.status='payment_failed' AND NEW.status IN('payment_pending','confirmed','cancelled','expired')) OR (OLD.status='confirmed' AND NEW.status='cancelled')) THEN RAISE EXCEPTION 'Invalid Rumbo booking status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_payment_sync_booking()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE booking rumbo_booking_requests%ROWTYPE; can_complete boolean;
BEGIN
  SELECT * INTO booking FROM rumbo_booking_requests WHERE id=NEW.booking_request_id FOR UPDATE;
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF booking.catalog_product_id IS NOT NULL THEN can_complete:=booking.status IN('payment_pending','payment_failed','quoted') AND booking.hold_expires_at IS NOT NULL AND booking.hold_expires_at>now() AND booking.total_amount=NEW.amount AND booking.currency=NEW.currency;
    ELSE SELECT EXISTS(SELECT 1 FROM rumbo_booking_holds h WHERE h.booking_request_id=NEW.booking_request_id AND h.status='active' AND h.expires_at>now() AND booking.status IN('payment_pending','payment_failed','quoted') AND booking.total_amount=NEW.amount AND booking.currency=NEW.currency) INTO can_complete; END IF;
    IF NOT can_complete THEN RAISE EXCEPTION 'RUMBO_PAYMENT_CANNOT_COMPLETE' USING ERRCODE='check_violation'; END IF;
  END IF;
  IF NEW.status='authorized' AND NEW.authorized_at IS NULL THEN NEW.authorized_at:=now(); ELSIF NEW.status='paid' AND NEW.paid_at IS NULL THEN NEW.paid_at:=now(); ELSIF NEW.status='failed' AND NEW.failed_at IS NULL THEN NEW.failed_at:=now(); ELSIF NEW.status='refunded' AND NEW.refunded_at IS NULL THEN NEW.refunded_at:=now(); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rumbo_booking_release_native_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE units integer;
BEGIN
  IF OLD.catalog_departure_id IS NULL OR NEW.status NOT IN('cancelled','expired') OR OLD.status IN('cancelled','expired') THEN RETURN NEW; END IF;
  units:=OLD.adults+OLD.children;
  UPDATE rumbo_catalog_departures SET available_capacity=CASE WHEN available_capacity IS NULL THEN NULL WHEN capacity IS NULL THEN available_capacity+units ELSE LEAST(capacity,available_capacity+units) END WHERE id=OLD.catalog_departure_id;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rumbo_booking_native_capacity_release_trigger') THEN
    CREATE TRIGGER rumbo_booking_native_capacity_release_trigger AFTER UPDATE OF status ON rumbo_booking_requests FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION rumbo_booking_release_native_capacity();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rumbo_expire_stale_native_bookings()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE expired_count integer;
BEGIN
  WITH expired AS (UPDATE rumbo_booking_requests SET status='expired' WHERE catalog_product_id IS NOT NULL AND status IN('payment_pending','payment_failed') AND hold_expires_at IS NOT NULL AND hold_expires_at<=now() RETURNING id)
  SELECT count(*)::integer INTO expired_count FROM expired;
  RETURN expired_count;
END;
$$;
