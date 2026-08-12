-- Autoclasificación geográfica para no depender de tags ni texto manual de región.
CREATE OR REPLACE FUNCTION rumbo_geo_normalize(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    translate(lower(COALESCE(value,'')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+','','g');
$$;

CREATE OR REPLACE FUNCTION rumbo_catalog_assign_country_code()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolved char(2);
BEGIN
  IF NEW.country_code IS NULL AND NEW.country IS NOT NULL THEN
    SELECT c.country_code INTO resolved
    FROM rumbo_catalog_countries c
    WHERE rumbo_geo_normalize(c.name)=rumbo_geo_normalize(NEW.country)
    LIMIT 1;
    NEW.country_code := resolved;
  END IF;

  IF NEW.country_code IS NULL AND rumbo_geo_normalize(NEW.name) LIKE '%panama%' THEN
    NEW.country_code := 'PA';
    NEW.country := COALESCE(NULLIF(NEW.country,''),'Panamá');
    NEW.city := COALESCE(NULLIF(NEW.city,''),'Ciudad de Panamá');
    NEW.destination_iata := COALESCE(NEW.destination_iata,'PTY');
  ELSIF NEW.country_code IS NULL AND rumbo_geo_normalize(NEW.name) LIKE '%miami%' THEN
    NEW.country_code := 'US';
    NEW.country := COALESCE(NULLIF(NEW.country,''),'Estados Unidos');
    NEW.city := COALESCE(NULLIF(NEW.city,''),'Miami');
    NEW.destination_iata := COALESCE(NEW.destination_iata,'MIA');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rumbo_catalog_products_geo_autofill ON rumbo_catalog_products;
CREATE TRIGGER rumbo_catalog_products_geo_autofill
BEFORE INSERT OR UPDATE OF country,country_code,name,city,destination_iata ON rumbo_catalog_products
FOR EACH ROW EXECUTE FUNCTION rumbo_catalog_assign_country_code();

UPDATE rumbo_catalog_products p
SET country_code=c.country_code
FROM rumbo_catalog_countries c
WHERE p.country_code IS NULL
  AND rumbo_geo_normalize(p.country)=rumbo_geo_normalize(c.name);

UPDATE rumbo_catalog_products
SET country_code='PA',country=COALESCE(NULLIF(country,''),'Panamá'),city=COALESCE(NULLIF(city,''),'Ciudad de Panamá'),destination_iata=COALESCE(destination_iata,'PTY')
WHERE country_code IS NULL AND rumbo_geo_normalize(name) LIKE '%panama%';

UPDATE rumbo_catalog_products
SET country_code='US',country=COALESCE(NULLIF(country,''),'Estados Unidos'),city=COALESCE(NULLIF(city,''),'Miami'),destination_iata=COALESCE(destination_iata,'MIA')
WHERE country_code IS NULL AND rumbo_geo_normalize(name) LIKE '%miami%';
