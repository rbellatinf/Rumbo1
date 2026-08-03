# Integración Izipay para Rumbo

Este adaptador conecta la capa neutral de pagos de Rumbo con Izipay / MiCuentaWeb.
La reserva continúa siendo la fuente de verdad: Izipay solo procesa el cobro y
Rumbo confirma la reserva cuando recibe un evento firmado, con el mismo monto y
moneda, antes de que venza el bloqueo de cupos.

## Flujo

1. Spree crea la reserva y bloquea precio y cupos por 15 minutos.
2. Spree genera un enlace firmado hacia `/pagar`.
3. El storefront valida la firma y solicita un `formToken` a Izipay mediante:
   `POST /api-payment/V4/Charge/CreatePayment`.
4. El navegador muestra el formulario Krypton V4 de Izipay.
5. Izipay envía `kr-answer` y `kr-hash` al retorno del navegador y a la URL de
   notificación configurada en el Back Office.
6. Rumbo valida el HMAC SHA-256 de Izipay, normaliza el evento y lo firma de nuevo
   para el webhook interno de Spree.
7. Spree vuelve a comprobar proveedor, monto, moneda, transición y vigencia del
   cupo. Solo entonces cambia el pago a `paid` y la reserva a `confirmed`.

## Variables del backend Spree / Render

```dotenv
RUMBO_STOREFRONT_URL=https://tu-storefront.example
RUMBO_PAYMENT_PROVIDER=izipay
RUMBO_PAYMENT_CHECKOUT_URL=https://tu-storefront.example/pagar
RUMBO_PAYMENT_CHECKOUT_SECRET=SECRETO_LARGO_1
RUMBO_PAYMENT_WEBHOOK_URL=https://tu-spree.onrender.com/api/v3/store/payment_webhooks/izipay
RUMBO_PAYMENT_WEBHOOK_SECRET_IZIPAY=SECRETO_LARGO_2
RUMBO_PAYMENT_RETURN_URL=https://tu-storefront.example/reservas
```

`RUMBO_PAYMENT_CHECKOUT_SECRET` y
`RUMBO_PAYMENT_WEBHOOK_SECRET_IZIPAY` deben ser distintos.

## Variables del storefront

```dotenv
SPREE_API_URL=https://tu-spree.onrender.com
RUMBO_STOREFRONT_URL=https://tu-storefront.example
RUMBO_PAYMENT_CHECKOUT_SECRET=SECRETO_LARGO_1
RUMBO_PAYMENT_WEBHOOK_SECRET_IZIPAY=SECRETO_LARGO_2

IZIPAY_API_URL=https://api.micuentaweb.pe
IZIPAY_STATIC_BASE_URL=https://static.micuentaweb.pe/static/js/krypton-client/V4.0
IZIPAY_USERNAME=USUARIO_API_REST
IZIPAY_PASSWORD=CONTRASENA_API_REST
IZIPAY_PUBLIC_KEY=CLAVE_PUBLICA
IZIPAY_HMAC_SHA256_KEY=CLAVE_HMAC_SHA_256
IZIPAY_DEFAULT_CUSTOMER_EMAIL=pagos@tu-dominio.example
IZIPAY_ALLOWED_CURRENCIES=PEN,USD
```

No uses las credenciales del POS físico del Club Croata para Rumbo. Rumbo debe
tener su propio comercio o tienda Izipay y sus propias claves de pruebas y
producción.

## Configuración en el Back Office de Izipay

En **Configuración → Reglas de notificaciones**, establecer como URL de
notificación al final del pago:

```text
https://tu-storefront.example/api/payments/izipay/notification
```

El retorno del navegador se configura automáticamente en el formulario como:

```text
https://tu-storefront.example/api/payments/izipay/result
```

La notificación es indispensable. El retorno del navegador no es suficiente,
porque el cliente puede cerrar la pestaña después de pagar.

## Datos que no se almacenan

Rumbo no recibe ni almacena:

- número completo de tarjeta;
- CVV;
- fecha de vencimiento;
- contraseña API REST;
- clave HMAC de Izipay;
- cuerpo completo del evento de pago.

La base de datos conserva únicamente identificadores, estado, monto, moneda,
digest del evento y marcas de tiempo necesarias para auditoría e idempotencia.

## Prueba en ambiente de pruebas

1. Configurar las claves de pruebas de Izipay en el storefront.
2. Configurar los dos secretos compartidos en storefront y Spree.
3. Crear una oferta con cupos y precio en Spree.
4. Crear una reserva desde Rumbo.
5. Abrir `Mis reservas` y seleccionar **Pagar ahora**.
6. Completar una transacción de prueba.
7. Verificar que la reserva cambie a `confirmed` y el pago a `paid`.
8. Repetir la misma notificación y comprobar que se trate como duplicada.
9. Alterar monto o moneda en una prueba controlada y comprobar que Spree la
   rechace sin confirmar la reserva.

## Paso a producción

Antes de habilitar cobros reales:

- reemplazar todas las claves de pruebas por claves de producción;
- confirmar que las URLs públicas usan HTTPS;
- regenerar cualquier credencial que haya aparecido en capturas o archivos
  compartidos;
- ejecutar una compra real de monto mínimo y verificar pago, reserva, auditoría
  y notificación;
- documentar el procedimiento de devolución y conciliación diaria.
