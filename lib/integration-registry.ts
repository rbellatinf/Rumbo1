export type IntegrationMapping={rumboField:string;providerField:string;direction:"Rumbo → API"|"API → Rumbo"|"Bidireccional";type:string;required?:boolean;rule?:string};
export type IntegrationService={code:string;name:string;method:string;endpoint:string;description:string;mappings:IntegrationMapping[]};
export type IntegrationConfigField={key:string;label:string;kind:"public"|"secret";type?:"text"|"url"|"password";required?:boolean;placeholder?:string;helper?:string};
export type IntegrationDefinition={code:string;name:string;category:string;environment:string;legacy?:boolean;credentialLabel:string;configurationFields?:IntegrationConfigField[];services:IntegrationService[]};

export const integrationRegistry:IntegrationDefinition[]=[
  {code:"rumbo-api",name:"Rumbo API",category:"Core interno",environment:"Production",credentialLabel:"API Key interna",services:[
    {code:"health",name:"Health / conectividad",method:"GET",endpoint:"/health",description:"Salud del API nativo y PostgreSQL.",mappings:[
      {rumboField:"service_status",providerField:"status",direction:"API → Rumbo",type:"string",required:true,rule:"ok / degraded / error"},
      {rumboField:"catalog_source",providerField:"catalog",direction:"API → Rumbo",type:"string",rule:"native"},
    ]},
    {code:"catalog",name:"Catálogo nativo",method:"GET",endpoint:"/api/catalog",description:"Productos y salidas publicadas en el catálogo propio.",mappings:[
      {rumboField:"destination_iata",providerField:"destination",direction:"Rumbo → API",type:"string",required:true,rule:"IATA 3 caracteres"},
      {rumboField:"product.id",providerField:"products[].id",direction:"API → Rumbo",type:"uuid",required:true},
      {rumboField:"price_amount",providerField:"products[].departures[].price_amount",direction:"API → Rumbo",type:"decimal"},
    ]},
    {code:"booking",name:"Crear reserva",method:"POST",endpoint:"/api/bookings",description:"Creación idempotente de reserva contra inventario Rumbo.",mappings:[
      {rumboField:"catalog_product_id",providerField:"catalog_product_id",direction:"Bidireccional",type:"uuid",required:true},
      {rumboField:"catalog_departure_id",providerField:"catalog_departure_id",direction:"Bidireccional",type:"uuid"},
      {rumboField:"contact_email",providerField:"contact_email",direction:"Rumbo → API",type:"email",required:true},
      {rumboField:"reference",providerField:"reference",direction:"API → Rumbo",type:"string",required:true},
    ]},
  ]},
  {code:"airlabs",name:"AirLabs",category:"Aeropuertos",environment:"Production / fallback local",credentialLabel:"API Key",configurationFields:[
    {key:"base_url",label:"Base URL",kind:"public",type:"url",required:true,placeholder:"https://airlabs.co/api/v9"},
    {key:"api_key",label:"API Key",kind:"secret",type:"password",required:true,helper:"Se cifra antes de guardarse y nunca vuelve al navegador completa."},
  ],services:[
    {code:"airport-suggest",name:"Autocomplete aeropuerto",method:"GET",endpoint:"/suggest + /airports",description:"Sugerencias mundiales de ciudades y aeropuertos, incluyendo resolución automática por país.",mappings:[
      {rumboField:"search_text",providerField:"q / country_code",direction:"Rumbo → API",type:"string",required:true,rule:"nombre de ciudad/aeropuerto o país → ISO"},
      {rumboField:"iataCode",providerField:"iata_code / city_code",direction:"API → Rumbo",type:"string",required:true},
      {rumboField:"cityName",providerField:"city / name",direction:"API → Rumbo",type:"string"},
      {rumboField:"countryName",providerField:"country_code",direction:"API → Rumbo",type:"string",rule:"código ISO → nombre localizado"},
    ]},
  ]},
  {code:"pricetravel",name:"PriceTravel",category:"Mayorista / paquetes",environment:"B2B",credentialLabel:"Usuario + contraseña B2B",configurationFields:[
    {key:"api_url",label:"API URL",kind:"public",type:"url",required:true},
    {key:"packages_path",label:"Ruta paquetes",kind:"public",type:"text",required:true,placeholder:"/v1/packages"},
    {key:"username",label:"Usuario",kind:"secret",type:"password",required:true},
    {key:"password",label:"Contraseña",kind:"secret",type:"password",required:true},
  ],services:[
    {code:"package-search",name:"Buscar paquetes",method:"GET",endpoint:"PRICETRAVEL_PACKAGES_PATH",description:"Consulta paquetes/tarifas B2B como fallback del catálogo propio.",mappings:[
      {rumboField:"origin_iata",providerField:"originAirportCode",direction:"Rumbo → API",type:"string",required:true},
      {rumboField:"destination_iata",providerField:"destinationAirportCode",direction:"Rumbo → API",type:"string",required:true},
      {rumboField:"departure_date",providerField:"departureDate",direction:"Rumbo → API",type:"date",required:true,rule:"YYYY-MM-DD"},
      {rumboField:"return_date",providerField:"returnDate",direction:"Rumbo → API",type:"date",required:true,rule:"YYYY-MM-DD"},
      {rumboField:"adults",providerField:"adults",direction:"Rumbo → API",type:"integer",required:true},
      {rumboField:"provider_reference",providerField:"PackageId / Id / Code",direction:"API → Rumbo",type:"string"},
      {rumboField:"price_amount",providerField:"TotalAmount / TotalPrice / Price",direction:"API → Rumbo",type:"decimal"},
      {rumboField:"image_url",providerField:"ImageUrl / HotelImageUri",direction:"API → Rumbo",type:"url"},
    ]},
  ]},
  {code:"izipay",name:"Izipay",category:"Pagos",environment:"MiCuentaWeb / Krypton",credentialLabel:"REST credentials + HMAC",configurationFields:[
    {key:"api_url",label:"API URL",kind:"public",type:"url",required:true,placeholder:"https://api.micuentaweb.pe"},
    {key:"username",label:"Usuario REST",kind:"secret",type:"password",required:true},
    {key:"password",label:"Contraseña REST",kind:"secret",type:"password",required:true},
    {key:"public_key",label:"Public Key",kind:"secret",type:"password"},
    {key:"hmac_key",label:"HMAC SHA-256 Key",kind:"secret",type:"password"},
  ],services:[
    {code:"payment-session",name:"Crear sesión de pago",method:"POST",endpoint:"/api-payment/V4/Charge/CreatePayment",description:"Integración objetivo directa con Izipay. Mientras exista tráfico en Spree / Sesión de pago legacy, el checkout aún no está totalmente desacoplado.",mappings:[
      {rumboField:"booking.reference",providerField:"orderId",direction:"Rumbo → API",type:"string",required:true},
      {rumboField:"total_amount",providerField:"amount",direction:"Rumbo → API",type:"integer",required:true,rule:"monto en unidad mínima"},
      {rumboField:"currency",providerField:"currency",direction:"Rumbo → API",type:"string",required:true},
      {rumboField:"contact_email",providerField:"customer.email",direction:"Rumbo → API",type:"email"},
      {rumboField:"payment_token",providerField:"answer.formToken",direction:"API → Rumbo",type:"string"},
    ]},
    {code:"payment-webhook",name:"Confirmación / webhook",method:"POST",endpoint:"/api/payments/izipay/notification",description:"Confirma estado de pago con validación HMAC.",mappings:[
      {rumboField:"booking.reference",providerField:"orderDetails.orderId",direction:"API → Rumbo",type:"string",required:true},
      {rumboField:"payment_status",providerField:"orderStatus",direction:"API → Rumbo",type:"string",required:true,rule:"normalización a pending/paid/failed"},
    ]},
  ]},
  {code:"cloudflare-r2",name:"Cloudflare R2",category:"Imágenes / objetos",environment:"Production · S3 compatible",credentialLabel:"R2 Access Key",configurationFields:[
    {key:"account_id",label:"Account ID",kind:"public",type:"text",required:true,helper:"ID de la cuenta Cloudflare; forma el endpoint S3 de R2."},
    {key:"bucket",label:"Bucket",kind:"public",type:"text",required:true,placeholder:"rumbo-images"},
    {key:"public_base_url",label:"URL pública",kind:"public",type:"url",required:true,helper:"Dominio público usado para servir las imágenes después de subirlas."},
    {key:"access_key_id",label:"Access Key ID",kind:"secret",type:"password",required:true,helper:"Se genera al crear el R2 API token con Object Read & Write."},
    {key:"secret_access_key",label:"Secret Access Key",kind:"secret",type:"password",required:true,helper:"Se muestra una sola vez en Cloudflare; Rumbo la guarda cifrada."},
  ],services:[
    {code:"image-upload",name:"Subir imagen de producto",method:"PUT",endpoint:"S3 presigned PUT · /{bucket}/{key}",description:"Rumbo API firma una URL S3 temporal restringida al objeto y Content-Type; el storefront sube sin recibir las credenciales R2.",mappings:[
      {rumboField:"image.file",providerField:"PutObject body",direction:"Rumbo → API",type:"binary",required:true},
      {rumboField:"image.content_type",providerField:"Content-Type signed header",direction:"Rumbo → API",type:"string",required:true,rule:"JPG/PNG/WebP/GIF"},
      {rumboField:"storage_key",providerField:"Key",direction:"Bidireccional",type:"string",required:true,rule:"catalog/YYYY/MM/uuid.ext"},
      {rumboField:"image_url",providerField:"public_base_url + Key",direction:"API → Rumbo",type:"url",required:true},
      {rumboField:"bucket_name",providerField:"Bucket",direction:"API → Rumbo",type:"string",rule:"restringido a rumbo-images"},
    ]},
  ]},
  {code:"spree",name:"Spree",category:"Legacy commerce",environment:"Legacy",legacy:true,credentialLabel:"SPREE_API_URL",services:[
    {code:"legacy-catalog",name:"Catálogo legacy",method:"GET",endpoint:"/api/v3/store/products",description:"Fuente temporal durante la salida de Spree. Debe quedar sin dependencia productiva.",mappings:[
      {rumboField:"rumbo_catalog_products",providerField:"spree_products",direction:"API → Rumbo",type:"entity",rule:"migración con lineage"},
      {rumboField:"rumbo_catalog_departures",providerField:"spree_variants + spree_prices",direction:"API → Rumbo",type:"entity"},
      {rumboField:"rumbo_catalog_images",providerField:"active_storage / assets",direction:"API → Rumbo",type:"entity"},
    ]},
    {code:"legacy-payment-session",name:"Sesión de pago legacy",method:"POST",endpoint:"/api/v3/store/booking_requests/{reference}/payment_session",description:"Dependencia productiva todavía existente: Rumbo Storefront solicita a Spree preparar la sesión de pago. Este contador debe llegar a cero antes de retirar Spree.",mappings:[
      {rumboField:"booking.reference",providerField:"booking_requests/{reference}",direction:"Rumbo → API",type:"string",required:true},
      {rumboField:"contact_email",providerField:"email",direction:"Rumbo → API",type:"email",required:true,rule:"no se persiste en logs de observabilidad"},
      {rumboField:"payment_session",providerField:"payment_session",direction:"API → Rumbo",type:"object",required:true},
    ]},
  ]},
];
