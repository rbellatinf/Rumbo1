import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { Pool } = pg;
const clean = (v) => String(v ?? "").trim();
const manifest = JSON.parse(await fs.readFile(new URL("../data/catalog-real-images.json", import.meta.url), "utf8"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurado.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });

function masterKey(){ const raw=clean(process.env.RUMBO_INTEGRATION_MASTER_KEY); return raw ? crypto.createHash("sha256").update(raw).digest() : null; }
function decryptSecrets(row){
  if(!row?.secret_ciphertext) return {};
  const key=masterKey(); if(!key) throw new Error("RUMBO_INTEGRATION_MASTER_KEY no está configurado.");
  const d=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(row.secret_iv,"base64"));
  d.setAuthTag(Buffer.from(row.secret_tag,"base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(row.secret_ciphertext,"base64")),d.final()]).toString("utf8"));
}
async function r2Config(){
  const {rows}=await pool.query(`SELECT public_config,secret_ciphertext,secret_iv,secret_tag FROM rumbo_integration_configs WHERE integration_code='cloudflare-r2' LIMIT 1`);
  const row=rows[0]||null, pub=row?.public_config||{}, sec=row?decryptSecrets(row):{};
  const c={accountId:clean(pub.account_id||process.env.CLOUDFLARE_ACCOUNT_ID),bucket:clean(pub.bucket||process.env.CLOUDFLARE_R2_BUCKET||"rumbo-images"),publicBase:clean(pub.public_base_url||process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL).replace(/\/$/,""),accessKeyId:clean(sec.access_key_id||process.env.CLOUDFLARE_ACCESS_KEY_ID),secretAccessKey:clean(sec.secret_access_key||process.env.CLOUDFLARE_SECRET_ACCESS_KEY)};
  if(!c.accountId||!c.bucket||!c.publicBase||!c.accessKeyId||!c.secretAccessKey) throw new Error("Cloudflare R2 no está completamente configurado.");
  return c;
}
const publicUrl=(base,key)=>`${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
async function exists(client,bucket,key){try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));return true;}catch(e){if(Number(e?.$metadata?.httpStatusCode||0)===404||e?.name==="NotFound"||e?.name==="NoSuchKey")return false;throw e;}}
async function downloadDrive(id){
  const urls=[`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&confirm=t`];
  for(const url of urls){const r=await fetch(url,{redirect:"follow",headers:{"user-agent":"Rumbo catalog image importer/1.0",accept:"image/webp,image/*;q=0.9,*/*;q=0.1"}}).catch(()=>null);if(!r?.ok)continue;const type=clean(r.headers.get("content-type")).split(";")[0].toLowerCase();const bytes=Buffer.from(await r.arrayBuffer());if(type.startsWith("image/")&&bytes.length>0&&bytes.length<=10*1024*1024)return{bytes,type,sourceUrl:r.url};}
  throw new Error(`Google Drive no devolvió una imagen para ${id}`);
}
async function main(){
  const cfg=await r2Config();
  const client=new S3Client({region:"auto",endpoint:`https://${cfg.accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey}});
  let uploaded=0,reused=0,attached=0;
  for(const a of manifest.images){
    const {rows}=await pool.query("SELECT id,name FROM rumbo_catalog_products WHERE provider_reference=$1 LIMIT 1",[a.product_reference]);
    const p=rows[0]; if(!p) throw new Error(`Producto no encontrado: ${a.product_reference}`);
    const key=`catalog/suppliers/2026-09/${a.product_reference.toLowerCase()}/${a.file_name}`;
    let info;
    if(await exists(client,cfg.bucket,key)){const h=await client.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:key}));info={type:clean(h.ContentType)||"image/webp",bytes:Number(h.ContentLength||0)};reused++;}
    else {info=await downloadDrive(a.drive_file_id);await client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:key,Body:info.bytes,ContentType:info.type,CacheControl:"public, max-age=31536000, immutable",Metadata:{source:"supplier-workbook",product:a.product_reference,drive_file_id:a.drive_file_id}}));await client.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:key}));uploaded++;}
    const url=publicUrl(cfg.publicBase,key);
    await pool.query("BEGIN");
    try{
      await pool.query("DELETE FROM rumbo_catalog_images WHERE product_id=$1 AND metadata->>'source'='supplier-workbook-2026-09-21'",[p.id]);
      await pool.query(`INSERT INTO rumbo_catalog_images(product_id,url,alt_text,sort_order,is_primary,storage_provider,storage_key,bucket_name,metadata)
        VALUES($1,$2,$3,0,true,'cloudflare-r2',$4,$5,$6::jsonb)`,[p.id,url,a.title||p.name,key,cfg.bucket,JSON.stringify({source:"supplier-workbook-2026-09-21",product_reference:a.product_reference,drive_file_id:a.drive_file_id,workbook_order:a.order,workbook_es_principal:false,credit:a.credit,license:a.license,source_updated_at:a.source_updated_at,content_type:info.type,bytes:info.bytes})]);
      await pool.query("COMMIT"); attached++;
    }catch(e){await pool.query("ROLLBACK");throw e;}
    console.log(`Real catalog image OK: ${a.product_reference} -> ${url}`);
  }
  console.log(`Real catalog image sync OK: ${uploaded} uploaded, ${reused} reused, ${attached}/${manifest.images.length} attached.`);
}
try{await main();}finally{await pool.end();}
