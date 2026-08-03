# Contrato de pasarela de pago de Rumbo

Rumbo separa las reservas de la pasarela. PostgreSQL conserva el precio, el
bloqueo de cupos y el estado; un adaptador externo se encarga de crear el cobro
en Izipay, Niubiz, Mercado Pago u otro proveedor.

## Principios

- El navegador nunca decide el monto ni la moneda.
- Rumbo no recibe ni almacena números de tarjeta, CVV ni datos equivalentes.
- Cada checkout vence como máximo junto con el bloqueo de cupos.
- La confirmación ocurre solamente por un webhook firmado.
- Los eventos son idempotentes por `provider + event_id`.
- Un mismo `event_id` con otro contenido se rechaza.

## Handoff hacia el adaptador

Cuando la reserva está en `payment_pending` o `payment_failed`, Rumbo crea una
URL de checkout con estos parámetros:

| Parámetro | Descripción |
| --- | --- |
| `reference` | Referencia pública `RUM-...` |
| `payment_id` | UUID interno del pago |
| `amount` | Monto verificado por el servidor |
| `currency` | Moneda ISO de tres letras |
| `expires_at` | Vencimiento ISO 8601 |
| `return_url` | Página a la que vuelve el viajero |
| `webhook_url` | Endpoint que recibirá el resultado |
| `signature` | HMAC-SHA256 del query canónico |

El adaptador debe recalcular `signature` con
`RUMBO_PAYMENT_CHECKOUT_SECRET` antes de crear una sesión con el proveedor.
No debe aceptar cambios en monto, moneda, referencia o vencimiento.

## Webhook normalizado

El adaptador envía un `POST` JSON a:

```text
/api/v3/store/payment_webhooks/{provider}
```

Encabezados obligatorios:

```text
X-Rumbo-Timestamp: 10-digit-unix-timestamp
X-Rumbo-Signature: hex-hmac-sha256
```

La firma se calcula sobre:

```text
{timestamp}.{raw_request_body}
```

con `RUMBO_PAYMENT_WEBHOOK_SECRET` o con la variable específica
`RUMBO_PAYMENT_WEBHOOK_SECRET_{PROVIDER}`.

Payload normalizado:

```json
{
  "event_id": "provider-event-123",
  "event_type": "payment.paid",
  "booking_reference": "RUM-20260803-A1B2C3",
  "provider_payment_id": "external-payment-456",
  "status": "paid",
  "amount": "1398.00",
  "currency": "USD"
}
```

Estados aceptados:

```text
pending, authorized, paid, failed, cancelled, refunded
```

## Reglas de aplicación

Antes de cambiar el pago, Rumbo comprueba:

1. firma válida y timestamp con antigüedad máxima de cinco minutos;
2. proveedor igual al registrado en la sesión;
3. monto y moneda idénticos a PostgreSQL;
4. referencia externa estable;
5. transición de estado permitida;
6. bloqueo todavía activo cuando el primer evento `paid` llega.

El evento se registra sin guardar el cuerpo completo. Solo se conserva un hash
SHA-256, los identificadores, el monto, la moneda y el resultado del
procesamiento.

## Variables

```text
RUMBO_PAYMENT_PROVIDER
RUMBO_PAYMENT_CHECKOUT_URL
RUMBO_PAYMENT_CHECKOUT_SECRET
RUMBO_PAYMENT_WEBHOOK_URL
RUMBO_PAYMENT_WEBHOOK_SECRET
RUMBO_PAYMENT_RETURN_URL
RUMBO_STOREFRONT_URL
```

Las dos claves HMAC deben ser diferentes y almacenarse como secretos del
entorno. Nunca se guardan en GitHub ni se envían al navegador.

## Trabajo específico por proveedor

Para activar una pasarela real falta un adaptador que:

1. valide el handoff firmado;
2. invoque la API oficial del proveedor con credenciales privadas;
3. devuelva o redirija al checkout alojado;
4. traduzca el callback del proveedor al webhook normalizado de Rumbo;
5. firme ese webhook con el secreto configurado.

El resto del flujo —cupos, vencimiento, auditoría y confirmación— permanece
igual al cambiar de proveedor.
