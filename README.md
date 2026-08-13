# Rumbo — MVP 1

Storefront y base operativa para venta de paquetes turísticos, Partners, agencias minoristas, referidos y comisiones.

## Arquitectura actual

Rumbo usa una única fuente operativa: **Rumbo API + PostgreSQL**.

- storefront responsive para búsqueda, catálogo y reservas;
- catálogo propio en `rumbo_catalog_products` y `rumbo_catalog_departures`;
- reserva automática con precio y cupos validados en servidor;
- consulta de reserva mediante referencia y correo;
- pagos y eventos de pago persistidos en PostgreSQL;
- checkout Izipay iniciado y validado desde Rumbo API;
- portal Partner y portal de agencias minoristas;
- backoffice mayorista propio;
- AirLabs para autocompletado mundial de aeropuertos;
- PriceTravel B2B como fuente externa de paquetes cuando no existe inventario propio compatible;
- Cloudflare R2 para imágenes del catálogo;
- comisiones, atribuciones y auditoría en PostgreSQL.

## Regla de integraciones

Las integraciones externas se configuran en Rumbo API / Administración. El navegador no recibe secretos.

**No existen fallbacks locales o demostrativos para ocultar errores de integración.** Si AirLabs, PriceTravel, Izipay o Rumbo API fallan o no están configurados, el sistema devuelve un error visible para facilitar el diagnóstico.

## Desarrollo del storefront

Requiere Node.js 22.13 o posterior.

```bash
npm ci
npm run dev
```

Validación completa:

```bash
npm run lint
npm test
```

## Backend nativo

Crear `.env` desde `.env.example`, reemplazar los secretos y ejecutar:

```bash
docker compose up -d
```

Servicios locales principales:

- PostgreSQL 18;
- Rumbo API (Node.js);
- storefront Node/Next/Vinext.

En Render, `render.yaml` define únicamente `rumbo-storefront`, `rumbo-api` y `rumbo1-postgres`.

## Documentación

La arquitectura está en [`docs/MVP1_ARCHITECTURE.md`](docs/MVP1_ARCHITECTURE.md).

Las integraciones de viajes están en [`docs/TRAVEL_API_INTEGRATIONS.md`](docs/TRAVEL_API_INTEGRATIONS.md).

El flujo de pagos está en [`docs/PAYMENT_GATEWAY_CONTRACT.md`](docs/PAYMENT_GATEWAY_CONTRACT.md) y [`docs/IZIPAY_INTEGRATION.md`](docs/IZIPAY_INTEGRATION.md).
