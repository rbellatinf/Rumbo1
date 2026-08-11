import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request:NextRequest){
  const provider=accessConfiguration();
  if(!provider||provider.kind!=="rumbo") return noStoreJson({message:"Rumbo API no está conectada."},503);
  const token=request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if(!token)return noStoreJson({message:"No hay una sesión de agencia activa."},401);
  let body:Record<string,unknown>;try{body=await request.json()}catch{return noStoreJson({message:"Formulario inválido."},400)}
  try{
    const upstream=await fetch(`${provider.apiUrl}/api/retailer-admin/people`,{method:"POST",headers:providerHeaders(provider,{token,json:true}),body:JSON.stringify(body),cache:"no-store"});
    const payload=await parseJson(upstream);
    if(!upstream.ok)return noStoreJson({message:backendMessage(payload,"No pudimos crear la persona.")},upstream.status||502);
    return noStoreJson(payload,upstream.status);
  }catch{return noStoreJson({message:"Rumbo API no respondió."},502)}
}
