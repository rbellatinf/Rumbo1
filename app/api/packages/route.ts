import { NextRequest, NextResponse } from "next/server";
import { accessConfiguration, backendMessage, fetchRumboApi, parseJson } from "../../../lib/rumbo-access";
import { PriceTravelError, searchPriceTravelPackages } from "../../../lib/pricetravel-packages";
import type { TravelDepartureOption, TravelPackage, TravelPolicySet, TravelProductDetails, TravelTag } from "../../../lib/travel-packages";

export const dynamic="force-dynamic";
const IATA_CODE=/^[A-Z]{3}$/,ISO_DATE=/^\d{4}-\d{2}-\d{2}$/,FLEX_DAYS=3;
type NativeDeparture={id:string;origin_iata?:string|null;departure_date?:string|null;return_date?:string|null;currency?:string;price_amount?:number;taxes_amount?:number|null;suggested_price_amount?:number|null;capacity?:number|null;available_capacity?:number|null;low_stock_threshold?:number|null;sale_deadline?:string|null;sale_timezone?:string|null;sale_open?:boolean;min_passengers_per_booking?:number;max_passengers_per_booking?:number;confirmation_mode?:"confirmed"|"minimum_required";minimum_group_size?:number|null;confirmation_label?:string;policy_cancellation?:string|null;policy_changes?:string|null;policy_refund?:string|null;policy_no_show?:string|null};
type NativeImage={id?:string;url?:string;alt_text?:string|null;sort_order?:number;is_primary?:boolean};
type NativeTag={id?:string;code?:string;name?:string;tag_type?:string;sort_order?:number};
type NativeProduct={id:string;slug:string;name:string;short_description?:string|null;description?:string|null;country?:string;country_code?:string;city?:string;destination_iata?:string;product_type?:TravelPackage["productType"];duration_label?:string;tag?:string;included?:string[];image_url?:string;images?:NativeImage[];active_departure_count?:number;departures?:NativeDeparture[];policy_cancellation?:string|null;policy_changes?:string|null;policy_refund?:string|null;policy_no_show?:string|null;tags?:NativeTag[];product_details?:TravelProductDetails};
const money=(amount:number,currency:string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency,maximumFractionDigits:0}).format(amount);
const dayDiff=(a:string,b:string)=>Math.round(Math.abs(Date.parse(a)-Date.parse(b))/86_400_000);
const productImages=(product:NativeProduct)=>Array.isArray(product.images)?product.images.filter(image=>typeof image?.url==="string"&&image.url.trim()).map(image=>({id:image.id,url:image.url!.trim(),alt:image.alt_text||product.name,sortOrder:Number(image.sort_order)||0,isPrimary:Boolean(image.is_primary)})):[];
const productPolicies=(p:NativeProduct):TravelPolicySet=>({cancellation:p.policy_cancellation,changes:p.policy_changes,refund:p.policy_refund,noShow:p.policy_no_show});
const option=(p:NativeProduct,d:NativeDeparture):TravelDepartureOption=>({id:d.id,originIata:d.origin_iata||undefined,departureDate:d.departure_date||undefined,returnDate:d.return_date||undefined,currency:d.currency||"USD",priceAmount:Number(d.price_amount||0),taxesAmount:d.taxes_amount??null,suggestedPriceAmount:d.suggested_price_amount??null,capacity:d.capacity??null,availableCapacity:d.available_capacity??null,lowStockThreshold:d.low_stock_threshold??5,saleDeadline:d.sale_deadline??null,saleTimezone:d.sale_timezone??null,minPassengers:Number(d.min_passengers_per_booking||1),maxPassengers:Number(d.max_passengers_per_booking||18),confirmationMode:d.confirmation_mode||"confirmed",minimumGroupSize:d.minimum_group_size??null,confirmationLabel:d.confirmation_label,saleOpen:d.sale_open!==false,policies:{cancellation:d.policy_cancellation??p.policy_cancellation,changes:d.policy_changes??p.policy_changes,refund:d.policy_refund??p.policy_refund,noShow:d.policy_no_show??p.policy_no_show}});
function compatibleDepartures(product:NativeProduct,input:{originIata:string;departureDate:string;returnDate:string;travellers:number}){
  return (Array.isArray(product.departures)?product.departures:[]).filter(d=>{
    if(!d.id||!d.departure_date||!d.return_date)return false;
    if(d.origin_iata&&d.origin_iata!==input.originIata)return false;
    if(d.sale_open===false||(d.sale_deadline&&Date.parse(d.sale_deadline)<Date.now()))return false;
    if(dayDiff(d.departure_date,input.departureDate)>FLEX_DAYS||dayDiff(d.return_date,input.returnDate)>FLEX_DAYS)return false;
    const min=Number(d.min_passengers_per_booking||1),max=Number(d.max_passengers_per_booking||18);
    if(input.travellers<min||input.travellers>max)return false;
    return d.available_capacity==null||d.available_capacity>=input.travellers;
  }).sort((a,b)=>{
    const ad=dayDiff(a.departure_date!,input.departureDate)+dayDiff(a.return_date!,input.returnDate),bd=dayDiff(b.departure_date!,input.departureDate)+dayDiff(b.return_date!,input.returnDate);
    return ad!==bd?ad-bd:Number(a.price_amount||0)-Number(b.price_amount||0);
  });
}
function nativePackage(product:NativeProduct,matches:NativeDeparture[]):TravelPackage{
  const selected=matches[0],departures=matches.map(d=>option(product,d)),amount=Number(selected.price_amount||0),currency=selected.currency||"USD";
  const prices=matches.map(d=>Number(d.price_amount||0)).filter(n=>n>0),fromAmount=prices.length?Math.min(...prices):amount;
  const remaining=selected.available_capacity??selected.capacity??undefined,threshold=selected.low_stock_threshold??5,lowStock=typeof remaining==="number"&&remaining>0&&remaining<=threshold,multiple=matches.length>1;
  const confirmation=selected.confirmation_label||(selected.confirmation_mode==="minimum_required"?"Sujeta a mínimo de pasajeros":"Salida confirmada"),images=productImages(product),image=images[0]?.url||product.image_url||"/images/rumbo-hero.jpg";
  const tags:TravelTag[]=Array.isArray(product.tags)?product.tags.filter(t=>Boolean(t.name)).map(t=>({id:t.id,code:t.code,name:String(t.name),type:t.tag_type,sortOrder:Number(t.sort_order)||0})):[];
  return{id:product.slug,destination:product.name,country:product.country||product.city||"",countryCode:product.country_code||undefined,destinationIata:product.destination_iata||undefined,image,images:images.length?images:undefined,imagePosition:"center",duration:product.duration_label||"Consultar duración",rating:confirmation,reviews:multiple?`${matches.length} salidas compatibles`:"Rumbo",price:multiple?`Desde ${money(fromAmount,currency)}`:amount>0?money(amount,currency):"Consultar",previousPrice:"",tag:lowStock?`Últimos ${remaining} cupos`:product.tag||confirmation,included:Array.isArray(product.included)?product.included:[],capacity:remaining,departureDate:selected.departure_date||undefined,returnDate:selected.return_date||undefined,priceAmount:amount||undefined,currency,bookable:Boolean(selected.id&&amount>0&&selected.sale_open!==false&&(remaining==null||remaining>0)),variantId:selected.id,provider:"Rumbo",providerReference:`rumbo:${product.id}`,originIata:selected.origin_iata||undefined,lowStock,activeDepartureCount:matches.length,productType:product.product_type||"package",shortDescription:product.short_description||undefined,description:product.description||undefined,policies:productPolicies(product),departures,tags,details:product.product_details||undefined};
}
async function searchNativeCatalog(input:{originIata:string;destinationIata:string;departureDate:string;returnDate:string;travellers:number}){
  const provider=accessConfiguration();if(!provider)throw new Error("Rumbo API no está configurada.");
  const response=await fetchRumboApi(provider,`/api/catalog?destination=${encodeURIComponent(input.destinationIata)}`);
  const payload=await parseJson(response) as {products?:NativeProduct[]};
  if(!response.ok||!Array.isArray(payload.products))throw new Error(backendMessage(payload as Record<string,unknown>,`Rumbo API devolvió HTTP ${response.status}.`));
  return payload.products.filter(p=>p.destination_iata===input.destinationIata).map(product=>({product,matches:compatibleDepartures(product,input)})).filter(entry=>entry.matches.length>0).map(({product,matches})=>nativePackage(product,matches));
}

export async function GET(request:NextRequest){
  const p=request.nextUrl.searchParams,originIata=(p.get("origin")||"").toUpperCase(),destinationIata=(p.get("destination")||"").toUpperCase(),destinationName=(p.get("destinationName")||destinationIata).trim().slice(0,100),departureDate=p.get("departureDate")||"",returnDate=p.get("returnDate")||"",adults=Number(p.get("adults")||"2"),children=Number(p.get("children")||"0"),travellers=adults+children;
  if(!IATA_CODE.test(originIata)||!IATA_CODE.test(destinationIata)||!ISO_DATE.test(departureDate)||!ISO_DATE.test(returnDate)||!Number.isInteger(adults)||!Number.isInteger(children)||adults<1||children<0||travellers>18||Date.parse(returnDate)<=Date.parse(departureDate))return NextResponse.json({mode:"error",provider:"Rumbo",packages:[],message:"Selecciona aeropuertos válidos, fechas consecutivas y entre 1 y 18 viajeros."},{status:400});
  let nativeError="";
  try{
    const native=await searchNativeCatalog({originIata,destinationIata,departureDate,returnDate,travellers});
    if(native.length)return NextResponse.json({mode:"live",provider:"Rumbo",packages:native,message:`Encontramos ${native.length} opción${native.length===1?"":"es"} propia${native.length===1?"":"s"} de Rumbo para ${destinationName}, considerando hasta ±${FLEX_DAYS} días.`},{headers:{"Cache-Control":"private, max-age=15"}});
  }catch(error){nativeError=error instanceof Error?error.message:"El catálogo propio no respondió."}
  try{
    const result=await searchPriceTravelPackages({originIata,destinationIata,destinationName,departureDate,returnDate,adults,currency:"USD"});
    const prefix=nativeError?`El catálogo propio de Rumbo no respondió temporalmente. `:`No encontramos una salida propia de Rumbo dentro de ±${FLEX_DAYS} días. `;
    return NextResponse.json({...result,message:`${prefix}${result.message}`},{headers:{"Cache-Control":"private, max-age=30"}});
  }catch(error){
    if(error instanceof PriceTravelError){const detail=nativeError?`Catálogo Rumbo: ${nativeError}. PriceTravel: ${error.message}`:`No hay inventario propio compatible y PriceTravel falló: ${error.message}`;return NextResponse.json({mode:"error",provider:"PriceTravel",packages:[],message:detail},{status:error.status,headers:{"Cache-Control":"no-store"}})}
    return NextResponse.json({mode:"error",provider:"Rumbo",packages:[],message:nativeError||(error instanceof Error?error.message:"No pudimos completar la búsqueda.")},{status:502,headers:{"Cache-Control":"no-store"}})
  }
}
