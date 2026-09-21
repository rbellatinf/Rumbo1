import { NextResponse } from "next/server";
import { accessConfiguration, backendMessage, fetchRumboApi, parseJson } from "../../../lib/rumbo-access";
import type { TravelDepartureOption, TravelPackage, TravelPolicySet, TravelProductDetails, TravelTag } from "../../../lib/travel-packages";

export const dynamic = "force-dynamic";

type NativeDeparture = {
  id:string;
  origin_iata?:string|null;
  departure_date?:string|null;
  return_date?:string|null;
  currency?:string;
  price_amount?:number;
  taxes_amount?:number|null;
  suggested_price_amount?:number|null;
  capacity?:number|null;
  available_capacity?:number|null;
  low_stock_threshold?:number|null;
  sale_deadline?:string|null;
  sale_timezone?:string|null;
  min_passengers_per_booking?:number;
  max_passengers_per_booking?:number;
  confirmation_mode?:"confirmed"|"minimum_required";
  minimum_group_size?:number|null;
  confirmation_label?:string;
  sale_open?:boolean;
  policy_cancellation?:string|null;
  policy_changes?:string|null;
  policy_refund?:string|null;
  policy_no_show?:string|null;
};
type NativeImage={id?:string;url?:string;alt_text?:string|null;sort_order?:number;is_primary?:boolean};
type NativeTag={id?:string;code?:string;name?:string;tag_type?:string;sort_order?:number};
type NativeProduct={
  id:string;slug:string;name:string;short_description?:string|null;description?:string|null;
  country?:string;country_code?:string;city?:string;destination_iata?:string;product_type?:TravelPackage["productType"];
  duration_label?:string;tag?:string;included?:string[];image_url?:string;images?:NativeImage[];
  from_price_amount?:number;active_departure_count?:number;departures?:NativeDeparture[];
  policy_cancellation?:string|null;policy_changes?:string|null;policy_refund?:string|null;policy_no_show?:string|null;
  tags?:NativeTag[];product_details?:TravelProductDetails;
};
const money=(amount:number,currency:string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency,maximumFractionDigits:0}).format(amount);
const productImages=(product:NativeProduct)=>Array.isArray(product.images)?product.images.filter(image=>typeof image?.url==="string"&&image.url.trim()).map(image=>({id:image.id,url:image.url!.trim(),alt:image.alt_text||product.name,sortOrder:Number(image.sort_order)||0,isPrimary:Boolean(image.is_primary)})):[];
const productPolicies=(product:NativeProduct):TravelPolicySet=>({cancellation:product.policy_cancellation,changes:product.policy_changes,refund:product.policy_refund,noShow:product.policy_no_show});
const departurePolicies=(product:NativeProduct,departure:NativeDeparture):TravelPolicySet=>({
  cancellation:departure.policy_cancellation??product.policy_cancellation,
  changes:departure.policy_changes??product.policy_changes,
  refund:departure.policy_refund??product.policy_refund,
  noShow:departure.policy_no_show??product.policy_no_show,
});
const departureOption=(product:NativeProduct,departure:NativeDeparture):TravelDepartureOption=>({
  id:departure.id,
  originIata:departure.origin_iata||undefined,
  departureDate:departure.departure_date||undefined,
  returnDate:departure.return_date||undefined,
  currency:departure.currency||"USD",
  priceAmount:Number(departure.price_amount||0),
  taxesAmount:departure.taxes_amount??null,
  suggestedPriceAmount:departure.suggested_price_amount??null,
  capacity:departure.capacity??null,
  availableCapacity:departure.available_capacity??null,
  lowStockThreshold:departure.low_stock_threshold??5,
  saleDeadline:departure.sale_deadline??null,
  saleTimezone:departure.sale_timezone??null,
  minPassengers:Number(departure.min_passengers_per_booking||1),
  maxPassengers:Number(departure.max_passengers_per_booking||18),
  confirmationMode:departure.confirmation_mode||"confirmed",
  minimumGroupSize:departure.minimum_group_size??null,
  confirmationLabel:departure.confirmation_label,
  saleOpen:departure.sale_open!==false,
  policies:departurePolicies(product,departure),
});
const productTags=(product:NativeProduct):TravelTag[]=>Array.isArray(product.tags)?product.tags.filter(tag=>Boolean(tag?.name)).map(tag=>({id:tag.id,code:tag.code,name:String(tag.name),type:tag.tag_type,sortOrder:Number(tag.sort_order)||0})):[];
function toPackage(product:NativeProduct):TravelPackage{
  const departures=(Array.isArray(product.departures)?product.departures:[]).map(item=>departureOption(product,item));
  const departure=departures[0];
  const amount=Number(departure?.priceAmount||product.from_price_amount||0),fromAmount=Number(product.from_price_amount||amount),currency=departure?.currency||"USD";
  const remaining=departure?.availableCapacity??departure?.capacity??undefined,threshold=departure?.lowStockThreshold??5,lowStock=typeof remaining==="number"&&remaining>0&&remaining<=threshold,multiple=Number(product.active_departure_count||0)>1;
  const images=productImages(product),image=images[0]?.url||product.image_url||"/images/rumbo-hero.jpg";
  const confirmation=departure?.confirmationLabel||(departure?.confirmationMode==="minimum_required"?"Sujeta a mínimo de pasajeros":"Salida confirmada");
  return {
    id:product.slug,destination:product.name,country:product.country||product.city||"",countryCode:product.country_code||undefined,
    destinationIata:product.destination_iata||undefined,image,images:images.length?images:undefined,imagePosition:"center",
    duration:product.duration_label||"Consultar duración",rating:confirmation,reviews:multiple?`${product.active_departure_count} salidas`:"Rumbo",
    price:multiple&&fromAmount>0?`Desde ${money(fromAmount,currency)}`:amount>0?money(amount,currency):"Consultar",previousPrice:"",
    tag:lowStock?`Últimos ${remaining} cupos`:product.tag||confirmation,included:Array.isArray(product.included)?product.included:[],
    capacity:remaining,departureDate:departure?.departureDate,returnDate:departure?.returnDate,priceAmount:amount||undefined,currency,
    bookable:Boolean(departure?.id&&amount>0&&departure.saleOpen!==false&&(remaining==null||remaining>0)),variantId:departure?.id,
    provider:"Rumbo",providerReference:`rumbo:${product.id}`,originIata:departure?.originIata,lowStock,
    activeDepartureCount:Number(product.active_departure_count||0),productType:product.product_type||"package",
    shortDescription:product.short_description||undefined,description:product.description||undefined,policies:productPolicies(product),
    departures,tags:productTags(product),details:product.product_details||undefined,
  };
}

export async function GET(){
  const provider=accessConfiguration();
  if(!provider)return NextResponse.json({mode:"error",packages:[],message:"Rumbo API no está configurada."},{status:503,headers:{"Cache-Control":"no-store"}});
  try{
    const response=await fetchRumboApi(provider,"/api/catalog");
    const payload=await parseJson(response) as {products?:NativeProduct[]};
    if(!response.ok||!Array.isArray(payload.products))return NextResponse.json({mode:"error",packages:[],message:backendMessage(payload as Record<string,unknown>,"No pudimos leer el catálogo nativo de Rumbo.")},{status:response.ok?502:response.status,headers:{"Cache-Control":"no-store"}});
    return NextResponse.json({mode:"live",packages:payload.products.map(toPackage),message:`Catálogo propio de Rumbo conectado a PostgreSQL (${payload.products.length} producto${payload.products.length===1?"":"s"}).`},{headers:{"Cache-Control":"private, max-age=30"}});
  }catch(error){return NextResponse.json({mode:"error",packages:[],message:error instanceof Error?`Rumbo API no respondió: ${error.message}`:"Rumbo API no respondió."},{status:502,headers:{"Cache-Control":"no-store"}})}
}
