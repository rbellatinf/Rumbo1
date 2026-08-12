import pg from "pg";
const {Pool}=pg;
if(!process.env.DATABASE_URL)process.exit(0);
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==="disable"?false:{rejectUnauthorized:false}});

function collectUrls(value,found=new Set()){
 if(Array.isArray(value)){for(const item of value)collectUrls(item,found);return found;}
 if(!value||typeof value!=="object")return found;
 for(const [key,item] of Object.entries(value)){
  if(typeof item==="string"&&/(url|uri)$/i.test(key)&&/^https?:\/\//i.test(item))found.add(item);
  else if(item&&typeof item==="object")collectUrls(item,found);
 }
 return found;
}
try{
 const {rows}=await pool.query(`SELECT product_id,raw_snapshot FROM rumbo_catalog_source_links WHERE source_system='spree' AND source_entity='product'`);
 let products=0,images=0;
 for(const row of rows){
  const urls=[...collectUrls(row.raw_snapshot)].slice(0,20);if(!urls.length)continue;
  products++;
  for(let i=0;i<urls.length;i++){
   const exists=await pool.query(`SELECT 1 FROM rumbo_catalog_images WHERE product_id=$1 AND url=$2 LIMIT 1`,[row.product_id,urls[i]]);
   if(exists.rowCount)continue;
   const hasPrimary=(await pool.query(`SELECT 1 FROM rumbo_catalog_images WHERE product_id=$1 AND is_primary=true LIMIT 1`,[row.product_id])).rowCount>0;
   await pool.query(`INSERT INTO rumbo_catalog_images(product_id,url,alt_text,sort_order,is_primary) SELECT $1,$2,p.name,$3,$4 FROM rumbo_catalog_products p WHERE p.id=$1`,[row.product_id,urls[i],i,!hasPrimary&&i===0]);
   images++;
  }
 }
 console.log(`Spree image migration: ${images} URL(s) nuevas en ${products} producto(s) con media pública detectable.`);
}catch(error){console.error('Spree image migration failed:',error);process.exitCode=1;}
finally{await pool.end();}
