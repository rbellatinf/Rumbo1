# Rumbo — MVP 1

Storefront y base operativa para venta de paquetes turísticos, asociados,
licencias, enlaces de referido y comisión directa.

## Estado actual

- buscador y catálogo adaptable a celular y escritorio;
- detalle y flujo de solicitud de reserva;
- portal demostrativo del asociado;
- backoffice demostrativo;
- adaptador para el catálogo de Spree Store API v3;
- autocompletado mundial de aeropuertos preparado para AirLabs Name Suggestion;
- buscador de paquetes preparado para el contrato B2B de PriceTravel;
- PostgreSQL con el modelo propio de asociados, licencias, atribuciones,
  comisiones y auditoría;
- entorno reproducible con Spree Commerce 5.4 y PostgreSQL 18.

Mientras el backend no esté configurado, las tarifas aparecen claramente como
demostrativas y no se generan cobros ni tickets.

Los conectores externos nunca envían secretos al navegador. Sin las
credenciales de sandbox, AirLabs usa una lista local de respaldo y
PriceTravel devuelve los paquetes demostrativos de Rumbo.

## Desarrollo del storefront

Requiere Node.js 22.13 o posterior.

```bash
npm ci
npm run dev
```

Validación:

```bash
npm run lint
npm run build
```

## Backend comercial

Crear `.env` desde `.env.example`, reemplazar todos los secretos y ejecutar en
un servidor con Docker:

```bash
docker compose up -d
```

El backoffice de Spree queda disponible en el puerto configurado. Después de
crear una clave publicable, configurar `SPREE_API_URL` y
`SPREE_PUBLISHABLE_API_KEY` en el storefront.

La definición completa del alcance y la arquitectura está en
[`docs/MVP1_ARCHITECTURE.md`](docs/MVP1_ARCHITECTURE.md).

Los pasos y variables de las integraciones están en
[`docs/TRAVEL_API_INTEGRATIONS.md`](docs/TRAVEL_API_INTEGRATIONS.md).

El contrato exacto de campos entre Spree y el storefront está en
[`docs/SPREE_CATALOG_CONTRACT.md`](docs/SPREE_CATALOG_CONTRACT.md).
