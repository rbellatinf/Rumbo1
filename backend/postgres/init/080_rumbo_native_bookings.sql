ALTER TABLE rumbo_booking_requests
  ADD COLUMN IF NOT EXISTS catalog_product_id uuid REFERENCES rumbo_catalog_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_departure_id uuid REFERENCES rumbo_catalog_departures(id) ON DELETE SET NULL;

ALTER TABLE rumbo_booking_requests
  ALTER COLUMN spree_product_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_catalog_product_idx
  ON rumbo_booking_requests (catalog_product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_catalog_departure_idx
  ON rumbo_booking_requests (catalog_departure_id, created_at DESC)
  WHERE catalog_departure_id IS NOT NULL;

COMMENT ON COLUMN rumbo_booking_requests.spree_product_id IS
  'Legacy optional Spree product identifier. Native Rumbo bookings use catalog_product_id.';
