-- Datos controlados de prueba para validar el storefront de resultados.
-- Son productos nativos del catálogo oficial (no mocks del frontend) y quedan
-- marcados en metadata para poder retirarlos fácilmente antes del lanzamiento.

INSERT INTO rumbo_catalog_products(
  id,slug,name,short_description,description,country,country_code,city,destination_iata,
  product_type,provider,duration_label,tag,included,status,featured,sort_order,metadata
) VALUES
('61000000-0000-4000-8000-000000000001','test-miami-city-break','Miami City Break','Miami práctico con vuelo, hotel y desayuno.','Paquete de prueba Rumbo para validar filtros, disponibilidad y checkout del catálogo nativo.','Estados Unidos','US','Miami','MIA','package','Rumbo','5 días / 4 noches','Escapada urbana','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido"]'::jsonb,'published',true,101,'{"test_seed":true,"test_group":"storefront-results","theme":"city"}'::jsonb),
('61000000-0000-4000-8000-000000000002','test-miami-shopping','Miami Shopping Week','Una semana para compras y ciudad con equipaje incluido.','Paquete de prueba Rumbo con pocos cupos para validar alertas de disponibilidad.','Estados Unidos','US','Miami','MIA','package','Rumbo','7 días / 6 noches','Últimos cupos','["Vuelo ida y vuelta","Hotel 4 estrellas","Equipaje de bodega","Traslado aeropuerto"]'::jsonb,'published',true,102,'{"test_seed":true,"test_group":"storefront-results","theme":"shopping"}'::jsonb),
('61000000-0000-4000-8000-000000000003','test-miami-beach','Miami Beach Relax','Playa y ciudad con hotel frente al mar.','Paquete de prueba Rumbo para validar beneficios y duración media.','Estados Unidos','US','Miami','MIA','package','Rumbo','8 días / 7 noches','Playa','["Vuelo ida y vuelta","Hotel frente al mar","Desayuno incluido","Traslado aeropuerto"]'::jsonb,'published',true,103,'{"test_seed":true,"test_group":"storefront-results","theme":"beach"}'::jsonb),
('61000000-0000-4000-8000-000000000004','test-miami-premium','Miami Premium 9 días','Experiencia premium con mayor estadía y servicios incluidos.','Paquete de prueba Rumbo sujeto a mínimo de pasajeros para validar ese filtro comercial.','Estados Unidos','US','Miami','MIA','package','Rumbo','9 días / 8 noches','Premium','["Vuelo ida y vuelta","Hotel 5 estrellas","Desayuno incluido","Equipaje de bodega","Traslado privado"]'::jsonb,'published',false,104,'{"test_seed":true,"test_group":"storefront-results","theme":"premium"}'::jsonb),
('61000000-0000-4000-8000-000000000005','test-panama-essentials','Panamá Esencial','Ciudad de Panamá en formato corto con salida confirmada.','Paquete de prueba Rumbo para validar resultados del destino PTY.','Panamá','PA','Ciudad de Panamá','PTY','package','Rumbo','5 días / 4 noches','Más elegido','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","City tour"]'::jsonb,'published',true,105,'{"test_seed":true,"test_group":"storefront-results","theme":"city"}'::jsonb),
('61000000-0000-4000-8000-000000000006','test-panama-canal','Panamá Canal & Ciudad','Una semana combinando Canal, ciudad y compras.','Paquete de prueba Rumbo con mayor duración y pocos cupos.','Panamá','PA','Ciudad de Panamá','PTY','package','Rumbo','7 días / 6 noches','Canal + ciudad','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","Tour Canal de Panamá","Traslado aeropuerto"]'::jsonb,'published',false,106,'{"test_seed":true,"test_group":"storefront-results","theme":"culture"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  slug=EXCLUDED.slug,name=EXCLUDED.name,short_description=EXCLUDED.short_description,
  description=EXCLUDED.description,country=EXCLUDED.country,country_code=EXCLUDED.country_code,
  city=EXCLUDED.city,destination_iata=EXCLUDED.destination_iata,product_type=EXCLUDED.product_type,
  provider=EXCLUDED.provider,duration_label=EXCLUDED.duration_label,tag=EXCLUDED.tag,
  included=EXCLUDED.included,status=EXCLUDED.status,featured=EXCLUDED.featured,
  sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata;

-- Las fechas son relativas para que los productos de prueba sigan apareciendo
-- con las fechas por defecto del buscador (aprox. +45 a +52 días).
INSERT INTO rumbo_catalog_departures(
  id,product_id,origin_iata,departure_date,return_date,currency,price_amount,cost_amount,
  capacity,available_capacity,low_stock_threshold,status,sale_deadline,
  min_passengers_per_booking,max_passengers_per_booking,confirmation_mode,minimum_group_size
) VALUES
('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','LIM',current_date+45,current_date+49,'USD',699,540,24,18,5,'active',current_date+38,1,6,'confirmed',NULL),
('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','LIM',current_date+44,current_date+50,'USD',829,650,12,3,4,'active',current_date+37,1,6,'confirmed',NULL),
('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','LIM',current_date+45,current_date+52,'USD',949,720,20,14,5,'active',current_date+38,1,8,'confirmed',NULL),
('62000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000004','LIM',current_date+44,current_date+52,'USD',1249,930,30,30,5,'active',current_date+37,1,8,'minimum_required',18),
('62000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000005','LIM',current_date+45,current_date+49,'USD',579,430,25,21,5,'active',current_date+38,1,8,'confirmed',NULL),
('62000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000006','LIM',current_date+46,current_date+52,'USD',759,590,15,4,5,'active',current_date+39,1,8,'confirmed',NULL)
ON CONFLICT (id) DO UPDATE SET
  origin_iata=EXCLUDED.origin_iata,departure_date=EXCLUDED.departure_date,return_date=EXCLUDED.return_date,
  currency=EXCLUDED.currency,price_amount=EXCLUDED.price_amount,cost_amount=EXCLUDED.cost_amount,
  capacity=EXCLUDED.capacity,available_capacity=EXCLUDED.available_capacity,
  low_stock_threshold=EXCLUDED.low_stock_threshold,status=EXCLUDED.status,
  sale_deadline=EXCLUDED.sale_deadline,min_passengers_per_booking=EXCLUDED.min_passengers_per_booking,
  max_passengers_per_booking=EXCLUDED.max_passengers_per_booking,
  confirmation_mode=EXCLUDED.confirmation_mode,minimum_group_size=EXCLUDED.minimum_group_size;

-- Imágenes públicas reales ya existentes en Cloudflare R2. Para estos productos de
-- prueba se comparten deliberadamente hasta que las nuevas credenciales S3 de R2
-- queden guardadas en Administración → APIs y podamos subir assets individuales.
INSERT INTO rumbo_catalog_images(id,product_id,url,alt_text,sort_order,is_primary,metadata) VALUES
('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/3catei9qospldeo73zau9czjkqsg','Miami City Break',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb),
('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/3catei9qospldeo73zau9czjkqsg','Miami Shopping Week',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb),
('63000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/3catei9qospldeo73zau9czjkqsg','Miami Beach Relax',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb),
('63000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000004','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/b4ot2lbnmmzwkgyhyx037xnls14o','Miami Premium',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb),
('63000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000005','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/gvvfzevs4tccnt4btxwy680q9d7l','Panamá Esencial',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb),
('63000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000006','https://pub-4a41d3634afa4e46b3be096a1d931aa7.r2.dev/gvvfzevs4tccnt4btxwy680q9d7l','Panamá Canal y Ciudad',0,true,'{"test_seed":true,"shared_r2_asset":true}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  product_id=EXCLUDED.product_id,url=EXCLUDED.url,alt_text=EXCLUDED.alt_text,
  sort_order=EXCLUDED.sort_order,is_primary=EXCLUDED.is_primary,metadata=EXCLUDED.metadata;
