export type IntegrationMapping={rumboField:string;providerField:string;direction:"Rumbo → API"|"API → Rumbo"|"Bidireccional";type:string;required?:boolean;rule?:string};
export type IntegrationService={code:string;name:string;method:string;endpoint:string;description:string;mappings:IntegrationMapping[]};
export type IntegrationDefinition={code:string;name:string;category:string;environment:string;legacy?:boolean;credentialLabel:string;services:IntegrationService[]};

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
  {code:"airlabs",name:"AirLabs",category:"Aeropuertos",environment:"Production / fallback local",credentialLabel:"AIRLABS_API_KEY",services:[
    {code:"airport-suggest",name:"Autocomplete aeropuerto",method:"GET",endpoint:"/suggest",description:"Sugerencias mundiales de ciudades y aeropuertos.",mappings:[
      {rumboField:"search_text",providerField:"q",direction:"Rumbo → API",type:"string",required:true,rule:"mínimo 3 caracteres para consulta live"},
      {rumboField:"iataCode",providerField:"iata_code / city_code",direction:"API → Rumbo",type:"string",required:true},
      {rumboField:"cityName",providerField:"city / name",direction:"API → Rumbo",type:"string"},
      {rumboField:"countryName",providerField:"country_code",direction:"API → Rumbo",type:"string",rule:"código ISO → nombre localizado"},
    ]},
  ]},
  {code:"pricetravel",name:"PriceTravel",category:"Mayorista / paquetes",environment:"B2B",credentialLabel:"Usuario + contraseña B2B",services:[
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
  {code:"izipay",name:"Izipay",category:"Pagos",environment:"MiCuentaWeb / Krypton",credentialLabel:"REST credentials + HMAC",services:[
    {code:"payment-session",name:"Crear sesión de pago",method:"POST",endpoint:"/api-payment/V4/Charge/CreatePayment",description:"Genera el formulario/token de pago para una reserva.",mappings:[
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
  {code:"cloudflare-r2",name:"Cloudflare R2",category:"Imágenes / objetos",environment:"Production",credentialLabel:"Cloudflare API Token",services:[
    {code:"image-upload",name:"Subir imagen de producto",method:"PUT",endpoint:"/r2/buckets/rumbo-images/objects/{key}",description:"Almacena imágenes del catálogo y devuelve referencia pública.",mappings:[
      {rumboField:"image.file",providerField:"body",direction:"Rumbo → API",type:"binary",required:true},
      {rumboField:"storage_key",providerField:"object key",direction:"Bidireccional",type:"string",required:true},
      {rumboField:"image_url",providerField:"public domain + object key",direction:"API → Rumbo",type:"url",required:true},
      {rumboField:"bucket_name",providerField:"rumbo-images",direction:"API → Rumbo",type:"string",rule:"constante"},
    ]},
  ]},
  {code:"spree",name:"Spree",category:"Legacy commerce",environment:"Legacy",legacy:true,credentialLabel:"SPREE_API_URL",services:[
    {code:"legacy-catalog",name:"Catálogo legacy",method:"GET",endpoint:"/api/v3/store/products",description:"Fuente temporal durante la salida de Spree. Debe quedar sin dependencia productiva.",mappings:[
      {rumboField:"rumbo_catalog_products",providerField:"spree_products",direction:"API → Rumbo",type:"entity",rule:"migración con lineage"},
      {rumboField:"rumbo_catalog_departures",providerField:"spree_variants + spree_prices",direction:"API → Rumbo",type:"entity"},
      {rumboField:"rumbo_catalog_images",providerField:"active_storage / assets",direction:"API → Rumbo",type:"entity"},
    ]},
  ]},
];
