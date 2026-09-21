-- Rumbo catalog contract v2 aligned to the agency workbook.
-- Additive only: this migration does not insert, update or delete catalog products.

ALTER TABLE rumbo_catalog_products
  ADD COLUMN IF NOT EXISTS policy_cancellation text,
  ADD COLUMN IF NOT EXISTS policy_changes text,
  ADD COLUMN IF NOT EXISTS policy_refund text,
  ADD COLUMN IF NOT EXISTS policy_no_show text,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_product_url text,
  ADD COLUMN IF NOT EXISTS observations text;

ALTER TABLE rumbo_catalog_departures
  ADD COLUMN IF NOT EXISTS provider_variant_reference varchar(180),
  ADD COLUMN IF NOT EXISTS taxes_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS suggested_price_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS sale_timezone varchar(80),
  ADD COLUMN IF NOT EXISTS availability_via_api boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_rate_reference varchar(180),
  ADD COLUMN IF NOT EXISTS api_inventory_reference varchar(180),
  ADD COLUMN IF NOT EXISTS policy_cancellation text,
  ADD COLUMN IF NOT EXISTS policy_changes text,
  ADD COLUMN IF NOT EXISTS policy_refund text,
  ADD COLUMN IF NOT EXISTS policy_no_show text,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS observations text;

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_taxes_amount_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_taxes_amount_check
  CHECK (taxes_amount IS NULL OR taxes_amount >= 0);

ALTER TABLE rumbo_catalog_departures
  DROP CONSTRAINT IF EXISTS rumbo_catalog_departures_suggested_price_amount_check;
ALTER TABLE rumbo_catalog_departures
  ADD CONSTRAINT rumbo_catalog_departures_suggested_price_amount_check
  CHECK (suggested_price_amount IS NULL OR suggested_price_amount >= 0);

CREATE INDEX IF NOT EXISTS rumbo_catalog_departures_provider_variant_idx
  ON rumbo_catalog_departures(provider_variant_reference)
  WHERE provider_variant_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS rumbo_catalog_departures_api_inventory_idx
  ON rumbo_catalog_departures(api_inventory_reference)
  WHERE api_inventory_reference IS NOT NULL;

ALTER TABLE rumbo_catalog_images
  ADD COLUMN IF NOT EXISTS title varchar(240),
  ADD COLUMN IF NOT EXISTS author_credit varchar(240),
  ADD COLUMN IF NOT EXISTS usage_license varchar(240),
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS observations text;

ALTER TABLE rumbo_catalog_source_links
  ADD COLUMN IF NOT EXISTS endpoint_reference text,
  ADD COLUMN IF NOT EXISTS technical_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS observations text;

ALTER TABLE rumbo_catalog_product_tags
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observations text;

CREATE INDEX IF NOT EXISTS rumbo_catalog_product_tags_sort_idx
  ON rumbo_catalog_product_tags(product_id,sort_order,tag_id);

CREATE TABLE IF NOT EXISTS rumbo_catalog_package_details (
  product_id uuid PRIMARY KEY REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  origin_iata char(3),
  flight_included boolean,
  airline varchar(120),
  hotel_included boolean,
  hotel_name varchar(200),
  hotel_category varchar(40),
  room_type varchar(120),
  meal_plan varchar(120),
  transfers_included boolean,
  excursions_included text,
  insurance_included boolean,
  detailed_itinerary text,
  documentation_requirements text,
  operational_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origin_iata IS NULL OR origin_iata ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS rumbo_catalog_hotel_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  provider_hotel_id varchar(180),
  hotel_name varchar(200),
  star_category numeric(3,1),
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  check_in_time time,
  check_out_time time,
  provider_room_id varchar(180),
  room_type varchar(160),
  max_occupancy integer,
  provider_rate_plan_id varchar(180),
  meal_plan varchar(160),
  amenities text,
  children_policy text,
  pets_policy text,
  observations text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (star_category IS NULL OR (star_category >= 0 AND star_category <= 5)),
  CHECK (max_occupancy IS NULL OR max_occupancy >= 1)
);

CREATE INDEX IF NOT EXISTS rumbo_catalog_hotel_details_product_idx
  ON rumbo_catalog_hotel_details(product_id);

CREATE TABLE IF NOT EXISTS rumbo_catalog_flight_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  departure_id uuid REFERENCES rumbo_catalog_departures(id) ON DELETE CASCADE,
  provider_variant_reference varchar(180),
  airline_iata char(2),
  flight_number varchar(20),
  origin_iata char(3),
  destination_iata char(3),
  departure_local timestamp,
  arrival_local timestamp,
  origin_timezone varchar(80),
  destination_timezone varchar(80),
  cabin varchar(80),
  fare_family varchar(120),
  booking_class varchar(12),
  stops integer,
  checked_baggage varchar(120),
  cabin_baggage varchar(120),
  seat_included boolean,
  refundable boolean,
  changes_allowed boolean,
  provider_offer_reference varchar(240),
  observations text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (airline_iata IS NULL OR airline_iata ~ '^[A-Z0-9]{2}$'),
  CHECK (origin_iata IS NULL OR origin_iata ~ '^[A-Z]{3}$'),
  CHECK (destination_iata IS NULL OR destination_iata ~ '^[A-Z]{3}$'),
  CHECK (stops IS NULL OR stops >= 0)
);

CREATE INDEX IF NOT EXISTS rumbo_catalog_flight_details_product_idx
  ON rumbo_catalog_flight_details(product_id);

CREATE INDEX IF NOT EXISTS rumbo_catalog_flight_details_departure_idx
  ON rumbo_catalog_flight_details(departure_id)
  WHERE departure_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rumbo_catalog_experience_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  provider_activity_id varchar(180),
  meeting_point text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  duration varchar(100),
  start_time time,
  languages text,
  minimum_age integer,
  maximum_age integer,
  accessibility text,
  what_to_bring text,
  restrictions text,
  instant_confirmation boolean,
  voucher_type varchar(80),
  observations text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (minimum_age IS NULL OR minimum_age >= 0),
  CHECK (maximum_age IS NULL OR maximum_age >= 0),
  CHECK (minimum_age IS NULL OR maximum_age IS NULL OR maximum_age >= minimum_age)
);

CREATE INDEX IF NOT EXISTS rumbo_catalog_experience_details_product_idx
  ON rumbo_catalog_experience_details(product_id);

ALTER TABLE rumbo_booking_requests
  ADD COLUMN IF NOT EXISTS policies_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS traveller_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS rumbo_booking_travellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id uuid NOT NULL REFERENCES rumbo_booking_requests(id) ON DELETE CASCADE,
  position integer NOT NULL,
  passenger_type varchar(20) NOT NULL CHECK (passenger_type IN ('adult','child')),
  first_name varchar(120) NOT NULL,
  last_name varchar(120) NOT NULL,
  document_type varchar(30),
  document_number varchar(80),
  nationality_code char(2),
  date_of_birth date,
  lead_passenger boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_request_id,position),
  CHECK (position >= 1),
  CHECK (nationality_code IS NULL OR nationality_code ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS rumbo_booking_travellers_booking_idx
  ON rumbo_booking_travellers(booking_request_id,position);

COMMENT ON COLUMN rumbo_catalog_departures.price_amount IS
  'Final Rumbo selling price per passenger. Provider net cost, taxes and suggested price are stored separately.';

COMMENT ON COLUMN rumbo_catalog_departures.suggested_price_amount IS
  'Provider suggested selling price from the agency workbook; it does not override Rumbo final price_amount.';

COMMENT ON TABLE rumbo_booking_travellers IS
  'Passenger identity captured before checkout so the paid booking is operationally fulfilable.';
