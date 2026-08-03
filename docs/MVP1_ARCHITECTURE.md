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
| Storefront Rumbo | Búsqueda, catálogo, detalle y reserva automática |
| Adaptador AirLabs | Autocompletado normalizado de ciudades y aeropuertos |
| Adaptador PriceTravel | Consulta y normalización de paquetes B2B |
| Spree Store API | Productos, clientes, carritos, pedidos y estado de pagos |
| Spree Admin | Paquetes, tarifas, pedidos y clientes |
| Módulo Rumbo | Asociados, licencias, atribución y comisión directa |
| PostgreSQL | Persistencia comercial y trazabilidad |

## Reservas automáticas

El flujo comercial bloquea precio y cupos sin aprobación manual. En esta fase
todavía no captura tarjetas ni emite tickets porque la pasarela de pago no está
contratada, pero deja preparado el registro transaccional del pago.

1. El cliente abre un producto real de Spree.
2. La Store API vuelve a resolver producto, precio, fechas y capacidad desde
   Spree; nunca acepta el importe enviado por el navegador como fuente válida.
3. PostgreSQL bloquea la fila de inventario y comprueba atómicamente que todavía
   existan cupos para todos los viajeros.
4. Si hay capacidad, crea una reserva `payment_pending`, un bloqueo de 15
   minutos y un pago pendiente por el importe exacto. Si no hay capacidad, no
   crea la reserva ni realiza cobros.
5. Los gatillos convierten el bloqueo en venta cuando el pago queda `paid`, o
   liberan los cupos al cancelar o vencer. La transición a `confirmed` exige un
   pago registrado como completado.
6. El cliente puede consultar únicamente el estado usando referencia y correo;
   la respuesta pública nunca contiene teléfono ni correo.

La clave de idempotencia evita que un doble toque o reintento cree dos reservas.
Las ofertas demostrativas o sin `rumbo.capacity` no se pueden reservar.

## Modelo de comisión

La comisión es de un único nivel y comienza en 6%, configurable por asociado.

1. El cliente llega con un `referral_code`.
2. Al generar el pedido se registra una atribución única.
3. La pasarela confirma el pago mediante un evento autenticado.
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
`/api/availability` consulta precio y cupos vigentes.
`/api/reservations` registra y consulta reservas persistentes.
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

La búsqueda de aeropuertos y la capa de paquetes ya quedan preparadas. Las
ofertas propias de Spree bloquean cupos automáticamente; los proveedores
externos solo podrán venderse automáticamente cuando sus APIs permitan
revalidar y bloquear inventario de extremo a extremo.

## Preparación del entorno

1. Crear un archivo `.env` a partir de `.env.example`.
2. Generar valores secretos únicos.
3. Ejecutar `docker compose up -d` en el servidor.
4. Crear una clave publicable en Spree Admin.
5. Configurar `SPREE_API_URL` y `SPREE_PUBLISHABLE_API_KEY` en el storefront.
6. Configurar las credenciales de AirLabs y PriceTravel únicamente en el
   entorno del servidor.

Nunca se deben subir secretos reales al repositorio.
