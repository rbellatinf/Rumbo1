import { NextResponse } from "next/server";
import { accessConfiguration, backendMessage, fetchRumboApi, parseJson } from "../../../lib/rumbo-access";
import type { TravelPackage } from "../../../lib/travel-packages";

export const dynamic = "force-dynamic";

type NativeDeparture={id:string;origin_iata?:string|null;departure_date?:string|null;return_date?:string|null;currency?:string;price_amount?:number;capacity?:number|null;available_capacity?:number|null;low_stock_threshold?:number|null};
type NativeProduct={id:string;slug:string;name:string;country?:string;city?:string;duration_label?:string;tag?:string;included?:string[];image_url?:string;from_price_amount?:number;active_departure_count?:number;departures?:NativeDeparture[]};
const money=(amount:number,currency:string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency,maximumFractionDigits:0}).format(amount);

function toPackage(product:NativeProduct):TravelPackage{
 const departures=Array.isArray(product.departures)?product.departures:[],departure=departures[0];
 const amount=Number(departure?.price_amount||product.from_price_amount||0),fromAmount=Number(product.from_price_amount||amount),currency=departure?.currency||"USD";
 const remaining=departure?.available_capacity??departure?.capacity??undefined,threshold=departure?.low_stock_threshold??5,lowStock=typeof remaining==="number"&&remaining>0&&remaining<=threshold,multiple=Number(product.active_departure_count||0)>1;
 return {id:product.slug,destination:product.name,country:product.country||product.city||"",image:product.image_url||"/images/rumbo-hero.jpg",imagePosition:"center",duration:product.duration_label||"Consultar duración",rating:"Nuevo",reviews:multiple?`${product.active_departure_count} salidas`:"Rumbo",price:multiple&&fromAmount>0?`Desde ${money(fromAmount,currency)}`:amount>0?money(amount,currency):"Consultar",previousPrice:"",tag:lowStock?`Últimos ${remaining} cupos`:product.tag||"Rumbo",included:Array.isArray(product.included)?product.included:[],capacity:remaining,departureDate:departure?.departure_date||undefined,returnDate:departure?.return_date||undefined,priceAmount:amount||undefined,currency,bookable:Boolean(departure?.id&&amount>0&&(remaining==null||remaining>0)),variantId:departure?.id,provider:"Rumbo",providerReference:`rumbo:${product.id}`,originIata:departure?.origin_iata||undefined,lowStock,activeDepartureCount:Number(product.active_departure_count||0)};
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
