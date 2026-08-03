# Rumbo — arquitectura del MVP 1

## Objetivo

El MVP 1 vende paquetes turísticos y administra asociados con membresía. La
primera fase concentra catálogo, carrito y checkout, clientes, asociados,
licencias, pedidos, pagos registrados manualmente, enlaces de referido,
comisión directa y backoffice.

## Base tecnológica

- Storefront: la aplicación React/Next compatible que vive en este repositorio.
- Comercio y backoffice: Spree Commerce 5.4, usando su imagen oficial.
- Datos: PostgreSQL 18.
- Integración: Store API v3 de Spree.
- Infraestructura inicial: un VPS con contenedores; el storefront puede
  desplegarse por separado.

Spree y PostgreSQL son bases abiertas y reemplazables. El archivo
`compose.yaml` inicia los dos servicios sin exigir instalaciones en la laptop
del usuario cuando se ejecuta en un VPS o entorno cloud.

## Responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| Storefront Rumbo | Búsqueda, catálogo, detalle y solicitud de reserva |
| Adaptador AirLabs | Autocompletado normalizado de ciudades y aeropuertos |
| Adaptador PriceTravel | Consulta y normalización de paquetes B2B |
| Spree Store API | Productos, clientes, carritos, pedidos y estado de pagos |
| Spree Admin | Paquetes, tarifas, pedidos y clientes |
| Módulo Rumbo | Asociados, licencias, atribución y comisión directa |
| PostgreSQL | Persistencia comercial y trazabilidad |

## Solicitudes de reserva

El primer flujo comercial no cobra ni emite. Registra una intención de compra
que el equipo valida manualmente antes de convertirla en pedido confirmado.

1. El cliente abre un producto real de Spree.
2. El storefront valida contacto, viajeros, fechas, consentimiento y código de
   asociado opcional.
3. `/api/reservations` revalida el contrato y llama a la Store API de Spree con
   la clave publicable.
4. Spree guarda la solicitud en `rumbo_booking_requests` dentro del mismo
   PostgreSQL del comercio y vuelve a resolver el producto por su ID público,
   evitando aceptar nombres de producto inventados por el navegador.
5. PostgreSQL genera la referencia, bloquea transiciones inválidas y escribe
   `rumbo_booking_status_history` y `rumbo_audit_events` mediante gatillos.
6. El cliente puede consultar únicamente el estado usando referencia y correo;
   la respuesta pública nunca contiene teléfono ni correo.

La clave de idempotencia evita que un doble toque o reintento cree dos reservas.
La API administrativa de Spree expone lectura y cambio de estado únicamente con
una clave secreta de administración.

## Modelo de comisión

La comisión es de un único nivel y comienza en 6%, configurable por asociado.

1. El cliente llega con un `referral_code`.
2. Al generar el pedido se registra una atribución única.
3. El administrador confirma el pago.
4. Se calcula la comisión sobre el importe válido.
5. El administrador la aprueba y posteriormente la marca como pagada.
6. Toda modificación genera un evento de auditoría.

No se distribuyen comisiones a patrocinadores ni niveles superiores.

## Datos de viaje en Spree

Cada paquete se modela como un producto. Los campos de viaje se guardan como
campos personalizados:

- `rumbo.country`
- `rumbo.duration`
- `rumbo.included`, separado por `|`
- `rumbo.rating`
- `rumbo.reviews`
- `rumbo.departure_date` y `rumbo.return_date`
- `rumbo.conditions`, `rumbo.capacity` y `rumbo.cancellation_policy`

El despliegue crea o verifica estas definiciones de forma idempotente y las
expone en la Store API. El mapeo y los formatos están versionados en
[`SPREE_CATALOG_CONTRACT.md`](SPREE_CATALOG_CONTRACT.md).

El endpoint `/api/catalog` puede leer productos de la Store API v3.
`/api/reservations` registra y consulta solicitudes persistentes.
`/api/airports` encapsula el servicio Name Suggestion de AirLabs.
`/api/packages` encapsula la búsqueda B2B de PriceTravel. Si las variables de
conexión todavía no existen, los tres endpoints devuelven datos demostrativos
identificados como tales y no habilitan cobros.

## Límites del MVP 1

Quedan fuera de esta fase:

- comisiones multinivel o pagos a patrocinadores;
- retornos financieros, billeteras o retiros automáticos;
- emisión automática de tickets;
- emisión, revalidación o cancelación automática con proveedores;
- facturación electrónica;
- aplicación móvil nativa;
- pasarela de pago automática no contratada.

La búsqueda de aeropuertos y la capa de paquetes ya quedan preparadas, pero las
reservas y excepciones se validan manualmente hasta certificar PriceTravel de
extremo a extremo con credenciales comerciales.

## Preparación del entorno

1. Crear un archivo `.env` a partir de `.env.example`.
2. Generar valores secretos únicos.
3. Ejecutar `docker compose up -d` en el servidor.
4. Crear una clave publicable en Spree Admin.
5. Configurar `SPREE_API_URL` y `SPREE_PUBLISHABLE_API_KEY` en el storefront.
6. Configurar las credenciales de AirLabs y PriceTravel únicamente en el
   entorno del servidor.

Nunca se deben subir secretos reales al repositorio.
