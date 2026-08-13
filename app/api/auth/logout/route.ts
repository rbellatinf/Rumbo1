import { NextRequest } from "next/server";
import { accessConfiguration, noStoreJson, providerHeaders, providerUrl, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){const provider=accessConfiguration(),token=request.cookies.get(RUMBO_SESSION_COOKIE)?.value;if(provider&&token){try{await fetch(providerUrl(provider,"/api/access/logout"),{method:"POST",headers:providerHeaders(provider,{token}),cache:"no-store"})}catch{}}const response=noStoreJson({ok:true});response.cookies.delete(RUMBO_SESSION_COOKIE);return response}
