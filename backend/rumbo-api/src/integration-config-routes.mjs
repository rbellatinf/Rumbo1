import crypto from "node:crypto";
import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const clean=(value)=>String(value??"").trim();
const normalize=(value)=>clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

const DEFINITIONS={
  airlabs:{
    publicKeys:["base_url"],secretKeys:["api_key"],requiredSecrets:["api_key"],
    defaults:{base_url:"https://airlabs.co/api/v9"},
    env:{base_url:"AIRLABS_API_BASE_URL",api_key:"AIRLABS_API_KEY"},
  },
  pricetravel:{
    publicKeys:["api_url","packages_path"],secretKeys:["username","password"],requiredPublic:["api_url","packages_path"],requiredSecrets:["username","password"],
    defaults:{},env:{api_url:"PRICETRAVEL_API_URL",packages_path:"PRICETRAVEL_PACKAGES_PATH",username:"PRICETRAVEL_USERNAME",password:"PRICETRAVEL_PASSWORD"},
  },
  izipay:{
    publicKeys:["api_url"],secretKeys:["username","password","public_key","hmac_key"],requiredPublic:["api_url"],requiredSecrets:["username","password"],
    defaults:{api_url:"https://api.micuentaweb.pe"},env:{api_url:"IZIPAY_API_URL",username:"IZIPAY_USERNAME",password:"IZIPAY_PASSWORD",public_key:"IZIPAY_PUBLIC_KEY",hmac_key:"IZIPAY_HMAC_SHA256_KEY"},
  },
  "cloudflare-r2":{
    publicKeys:["account_id","bucket","public_base_url"],secretKeys:["access_key_id","secret_access_key"],requiredPublic:["account_id","bucket","public_base_url"],requiredSecrets:["access_key_id","secret_access_key"],
    defaults:{bucket:"rumbo-images"},env:{account_id:"CLOUDFLARE_ACCOUNT_ID",bucket:"CLOUDFLARE_R2_BUCKET",public_base_url:"CLOUDFLARE_R2_PUBLIC_BASE_URL",access_key_id:"CLOUDFLARE_ACCESS_KEY_ID",secret_access_key:"CLOUDFLARE_SECRET_ACCESS_KEY"},
  },
};

const R2_IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"};
const R2_MAX_IMAGE_BYTES=10*1024*1024;

function masterKey(){
  const raw=clean(process.env.RUMBO_INTEGRATION_MASTER_KEY);
  if(!raw)return null;
  return crypto.createHash("sha256").update(raw).digest();
}
function encryptSecrets(value){
  const key=masterKey();if(!key)throw new Error("RUMBO_INTEGRATION_MASTER_KEY no está configurado.");
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {ciphertext:ciphertext.toString("base64"),iv:iv.toString("base64"),tag:tag.toString("base64")};
}
function decryptSecrets(row){
  if(!row?.secret_ciphertext)return {};
  const key=masterKey();if(!key)throw new Error("RUMBO_INTEGRATION_MASTER_KEY no está configurado.");
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(row.secret_iv,"base64"));
  decipher.setAuthTag(Buffer.from(row.secret_tag,"base64"));
  const plaintext=Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext,"base64")),decipher.final()]).toString("utf8");
  const parsed=JSON.parse(plaintext);return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
}
function mask(value){const text=clean(value);if(!text)return "";return `••••••••${text.slice(-4)}`}
function envValue(def,key){const name=def.env?.[key];return name?clean(process.env[name]):""}

async function storedRow(pool,code){return (await pool.query(`SELECT * FROM rumbo_integration_configs WHERE integration_code=$1 LIMIT 1`,[code])).rows[0]||null}
async function resolvedConfig(pool,code){
  const def=DEFINITIONS[code];if(!def)return null;
  const row=await storedRow(pool,code),storedSecrets=row?decryptSecrets(row):{};
  const publicConfig={...def.defaults};
  for(const key of def.publicKeys||[]){const fromEnv=envValue(def,key);if(fromEnv)publicConfig[key]=fromEnv}
  if(row?.public_config&&typeof row.public_config==="object")for(const key of def.publicKeys||[]){const value=clean(row.public_config[key]);if(value)publicConfig[key]=value}
  const secrets={};for(const key of def.secretKeys||[]){const fromEnv=envValue(def,key);if(fromEnv)secrets[key]=fromEnv;const stored=clean(storedSecrets[key]);if(stored)secrets[key]=stored}
  const requiredPublic=def.requiredPublic||[],requiredSecrets=def.requiredSecrets||[];
  const configured=requiredPublic.every(key=>clean(publicConfig[key]))&&requiredSecrets.every(key=>clean(secrets[key]));
  const source=row&&(row.secret_ciphertext||Object.keys(row.public_config||{}).length)?"admin":configured?"environment":"none";
  const secretMask={};for(const key of def.secretKeys||[]){const savedMask=clean(row?.secret_mask?.[key]);secretMask[key]=savedMask||mask(secrets[key])}
  return {code,def,row,publicConfig,secrets,secretMask,configured,source};
}

function safeUrl(value,fallback=""){const text=clean(value||fallback).replace(/\/$/,"");if(!text)return "";try{return new URL(text).toString().replace(/\/$/,"")}catch{return ""}}
async function timedFetch(url,init={},timeoutMs=7000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();try{const response=await fetch(url,{...init,signal:controller.signal,cache:"no-store"});return{response,duration:Date.now()-started}}finally{clearTimeout(timer)}}
function r2Endpoint(accountId){return `https://${clean(accountId)}.r2.cloudflarestorage.com`}
function r2Client(cfg){
  return new S3Client({
    region:"auto",
    endpoint:r2Endpoint(cfg.publicConfig.account_id),
    credentials:{accessKeyId:clean(cfg.secrets.access_key_id),secretAccessKey:clean(cfg.secrets.secret_access_key)},
  });
}
function publicObjectUrl(base,key){
  const root=safeUrl(base);if(!root)return "";
  return `${root}/${String(key).split("/").map(part=>encodeURIComponent(part)).join("/")}`;
}

async function probeConfig(pool,code){
  const cfg=await resolvedConfig(pool,code);if(!cfg?.configured)return{success:false,http_status:null,duration_ms:0,message:"Faltan campos obligatorios de configuración."};
  try{
    if(code==="airlabs"){
      const base=safeUrl(cfg.publicConfig.base_url,"https://airlabs.co/api/v9"),query=new URLSearchParams({q:"LIM",lang:"es",api_key:cfg.secrets.api_key,_fields:"name,iata_code,icao_code,city,country_code,popularity,is_major,is_international"});
      const {response,duration}=await timedFetch(`${base}/suggest?${query}`);const payload=await response.json().catch(()=>({})),rows=suggestAirportRows(payload),airports=rows.map(mapAirport).filter(Boolean);const success=response.ok&&!payload?.error&&airports.length>0;
      return{success,http_status:response.status,duration_ms:duration,message:success?`AirLabs respondió correctamente (${airports.length} aeropuerto(s) interpretados).`:response.ok?"AirLabs respondió, pero Rumbo no pudo interpretar ningún aeropuerto.":"AirLabs rechazó la conexión.",details:{test_query:"LIM",results:airports.length}};
    }
    if(code==="pricetravel"){
      const base=safeUrl(cfg.publicConfig.api_url),path=clean(cfg.publicConfig.packages_path),endpoint=path.startsWith("/")?path:`/${path}`,auth=Buffer.from(`${cfg.secrets.username}:${cfg.secrets.password}`).toString("base64");
      const {response,duration}=await timedFetch(`${base}${endpoint}`,{headers:{accept:"application/json",authorization:`Basic ${auth}`}});const success=response.status<500&&![401,403].includes(response.status);
      return{success,http_status:response.status,duration_ms:duration,message:success?"PriceTravel es alcanzable y aceptó las credenciales.":"PriceTravel rechazó la conexión o credenciales."};
    }
    if(code==="izipay"){
      const base=safeUrl(cfg.publicConfig.api_url,"https://api.micuentaweb.pe"),auth=Buffer.from(`${cfg.secrets.username}:${cfg.secrets.password}`).toString("base64");
      const {response,duration}=await timedFetch(base,{headers:{accept:"application/json",authorization:`Basic ${auth}`}});const success=response.status<500&&![401,403].includes(response.status);
      return{success,http_status:response.status,duration_ms:duration,message:success?"Izipay es alcanzable con las credenciales guardadas.":"Izipay rechazó la conexión o credenciales."};
    }
    if(code==="cloudflare-r2"){
      const started=Date.now(),client=r2Client(cfg),bucket=clean(cfg.publicConfig.bucket);
      const result=await client.send(new ListObjectsV2Command({Bucket:bucket,MaxKeys:1}));
      const httpStatus=Number(result?.$metadata?.httpStatusCode||200);
      return{success:httpStatus>=200&&httpStatus<300,http_status:httpStatus,duration_ms:Date.now()-started,message:`Cloudflare R2 S3 respondió para ${bucket}.`,details:{bucket,objects_visible:Number(result?.KeyCount||0),endpoint:r2Endpoint(cfg.publicConfig.account_id),test_mode:"read_only"}};
    }
    return{success:false,http_status:null,duration_ms:0,message:"No existe prueba para esta integración."};
  }catch(error){return{success:false,http_status:null,duration_ms:0,message:error instanceof Error?error.message:"La prueba falló."}}
}

function levenshtein(a,b){const m=a.length,n=b.length,dp=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=n;j++){const old=dp[j],cost=a[i-1]===b[j-1]?0:1;dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+cost);prev=old}}return dp[n]}
let countryIndexCache=null;
function countryIndex(){
  if(countryIndexCache)return countryIndexCache;
  const locales=["es","en","fr"],items=[];
  for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
    const code=String.fromCharCode(a,b),names=new Set();
    for(const locale of locales){try{const value=new Intl.DisplayNames([locale],{type:"region"}).of(code);if(value&&value!==code)names.add(value)}catch{}}
    if(names.size)items.push({code,names:[...names]});
  }
  countryIndexCache=items;return items;
}
function resolveCountry(query){
  const q=normalize(query);if(q.length<4)return null;
  let best=null;
  for(const item of countryIndex())for(const name of item.names){const n=normalize(name);if(!n)continue;if(n===q)return{code:item.code,name};const dist=levenshtein(q,n);const threshold=q.length>=5?2:1;if(dist<=threshold&&(!best||dist<best.dist))best={code:item.code,name,dist}}
  return best?{code:best.code,name:best.name}:null;
}
function countryName(code){try{return new Intl.DisplayNames(["es"],{type:"region"}).of(code)||code}catch{return code}}
function mapAirport(item){const iata=clean(item?.iata_code).toUpperCase();if(!/^[A-Z]{3}$/.test(iata))return null;const name=clean(item?.name)||iata,city=clean(item?.city)||name,cc=clean(item?.country_code).toUpperCase();return{id:`AIRPORT-${clean(item?.icao_code)||iata}`,iataCode:iata,name,cityName:city,countryName:countryName(cc),subType:"AIRPORT",label:`${city} (${iata}) · ${name}${cc?`, ${countryName(cc)}`:""}`}}
function listPayload(payload){if(Array.isArray(payload))return payload;if(Array.isArray(payload?.response))return payload.response;return[]}
function suggestAirportRows(payload){
  const source=payload?.response??payload;
  if(Array.isArray(source))return source;
  if(!source||typeof source!=="object")return[];
  return [
    ...(Array.isArray(source.airports)?source.airports:[]),
    ...(Array.isArray(source.airports_by_cities)?source.airports_by_cities:[]),
    ...(Array.isArray(source.airports_by_countries)?source.airports_by_countries:[]),
  ];
}

export function installIntegrationConfigRoutes(app,{pool,requireAdmin,audit}){
  // Compatibility fix: this handler runs before the older person-detail route and
  // restores agency fields required by the DNI popup. Other person types continue
  // to the existing handler below in user-management-routes.
  app.get('/api/admin/person-detail',requireAdmin,async(req,res,next)=>{
    if(clean(req.query.type)!=='retailer')return next();
    const id=clean(req.query.id);if(!id)return res.status(422).json({error:{message:'Identificador obligatorio.'}});
    const {rows}=await pool.query(`SELECT m.account_id,m.retailer_id,m.first_name,m.last_name,m.member_role,m.phone,m.document_type,m.document_number,m.date_of_birth,m.created_at,a.email,a.status,a.last_login_at,r.trade_name,r.legal_name,r.tax_id FROM rumbo_retailer_members m JOIN rumbo_accounts a ON a.id=m.account_id JOIN rumbo_retailers r ON r.id=m.retailer_id WHERE m.account_id=$1 LIMIT 1`,[id]);
    if(!rows[0])return res.status(404).json({error:{message:'Persona no encontrada.'}});return res.json({person:{...rows[0],person_type:'retailer'}});
  });

  app.get('/api/admin/integration-configs',requireAdmin,async(_req,res)=>{
    try{const integrations=[];for(const code of Object.keys(DEFINITIONS)){const cfg=await resolvedConfig(pool,code);integrations.push({code,configured:cfg.configured,source:cfg.source,public_config:cfg.publicConfig,secret_mask:cfg.secretMask,last_tested_at:cfg.row?.last_tested_at||null,last_test_success:cfg.row?.last_test_success??null,last_test_message:cfg.row?.last_test_message||null,updated_at:cfg.row?.updated_at||null})}res.json({integrations,master_key_configured:Boolean(masterKey())})}
    catch(error){console.error(error);res.status(500).json({error:{message:'No pudimos leer la configuración de integraciones.'}})}
  });

  app.put('/api/admin/integration-configs/:code',requireAdmin,async(req,res)=>{
    const code=clean(req.params.code),def=DEFINITIONS[code];if(!def)return res.status(404).json({error:{message:'Integración no administrable desde Rumbo.'}});if(!masterKey())return res.status(503).json({error:{message:'Falta la llave maestra de cifrado de integraciones.'}});
    try{
      const current=await storedRow(pool,code),oldSecrets=current?decryptSecrets(current):{},publicInput=req.body?.public_config&&typeof req.body.public_config==='object'&&!Array.isArray(req.body.public_config)?req.body.public_config:{},secretInput=req.body?.secrets&&typeof req.body.secrets==='object'&&!Array.isArray(req.body.secrets)?req.body.secrets:{};
      const publicConfig={};for(const key of def.publicKeys||[]){const value=clean(publicInput[key]);if(value)publicConfig[key]=value}
      const secrets={};for(const key of def.secretKeys||[]){const old=clean(oldSecrets[key]);if(old)secrets[key]=old;const value=clean(secretInput[key]);if(value)secrets[key]=value}
      const encrypted=encryptSecrets(secrets),secretMask={};for(const key of def.secretKeys||[])secretMask[key]=mask(secrets[key]);
      const {rows}=await pool.query(`INSERT INTO rumbo_integration_configs(integration_code,public_config,secret_ciphertext,secret_iv,secret_tag,secret_mask,configured_by_account_id,configured_at,updated_at) VALUES($1,$2::jsonb,$3,$4,$5,$6::jsonb,$7,now(),now()) ON CONFLICT(integration_code) DO UPDATE SET public_config=EXCLUDED.public_config,secret_ciphertext=EXCLUDED.secret_ciphertext,secret_iv=EXCLUDED.secret_iv,secret_tag=EXCLUDED.secret_tag,secret_mask=EXCLUDED.secret_mask,configured_by_account_id=EXCLUDED.configured_by_account_id,configured_at=now(),updated_at=now() RETURNING updated_at`,[code,JSON.stringify(publicConfig),encrypted.ciphertext,encrypted.iv,encrypted.tag,JSON.stringify(secretMask),req.adminSession.account_id||null]);
      await audit(req.adminSession.email,'integration.config_updated','integration',code,{public_fields:Object.keys(publicConfig),secret_fields:Object.keys(secretInput).filter(key=>clean(secretInput[key]))});
      const cfg=await resolvedConfig(pool,code);res.json({integration:{code,configured:cfg.configured,source:cfg.source,public_config:cfg.publicConfig,secret_mask:cfg.secretMask,updated_at:rows[0].updated_at}});
    }catch(error){console.error(error);res.status(500).json({error:{message:'No pudimos guardar la configuración cifrada.'}})}
  });

  app.post('/api/admin/integration-configs/:code/test',requireAdmin,async(req,res)=>{
    const code=clean(req.params.code);if(!DEFINITIONS[code])return res.status(404).json({error:{message:'Integración no administrable.'}});
    const result=await probeConfig(pool,code);await pool.query(`INSERT INTO rumbo_integration_configs(integration_code,last_tested_at,last_test_success,last_test_message,updated_at) VALUES($1,now(),$2,$3,now()) ON CONFLICT(integration_code) DO UPDATE SET last_tested_at=now(),last_test_success=$2,last_test_message=$3,updated_at=now()`,[code,result.success,result.message]);
    await audit(req.adminSession.email,'integration.connection_test','integration',code,{success:result.success,http_status:result.http_status,duration_ms:result.duration_ms});
    res.status(result.success?200:502).json({test:result});
  });

  app.post('/api/admin/integration-configs/cloudflare-r2/presign-upload',requireAdmin,async(req,res)=>{
    try{
      const cfg=await resolvedConfig(pool,'cloudflare-r2');if(!cfg?.configured)return res.status(503).json({error:{message:'Cloudflare R2 no está configurado en Administración → APIs.'}});
      const contentType=clean(req.body?.content_type).toLowerCase(),size=Number(req.body?.size||0),extension=R2_IMAGE_TYPES[contentType];
      if(!extension)return res.status(415).json({error:{message:'Formato no permitido. Usa JPG, PNG, WebP o GIF.'}});
      if(!Number.isFinite(size)||size<=0||size>R2_MAX_IMAGE_BYTES)return res.status(413).json({error:{message:'La imagen debe pesar entre 1 byte y 10 MB.'}});
      const now=new Date(),year=now.getUTCFullYear(),month=String(now.getUTCMonth()+1).padStart(2,'0'),key=`catalog/${year}/${month}/${crypto.randomUUID()}.${extension}`;
      const bucket=clean(cfg.publicConfig.bucket),client=r2Client(cfg),command=new PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType});
      const uploadUrl=await getSignedUrl(client,command,{expiresIn:300});
      const publicUrl=publicObjectUrl(cfg.publicConfig.public_base_url,key);if(!publicUrl)return res.status(422).json({error:{message:'Configura la URL pública del bucket antes de subir imágenes.'}});
      await audit(req.adminSession.email,'integration.r2_upload_presigned','integration','cloudflare-r2',{bucket,key,content_type:contentType,size,expires_in_seconds:300});
      res.json({upload_url:uploadUrl,storage_key:key,bucket,public_url:publicUrl,content_type:contentType,expires_in_seconds:300});
    }catch(error){console.error(error);res.status(502).json({error:{message:error instanceof Error?error.message:'No pudimos preparar la carga a Cloudflare R2.'}})}
  });

  app.get('/api/integrations/airlabs/airports',async(req,res)=>{
    const q=clean(req.query.q).slice(0,30);if(q.length<3)return res.status(422).json({error:{message:'Escribe al menos tres caracteres.'}});
    try{
      const cfg=await resolvedConfig(pool,'airlabs');if(!cfg?.configured)return res.status(503).json({error:{message:'AirLabs no está configurada en Administración → APIs.'}});
      const base=safeUrl(cfg.publicConfig.base_url,'https://airlabs.co/api/v9'),country=resolveCountry(q),started=Date.now();let providerRows=[],responseStatus=200;
      if(country){
        const params=new URLSearchParams({country_code:country.code,api_key:cfg.secrets.api_key,_fields:'name,iata_code,icao_code,city,city_code,country_code,popularity,is_major,is_international'});
        const attempt=await timedFetch(`${base}/airports?${params}`);responseStatus=attempt.response.status;if(!attempt.response.ok)throw new Error(`AirLabs airports returned ${attempt.response.status}`);providerRows=listPayload(await attempt.response.json());
      }else{
        const params=new URLSearchParams({q,lang:'es',api_key:cfg.secrets.api_key,_fields:'name,iata_code,icao_code,city,city_code,country_code,popularity,is_major,is_international'});
        const attempt=await timedFetch(`${base}/suggest?${params}`);responseStatus=attempt.response.status;if(!attempt.response.ok)throw new Error(`AirLabs suggest returned ${attempt.response.status}`);providerRows=suggestAirportRows(await attempt.response.json());
      }
      providerRows.sort((a,b)=>Number(b?.is_major||0)-Number(a?.is_major||0)||Number(b?.is_international||0)-Number(a?.is_international||0)||Number(b?.popularity||0)-Number(a?.popularity||0));
      const seen=new Set(),airports=[];for(const item of providerRows){const mapped=mapAirport(item);if(!mapped||seen.has(mapped.iataCode))continue;seen.add(mapped.iataCode);airports.push(mapped);if(airports.length>=60)break}
      try{await pool.query(`INSERT INTO rumbo_integration_calls(integration_code,service_code,source,success,http_status,duration_ms,request_summary,response_summary) VALUES('airlabs','airport-suggest','storefront',true,$1,$2,$3::jsonb,$4::jsonb)`,[responseStatus,Date.now()-started,JSON.stringify({query:q,country_code:country?.code||null}),JSON.stringify({results:airports.length})])}catch{}
      res.json({mode:'live',provider:'AirLabs',airports,message:country?`Aeropuertos de ${countryName(country.code)} consultados en AirLabs.`:`AirLabs devolvió ${airports.length} aeropuerto(s).`});
    }catch(error){console.error(error);res.status(502).json({error:{message:error instanceof Error?error.message:'AirLabs no respondió.'}})}
  });
}
