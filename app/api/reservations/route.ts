import { NextRequest } from "next/server";
import { BookingValidationError, parseBookingInput, parseBookingRecord, toBookingApiPayload } from "../../../lib/booking-requests";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";
const REFERRAL_COOKIE="rumbo_referral";

async function validAutomaticReferral(code:string|undefined){
 if(!code)return undefined;const provider=accessConfiguration();if(!provider)return undefined;
 try{const response=await fetch(`${provider.apiUrl}/api/referrals/${encodeURIComponent(code)}`,{headers:providerHeaders(provider),cache:"no-store"});return response.ok?code:undefined}catch{return undefined}
}
function nativeProductId(product:{id:string;providerReference?:string}){
 if(product.providerReference?.startsWith("rumbo:"))return product.providerReference.slice(6).trim()||null;
 if(product.id.startsWith("rumbo:"))return product.id.slice(6).trim()||null;
 return null;
}

export async function POST(request:NextRequest){
 let raw:unknown;try{raw=await request.json()}catch{return noStoreJson({message:"El formulario no contiene datos válidos."},400)}
 try{
  const source=raw&&typeof raw==="object"&&!Array.isArray(raw)?{...(raw as Record<string,unknown>)}:{};
  const captured=request.cookies.get(REFERRAL_COOKIE)?.value?.trim().toUpperCase();if(captured)source.referralCode=await validAutomaticReferral(captured);
  const booking=parseBookingInput(source),nativeReference=nativeProductId(booking.product),provider=accessConfiguration();
  if(!provider||!nativeReference)return noStoreJson({message:"Solo se pueden reservar productos nativos del catálogo Rumbo."},422);
  const apiPayload=toBookingApiPayload(booking) as Record<string,unknown>;
  apiPayload.catalog_product_id=nativeReference;
  apiPayload.catalog_departure_id=booking.product.variantId;
  apiPayload.rumbo_product_id=nativeReference;
  const token=request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  const upstream=await fetch(`${provider.apiUrl}/api/bookings`,{method:"POST",headers:providerHeaders(provider,{json:true,token}),body:JSON.stringify(apiPayload),cache:"no-store"});
  const payload=await parseJson(upstream);
  if(!upstream.ok)return noStoreJson({message:backendMessage(payload,"No pudimos crear la reserva en Rumbo.")},upstream.status===409?409:upstream.status>=400&&upstream.status<500?422:502);
  return noStoreJson({booking:parseBookingRecord(payload)},upstream.status);
 }catch(error){if(error instanceof BookingValidationError)return noStoreJson({message:error.message,fields:error.fields},422);return noStoreJson({message:error instanceof Error?error.message:"El servicio de reservas no respondió."},502)}
}

export async function GET(request:NextRequest){
 const reference=request.nextUrl.searchParams.get("reference")?.trim().toUpperCase(),email=request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
 if(!reference||!/^RUM-\d{8}-[A-F0-9]{6}$/.test(reference)||!email)return noStoreJson({message:"Ingresa una referencia y un correo válidos."},422);
 const provider=accessConfiguration();if(!provider)return noStoreJson({message:"Rumbo API no está configurada."},503);
 try{
  const upstream=await fetch(`${provider.apiUrl}/api/bookings/${encodeURIComponent(reference)}?email=${encodeURIComponent(email)}`,{headers:providerHeaders(provider),cache:"no-store"});
  const payload=await parseJson(upstream);
  if(!upstream.ok)return noStoreJson({message:backendMessage(payload,upstream.status===404?"No encontramos una reserva con esos datos.":"No pudimos consultar la reserva.")},upstream.status===404?404:upstream.status);
  return noStoreJson({booking:parseBookingRecord(payload)});
 }catch(error){return noStoreJson({message:error instanceof Error?`Rumbo API no respondió: ${error.message}`:"Rumbo API no respondió."},502)}
}
