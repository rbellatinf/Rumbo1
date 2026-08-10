ALTER TABLE rumbo_catalog_departures
  ADD COLUMN IF NOT EXISTS origin_iata char(3),
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_origin_iata_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_origin_iata_check
  CHECK (origin_iata IS NULL OR origin_iata ~ '^[A-Z]{3}$');

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_low_stock_threshold_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_low_stock_threshold_check
  CHECK (low_stock_threshold >= 0);

CREATE INDEX IF NOT EXISTS rumbo_catalog_departures_origin_destination_idx
  ON rumbo_catalog_departures(origin_iata, departure_date, status);

CREATE OR REPLACE VIEW rumbo_catalog_product_search AS
SELECT
  p.id,
  p.slug,
  p.name,
  p.country,
  p.city,
  p.destination_iata,
  p.duration_label,
  p.tag,
  p.included,
  p.status,
  p.featured,
  MIN(d.price_amount) FILTER (WHERE d.status='active') AS from_price_amount,
  MIN(d.currency) FILTER (WHERE d.status='active') AS from_price_currency,
  COUNT(d.id) FILTER (WHERE d.status='active') AS active_departure_count,
  MIN(d.departure_date) FILTER (WHERE d.status='active') AS next_departure_date
FROM rumbo_catalog_products p
LEFT JOIN rumbo_catalog_departures d ON d.product_id=p.id
GROUP BY p.id;
