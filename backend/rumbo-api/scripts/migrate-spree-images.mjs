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
const publicBase = clean(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL).replace(/\/$/, "");
const bucketName = clean(process.env.CLOUDFLARE_R2_BUCKET) || "rumbo-images";

function normalizeUrl(value) {
  const text = clean(value).replace(/[),.;'\"]+$/, "");
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function looksLikeImageUrl(url, path = "") {
  if (/\.(jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i.test(url)) return true;
  if (/(image|photo|picture|thumbnail|hero|cover|asset|attachment|cdn)/i.test(path)) return true;
  if (/(r2\.dev|cloudflare|cloudflarestorage|imagedelivery\.net)/i.test(url)) return true;
  return false;
}

function urlScore(url, path = "") {
  let score = 0;
  if (/(r2\.dev|cloudflare|cloudflarestorage|imagedelivery\.net)/i.test(url)) score += 100;
  if (/\.(jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i.test(url)) score += 60;
  if (/(image_url|image|photo|picture|thumbnail|hero|cover)/i.test(path)) score += 40;
  if (/(url|asset|attachment|blob)/i.test(path)) score += 20;
  return score;
}

function collectDirectUrls(value, path = [], output = []) {
  if (value == null) return output;
  if (typeof value === "string") {
    const pathText = path.join(".");
    const matches = value.match(/https?:\/\/[^\s<>"']+/gi) || [];
    for (const match of matches) {
      const url = normalizeUrl(match);
      if (url && looksLikeImageUrl(url, pathText)) output.push({ url, path: pathText, score: urlScore(url, pathText) });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDirectUrls(item, [...path, String(index)], output));
    return output;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) collectDirectUrls(nested, [...path, key], output);
  }
  return output;
}

function blobDerivedUrls(snapshot) {
  if (!publicBase) return [];
  const blobs = Array.isArray(snapshot?.active_storage_blobs) ? snapshot.active_storage_blobs : [];
  return blobs.flatMap((blob, index) => {
    const key = clean(blob?.key).replace(/^\/+/, "");
    if (!key) return [];
    const contentType = clean(blob?.content_type).toLowerCase();
    if (contentType && !contentType.startsWith("image/")) return [];
    const url = `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
    return [{ url, path: `active_storage_blobs.${index}.key`, score: 90, blob }];
  });
}

function uniqueCandidates(snapshot) {
  const candidates = [...collectDirectUrls(snapshot), ...blobDerivedUrls(snapshot)];
  const byUrl = new Map();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.score > existing.score) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

function storageInfo(candidate, snapshot) {
  const parsed = new URL(candidate.url);
  const blobs = Array.isArray(snapshot?.active_storage_blobs) ? snapshot.active_storage_blobs : [];
  const relatedBlob = candidate.blob || blobs.find((blob) => {
    const key = clean(blob?.key);
    return key && decodeURIComponent(parsed.pathname).includes(key);
  });
  const service = norm(relatedBlob?.service_name);
  const cloudflare = /(r2\.dev|cloudflare|cloudflarestorage|imagedelivery\.net)/i.test(candidate.url) || service.includes("r2") || service.includes("cloudflare");
  const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return {
    provider: cloudflare ? "cloudflare-r2" : "legacy-spree",
    storageKey: cloudflare ? (clean(relatedBlob?.key) || pathname || null) : null,
    bucket: cloudflare ? bucketName : null,
    service: clean(relatedBlob?.service_name) || null,
    filename: clean(relatedBlob?.filename) || null,
  };
}

function imageAlt(snapshot, fallback) {
  const assets = Array.isArray(snapshot?.assets) ? snapshot.assets : [];
  for (const asset of assets) {
    const alt = clean(asset?.alt || asset?.alt_text || asset?.title || asset?.name);
    if (alt) return alt.slice(0, 240);
  }
  return clean(fallback || "Rumbo").slice(0, 240);
}

async function main() {
  const hasLinks = (await pool.query(`SELECT to_regclass('public.rumbo_catalog_source_links') IS NOT NULL AS ok`)).rows[0]?.ok;
  if (!hasLinks) {
    console.log("Spree image migration: no existe rumbo_catalog_source_links.");
    return;
  }

  const { rows: links } = await pool.query(`
    SELECT l.source_id,l.product_id,l.raw_snapshot,p.name
    FROM rumbo_catalog_source_links l
    JOIN rumbo_catalog_products p ON p.id=l.product_id
    WHERE l.source_system='spree' AND l.source_entity='product'
    ORDER BY l.imported_at,l.source_id
  `);

  let migrated = 0;
  let productsWithImage = 0;
  const warnings = [];

  for (const link of links) {
    const snapshot = link.raw_snapshot || {};
    const candidates = uniqueCandidates(snapshot);
    const existing = await pool.query(`SELECT id,url,is_primary FROM rumbo_catalog_images WHERE product_id=$1 ORDER BY is_primary DESC,sort_order,created_at`, [link.product_id]);
    let hasPrimary = existing.rows.some((row) => row.is_primary);
    let sortOrder = existing.rowCount;

    for (const candidate of candidates) {
      const duplicate = await pool.query(`SELECT id FROM rumbo_catalog_images WHERE product_id=$1 AND url=$2 LIMIT 1`, [link.product_id, candidate.url]);
      if (duplicate.rowCount) continue;

      const storage = storageInfo(candidate, snapshot);
      const isPrimary = !hasPrimary;
      const metadata = {
        legacy_source: "spree",
        legacy_product_id: String(link.source_id),
        discovered_from: candidate.path,
        legacy_service_name: storage.service,
        legacy_filename: storage.filename,
        migrated_at: new Date().toISOString(),
      };

      await pool.query(`
        INSERT INTO rumbo_catalog_images(
          product_id,url,alt_text,sort_order,is_primary,storage_provider,storage_key,bucket_name,metadata
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      `, [
        link.product_id,
        candidate.url,
        imageAlt(snapshot, link.name),
        sortOrder,
        isPrimary,
        storage.provider,
        storage.storageKey,
        storage.bucket,
        JSON.stringify(metadata),
      ]);
      migrated += 1;
      sortOrder += 1;
      if (isPrimary) hasPrimary = true;
    }

    const finalCount = Number((await pool.query(`SELECT count(*)::int AS n FROM rumbo_catalog_images WHERE product_id=$1`, [link.product_id])).rows[0]?.n || 0);
    if (finalCount > 0) productsWithImage += 1;
    else {
      const blobs = Array.isArray(snapshot?.active_storage_blobs) ? snapshot.active_storage_blobs : [];
      warnings.push({
        source_id: String(link.source_id),
        product: link.name,
        warning: "No se encontró una URL pública de imagen legacy utilizable.",
        active_storage: blobs.map((blob) => ({
          key: clean(blob?.key) || null,
          service_name: clean(blob?.service_name) || null,
          filename: clean(blob?.filename) || null,
        })),
        hint: blobs.length && !publicBase
          ? "Si la imagen solo existe como ActiveStorage key, configura CLOUDFLARE_R2_PUBLIC_BASE_URL para reconstruir su URL pública."
          : null,
      });
    }
  }

  console.log(`Spree image migration: ${migrated} imágenes nuevas; ${productsWithImage}/${links.length} productos legacy con imagen nativa.`);
  for (const warning of warnings) console.warn("Spree image migration warning:", JSON.stringify(warning));
}

try {
  await main();
} catch (error) {
  console.error("Spree image migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
