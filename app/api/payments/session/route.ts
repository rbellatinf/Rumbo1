import { NextRequest } from "next/server";
import { parseBookingRecord } from "../../../../lib/booking-requests";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders } from "../../../../lib/rumbo-access";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
 let body:Record<string,unknown>;try{body=await request.json() as Record<string,unknown>}catch{return noStoreJson({message:"La solicitud de pago no es válida."},400)}
 const reference=typeof body.reference==="string"?body.reference.trim().toUpperCase():"",email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 if(!/^RUM-\d{8}-[A-F0-9]{6}$/.test(reference)||!email)return noStoreJson({message:"Ingresa una referencia y un correo válidos."},422);
 const provider=accessConfiguration();if(!provider)return noStoreJson({message:"Rumbo API no está configurada."},503);
 try{
  const upstream=await fetch(`${provider.apiUrl}/api/payments/session`,{method:"POST",headers:providerHeaders(provider,{json:true}),body:JSON.stringify({reference,email}),cache:"no-store"});
  const payload=await parseJson(upstream);
  if(!upstream.ok)return noStoreJson({message:backendMessage(payload,"No pudimos preparar el pago de esta reserva.")},upstream.status);
  return noStoreJson({booking:parseBookingRecord(payload)});
 }catch(error){return noStoreJson({message:error instanceof Error?`Rumbo API no respondió: ${error.message}`:"Rumbo API no respondió."},502)}
}
