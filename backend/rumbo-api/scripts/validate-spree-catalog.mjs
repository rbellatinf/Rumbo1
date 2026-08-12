import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) process.exit(0);
const pool = new Pool({ connectionString:process.env.DATABASE_URL, ssl:process.env.PGSSLMODE==="disable"?false:{rejectUnauthorized:false} });

try {
  const exists=(await pool.query(`SELECT to_regclass('public.spree_products') IS NOT NULL AS ok`)).rows[0]?.ok;
  if(!exists){ console.log('Spree migration validation: no existe spree_products; catálogo legacy ya no está presente.'); process.exitCode=0; }
  else {
    const source=(await pool.query(`SELECT count(*)::int AS n FROM spree_products p WHERE NULLIF(to_jsonb(p)->>'deleted_at','') IS NULL`)).rows[0].n;
    const linked=(await pool.query(`SELECT count(*)::int AS n FROM rumbo_catalog_source_links WHERE source_system='spree' AND source_entity='product'`)).rows[0].n;
    const missing=await pool.query(`SELECT to_jsonb(p)->>'id' AS source_id,to_jsonb(p)->>'name' AS name FROM spree_products p LEFT JOIN rumbo_catalog_source_links l ON l.source_system='spree' AND l.source_entity='product' AND l.source_id=to_jsonb(p)->>'id' WHERE NULLIF(to_jsonb(p)->>'deleted_at','') IS NULL AND l.id IS NULL ORDER BY 2 LIMIT 20`);
    const targets={};
    for(const target of ['panama','miami']){
      const src=await pool.query(`SELECT to_jsonb(p)->>'id' AS id,to_jsonb(p)->>'name' AS name FROM spree_products p WHERE NULLIF(to_jsonb(p)->>'deleted_at','') IS NULL AND rumbo_geo_normalize(to_jsonb(p)->>'name') LIKE $1`,[`%${target}%`]);
      const native=await pool.query(`SELECT p.id,p.name,p.slug,p.country,p.country_code,p.city,p.destination_iata,p.status,g.region_name,g.subregion_name,(SELECT count(*)::int FROM rumbo_catalog_departures d WHERE d.product_id=p.id) AS departures FROM rumbo_catalog_products p LEFT JOIN rumbo_catalog_product_geography g ON g.product_id=p.id WHERE rumbo_geo_normalize(COALESCE(p.name,'')||' '||COALESCE(p.city,'')||' '||COALESCE(p.country,'')) LIKE $1 ORDER BY p.created_at DESC`,[`%${target}%`]);
      targets[target]={source_found:src.rowCount,source_ids:src.rows.map(r=>r.id),native_found:native.rowCount,native:native.rows};
      console.log(`Target ${target}: Spree=${src.rowCount}, Rumbo=${native.rowCount}.`);
      for(const row of native.rows) console.log(`  Rumbo ${row.name} | ${row.country_code||'--'} | ${row.region_name||'sin región'} / ${row.subregion_name||'sin subregión'} | salidas=${row.departures}`);
    }
    const last=(await pool.query(`SELECT id,warnings FROM rumbo_catalog_migration_runs WHERE source_system='spree' ORDER BY started_at DESC LIMIT 1`)).rows[0];
    if(last) await pool.query(`UPDATE rumbo_catalog_migration_runs SET target_validation=$2::jsonb WHERE id=$1`,[last.id,JSON.stringify(targets)]);
    console.log(`Spree migration lineage: source=${source}, links=${linked}, missing=${missing.rowCount}.`);
    if(missing.rowCount){ console.error('Productos Spree sin equivalente Rumbo:',missing.rows); process.exitCode=2; }
    for(const target of ['panama','miami']) if(targets[target].source_found>0&&targets[target].native_found===0){ console.error(`${target} existe en Spree y no fue migrado.`); process.exitCode=3; }
  }
} catch(error){ console.error('Spree migration validation failed:',error); process.exitCode=1; }
finally{ await pool.end(); }
