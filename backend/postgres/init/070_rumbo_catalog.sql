CREATE TABLE IF NOT EXISTS rumbo_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(180) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  short_description varchar(320),
  description text,
  country varchar(100),
  city varchar(120),
  destination_iata char(3),
  product_type varchar(30) NOT NULL DEFAULT 'package'
    CHECK (product_type IN ('package','hotel','flight','experience','other')),
  provider varchar(80) NOT NULL DEFAULT 'Rumbo',
  provider_reference varchar(120),
  duration_label varchar(100),
  tag varchar(80),
  included jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rumbo_catalog_departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  departure_date date,
  return_date date,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  price_amount numeric(12,2) NOT NULL CHECK (price_amount >= 0),
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  available_capacity integer CHECK (available_capacity IS NULL OR available_capacity >= 0),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','sold_out','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (return_date IS NULL OR departure_date IS NULL OR return_date > departure_date),
  CHECK (available_capacity IS NULL OR capacity IS NULL OR available_capacity <= capacity)
);

CREATE TABLE IF NOT EXISTS rumbo_catalog_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text varchar(240),
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_catalog_products_status_idx ON rumbo_catalog_products(status, featured DESC, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS rumbo_catalog_products_destination_idx ON rumbo_catalog_products(destination_iata, status);
CREATE INDEX IF NOT EXISTS rumbo_catalog_departures_product_idx ON rumbo_catalog_departures(product_id, departure_date, status);
CREATE INDEX IF NOT EXISTS rumbo_catalog_images_product_idx ON rumbo_catalog_images(product_id, is_primary DESC, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS rumbo_catalog_one_primary_image_idx ON rumbo_catalog_images(product_id) WHERE is_primary;

CREATE OR REPLACE FUNCTION rumbo_catalog_touch_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rumbo_catalog_products_touch ON rumbo_catalog_products;
CREATE TRIGGER rumbo_catalog_products_touch BEFORE UPDATE ON rumbo_catalog_products
FOR EACH ROW EXECUTE FUNCTION rumbo_catalog_touch_update();

DROP TRIGGER IF EXISTS rumbo_catalog_departures_touch ON rumbo_catalog_departures;
CREATE TRIGGER rumbo_catalog_departures_touch BEFORE UPDATE ON rumbo_catalog_departures
FOR EACH ROW EXECUTE FUNCTION rumbo_catalog_touch_update();
