# Rumbo — MVP 1

Storefront y base operativa para venta de paquetes turísticos, asociados,
licencias, enlaces de referido y comisión directa.

## Estado actual

- buscador y catálogo adaptable a celular y escritorio;
- detalle y flujo de solicitud de reserva;
- portal demostrativo del asociado;
- backoffice demostrativo;
- adaptador para el catálogo de Spree Store API v3;
- PostgreSQL con el modelo propio de asociados, licencias, atribuciones,
  comisiones y auditoría;
- entorno reproducible con Spree Commerce 5.4 y PostgreSQL 18.

Mientras el backend no esté configurado, las tarifas aparecen claramente como
demostrativas y no se generan cobros ni tickets.

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
