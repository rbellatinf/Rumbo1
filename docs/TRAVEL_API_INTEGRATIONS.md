# Integraciones de viaje: AirLabs y PriceTravel

## Diseño

El navegador nunca se conecta directamente con los proveedores ni recibe sus
credenciales.

1. El usuario escribe una ciudad o código IATA.
2. `/api/airports` consulta AirLabs y normaliza la respuesta.
3. El usuario selecciona origen, destino y fechas.
4. `/api/packages` consulta PriceTravel y transforma su respuesta al formato
   interno `TravelPackage`.
5. La interfaz muestra si los datos son reales o demostrativos.

La separación por adaptadores permite cambiar el contrato de un proveedor sin
reescribir la experiencia de compra.

## AirLabs

El conector usa la API REST Name Suggestion para autocompletar ciudades,
países y aeropuertos. La clave se guarda solo en el entorno del servidor y
nunca llega al navegador.

Variables:

- `AIRLABS_API_BASE_URL`
- `AIRLABS_API_KEY`

La URL base es `https://airlabs.co/api/v9`. Sin clave o si el proveedor no
responde, Rumbo utiliza un catálogo local de respaldo identificado como tal.

Documentación oficial:

- https://airlabs.co/docs/suggest
- https://airlabs.co/docs/airports

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

1. Crear una cuenta de AirLabs y obtener una clave de prueba.
2. Solicitar a PriceTravel acceso B2B, documentación vigente, sandbox,
   credenciales y casos de certificación.
3. Guardar los valores en el administrador de secretos del hosting; nunca en
   GitHub ni en archivos enviados por chat.
4. Probar búsquedas sin datos reales de pasajeros.
5. Validar límites, moneda, impuestos, comisiones, disponibilidad, reintentos y
   política de caché.
6. Habilitar producción solo después de validar las condiciones comerciales de
   AirLabs y completar la aprobación técnica de PriceTravel.
