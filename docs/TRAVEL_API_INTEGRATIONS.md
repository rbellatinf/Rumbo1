# Integraciones de viaje: Amadeus y PriceTravel

## Diseño

El navegador nunca se conecta directamente con los proveedores ni recibe sus
credenciales.

1. El usuario escribe una ciudad o código IATA.
2. `/api/airports` consulta Amadeus y normaliza la respuesta.
3. El usuario selecciona origen, destino y fechas.
4. `/api/packages` consulta PriceTravel y transforma su respuesta al formato
   interno `TravelPackage`.
5. La interfaz muestra si los datos son reales o demostrativos.

La separación por adaptadores permite cambiar el contrato de un proveedor sin
reescribir la experiencia de compra.

## Amadeus

El conector usa OAuth 2.0 con `client_credentials` y el recurso Airport & City
Search. Las claves se guardan solo en el entorno del servidor.

Variables:

- `AMADEUS_API_BASE_URL`
- `AMADEUS_API_KEY`
- `AMADEUS_API_SECRET`

Para pruebas, la URL base es `https://test.api.amadeus.com`. Producción debe
activarse con las condiciones comerciales de Amadeus.

Documentación oficial:

- https://developers.amadeus.com/
- https://github.com/amadeus4dev/amadeus-node

## PriceTravel

PriceTravel Connect publica que su distribución B2B se integra mediante
API/XML. La documentación pública histórica de PriceTravel describe
autenticación Basic y recursos de destinos, hoteles, vuelos y reservas, pero
no constituye por sí sola el contrato vigente para paquetes.

Por esa razón, la ruta de paquetes es configurable:

- `PRICETRAVEL_API_URL`
- `PRICETRAVEL_PACKAGES_PATH`
- `PRICETRAVEL_USERNAME`
- `PRICETRAVEL_PASSWORD`

El adaptador acepta respuestas JSON con colecciones comunes como `Packages`,
`Results` o `Data` y normaliza nombres, imágenes, duración, moneda, precio e
incluidos. Al recibir la documentación de sandbox vigente se ajusta el mapeo
exacto y se agregan los casos de certificación.

Fuentes oficiales:

- https://www.pricetravelconnect.com/
- https://api.pricetravel.com/docs/

Contacto de integración publicado por PriceTravel Connect:
`apiconnect@pricetravel.com`.

## Activación segura

1. Crear un proyecto Self-Service de Amadeus y obtener claves de prueba.
2. Solicitar a PriceTravel acceso B2B, documentación vigente, sandbox,
   credenciales y casos de certificación.
3. Guardar los valores en el administrador de secretos del hosting; nunca en
   GitHub ni en archivos enviados por chat.
4. Probar búsquedas sin datos reales de pasajeros.
5. Validar límites, moneda, impuestos, comisiones, disponibilidad, reintentos y
   política de caché.
6. Habilitar producción solo después de la aprobación comercial y técnica de
   ambos proveedores.
