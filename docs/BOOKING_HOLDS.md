# Bloqueos temporales de reserva

Rumbo trata una oferta publicada en Spree como una tarifa reservable. Cuando el
cliente envía sus datos, el backend vuelve a leer el producto, la variante y el
precio directamente desde Spree. Los importes enviados por el navegador no son
la fuente de verdad.

## Flujo implementado

1. El cliente selecciona una oferta publicada.
2. Spree resuelve nuevamente el producto y la variante por sus IDs públicos.
3. El backend toma el precio vigente en la moneda principal de la tienda.
4. El precio por persona se multiplica por adultos más niños para obtener el
   total inicial del MVP.
5. La reserva se guarda con estado `held` y un vencimiento de 15 minutos.
6. La consulta pública devuelve importe, moneda, vencimiento y estado del pago,
   pero nunca correo ni teléfono.
7. Una consulta posterior expira automáticamente un bloqueo vencido. La función
   PostgreSQL `rumbo_expire_booking_holds()` permite también realizar la limpieza
   periódica desde un worker o tarea programada.

## Estados

```text
held -> payment_pending -> paid -> confirmed
   |            |           |
   +----------> expired     +-> cancelled
```

Los estados históricos `new`, `validating` y `quoted` se mantienen para las
solicitudes creadas antes de este flujo y para futuros proveedores que no
permitan confirmación inmediata.

## Preparación para la pasarela

`rumbo_booking_payment_attempts` registra cada intento con una clave de
idempotencia, proveedor, monto, moneda, identificador externo y estado. Este PR
no procesa tarjetas ni marca pagos como aprobados: deja el contrato listo para
conectar una pasarela sin almacenar datos sensibles de tarjeta.

## Alcance del cálculo inicial

En este primer MVP el precio publicado se interpreta como precio por viajero y
se aplica por igual a adultos y niños. Cuando PriceTravel u otro proveedor
devuelva precios diferenciados, el cálculo deberá reemplazarse por el desglose
autoritativo del proveedor antes de iniciar el pago.
