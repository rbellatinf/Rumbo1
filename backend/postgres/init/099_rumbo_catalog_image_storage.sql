-- Mantiene la URL pública y, además, la identidad física del objeto.
-- Esto permite reemplazar/eliminar imágenes en Cloudflare R2 sin depender de parsear URLs.
ALTER TABLE rumbo_catalog_images
  ADD COLUMN IF NOT EXISTS storage_provider varchar(30),
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS bucket_name varchar(120),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE rumbo_catalog_images
  DROP CONSTRAINT IF EXISTS rumbo_catalog_images_storage_provider_check;
ALTER TABLE rumbo_catalog_images
  ADD CONSTRAINT rumbo_catalog_images_storage_provider_check
  CHECK (storage_provider IS NULL OR storage_provider IN ('cloudflare-r2','external','legacy-spree'));

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_catalog_images_storage_object_uidx
  ON rumbo_catalog_images(storage_provider, bucket_name, storage_key)
  WHERE storage_provider IS NOT NULL AND bucket_name IS NOT NULL AND storage_key IS NOT NULL;
