ALTER TABLE rumbo_catalog_departures
  ADD COLUMN IF NOT EXISTS sale_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS min_passengers_per_booking integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_passengers_per_booking integer NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS confirmation_mode varchar(30) NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS minimum_group_size integer;

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_booking_passengers_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_booking_passengers_check
  CHECK (
    min_passengers_per_booking >= 1 AND
    max_passengers_per_booking >= min_passengers_per_booking AND
    max_passengers_per_booking <= 18
  );

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_cost_amount_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_cost_amount_check
  CHECK (cost_amount IS NULL OR cost_amount >= 0);

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_confirmation_mode_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_confirmation_mode_check
  CHECK (confirmation_mode IN ('confirmed','minimum_required'));

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_minimum_group_size_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_minimum_group_size_check
  CHECK (minimum_group_size IS NULL OR minimum_group_size >= 1);

CREATE INDEX IF NOT EXISTS rumbo_catalog_departures_sale_deadline_idx
  ON rumbo_catalog_departures(sale_deadline, status);

CREATE OR REPLACE VIEW rumbo_catalog_departure_commercial AS
SELECT
  d.*,
  (d.price_amount - COALESCE(d.cost_amount, d.price_amount))::numeric(12,2) AS margin_amount,
  CASE
    WHEN d.price_amount > 0 AND d.cost_amount IS NOT NULL
      THEN ROUND(((d.price_amount - d.cost_amount) / d.price_amount) * 100, 2)
    ELSE NULL
  END AS margin_pct,
  CASE
    WHEN d.sale_deadline IS NOT NULL AND d.sale_deadline < now() THEN false
    ELSE true
  END AS sale_open,
  CASE
    WHEN d.confirmation_mode='confirmed' THEN 'Salida confirmada'
    ELSE 'Sujeta a mínimo de pasajeros'
  END AS confirmation_label
FROM rumbo_catalog_departures d;
