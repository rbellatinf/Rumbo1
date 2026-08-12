-- Paquetes nativos de prueba en destinos adicionales para validar búsquedas y filtros.
-- No son mocks del frontend. Se guardan en las tablas oficiales y se identifican
-- mediante metadata.test_seed para poder retirarlos antes del lanzamiento.

INSERT INTO rumbo_catalog_products(
  id,slug,name,short_description,description,country,country_code,city,destination_iata,
  product_type,provider,duration_label,tag,included,status,featured,sort_order,metadata
) VALUES
('61000000-0000-4000-8000-000000000007','test-istanbul-bosphorus','Estambul · Bósforo y Ciudad','Estambul entre Europa y Asia con hotel, desayuno y paseo por el Bósforo.','Paquete nativo de prueba Rumbo para validar destinos internacionales y filtros del storefront.','Turquía','TR','Estambul','IST','package','Rumbo','7 días / 6 noches','Europa + Asia','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","Paseo por el Bósforo","Traslado aeropuerto"]'::jsonb,'published',true,107,'{"test_seed":true,"test_group":"storefront-world","theme":"culture","image_asset":"istanbul-cc0"}'::jsonb),
('61000000-0000-4000-8000-000000000008','test-budapest-danube','Budapest · Danubio Imperial','Budapest, Parlamento y Danubio en una escapada europea de seis noches.','Paquete nativo de prueba Rumbo con precio y disponibilidad diferenciados.','Hungría','HU','Budapest','BUD','package','Rumbo','7 días / 6 noches','Danubio','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","City tour","Crucero por el Danubio"]'::jsonb,'published',true,108,'{"test_seed":true,"test_group":"storefront-world","theme":"city","image_asset":"budapest-cc0"}'::jsonb),
('61000000-0000-4000-8000-000000000009','test-dubrovnik-adriatic','Dubrovnik · Perla del Adriático','Murallas, casco histórico y costa del Adriático con seis noches.','Paquete nativo de prueba Rumbo para validar Croacia y productos culturales.','Croacia','HR','Dubrovnik','DBV','package','Rumbo','7 días / 6 noches','Adriático','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","Tour casco histórico","Traslado aeropuerto"]'::jsonb,'published',true,109,'{"test_seed":true,"test_group":"storefront-world","theme":"coast","image_asset":"dubrovnik-cc0"}'::jsonb),
('61000000-0000-4000-8000-000000000010','test-paris-classic','París Clásico','París con hotel céntrico, desayuno y recorrido panorámico.','Paquete nativo de prueba Rumbo para validar Francia y búsquedas por CDG.','Francia','FR','París','CDG','package','Rumbo','6 días / 5 noches','Clásico europeo','["Vuelo ida y vuelta","Hotel 4 estrellas","Desayuno incluido","City tour panorámico","Traslado aeropuerto"]'::jsonb,'published',true,110,'{"test_seed":true,"test_group":"storefront-world","theme":"city","image_asset":"paris-cc0"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  slug=EXCLUDED.slug,name=EXCLUDED.name,short_description=EXCLUDED.short_description,
  description=EXCLUDED.description,country=EXCLUDED.country,country_code=EXCLUDED.country_code,
  city=EXCLUDED.city,destination_iata=EXCLUDED.destination_iata,product_type=EXCLUDED.product_type,
  provider=EXCLUDED.provider,duration_label=EXCLUDED.duration_label,tag=EXCLUDED.tag,
  included=EXCLUDED.included,status=EXCLUDED.status,featured=EXCLUDED.featured,
  sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata;

INSERT INTO rumbo_catalog_departures(
  id,product_id,origin_iata,departure_date,return_date,currency,price_amount,cost_amount,
  capacity,available_capacity,low_stock_threshold,status,sale_deadline,
  min_passengers_per_booking,max_passengers_per_booking,confirmation_mode,minimum_group_size
) VALUES
('62000000-0000-4000-8000-000000000007','61000000-0000-4000-8000-000000000007','LIM',current_date+45,current_date+51,'USD',1399,1080,20,13,5,'active',current_date+35,1,6,'confirmed',NULL),
('62000000-0000-4000-8000-000000000008','61000000-0000-4000-8000-000000000008','LIM',current_date+46,current_date+52,'USD',1299,995,18,5,5,'active',current_date+36,1,6,'confirmed',NULL),
('62000000-0000-4000-8000-000000000009','61000000-0000-4000-8000-000000000009','LIM',current_date+47,current_date+53,'USD',1499,1160,16,10,4,'active',current_date+37,1,6,'confirmed',NULL),
('62000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000010','LIM',current_date+44,current_date+49,'USD',1199,910,24,4,5,'active',current_date+34,1,6,'confirmed',NULL)
ON CONFLICT (id) DO UPDATE SET
  origin_iata=EXCLUDED.origin_iata,departure_date=EXCLUDED.departure_date,return_date=EXCLUDED.return_date,
  currency=EXCLUDED.currency,price_amount=EXCLUDED.price_amount,cost_amount=EXCLUDED.cost_amount,
  capacity=EXCLUDED.capacity,available_capacity=EXCLUDED.available_capacity,
  low_stock_threshold=EXCLUDED.low_stock_threshold,status=EXCLUDED.status,
  sale_deadline=EXCLUDED.sale_deadline,min_passengers_per_booking=EXCLUDED.min_passengers_per_booking,
  max_passengers_per_booking=EXCLUDED.max_passengers_per_booking,
  confirmation_mode=EXCLUDED.confirmation_mode,minimum_group_size=EXCLUDED.minimum_group_size;
