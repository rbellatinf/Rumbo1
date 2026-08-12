import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no está configurado.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (value) => {
  const n = numberOrNull(value);
  return n === null ? null : Math.max(0, Math.trunc(n));
};
const dateOnly = (value) => {
  if (!value) return null;
  const text = clean(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const safeSlug = (value, fallback) => {
  const slug = norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 170);
  return slug || fallback;
};
const safeTagCode = (value) => norm(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 60);

async function tableExists(name) {
  const { rows } = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${name}`]);
  return Boolean(rows[0]?.ok);
}

async function jsonRows(name) {
  if (!/^[a-z0-9_]+$/.test(name) || !(await tableExists(name))) return [];
  const { rows } = await pool.query(`SELECT to_jsonb(t) AS row FROM ${name} t`);
  return rows.map((x) => x.row || {});
}

function first(row, keys) {
  for (const key of keys) if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "") return row[key];
  return null;
}

function metafieldValue(row) {
  const direct = first(row, ["value", "text_value", "string_value", "short_text", "long_text", "number_value", "number", "data", "json_value"]);
  if (direct !== null) return direct;
  const ignored = new Set(["id", "created_at", "updated_at", "resource_id", "resource_type", "metafieldable_id", "metafieldable_type", "owner_id", "owner_type", "metafield_definition_id", "definition_id"]);
  for (const [key, value] of Object.entries(row || {})) if (!ignored.has(key) && value !== null && value !== "") return value;
  return null;
}

function parseIncluded(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 30);
  if (value && typeof value === "object") return Object.values(value).map(clean).filter(Boolean).slice(0, 30);
  const text = clean(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean).slice(0, 30);
  } catch {}
  return text.split(/\r?\n|\s*\|\s*|\s*;\s*/).map((x) => x.replace(/^[-•]\s*/, "").trim()).filter(Boolean).slice(0, 30);
}

const countryAliases = new Map([
  ["panama", "PA"], ["republica de panama", "PA"],
  ["estados unidos", "US"], ["estados unidos de america", "US"], ["usa", "US"], ["united states", "US"], ["united states of america", "US"],
  ["peru", "PE"], ["colombia", "CO"], ["republica dominicana", "DO"], ["mexico", "MX"], ["brasil", "BR"], ["brazil", "BR"],
  ["argentina", "AR"], ["chile", "CL"], ["ecuador", "EC"], ["bolivia", "BO"], ["uruguay", "UY"], ["paraguay", "PY"], ["venezuela", "VE"],
  ["espana", "ES"], ["spain", "ES"], ["francia", "FR"], ["france", "FR"], ["italia", "IT"], ["italy", "IT"], ["alemania", "DE"], ["germany", "DE"],
  ["portugal", "PT"], ["reino unido", "GB"], ["united kingdom", "GB"], ["croacia", "HR"], ["croatia", "HR"], ["grecia", "GR"], ["greece", "GR"],
  ["china", "CN"], ["japon", "JP"], ["japan", "JP"], ["tailandia", "TH"], ["thailand", "TH"], ["vietnam", "VN"], ["singapur", "SG"], ["singapore", "SG"],
  ["emiratos arabes unidos", "AE"], ["united arab emirates", "AE"], ["india", "IN"], ["maldivas", "MV"], ["maldives", "MV"],
  ["egipto", "EG"], ["egypt", "EG"], ["marruecos", "MA"], ["morocco", "MA"], ["sudafrica", "ZA"], ["south africa", "ZA"],
  ["australia", "AU"], ["nueva zelanda", "NZ"], ["new zealand", "NZ"],
]);

function inferGeo(source, metadata) {
  const name = clean(source.name || source.title);
  const nameNorm = norm(name);
  let country = clean(metadata.country || source.country || source.country_name);
  let countryCode = clean(source.country_code || metadata.country_code).toUpperCase();
  let city = clean(metadata.city || source.city);
  let iata = clean(metadata.destination_iata || source.destination_iata).toUpperCase();
  if (!countryCode) countryCode = countryAliases.get(norm(country)) || "";
  if (nameNorm.includes("panama")) {
    country ||= "Panamá"; countryCode ||= "PA"; city ||= "Ciudad de Panamá"; iata ||= "PTY";
  }
  if (nameNorm.includes("miami")) {
    country ||= "Estados Unidos"; countryCode ||= "US"; city ||= "Miami"; iata ||= "MIA";
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) countryCode = "";
  if (!/^[A-Z]{3}$/.test(iata)) iata = "";
  return { country: country || null, countryCode: countryCode || null, city: city || null, iata: iata || null };
}

function sourceStatus(source) {
  const raw = norm(source.status || source.state);
  if (["archived", "deleted", "discontinued"].includes(raw)) return "archived";
  if (["draft", "inactive"].includes(raw)) return "draft";
  const available = first(source, ["available_on", "available_at"]);
  const discontinued = first(source, ["discontinue_on", "discontinued_on"]);
  if (discontinued && new Date(discontinued) <= new Date()) return "archived";
  if (available && new Date(available) > new Date()) return "draft";
  return "published";
}

async function main() {
  if (!(await tableExists("spree_products"))) {
    console.log("Spree catalog migration: spree_products no existe; no hay legado que importar.");
    return;
  }

  const run = (await pool.query(`INSERT INTO rumbo_catalog_migration_runs(source_system,status) VALUES('spree','running') RETURNING id`)).rows[0];
  const warnings = [];
  try {
    const [products, variants, prices, taxons, productTaxons, assets, attachments, blobs] = await Promise.all([
      jsonRows("spree_products"), jsonRows("spree_variants"), jsonRows("spree_prices"), jsonRows("spree_taxons"), jsonRows("spree_products_taxons"), jsonRows("spree_assets"), jsonRows("active_storage_attachments"), jsonRows("active_storage_blobs"),
    ]);
    const activeProducts = products.filter((p) => !first(p, ["deleted_at"]));

    const { rows: mfTables } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'spree_metafield%' ORDER BY table_name`);
    const metafieldTables = {};
    for (const row of mfTables) metafieldTables[row.table_name] = await jsonRows(row.table_name);
    const definitions = metafieldTables.spree_metafield_definitions || [];
    const definitionById = new Map(definitions.map((d) => [String(d.id), d]));

    const variantsByProduct = new Map();
    for (const v of variants) {
      if (first(v, ["deleted_at"])) continue;
      const pid = String(first(v, ["product_id"]) ?? "");
      if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
      variantsByProduct.get(pid).push(v);
    }
    const pricesByVariant = new Map();
    for (const p of prices) {
      if (first(p, ["deleted_at"])) continue;
      const vid = String(first(p, ["variant_id"]) ?? "");
      if (!pricesByVariant.has(vid)) pricesByVariant.set(vid, []);
      pricesByVariant.get(vid).push(p);
    }
    const taxonById = new Map(taxons.map((t) => [String(t.id), t]));
    const taxonsByProduct = new Map();
    for (const link of productTaxons) {
      const pid = String(first(link, ["product_id"]) ?? ""), tid = String(first(link, ["taxon_id"]) ?? "");
      const taxon = taxonById.get(tid); if (!taxon) continue;
      if (!taxonsByProduct.has(pid)) taxonsByProduct.set(pid, []);
      taxonsByProduct.get(pid).push(taxon);
    }

    const metafieldsFor = (productId) => {
      const result = {};
      const rows = [];
      for (const [table, tableRows] of Object.entries(metafieldTables)) {
        if (table === "spree_metafield_definitions") continue;
        for (const row of tableRows) {
          const rid = first(row, ["resource_id", "metafieldable_id", "owner_id", "record_id"]);
          const rtype = clean(first(row, ["resource_type", "metafieldable_type", "owner_type", "record_type"]));
          if (String(rid ?? "") !== String(productId) || (rtype && !rtype.includes("Product"))) continue;
          rows.push({ table, ...row });
          const defId = first(row, ["metafield_definition_id", "definition_id"]);
          const def = definitionById.get(String(defId ?? ""));
          const key = clean(def?.key || row.key || row.name);
          const namespace = clean(def?.namespace || row.namespace);
          if (key && (!namespace || namespace === "rumbo")) result[key] = metafieldValue(row);
        }
      }
      return { values: result, raw: rows };
    };

    let migrated = 0, departuresMigrated = 0, withPrice = 0, withMetadata = 0;

    for (const source of activeProducts) {
      const sourceId = String(source.id);
      const mfs = metafieldsFor(sourceId);
      const metadata = { ...mfs.values };
      for (const key of ["country","duration","included","rating","reviews","departure_date","return_date","conditions","capacity","cancellation_policy"]) {
        if (metadata[key] == null && source[key] != null) metadata[key] = source[key];
      }
      const geo = inferGeo(source, metadata);
      const sourceVariants = variantsByProduct.get(sourceId) || [];
      const master = sourceVariants.find((v) => v.is_master === true || String(v.is_master) === "true") || sourceVariants[0] || null;
      const variantId = master ? String(master.id) : "product";
      const candidatePrices = master ? (pricesByVariant.get(variantId) || []).filter((x) => numberOrNull(x.amount) !== null) : [];
      candidatePrices.sort((a,b) => {
        const rank = (x) => clean(x.currency).toUpperCase() === "USD" ? 0 : clean(x.currency).toUpperCase() === "PEN" ? 1 : 2;
        return rank(a)-rank(b);
      });
      const price = candidatePrices[0] || null;
      const amount = numberOrNull(price?.amount);
      const currency = clean(price?.currency || master?.cost_currency || "USD").toUpperCase().slice(0,3) || "USD";
      const cost = numberOrNull(first(master || {}, ["cost_price", "cost_amount"]));
      const capacity = intOrNull(metadata.capacity);
      const departureDate = dateOnly(metadata.departure_date);
      let returnDate = dateOnly(metadata.return_date);
      if (departureDate && returnDate && returnDate <= departureDate) returnDate = null;
      const included = parseIncluded(metadata.included);
      const name = clean(source.name || source.title) || `Producto Spree ${sourceId}`;
      const slug = safeSlug(source.slug || source.permalink || name, `spree-${sourceId}`);
      const description = clean(source.description) || null;
      const shortDescription = clean(source.meta_description || source.short_description) || (description ? description.replace(/\s+/g," ").slice(0,320) : null);
      const sourceTaxons = taxonsByProduct.get(sourceId) || [];
      const primaryTag = clean(metadata.tag || source.tag || sourceTaxons[0]?.name) || null;
      const normalizedMetadata = {
        rating: numberOrNull(metadata.rating),
        reviews: intOrNull(metadata.reviews),
        conditions: clean(metadata.conditions) || null,
        cancellation_policy: clean(metadata.cancellation_policy) || null,
        legacy_metafields: mfs.values,
        migration: { source: "spree", source_id: sourceId, imported_at: new Date().toISOString() },
      };
      if (Object.keys(mfs.values).length) withMetadata += 1;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const linked = await client.query(`SELECT product_id FROM rumbo_catalog_source_links WHERE source_system='spree' AND source_entity='product' AND source_id=$1 FOR UPDATE`, [sourceId]);
        let productId = linked.rows[0]?.product_id;
        if (!productId) {
          const sameSlug = await client.query(`SELECT id FROM rumbo_catalog_products WHERE slug=$1 LIMIT 1`, [slug]);
          productId = sameSlug.rows[0]?.id;
        }
        const values = [slug,name,shortDescription,description,geo.country,geo.countryCode,geo.city,geo.iata,"package","Rumbo",clean(master?.sku) || `LEGACY-SPREE-${sourceId}`,clean(metadata.duration) || null,primaryTag,JSON.stringify(included),sourceStatus(source),JSON.stringify(normalizedMetadata)];
        if (productId) {
          await client.query(`UPDATE rumbo_catalog_products SET slug=$1,name=$2,short_description=$3,description=$4,country=$5,country_code=$6,city=$7,destination_iata=$8,product_type=$9,provider=$10,provider_reference=$11,duration_label=$12,tag=$13,included=$14::jsonb,status=$15,metadata=COALESCE(metadata,'{}'::jsonb)||$16::jsonb WHERE id=$17`, [...values, productId]);
        } else {
          productId = (await client.query(`INSERT INTO rumbo_catalog_products(slug,name,short_description,description,country,country_code,city,destination_iata,product_type,provider,provider_reference,duration_label,tag,included,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb) RETURNING id`, values)).rows[0].id;
        }

        const relatedAssets = assets.filter((a) => {
          const viewableId = String(first(a,["viewable_id","record_id"]) ?? "");
          return sourceVariants.some((v) => String(v.id) === viewableId) || viewableId === sourceId;
        });
        const assetIds = new Set(relatedAssets.map((a) => String(a.id)));
        const relatedAttachments = attachments.filter((a) => assetIds.has(String(first(a,["record_id"]) ?? "")));
        const blobIds = new Set(relatedAttachments.map((a) => String(first(a,["blob_id"]) ?? "")));
        const relatedBlobs = blobs.filter((b) => blobIds.has(String(b.id)));
        const rawSnapshot = { product: source, variants: sourceVariants, prices: sourceVariants.flatMap((v) => pricesByVariant.get(String(v.id)) || []), taxons: sourceTaxons, metafields: mfs.raw, assets: relatedAssets, active_storage_attachments: relatedAttachments, active_storage_blobs: relatedBlobs };
        await client.query(`INSERT INTO rumbo_catalog_source_links(source_system,source_entity,source_id,product_id,raw_snapshot,source_updated_at,imported_at) VALUES('spree','product',$1,$2,$3::jsonb,NULLIF($4,'')::timestamptz,now()) ON CONFLICT(source_system,source_entity,source_id) DO UPDATE SET product_id=EXCLUDED.product_id,raw_snapshot=EXCLUDED.raw_snapshot,source_updated_at=EXCLUDED.source_updated_at,imported_at=now()`, [sourceId,productId,JSON.stringify(rawSnapshot),clean(source.updated_at)]);

        for (const taxon of sourceTaxons) {
          const tagName = clean(taxon.name); const tagCode = safeTagCode(tagName); if (!tagName || !tagCode) continue;
          const tag = (await client.query(`INSERT INTO rumbo_catalog_tags(code,name,tag_type) VALUES($1,$2,'legacy') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,active=true RETURNING id`,[tagCode,tagName])).rows[0];
          await client.query(`INSERT INTO rumbo_catalog_product_tags(product_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[productId,tag.id]);
        }

        if (amount !== null && amount >= 0) {
          const sourceDepartureId = `${sourceId}:${variantId}:${currency}`;
          const departureLink = await client.query(`SELECT departure_id FROM rumbo_catalog_departure_source_links WHERE source_system='spree' AND source_id=$1 FOR UPDATE`,[sourceDepartureId]);
          let departureId = departureLink.rows[0]?.departure_id;
          const departureValues = [productId,departureDate,returnDate,currency,amount,cost,capacity,capacity,sourceDepartureId];
          if (departureId) {
            await client.query(`UPDATE rumbo_catalog_departures SET product_id=$1,departure_date=$2,return_date=$3,currency=$4,price_amount=$5,cost_amount=$6,capacity=COALESCE($7,capacity),available_capacity=CASE WHEN $8::int IS NULL THEN available_capacity ELSE LEAST(COALESCE(available_capacity,$8),$8) END,status='active' WHERE id=$10`, [...departureValues, departureId]);
          } else {
            departureId = (await client.query(`INSERT INTO rumbo_catalog_departures(product_id,departure_date,return_date,currency,price_amount,cost_amount,capacity,available_capacity,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`,departureValues.slice(0,8))).rows[0].id;
          }
          await client.query(`INSERT INTO rumbo_catalog_departure_source_links(source_system,source_id,product_id,departure_id,raw_snapshot,imported_at) VALUES('spree',$1,$2,$3,$4::jsonb,now()) ON CONFLICT(source_system,source_id) DO UPDATE SET product_id=EXCLUDED.product_id,departure_id=EXCLUDED.departure_id,raw_snapshot=EXCLUDED.raw_snapshot,imported_at=now()`,[sourceDepartureId,productId,departureId,JSON.stringify({variant:master,price,departure_date:departureDate,return_date:returnDate,capacity})]);
          departuresMigrated += 1; withPrice += 1;
        } else warnings.push({ source_id:sourceId, product:name, warning:"Sin precio legacy utilizable; producto migrado sin salida." });

        await client.query("COMMIT"); migrated += 1;
      } catch (error) {
        await client.query("ROLLBACK").catch(()=>{}); throw error;
      } finally { client.release(); }
    }

    const targets = {};
    for (const target of ["panama","miami"]) {
      const sourceMatches = activeProducts.filter((p) => norm(p.name || p.title).includes(target));
      const native = await pool.query(`SELECT p.id,p.name,p.slug,p.country,p.country_code,p.city,p.destination_iata,p.status,g.region_name,g.subregion_name FROM rumbo_catalog_products p LEFT JOIN rumbo_catalog_product_geography g ON g.product_id=p.id WHERE lower(unaccent(COALESCE(p.name,'')||' '||COALESCE(p.city,'')||' '||COALESCE(p.country,''))) LIKE $1`, [`%${target}%`]).catch(async()=>pool.query(`SELECT p.id,p.name,p.slug,p.country,p.country_code,p.city,p.destination_iata,p.status,g.region_name,g.subregion_name FROM rumbo_catalog_products p LEFT JOIN rumbo_catalog_product_geography g ON g.product_id=p.id WHERE lower(COALESCE(p.name,'')||' '||COALESCE(p.city,'')||' '||COALESCE(p.country,'')) LIKE $1`, [`%${target}%`]));
      targets[target] = { source_found:sourceMatches.length, source_ids:sourceMatches.map((p)=>String(p.id)), native_found:native.rowCount, native:native.rows };
      if (!sourceMatches.length) warnings.push({ target, warning:`No se encontró ${target} en spree_products; no se fabricaron datos para ocultar el faltante.` });
      else if (!native.rowCount) warnings.push({ target, warning:`${target} existe en Spree pero no quedó visible en catálogo Rumbo.` });
    }

    const status = migrated === activeProducts.length && warnings.length === 0 ? "complete" : "warning";
    await pool.query(`UPDATE rumbo_catalog_migration_runs SET finished_at=now(),source_products=$2,migrated_products=$3,migrated_departures=$4,products_with_price=$5,products_with_metadata=$6,target_validation=$7::jsonb,warnings=$8::jsonb,status=$9 WHERE id=$1`,[run.id,activeProducts.length,migrated,departuresMigrated,withPrice,withMetadata,JSON.stringify(targets),JSON.stringify(warnings),status]);
    console.log(`Spree catalog migration ${status}: ${migrated}/${activeProducts.length} productos; ${departuresMigrated} salidas; ${withMetadata} con metafields.`);
    console.log(`Spree targets: Panama source=${targets.panama.source_found}, native=${targets.panama.native_found}; Miami source=${targets.miami.source_found}, native=${targets.miami.native_found}.`);
    for (const warning of warnings) console.warn("Spree migration warning:", JSON.stringify(warning));
  } catch (error) {
    await pool.query(`UPDATE rumbo_catalog_migration_runs SET finished_at=now(),status='failed',warnings=$2::jsonb WHERE id=$1`,[run.id,JSON.stringify([{error:error.message}])]).catch(()=>{});
    throw error;
  }
}

try { await main(); }
catch (error) { console.error("Spree catalog migration failed:", error); process.exitCode=1; }
finally { await pool.end(); }
