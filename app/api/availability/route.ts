import { NextRequest } from "next/server";
import { parseOfferAvailability } from "../../../lib/booking-requests";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
 const productId=request.nextUrl.searchParams.get("productId")?.trim();
 const departureDate=request.nextUrl.searchParams.get("departureDate")?.trim();
 const returnDate=request.nextUrl.searchParams.get("returnDate")?.trim();
 if(!productId?.startsWith("rumbo:")||!departureDate||!returnDate)return noStoreJson({message:"La disponibilidad solo se consulta sobre productos nativos de Rumbo."},422);
 const nativeId=productId.slice(6),provider=accessConfiguration();
 if(!provider)return noStoreJson({message:"Rumbo API no está configurada."},503);
 try{
  const response=await fetch(`${provider.apiUrl}/api/catalog`,{headers:providerHeaders(provider),cache:"no-store"});
  const payload=await parseJson(response) as {products?:Array<Record<string,unknown>>};
  if(!response.ok)return noStoreJson({message:backendMessage(payload as Record<string,unknown>,"No pudimos consultar el catálogo de Rumbo.")},response.status);
  const product=payload.products?.find(item=>String(item.id)===nativeId);
  if(!product)return noStoreJson({message:"La oferta ya no está disponible."},404);
  const departures=Array.isArray(product.departures)?product.departures as Array<Record<string,unknown>>:[];
  const departure=departures.find(item=>String(item.departure_date||"")===departureDate&&String(item.return_date||"")===returnDate)||departures[0];
  if(!departure)return noStoreJson({message:"No encontramos una salida activa para esas fechas."},404);
  const available=departure.available_capacity==null?999999:Number(departure.available_capacity),capacity=departure.capacity==null?available:Number(departure.capacity),amount=Number(departure.price_amount||0),currency=String(departure.currency||"USD");
  const parsed=parseOfferAvailability({product_id:productId,variant_id:String(departure.id||""),departure_date:String(departure.departure_date||departureDate),return_date:String(departure.return_date||returnDate),total_capacity:capacity,remaining_capacity:available,price_amount:amount,price_display:`${currency} ${amount.toFixed(2)}`,currency,bookable:Boolean(departure.id&&amount>0&&available>0),hold_minutes:15});
  return noStoreJson({availability:parsed});
 }catch(error){return noStoreJson({message:error instanceof Error?`Rumbo API no respondió: ${error.message}`:"Rumbo API no respondió."},502)}
}
