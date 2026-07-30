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
| Spree Store API | Productos, clientes, carritos, pedidos y estado de pagos |
| Spree Admin | Paquetes, tarifas, pedidos y clientes |
| Módulo Rumbo | Asociados, licencias, atribución y comisión directa |
| PostgreSQL | Persistencia comercial y trazabilidad |

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

- `country`
- `duration`
- `included`, separado por `|`
- `rating`
- `reviews`
- fechas de salida y retorno
- condiciones, cupos y política de cancelación

El endpoint `/api/catalog` ya puede leer productos de la Store API v3. Si las
variables de conexión todavía no existen, devuelve datos demostrativos
identificados como tales y no habilita cobros.

## Límites del MVP 1

Quedan fuera de esta fase:

- comisiones multinivel o pagos a patrocinadores;
- retornos financieros, billeteras o retiros automáticos;
- emisión automática de tickets;
- integraciones con GDS, aerolíneas u hoteles;
- facturación electrónica;
- aplicación móvil nativa;
- pasarela de pago automática no contratada.

Las reservas y excepciones se validan manualmente hasta integrar el primer
proveedor de viajes de extremo a extremo.

## Preparación del entorno

1. Crear un archivo `.env` a partir de `.env.example`.
2. Generar valores secretos únicos.
3. Ejecutar `docker compose up -d` en el servidor.
4. Crear una clave publicable en Spree Admin.
5. Configurar `SPREE_API_URL` y `SPREE_PUBLISHABLE_API_KEY` en el storefront.

Nunca se deben subir secretos reales al repositorio.

