import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

function config(request: NextRequest){
  const provider=accessConfiguration();
  const token=request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  return {provider,token};
}

export async function GET(request:NextRequest){
  const {provider,token}=config(request);
  if(!provider||provider.kind!=="rumbo") return noStoreJson({message:"Rumbo API no está conectada."},503);
  if(!token&&!demoMode()) return noStoreJson({message:"No hay una sesión administrativa activa."},401);
  try{
    const upstream=await fetch(`${provider.apiUrl}/api/admin/internal-users`,{headers:providerHeaders(provider,{token,demoRole:"wholesaler_admin"}),cache:"no-store"});
    const payload=await parseJson(upstream);
    if(!upstream.ok) return noStoreJson({message:backendMessage(payload,"No pudimos cargar los usuarios Rumbo.")},upstream.status||502);
    return noStoreJson(payload);
  }catch{return noStoreJson({message:"Rumbo API no respondió."},502)}
}

export async function POST(request:NextRequest){
  const {provider,token}=config(request);
  if(!provider||provider.kind!=="rumbo") return noStoreJson({message:"Rumbo API no está conectada."},503);
  if(!token&&!demoMode()) return noStoreJson({message:"No hay una sesión administrativa activa."},401);
  let body:Record<string,unknown>;try{body=await request.json()}catch{return noStoreJson({message:"Formulario inválido."},400)}
  const action=String(body.action||"");
  const path=action==="internal_user"?"/api/admin/internal-users":action==="agency"?"/api/admin/agencies":action==="agency_person"?"/api/admin/agency-people":"";
  if(!path)return noStoreJson({message:"Acción inválida."},422);
  try{
    const upstream=await fetch(`${provider.apiUrl}${path}`,{method:"POST",headers:providerHeaders(provider,{token,json:true,demoRole:"wholesaler_admin"}),body:JSON.stringify(body),cache:"no-store"});
    const payload=await parseJson(upstream);
    if(!upstream.ok)return noStoreJson({message:backendMessage(payload,"No pudimos completar la operación.")},upstream.status||502);
    return noStoreJson(payload,upstream.status);
  }catch{return noStoreJson({message:"Rumbo API no respondió."},502)}
}
