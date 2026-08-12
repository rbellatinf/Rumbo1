import crypto from "node:crypto";
import pg from "pg";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { Pool } = pg;
const clean = (value) => String(value ?? "").trim();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no está configurado.");
  process.exit(1);
}

const ASSETS = [
  {
    productId: "61000000-0000-4000-8000-000000000007",
    imageId: "63000000-0000-4000-8000-000000000007",
    key: "catalog/test-world/istanbul-cc0.jpg",
    file: "Istanbul-Tur.jpg",
    alt: "Estambul, Turquía",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Istanbul-Tur.jpg",
  },
  {
    productId: "61000000-0000-4000-8000-000000000008",
    imageId: "63000000-0000-4000-8000-000000000008",
    key: "catalog/test-world/budapest-cc0.jpg",
    file: "Budapest city centre Hungary.jpg",
    alt: "Budapest, Hungría",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Budapest_city_centre_Hungary.jpg",
  },
  {
    productId: "61000000-0000-4000-8000-000000000009",
    imageId: "63000000-0000-4000-8000-000000000009",
    key: "catalog/test-world/dubrovnik-cc0.jpg",
    file: "Dubrovnik 10.2.2026.jpg",
    alt: "Dubrovnik, Croacia",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Dubrovnik_10.2.2026.jpg",
  },
  {
    productId: "61000000-0000-4000-8000-000000000010",
    imageId: "63000000-0000-4000-8000-000000000010",
    key: "catalog/test-world/paris-cc0.jpg",
    file: "Paris Eiffel tower.jpg",
    alt: "París, Francia",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Paris_Eiffel_tower.jpg",
  },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

function masterKey() {
  const raw = clean(process.env.RUMBO_INTEGRATION_MASTER_KEY);
  return raw ? crypto.createHash("sha256").update(raw).digest() : null;
}

function decryptSecrets(row) {
  if (!row?.secret_ciphertext) return {};
  const key = masterKey();
  if (!key) throw new Error("RUMBO_INTEGRATION_MASTER_KEY no está configurado.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.secret_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plain);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

async function resolveR2Config() {
  const { rows } = await pool.query(
    `SELECT public_config,secret_ciphertext,secret_iv,secret_tag,last_test_success
       FROM rumbo_integration_configs
      WHERE integration_code='cloudflare-r2'
      LIMIT 1`,
  );
  const row = rows[0] || null;
  const storedPublic = row?.public_config && typeof row.public_config === "object" ? row.public_config : {};
  const storedSecrets = row ? decryptSecrets(row) : {};
  const config = {
    accountId: clean(storedPublic.account_id || process.env.CLOUDFLARE_ACCOUNT_ID),
    bucket: clean(storedPublic.bucket || process.env.CLOUDFLARE_R2_BUCKET || "rumbo-images"),
    publicBase: clean(storedPublic.public_base_url || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL).replace(/\/$/, ""),
    accessKeyId: clean(storedSecrets.access_key_id || process.env.CLOUDFLARE_ACCESS_KEY_ID),
    secretAccessKey: clean(storedSecrets.secret_access_key || process.env.CLOUDFLARE_SECRET_ACCESS_KEY),
    tested: row?.last_test_success === true,
  };
  config.configured = Boolean(config.accountId && config.bucket && config.publicBase && config.accessKeyId && config.secretAccessKey);
  return config;
}

function publicUrl(base, key) {
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode || 0);
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return false;
    throw error;
  }
}

async function downloadImage(file) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "image/jpeg,image/*;q=0.9,*/*;q=0.1",
      "user-agent": "Rumbo travel catalog test asset importer/1.0",
    },
  });
  if (!response.ok) throw new Error(`Wikimedia respondió ${response.status} para ${file}.`);
  const contentType = clean(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error(`${file} no devolvió una imagen (${contentType || "sin content-type"}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error(`${file} tiene un tamaño inválido (${bytes.length} bytes).`);
  return { bytes, contentType: contentType || "image/jpeg", sourceUrl: response.url };
}

async function attachImage(asset, config, client, uploadInfo) {
  const url = publicUrl(config.publicBase, asset.key);
  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE rumbo_catalog_images
          SET is_primary=false
        WHERE product_id=$1 AND id<>$2 AND is_primary=true`,
      [asset.productId, asset.imageId],
    );
    await pool.query(
      `INSERT INTO rumbo_catalog_images(
         id,product_id,url,alt_text,sort_order,is_primary,storage_provider,storage_key,bucket_name,metadata
       ) VALUES($1,$2,$3,$4,0,true,'cloudflare-r2',$5,$6,$7::jsonb)
       ON CONFLICT(id) DO UPDATE SET
         product_id=EXCLUDED.product_id,
         url=EXCLUDED.url,
         alt_text=EXCLUDED.alt_text,
         sort_order=EXCLUDED.sort_order,
         is_primary=EXCLUDED.is_primary,
         storage_provider=EXCLUDED.storage_provider,
         storage_key=EXCLUDED.storage_key,
         bucket_name=EXCLUDED.bucket_name,
         metadata=EXCLUDED.metadata`,
      [
        asset.imageId,
        asset.productId,
        url,
        asset.alt,
        asset.key,
        config.bucket,
        JSON.stringify({
          test_seed: true,
          test_group: "storefront-world",
          copied_to_r2: true,
          source_repository: "Wikimedia Commons",
          source_file: asset.file,
          source_page: asset.sourcePage,
          source_download_url: uploadInfo.sourceUrl,
          source_license: "CC0-1.0",
          content_type: uploadInfo.contentType,
          bytes: uploadInfo.bytes,
        }),
      ],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
  return url;
}

let exitCode = 0;
try {
  const config = await resolveR2Config();
  if (!config.configured) {
    console.log("World test catalog R2 sync: Cloudflare R2 no está configurado; se omite en este entorno.");
  } else {
    console.log(`World test catalog R2 sync: bucket=${config.bucket}, prueba previa=${config.tested ? "OK" : "sin confirmar"}.`);
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });

    let uploaded = 0;
    let reused = 0;
    for (const asset of ASSETS) {
      const product = await pool.query(`SELECT id,name FROM rumbo_catalog_products WHERE id=$1 LIMIT 1`, [asset.productId]);
      if (!product.rows[0]) throw new Error(`No existe el producto seed ${asset.productId}; ejecuta db:prepare primero.`);

      let info;
      if (await objectExists(client, config.bucket, asset.key)) {
        const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: asset.key }));
        info = {
          sourceUrl: asset.sourcePage,
          contentType: clean(head.ContentType) || "image/jpeg",
          bytes: Number(head.ContentLength || 0),
        };
        reused++;
        console.log(`R2 ya contiene ${asset.key}; se reutiliza el objeto físico.`);
      } else {
        const downloaded = await downloadImage(asset.file);
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: asset.key,
          Body: downloaded.bytes,
          ContentType: downloaded.contentType,
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: {
            source: "wikimedia-commons",
            license: "CC0-1.0",
            seed: "storefront-world",
          },
        }));
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: asset.key }));
        info = { sourceUrl: downloaded.sourceUrl, contentType: downloaded.contentType, bytes: downloaded.bytes.length };
        uploaded++;
        console.log(`R2 upload OK: ${asset.file} -> ${asset.key} (${downloaded.bytes.length} bytes).`);
      }

      const url = await attachImage(asset, config, client, info);
      console.log(`Catálogo imagen OK: ${product.rows[0].name} -> ${url}`);
    }
    console.log(`World test catalog R2 sync OK: ${uploaded} subidas nuevas, ${reused} objetos reutilizados, ${ASSETS.length}/4 productos con imagen R2 propia.`);
  }
} catch (error) {
  console.error("World test catalog R2 sync FAILED:", error?.message || error);
  exitCode = 1;
} finally {
  await pool.end();
}

process.exitCode = exitCode;
