# Contrato del catálogo Spree 5.4

Este documento define cómo un producto administrado en Spree se convierte en
un paquete visible en el storefront de Rumbo. El contrato evita depender de
nombres informales o de la estructura interna de las tablas de PostgreSQL.

## Flujo

1. Spree guarda productos, variantes, precios y metafields en PostgreSQL.
2. El storefront consulta `GET /api/v3/store/products` con
   `expand=media,custom_fields`.
3. `lib/spree-catalog.ts` valida la respuesta de Spree 5.4.
4. El adaptador transforma el producto al tipo interno `TravelPackage`.
5. Si la respuesta no cumple el contrato, Rumbo muestra el catálogo
   demostrativo y no habilita cobros con datos inconsistentes.

## Mapeo de campos

| Spree Store API v3 | Rumbo `TravelPackage` |
| --- | --- |
| `slug` o `id` | `id` |
| `name` | `destination` |
| `thumbnail_url` | `image` |
| `price.display_amount` | `price` |
| `price.amount` | `priceAmount` |
| `price.currency` | `currency` |
| `original_price.display_amount` | `previousPrice` |
| `tags[0]` | `tag` |
| `default_variant_id` | `variantId` |
| `rumbo.country` | `country` |
| `rumbo.duration` | `duration` |
| `rumbo.included` | `included` |
| `rumbo.rating` | `rating` |
| `rumbo.reviews` | `reviews` |
| `rumbo.departure_date` | `departureDate` |
| `rumbo.return_date` | `returnDate` |
| `rumbo.capacity` | `capacity` y `bookable` |

## Metafields canónicos

El despliegue ejecuta `backend/spree/ensure_rumbo_metafields.rb` después de
las migraciones. El script crea las definiciones faltantes y garantiza que
sean públicas para la Store API (`display_on=both`).

| Clave completa | Tipo | Formato |
| --- | --- | --- |
| `rumbo.country` | Texto corto | `Panamá` |
| `rumbo.duration` | Texto corto | `5 días / 4 noches` |
| `rumbo.included` | Texto largo | Elementos separados por `|` |
| `rumbo.rating` | Número | `4.8` |
| `rumbo.reviews` | Número | `125` |
| `rumbo.departure_date` | Texto corto | Fecha ISO `AAAA-MM-DD` |
| `rumbo.return_date` | Texto corto | Fecha ISO `AAAA-MM-DD` |
| `rumbo.conditions` | Texto largo | Condiciones comerciales |
| `rumbo.capacity` | Número | Cupos totales contratados |
| `rumbo.cancellation_policy` | Texto largo | Política aplicable |

Spree devuelve cada metafield con las propiedades `key`, `label`, `type` y
`value`. El adaptador utiliza `key`; `label` es solamente el texto visible en
el administrador.

El valor `rumbo.capacity` define el inventario total. Los cupos temporales y
vendidos se descuentan en PostgreSQL; no se modifica manualmente este metafield
por cada reserva.

## Importación masiva

Para cargar productos desde Excel, guardar la hoja como CSV UTF-8 y usar
**Products → Import**. Las columnas personalizadas deben usar estos encabezados:

```text
metafield.rumbo.country
metafield.rumbo.duration
metafield.rumbo.included
metafield.rumbo.rating
metafield.rumbo.reviews
metafield.rumbo.departure_date
metafield.rumbo.return_date
metafield.rumbo.conditions
metafield.rumbo.capacity
metafield.rumbo.cancellation_policy
```

Mantener el mismo `slug` al volver a importar un producto existente para que
Spree lo actualice en lugar de crear un duplicado.

## Validación

Ejecutar el contrato de forma aislada:

```bash
npm run test:contract
```

La integración continua ejecuta este contrato antes de construir el
storefront. Los casos cubren la estructura real de Spree 5.4, campos con
namespace, números, listas y respuestas incompatibles.
