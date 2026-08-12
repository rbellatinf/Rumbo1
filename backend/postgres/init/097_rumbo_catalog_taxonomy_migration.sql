-- Catálogo nativo de Rumbo: geografía estructurada, tags flexibles y trazabilidad legacy.
-- Región/subregión son dimensiones; tags quedan para atributos comerciales no jerárquicos.

ALTER TABLE rumbo_catalog_products
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS rumbo_catalog_regions (
  code varchar(40) PRIMARY KEY,
  name varchar(100) NOT NULL,
  parent_code varchar(40) REFERENCES rumbo_catalog_regions(code) ON DELETE RESTRICT,
  region_level varchar(20) NOT NULL CHECK (region_level IN ('region','subregion')),
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO rumbo_catalog_regions(code,name,parent_code,region_level,sort_order) VALUES
 ('AMERICAS','Américas',NULL,'region',10),
 ('EUROPE','Europa',NULL,'region',20),
 ('ASIA','Asia',NULL,'region',30),
 ('AFRICA','África',NULL,'region',40),
 ('OCEANIA','Oceanía',NULL,'region',50)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,parent_code=EXCLUDED.parent_code,region_level=EXCLUDED.region_level,sort_order=EXCLUDED.sort_order;

INSERT INTO rumbo_catalog_regions(code,name,parent_code,region_level,sort_order) VALUES
 ('NORTH_AMERICA','Norteamérica','AMERICAS','subregion',11),
 ('CENTRAL_AMERICA','Centroamérica','AMERICAS','subregion',12),
 ('CARIBBEAN','Caribe','AMERICAS','subregion',13),
 ('SOUTH_AMERICA','Sudamérica','AMERICAS','subregion',14),
 ('NORTHERN_EUROPE','Europa del Norte','EUROPE','subregion',21),
 ('WESTERN_EUROPE','Europa Occidental','EUROPE','subregion',22),
 ('SOUTHERN_EUROPE','Europa del Sur','EUROPE','subregion',23),
 ('EASTERN_EUROPE','Europa Oriental','EUROPE','subregion',24),
 ('EAST_ASIA','Asia Oriental','ASIA','subregion',31),
 ('SOUTH_EAST_ASIA','Sudeste Asiático','ASIA','subregion',32),
 ('SOUTH_ASIA','Asia del Sur','ASIA','subregion',33),
 ('CENTRAL_ASIA','Asia Central','ASIA','subregion',34),
 ('WEST_ASIA','Asia Occidental','ASIA','subregion',35),
 ('NORTH_AFRICA','África del Norte','AFRICA','subregion',41),
 ('WEST_AFRICA','África Occidental','AFRICA','subregion',42),
 ('EAST_AFRICA','África Oriental','AFRICA','subregion',43),
 ('CENTRAL_AFRICA','África Central','AFRICA','subregion',44),
 ('SOUTHERN_AFRICA','África Austral','AFRICA','subregion',45),
 ('AUSTRALIA_NZ','Australia y Nueva Zelanda','OCEANIA','subregion',51),
 ('MELANESIA','Melanesia','OCEANIA','subregion',52),
 ('MICRONESIA','Micronesia','OCEANIA','subregion',53),
 ('POLYNESIA','Polinesia','OCEANIA','subregion',54)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,parent_code=EXCLUDED.parent_code,region_level=EXCLUDED.region_level,sort_order=EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS rumbo_catalog_countries (
  country_code char(2) PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
  name varchar(120) NOT NULL,
  region_code varchar(40) NOT NULL REFERENCES rumbo_catalog_regions(code),
  subregion_code varchar(40) REFERENCES rumbo_catalog_regions(code),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO rumbo_catalog_countries(country_code,name,region_code,subregion_code) VALUES
 ('US','Estados Unidos','AMERICAS','NORTH_AMERICA'),('CA','Canadá','AMERICAS','NORTH_AMERICA'),('MX','México','AMERICAS','NORTH_AMERICA'),
 ('PA','Panamá','AMERICAS','CENTRAL_AMERICA'),('CR','Costa Rica','AMERICAS','CENTRAL_AMERICA'),('GT','Guatemala','AMERICAS','CENTRAL_AMERICA'),('SV','El Salvador','AMERICAS','CENTRAL_AMERICA'),('HN','Honduras','AMERICAS','CENTRAL_AMERICA'),('NI','Nicaragua','AMERICAS','CENTRAL_AMERICA'),('BZ','Belice','AMERICAS','CENTRAL_AMERICA'),
 ('DO','República Dominicana','AMERICAS','CARIBBEAN'),('CU','Cuba','AMERICAS','CARIBBEAN'),('JM','Jamaica','AMERICAS','CARIBBEAN'),('BS','Bahamas','AMERICAS','CARIBBEAN'),('PR','Puerto Rico','AMERICAS','CARIBBEAN'),
 ('PE','Perú','AMERICAS','SOUTH_AMERICA'),('CO','Colombia','AMERICAS','SOUTH_AMERICA'),('BR','Brasil','AMERICAS','SOUTH_AMERICA'),('AR','Argentina','AMERICAS','SOUTH_AMERICA'),('CL','Chile','AMERICAS','SOUTH_AMERICA'),('EC','Ecuador','AMERICAS','SOUTH_AMERICA'),('BO','Bolivia','AMERICAS','SOUTH_AMERICA'),('UY','Uruguay','AMERICAS','SOUTH_AMERICA'),('PY','Paraguay','AMERICAS','SOUTH_AMERICA'),('VE','Venezuela','AMERICAS','SOUTH_AMERICA'),
 ('ES','España','EUROPE','SOUTHERN_EUROPE'),('PT','Portugal','EUROPE','SOUTHERN_EUROPE'),('IT','Italia','EUROPE','SOUTHERN_EUROPE'),('GR','Grecia','EUROPE','SOUTHERN_EUROPE'),('HR','Croacia','EUROPE','SOUTHERN_EUROPE'),('RS','Serbia','EUROPE','SOUTHERN_EUROPE'),('BA','Bosnia y Herzegovina','EUROPE','SOUTHERN_EUROPE'),('ME','Montenegro','EUROPE','SOUTHERN_EUROPE'),('AL','Albania','EUROPE','SOUTHERN_EUROPE'),('MK','Macedonia del Norte','EUROPE','SOUTHERN_EUROPE'),
 ('FR','Francia','EUROPE','WESTERN_EUROPE'),('DE','Alemania','EUROPE','WESTERN_EUROPE'),('NL','Países Bajos','EUROPE','WESTERN_EUROPE'),('BE','Bélgica','EUROPE','WESTERN_EUROPE'),('CH','Suiza','EUROPE','WESTERN_EUROPE'),('AT','Austria','EUROPE','WESTERN_EUROPE'),
 ('GB','Reino Unido','EUROPE','NORTHERN_EUROPE'),('IE','Irlanda','EUROPE','NORTHERN_EUROPE'),('IS','Islandia','EUROPE','NORTHERN_EUROPE'),('NO','Noruega','EUROPE','NORTHERN_EUROPE'),('SE','Suecia','EUROPE','NORTHERN_EUROPE'),('DK','Dinamarca','EUROPE','NORTHERN_EUROPE'),('FI','Finlandia','EUROPE','NORTHERN_EUROPE'),
 ('PL','Polonia','EUROPE','EASTERN_EUROPE'),('CZ','Chequia','EUROPE','EASTERN_EUROPE'),('HU','Hungría','EUROPE','EASTERN_EUROPE'),('RO','Rumanía','EUROPE','EASTERN_EUROPE'),('BG','Bulgaria','EUROPE','EASTERN_EUROPE'),('UA','Ucrania','EUROPE','EASTERN_EUROPE'),
 ('CN','China','ASIA','EAST_ASIA'),('JP','Japón','ASIA','EAST_ASIA'),('KR','Corea del Sur','ASIA','EAST_ASIA'),
 ('TH','Tailandia','ASIA','SOUTH_EAST_ASIA'),('VN','Vietnam','ASIA','SOUTH_EAST_ASIA'),('SG','Singapur','ASIA','SOUTH_EAST_ASIA'),('MY','Malasia','ASIA','SOUTH_EAST_ASIA'),('ID','Indonesia','ASIA','SOUTH_EAST_ASIA'),('PH','Filipinas','ASIA','SOUTH_EAST_ASIA'),
 ('IN','India','ASIA','SOUTH_ASIA'),('LK','Sri Lanka','ASIA','SOUTH_ASIA'),('MV','Maldivas','ASIA','SOUTH_ASIA'),('NP','Nepal','ASIA','SOUTH_ASIA'),
 ('AE','Emiratos Árabes Unidos','ASIA','WEST_ASIA'),('QA','Qatar','ASIA','WEST_ASIA'),('SA','Arabia Saudita','ASIA','WEST_ASIA'),('IL','Israel','ASIA','WEST_ASIA'),('JO','Jordania','ASIA','WEST_ASIA'),('OM','Omán','ASIA','WEST_ASIA'),('BH','Baréin','ASIA','WEST_ASIA'),('KW','Kuwait','ASIA','WEST_ASIA'),('TR','Turquía','ASIA','WEST_ASIA'),
 ('EG','Egipto','AFRICA','NORTH_AFRICA'),('MA','Marruecos','AFRICA','NORTH_AFRICA'),('TN','Túnez','AFRICA','NORTH_AFRICA'),('ZA','Sudáfrica','AFRICA','SOUTHERN_AFRICA'),('KE','Kenia','AFRICA','EAST_AFRICA'),('TZ','Tanzania','AFRICA','EAST_AFRICA'),('MU','Mauricio','AFRICA','EAST_AFRICA'),('SC','Seychelles','AFRICA','EAST_AFRICA'),
 ('AU','Australia','OCEANIA','AUSTRALIA_NZ'),('NZ','Nueva Zelanda','OCEANIA','AUSTRALIA_NZ'),('FJ','Fiyi','OCEANIA','MELANESIA')
ON CONFLICT (country_code) DO UPDATE SET name=EXCLUDED.name,region_code=EXCLUDED.region_code,subregion_code=EXCLUDED.subregion_code,active=true;

ALTER TABLE rumbo_catalog_products DROP CONSTRAINT IF EXISTS rumbo_catalog_products_country_code_fkey;
ALTER TABLE rumbo_catalog_products ADD CONSTRAINT rumbo_catalog_products_country_code_fkey
  FOREIGN KEY (country_code) REFERENCES rumbo_catalog_countries(country_code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rumbo_catalog_products_country_code_idx ON rumbo_catalog_products(country_code,status);

CREATE TABLE IF NOT EXISTS rumbo_catalog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  tag_type varchar(30) NOT NULL DEFAULT 'commercial' CHECK (tag_type IN ('commercial','theme','audience','amenity','legacy')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS rumbo_catalog_product_tags (
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES rumbo_catalog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY(product_id,tag_id)
);

CREATE TABLE IF NOT EXISTS rumbo_catalog_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(30) NOT NULL,
  source_entity varchar(30) NOT NULL DEFAULT 'product',
  source_id varchar(120) NOT NULL,
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system,source_entity,source_id)
);
CREATE INDEX IF NOT EXISTS rumbo_catalog_source_links_product_idx ON rumbo_catalog_source_links(product_id);

CREATE TABLE IF NOT EXISTS rumbo_catalog_departure_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(30) NOT NULL,
  source_id varchar(160) NOT NULL,
  product_id uuid NOT NULL REFERENCES rumbo_catalog_products(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES rumbo_catalog_departures(id) ON DELETE CASCADE,
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system,source_id),
  UNIQUE(departure_id)
);
CREATE INDEX IF NOT EXISTS rumbo_catalog_departure_source_product_idx ON rumbo_catalog_departure_source_links(product_id);

CREATE TABLE IF NOT EXISTS rumbo_catalog_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(30) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  source_products integer NOT NULL DEFAULT 0,
  migrated_products integer NOT NULL DEFAULT 0,
  migrated_departures integer NOT NULL DEFAULT 0,
  products_with_price integer NOT NULL DEFAULT 0,
  products_with_metadata integer NOT NULL DEFAULT 0,
  target_validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'running' CHECK(status IN ('running','complete','warning','failed'))
);

CREATE OR REPLACE VIEW rumbo_catalog_product_geography AS
SELECT p.id AS product_id,p.country_code,c.name AS country_name,
       c.region_code,r.name AS region_name,c.subregion_code,s.name AS subregion_name
FROM rumbo_catalog_products p
LEFT JOIN rumbo_catalog_countries c ON c.country_code=p.country_code
LEFT JOIN rumbo_catalog_regions r ON r.code=c.region_code
LEFT JOIN rumbo_catalog_regions s ON s.code=c.subregion_code;
