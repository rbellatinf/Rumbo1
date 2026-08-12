import { NextRequest } from "next/server";
import { integrationRegistry } from "@/lib/integration-registry";
import {
  accessConfiguration,
  backendMessage,
  demoMode,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "@/lib/rumbo-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProbeResult={success:boolean;http_status:number|null;duration_ms:number;message:string;details?:Record<string,unknown>};
type StoredConfig={code:string;configured:boolean;source:string;public_config:Record<string,string>;secret_mask:Record<string,string>;last_tested_at?:string|null;last_test_success?:boolean|null;last_test_message?:string|null;updated_at?:string|null};

function localConfiguration(code:string){
  if(code==="rumbo-api"){
    const provider=accessConfiguration();
    return {configured:Boolean(provider&&provider.kind==="rumbo"),baseUrl:provider&&provider.kind==="rumbo"?provider.apiUrl:"",credential:"RUMBO_API_KEY",source:"environment"};
  }
  if(code==="spree")return {configured:Boolean(process.env.SPREE_API_URL),baseUrl:(process.env.SPREE_API_URL||"").replace(/\/$/,""),credential:"SPREE_API_URL",source:"environment"};
  return {configured:false,baseUrl:"",credential:"",source:"none"};
}
function safeHost(value:string){try{return value?new URL(value).host:"—"}catch{return value||"—"}}
async function timedFetch(url:string,init:RequestInit={},timeoutMs=6000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);const started=Date.now();try{const response=await fetch(url,{...init,signal:controller.signal,cache:"no-store"});return {response,duration:Date.now()-started}}finally{clearTimeout(timer)}}

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

async function secureConfigs(request:NextRequest){
  const a=await auth(request);if("error" in a)return {configs:new Map<string,StoredConfig>(),masterKeyConfigured:false};
  try{
    const response=await fetch(`${a.provider.apiUrl}/api/admin/integration-configs`,{headers:providerHeaders(a.provider,{token:a.token,demoRole:"wholesaler_admin"}),cache:"no-store"});
    const payload=await parseJson(response) as {integrations?:StoredConfig[];master_key_configured?:boolean};
    if(!response.ok)return {configs:new Map<string,StoredConfig>(),masterKeyConfigured:false};
    return {configs:new Map((payload.integrations||[]).map(item=>[item.code,item])),masterKeyConfigured:Boolean(payload.master_key_configured)};
  }catch{return {configs:new Map<string,StoredConfig>(),masterKeyConfigured:false}}
}

function baseUrlFromStored(code:string,config?:StoredConfig){
  const publicConfig=config?.public_config||{};
  if(code==="airlabs")return publicConfig.base_url||"https://airlabs.co/api/v9";
  if(code==="pricetravel")return publicConfig.api_url||"";
  if(code==="izipay")return publicConfig.api_url||"https://api.micuentaweb.pe";
  if(code==="cloudflare-r2")return publicConfig.account_id?`https://${publicConfig.account_id}.r2.cloudflarestorage.com`:"";
  return "";
}

async function localProbe(integration:string,service:string):Promise<ProbeResult>{
  const started=Date.now(),cfg=localConfiguration(integration);
  if(!cfg.configured)return {success:false,http_status:null,duration_ms:0,message:"La integración no tiene todas las credenciales/configuración requeridas en este servicio."};
  try{
    if(integration==="rumbo-api"){
      const {response,duration}=await timedFetch(`${cfg.baseUrl}/health`);const payload=await response.json().catch(()=>({}));const suffix=service==="health"?"":` Prueba no destructiva para ${service}.`;
      return {success:response.ok,http_status:response.status,duration_ms:duration,message:(response.ok?"Rumbo API respondió correctamente.":"Rumbo API respondió con error.")+suffix,details:{status:(payload as Record<string,unknown>)?.status||response.status,test_mode:"non_destructive"}};
    }
    if(integration==="spree"){
      let attempt=await timedFetch(`${cfg.baseUrl}/up`);if(!attempt.response.ok)attempt=await timedFetch(`${cfg.baseUrl}/api/v3/store/products?per_page=1`,{headers:{accept:"application/json"}});
      return {success:attempt.response.ok,http_status:attempt.response.status,duration_ms:attempt.duration,message:attempt.response.ok?`Spree legacy sigue accesible. Prueba no destructiva para ${service}.`:`Spree legacy no respondió.`,details:{test_mode:"non_destructive"}};
    }
    return {success:false,http_status:null,duration_ms:Date.now()-started,message:"No existe prueba local para esta integración."};
  }catch(error){return {success:false,http_status:null,duration_ms:Date.now()-started,message:error instanceof Error?error.message:"La prueba no pudo completarse."}}
}

export async function GET(request:NextRequest){
  const a=await auth(request);if("error" in a)return a.error;
  const requested=Number(request.nextUrl.searchParams.get("hours")||24),hours=[24,168,720].includes(requested)?requested:24;
  const [telemetry,secure]=await Promise.all([observability(request,hours),secureConfigs(request)]);
  const stats=Array.isArray((telemetry as Record<string,unknown>).stats)?(telemetry as Record<string,unknown>).stats as Record<string,unknown>[]:[];
  const integrations=integrationRegistry.map(item=>{
    const stored=secure.configs.get(item.code),local=localConfiguration(item.code),managed=Boolean(item.configurationFields?.length);
    const configured=managed?Boolean(stored?.configured):local.configured;
    const baseUrl=managed?baseUrlFromStored(item.code,stored):local.baseUrl;
    const source=managed?(stored?.source||"none"):local.source;
    return {...item,configured,status:item.legacy?"legacy":configured?"configured":"not_configured",base_host:safeHost(baseUrl),credential_status:configured?(source==="admin"?"Guardada en Rumbo":"Configurada"):(managed?"Pendiente":"No aplica"),configuration:managed?{public_config:stored?.public_config||{},secret_mask:stored?.secret_mask||{},source,last_tested_at:stored?.last_tested_at||null,last_test_success:stored?.last_test_success??null,last_test_message:stored?.last_test_message||null,updated_at:stored?.updated_at||null,master_key_configured:secure.masterKeyConfigured}:null,services:item.services.map(service=>({...service,stats:stats.find(row=>row.integration_code===item.code&&row.service_code===service.code)||null}))};
  });
  return noStoreJson({integrations,logs:Array.isArray((telemetry as Record<string,unknown>).logs)?(telemetry as Record<string,unknown>).logs:[],window_hours:hours,master_key_configured:secure.masterKeyConfigured});
}

export async function PUT(request:NextRequest){
  const a=await auth(request);if("error" in a)return a.error;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>,integration=String(body.integration_code||"");
  const definition=integrationRegistry.find(item=>item.code===integration);
  if(!definition?.configurationFields?.length)return noStoreJson({message:"Esta integración no se administra desde este formulario."},422);
  const upstream=await fetch(`${a.provider.apiUrl}/api/admin/integration-configs/${encodeURIComponent(integration)}`,{method:"PUT",headers:providerHeaders(a.provider,{token:a.token,json:true,demoRole:"wholesaler_admin"}),body:JSON.stringify({public_config:body.public_config||{},secrets:body.secrets||{}}),cache:"no-store"});
  const payload=await parseJson(upstream);
  if(!upstream.ok)return noStoreJson({message:backendMessage(payload,"No pudimos guardar la configuración.")},upstream.status||502);
  return noStoreJson(payload);
}

export async function POST(request:NextRequest){
  const a=await auth(request);if("error" in a)return a.error;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>,integration=String(body.integration_code||""),service=String(body.service_code||"");
  const definition=integrationRegistry.find(item=>item.code===integration),serviceDef=definition?.services.find(item=>item.code===service);
  if(!definition||!serviceDef)return noStoreJson({message:"Integración o servicio inválido."},422);

  let result:ProbeResult;
  if(definition.configurationFields?.length){
    const upstream=await fetch(`${a.provider.apiUrl}/api/admin/integration-configs/${encodeURIComponent(integration)}/test`,{method:"POST",headers:providerHeaders(a.provider,{token:a.token,json:true,demoRole:"wholesaler_admin"}),body:"{}",cache:"no-store"});
    const payload=await parseJson(upstream) as {test?:ProbeResult;message?:string};
    result=payload.test||{success:false,http_status:upstream.status||null,duration_ms:0,message:payload.message||"La prueba no pudo completarse."};
  }else result=await localProbe(integration,service);

  try{
    const upstream=await fetch(`${a.provider.apiUrl}/api/admin/integration-observability`,{method:"POST",headers:providerHeaders(a.provider,{token:a.token,json:true,demoRole:"wholesaler_admin"}),body:JSON.stringify({integration_code:integration,service_code:service,source:"admin_test",success:result.success,http_status:result.http_status,duration_ms:result.duration_ms,error_code:result.success?null:"HEALTH_TEST_FAILED",error_message:result.success?null:result.message,request_summary:{test:true,mode:"non_destructive"},response_summary:{message:result.message,...(result.details||{})}}),cache:"no-store"});
    const logged=await parseJson(upstream) as Record<string,unknown>;return noStoreJson({test:result,trace_id:logged?.trace_id||null},result.success?200:502);
  }catch(error){return noStoreJson({test:result,trace_id:null,message:result.message,telemetry_warning:error instanceof Error?error.message:"No se pudo registrar telemetría."},result.success?200:502)}
}
