-- Add a second, destination-correct image to the native Miami sample packages.
-- The public storefront already contains carousel controls; these rows make the
-- feature visible immediately while administrators can continue adding images.

WITH carousel_images(id,product_id,url,alt_text,sort_order) AS (
  VALUES
    ('64000000-0000-4000-8000-000000000001'::uuid,'61000000-0000-4000-8000-000000000001'::uuid,'https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/b4ot2lbnmmzwkgyhyx037xnls14o','Miami City Break, vista adicional',1),
    ('64000000-0000-4000-8000-000000000002'::uuid,'61000000-0000-4000-8000-000000000002'::uuid,'https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/b4ot2lbnmmzwkgyhyx037xnls14o','Miami Shopping Week, vista adicional',1),
    ('64000000-0000-4000-8000-000000000003'::uuid,'61000000-0000-4000-8000-000000000003'::uuid,'https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/b4ot2lbnmmzwkgyhyx037xnls14o','Miami Beach Relax, vista adicional',1),
    ('64000000-0000-4000-8000-000000000004'::uuid,'61000000-0000-4000-8000-000000000004'::uuid,'https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/3catei9qospldeo73zau9czjkqsg','Miami Premium, vista adicional',1)
)
INSERT INTO rumbo_catalog_images(id,product_id,url,alt_text,sort_order,is_primary,metadata)
SELECT image.id,image.product_id,image.url,image.alt_text,image.sort_order,false,
       '{"test_seed":true,"carousel_demo":true,"shared_r2_asset":true}'::jsonb
  FROM carousel_images image
  JOIN rumbo_catalog_products product ON product.id=image.product_id
ON CONFLICT(id) DO UPDATE SET
  product_id=EXCLUDED.product_id,
  url=EXCLUDED.url,
  alt_text=EXCLUDED.alt_text,
  sort_order=EXCLUDED.sort_order,
  is_primary=false,
  metadata=EXCLUDED.metadata;
