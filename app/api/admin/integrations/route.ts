import { NextRequest } from "next/server";
import { integrationRegistry } from "@/lib/integration-registry";
import {
  accessConfiguration,
  demoMode,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "@/lib/rumbo-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProbeResult={success:boolean;http_status:number|null;duration_ms:number;message:string;details?:Record<string,unknown>};

function configuration(code:string){
  if(code==="rumbo-api"){
    const provider=accessConfiguration();
    return {configured:Boolean(provider&&provider.kind==="rumbo"),baseUrl:provider&&provider.kind==="rumbo"?provider.apiUrl:"",credential:"RUMBO_API_KEY"};
  }
  if(code==="airlabs")return {configured:Boolean(process.env.AIRLABS_API_KEY),baseUrl:(process.env.AIRLABS_API_BASE_URL||"https://airlabs.co/api/v9").replace(/\/$/,""),credential:"AIRLABS_API_KEY"};
  if(code==="pricetravel")return {configured:Boolean(process.env.PRICETRAVEL_API_URL&&process.env.PRICETRAVEL_USERNAME&&process.env.PRICETRAVEL_PASSWORD&&process.env.PRICETRAVEL_PACKAGES_PATH),baseUrl:(process.env.PRICETRAVEL_API_URL||"").replace(/\/$/,""),credential:"B2B credentials"};
  if(code==="izipay")return {configured:Boolean(process.env.IZIPAY_API_URL&&process.env.IZIPAY_USERNAME&&process.env.IZIPAY_PASSWORD),baseUrl:(process.env.IZIPAY_API_URL||"https://api.micuentaweb.pe").replace(/\/$/,""),credential:"REST credentials"};
  if(code==="cloudflare-r2")return {configured:Boolean(process.env.CLOUDFLARE_API_TOKEN),baseUrl:"https://api.cloudflare.com/client/v4",credential:"CLOUDFLARE_API_TOKEN"};
  if(code==="spree")return {configured:Boolean(process.env.SPREE_API_URL),baseUrl:(process.env.SPREE_API_URL||"").replace(/\/$/,""),credential:"SPREE_API_URL"};
  return {configured:false,baseUrl:"",credential:""};
}

function safeHost(value:string){try{return value?new URL(value).host:"—"}catch{return value||"—"}}

async function timedFetch(url:string,init:RequestInit={},timeoutMs=6000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);const started=Date.now();
  try{const response=await fetch(url,{...init,signal:controller.signal,cache:"no-store"});return {response,duration:Date.now()-started}}
  finally{clearTimeout(timer)}
}

async function probe(integration:string,service:string):Promise<ProbeResult>{
  const started=Date.now(),cfg=configuration(integration);
  if(!cfg.configured)return {success:false,http_status:null,duration_ms:0,message:"La integración no tiene todas las credenciales/configuración requeridas en este servicio."};
  try{
    if(integration==="rumbo-api"){
      const {response,duration}=await timedFetch(`${cfg.baseUrl}/health`);
      const payload=await response.json().catch(()=>({}));
      const suffix=service==="health"?"":` Prueba no destructiva de conectividad para ${service}; no se crean datos.`;
      return {success:response.ok,http_status:response.status,duration_ms:duration,message:(response.ok?"Rumbo API respondió correctamente.":"Rumbo API respondió con error.")+suffix,details:{status:(payload as Record<string,unknown>)?.status||response.status,test_mode:"non_destructive"}};
    }
    if(integration==="airlabs"){
      const query=new URLSearchParams({q:"LIM",lang:"es",api_key:String(process.env.AIRLABS_API_KEY||""),_fields:"name,iata_code,city,country_code"});
      const {response,duration}=await timedFetch(`${cfg.baseUrl}/suggest?${query.toString()}`,{headers:{accept:"application/json"}});
      const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
      const success=response.ok&&!payload.error;
      const source=(payload.response&&typeof payload.response==="object"?payload.response:payload) as Record<string,unknown>;
      const results=Array.isArray(source.airports)?source.airports.length:0;
      return {success,http_status:response.status,duration_ms:duration,message:success?"AirLabs respondió correctamente.":"AirLabs rechazó la prueba de conectividad.",details:{results,test_query:"LIM"}};
    }
    if(integration==="pricetravel"){
      const path=String(process.env.PRICETRAVEL_PACKAGES_PATH||"");const endpoint=path.startsWith("/")?path:`/${path}`;
      const authorization=Buffer.from(`${process.env.PRICETRAVEL_USERNAME}:${process.env.PRICETRAVEL_PASSWORD}`).toString("base64");
      const {response,duration}=await timedFetch(`${cfg.baseUrl}${endpoint}`,{headers:{accept:"application/json",authorization:`Basic ${authorization}`}});
      const success=response.status<500&&response.status!==401&&response.status!==403;
      return {success,http_status:response.status,duration_ms:duration,message:success?"PriceTravel es alcanzable y aceptó la autenticación; una respuesta 4xx por parámetros vacíos puede ser esperable en esta prueba no destructiva.":"PriceTravel no aceptó la prueba de conectividad/autenticación.",details:{test_mode:"non_destructive"}};
    }
    if(integration==="izipay"){
      const authorization=Buffer.from(`${process.env.IZIPAY_USERNAME}:${process.env.IZIPAY_PASSWORD}`).toString("base64");
      const {response,duration}=await timedFetch(cfg.baseUrl,{method:"GET",headers:{accept:"application/json",authorization:`Basic ${authorization}`}});
      const success=response.status<500&&response.status!==401&&response.status!==403;
      return {success,http_status:response.status,duration_ms:duration,message:success?`Izipay es alcanzable con las credenciales configuradas. Prueba no destructiva para ${service}.`:`Izipay rechazó la conectividad o las credenciales.`,details:{test_mode:"non_destructive"}};
    }
    if(integration==="cloudflare-r2"){
      const account=process.env.CLOUDFLARE_ACCOUNT_ID||"b0c9535ffd40623838c8b025cc4bcda9",bucket=process.env.CLOUDFLARE_R2_BUCKET||"rumbo-images";
      const {response,duration}=await timedFetch(`${cfg.baseUrl}/accounts/${account}/r2/buckets/${bucket}/domains/managed`,{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,accept:"application/json"}});
      const payload=await response.json().catch(()=>({})) as Record<string,unknown>;const success=response.ok&&payload.success!==false;
      const result=payload.result&&typeof payload.result==="object"?payload.result as Record<string,unknown>:{};
      return {success,http_status:response.status,duration_ms:duration,message:success?`Cloudflare R2 respondió para el bucket ${bucket}.`:`Cloudflare R2 no pudo validar el bucket ${bucket}.`,details:{bucket,public_domain:result.domain||null,enabled:result.enabled??null,test_mode:"non_destructive"}};
    }
    if(integration==="spree"){
      let attempt=await timedFetch(`${cfg.baseUrl}/up`);
      if(!attempt.response.ok)attempt=await timedFetch(`${cfg.baseUrl}/api/v3/store/products?per_page=1`,{headers:{accept:"application/json"}});
      return {success:attempt.response.ok,http_status:attempt.response.status,duration_ms:attempt.duration,message:attempt.response.ok?`Spree legacy sigue accesible. Prueba no destructiva para ${service}.`:`Spree legacy no respondió. Si ya no hay dependencias, esto puede ser esperado.`,details:{test_mode:"non_destructive"}};
    }
    return {success:false,http_status:null,duration_ms:Date.now()-started,message:`No existe prueba definida para ${integration}/${service}.`};
  }catch(error){return {success:false,http_status:null,duration_ms:Date.now()-started,message:error instanceof Error?error.message:"La prueba no pudo completarse."}}
}

async function auth(request:NextRequest){
  const provider=accessConfiguration(),token=request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if(!provider||provider.kind!=="rumbo")return {error:noStoreJson({message:"Rumbo API no está conectada."},503)};
  if(!token&&!demoMode())return {error:noStoreJson({message:"No hay una sesión administrativa activa."},401)};
  return {provider,token};
}

async function observability(request:NextRequest,hours:number){
  const a=await auth(request);if("error" in a)return {stats:[],logs:[],window_hours:hours};
  try{const response=await fetch(`${a.provider.apiUrl}/api/admin/integration-observability?hours=${hours}`,{headers:providerHeaders(a.provider,{token:a.token,demoRole:"wholesaler_admin"}),cache:"no-store"});return response.ok?await parseJson(response):{stats:[],logs:[],window_hours:hours}}catch{return {stats:[],logs:[],window_hours:hours}}
}

export async function GET(request:NextRequest){
  const a=await auth(request);if("error" in a)return a.error;
  const requested=Number(request.nextUrl.searchParams.get("hours")||24),hours=[24,168,720].includes(requested)?requested:24;
  const telemetry=await observability(request,hours) as Record<string,unknown>;
  const stats=Array.isArray(telemetry.stats)?telemetry.stats:[];
  const integrations=integrationRegistry.map(item=>{const cfg=configuration(item.code);return {...item,configured:cfg.configured,status:item.legacy?"legacy":cfg.configured?"configured":"not_configured",base_host:safeHost(cfg.baseUrl),credential_status:cfg.configured?"Configurada":"Pendiente",services:item.services.map(service=>({...service,stats:stats.find((row:Record<string,unknown>)=>row.integration_code===item.code&&row.service_code===service.code)||null}))}});
  return noStoreJson({integrations,logs:Array.isArray(telemetry.logs)?telemetry.logs:[],window_hours:hours});
}

export async function POST(request:NextRequest){
  const a=await auth(request);if("error" in a)return a.error;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>,integration=String(body.integration_code||""),service=String(body.service_code||"");
  const definition=integrationRegistry.find(item=>item.code===integration),serviceDef=definition?.services.find(item=>item.code===service);
  if(!definition||!serviceDef)return noStoreJson({message:"Integración o servicio inválido."},422);
  const result=await probe(integration,service);
  try{
    const upstream=await fetch(`${a.provider.apiUrl}/api/admin/integration-observability`,{method:"POST",headers:providerHeaders(a.provider,{token:a.token,json:true,demoRole:"wholesaler_admin"}),body:JSON.stringify({integration_code:integration,service_code:service,source:"admin_test",success:result.success,http_status:result.http_status,duration_ms:result.duration_ms,error_code:result.success?null:"HEALTH_TEST_FAILED",error_message:result.success?null:result.message,request_summary:{test:true,mode:"non_destructive"},response_summary:{message:result.message,...(result.details||{})}}),cache:"no-store"});
    const logged=await parseJson(upstream) as Record<string,unknown>;return noStoreJson({test:result,trace_id:logged?.trace_id||null},result.success?200:502);
  }catch(error){return noStoreJson({test:result,trace_id:null,message:result.message,telemetry_warning:error instanceof Error?error.message:"No se pudo registrar telemetría."},result.success?200:502)}
}
