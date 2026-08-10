import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 4000);
const CORE_PORT = Number(process.env.RUMBO_CORE_PORT || 4001);
const API_KEY = process.env.RUMBO_API_KEY || "";
const DEMO_MODE = /^(1|true|yes)$/i.test(process.env.RUMBO_DEMO_MODE || "");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value || "").trim();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

const core = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: String(CORE_PORT) },
  stdio: "inherit",
});
core.on("exit", (code) => {
  console.error(`Rumbo core exited with ${code}`);
  process.exit(code ?? 1);
});

const app = express();
app.use(express.json({ limit: "512kb" }));

function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: { message: "RUMBO_API_KEY no está configurado." } });
  if (req.get("X-Rumbo-API-Key") !== API_KEY) return res.status(401).json({ error: { message: "API key inválida." } });
  next();
}

async function adminSession(req) {
  if (DEMO_MODE && req.get("X-Rumbo-Demo-Role") === "wholesaler_admin") {
    return { account_id: null, email: "demo-admin@rumbo.local", role: "wholesaler_admin" };
  }
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.account_id,a.email,a.role
       FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1`,
    [sha256(token)],
  );
  return rows[0]?.role === "wholesaler_admin" ? rows[0] : null;
}

async function requireAdmin(req, res, next) {
  const session = await adminSession(req);
  if (!session) return res.status(401).json({ error: { message: "Se requiere una sesión administrativa." } });
  req.adminSession = session;
  next();
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await pool.query(
    `INSERT INTO rumbo_audit_events(actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)`,
    [actor, action, entityType, String(entityId), JSON.stringify(details)],
  );
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const coreHealth = await fetch(`http://127.0.0.1:${CORE_PORT}/health`).then((r) => r.ok).catch(() => false);
    res.status(coreHealth ? 200 : 503).json({ status: coreHealth ? "ok" : "degraded", service: "rumbo-api", catalog: "native", bookings: "native", demo_mode: DEMO_MODE });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use(requireApiKey);

app.get("/api/referrals/:code", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  if (!/^RUMBO-[A-Z0-9-]{3,34}$/.test(code)) return res.status(404).json({ valid: false });
  const { rows } = await pool.query(
    `SELECT p.referral_code,p.first_name,p.last_name,a.status
       FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id
      WHERE p.referral_code=$1 AND a.status='active' LIMIT 1`,
    [code],
  );
  if (!rows[0]) return res.status(404).json({ valid: false });
  res.json({ valid: true, code: rows[0].referral_code, partner_name: `${rows[0].first_name} ${rows[0].last_name}`.trim() });
});

const catalogSelect = `
  SELECT p.id,p.slug,p.name,p.short_description,p.description,p.country,p.city,p.destination_iata,
         p.product_type,p.provider,p.provider_reference,p.duration_label,p.tag,p.included,p.status,p.featured,p.sort_order,
         d.id AS departure_id,d.departure_date,d.return_date,d.currency,d.price_amount::float8,d.capacity,d.available_capacity,
         i.url AS image_url,i.alt_text
    FROM rumbo_catalog_products p
    LEFT JOIN LATERAL (
      SELECT * FROM rumbo_catalog_departures d
       WHERE d.product_id=p.id AND d.status='active' AND (d.departure_date IS NULL OR d.departure_date>=current_date)
       ORDER BY d.departure_date NULLS LAST,d.price_amount LIMIT 1
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT * FROM rumbo_catalog_images i WHERE i.product_id=p.id ORDER BY i.is_primary DESC,i.sort_order,i.created_at LIMIT 1
    ) i ON true`;

app.get("/api/catalog", async (req, res) => {
  const destination = clean(req.query.destination).toUpperCase();
  const values = [];
  let where = ` WHERE p.status='published'`;
  if (destination && /^[A-Z]{3}$/.test(destination)) { values.push(destination); where += ` AND p.destination_iata=$${values.length}`; }
  const { rows } = await pool.query(`${catalogSelect}${where} ORDER BY p.featured DESC,p.sort_order,p.created_at DESC LIMIT 100`, values);
  res.json({ mode: "live", source: "rumbo", products: rows });
});

function bookingResponse(row, departure) {
  const unit = Number(departure?.price_amount ?? 0);
  const travellers = Number(row.adults || 0) + Number(row.children || 0);
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    product_name: row.product_name,
    country: row.country,
    departure_date: row.departure_date,
    return_date: row.return_date,
    adults: row.adults,
    children: row.children,
    contact_channel: row.contact_channel,
    unit_price_amount: unit || null,
    total_amount: unit ? unit * travellers : null,
    price_display: row.price_display,
    currency: row.currency,
    remaining_capacity: departure?.available_capacity ?? null,
    payment_status: "pending",
    payment_url: null,
    hold_expires_at: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

app.post("/api/bookings", async (req, res) => {
  const body = req.body || {};
  const idempotency = clean(body.idempotency_key);
  const productId = clean(body.catalog_product_id || body.rumbo_product_id || body.spree_product_id);
  const departureId = clean(body.catalog_departure_id || body.variant_id || body.spree_variant_id);
  const email = clean(body.contact_email).toLowerCase();
  const name = clean(body.contact_name);
  const phone = clean(body.contact_phone);
  const adults = Number(body.adults || 1), children = Number(body.children || 0);
  const referral = clean(body.referral_code).toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(idempotency) || !productId || !email || !name || !phone || adults < 1 || adults > 9 || children < 0 || children > 9) {
    return res.status(422).json({ error: { message: "La solicitud de reserva está incompleta." } });
  }

  const existing = await pool.query(`SELECT * FROM rumbo_booking_requests WHERE idempotency_key=$1::uuid LIMIT 1`, [idempotency]);
  if (existing.rows[0]) {
    const dep = existing.rows[0].catalog_departure_id ? await pool.query(`SELECT price_amount::float8,available_capacity FROM rumbo_catalog_departures WHERE id=$1`, [existing.rows[0].catalog_departure_id]) : { rows: [] };
    return res.json(bookingResponse(existing.rows[0], dep.rows[0]));
  }

  if (referral) {
    const valid = await pool.query(`SELECT 1 FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id WHERE p.referral_code=$1 AND a.status='active'`, [referral]);
    if (!valid.rowCount) return res.status(422).json({ error: { message: "El enlace del Partner ya no es válido." } });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productResult = await client.query(`SELECT * FROM rumbo_catalog_products WHERE id=$1::uuid AND status='published' FOR SHARE`, [productId]);
    const product = productResult.rows[0];
    if (!product) { await client.query("ROLLBACK"); return res.status(404).json({ error: { message: "El producto ya no está disponible." } }); }

    let depQuery = `SELECT * FROM rumbo_catalog_departures WHERE product_id=$1 AND status='active'`;
    const depValues = [product.id];
    if (departureId && /^[0-9a-f-]{36}$/i.test(departureId)) { depValues.push(departureId); depQuery += ` AND id=$2::uuid`; }
    else if (clean(body.departure_date)) { depValues.push(clean(body.departure_date)); depQuery += ` AND departure_date=$2::date`; }
    depQuery += ` ORDER BY departure_date NULLS LAST,price_amount LIMIT 1 FOR UPDATE`;
    const departureResult = await client.query(depQuery, depValues);
    const departure = departureResult.rows[0];
    if (!departure) { await client.query("ROLLBACK"); return res.status(409).json({ error: { message: "No encontramos una salida disponible para esas fechas." } }); }
    const travellers = adults + children;
    if (departure.available_capacity != null && Number(departure.available_capacity) < travellers) {
      await client.query("ROLLBACK"); return res.status(409).json({ error: { message: "No quedan suficientes cupos para todos los viajeros." } });
    }

    if (departure.available_capacity != null) {
      await client.query(`UPDATE rumbo_catalog_departures SET available_capacity=available_capacity-$2,updated_at=now() WHERE id=$1`, [departure.id, travellers]);
      departure.available_capacity = Number(departure.available_capacity) - travellers;
    }
    await client.query(`SELECT set_config('rumbo.actor',$1,true)`, [email]);
    const priceDisplay = `${departure.currency} ${Number(departure.price_amount).toFixed(2)}`;
    const snapshot = { image: body.product_snapshot?.image, duration: product.duration_label, tag: product.tag, included: product.included || [] };
    const inserted = await client.query(
      `INSERT INTO rumbo_booking_requests(
        idempotency_key,catalog_product_id,catalog_departure_id,spree_product_id,spree_variant_id,product_slug,product_name,provider,provider_reference,country,
        origin_iata,destination_iata,departure_date,return_date,adults,children,price_display,currency,contact_name,contact_email,contact_phone,contact_channel,
        referral_code,notes,product_snapshot,status,consent_accepted_at)
       VALUES($1::uuid,$2,$3,NULL,NULL,$4,$5,'Rumbo',$6,$7,NULLIF($8,''),NULLIF($9,''),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,'new',now()) RETURNING *`,
      [idempotency,product.id,departure.id,product.slug,product.name,product.provider_reference,product.country,clean(body.origin_iata).toUpperCase(),product.destination_iata,departure.departure_date,departure.return_date,adults,children,priceDisplay,departure.currency,name,email,phone,clean(body.contact_channel)||"whatsapp",referral||null,clean(body.notes)||null,JSON.stringify(snapshot)],
    );
    await client.query("COMMIT");
    res.status(201).json(bookingResponse(inserted.rows[0], departure));
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error(error);
    res.status(500).json({ error: { message: "No pudimos crear la reserva en Rumbo." } });
  } finally { client.release(); }
});

app.get("/api/bookings/:reference", async (req, res) => {
  const reference = clean(req.params.reference).toUpperCase();
  const email = clean(req.query.email).toLowerCase();
  if (!reference || !email) return res.status(422).json({ error: { message: "Referencia y correo son obligatorios." } });
  const { rows } = await pool.query(`SELECT * FROM rumbo_booking_requests WHERE reference=$1 AND lower(contact_email)=$2 LIMIT 1`, [reference,email]);
  if (!rows[0]) return res.status(404).json({ error: { message: "No encontramos una reserva con esos datos." } });
  const dep = rows[0].catalog_departure_id ? await pool.query(`SELECT price_amount::float8,available_capacity FROM rumbo_catalog_departures WHERE id=$1`, [rows[0].catalog_departure_id]) : { rows: [] };
  res.json(bookingResponse(rows[0], dep.rows[0]));
});

app.get("/api/admin/catalog", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(`${catalogSelect} ORDER BY p.created_at DESC LIMIT 250`);
  res.json({ products: rows });
});

app.post("/api/admin/catalog", requireAdmin, async (req, res) => {
  const name = clean(req.body.name), slug = clean(req.body.slug).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const status = clean(req.body.status) || "draft";
  if (!name || !slug || !["draft","published","archived"].includes(status)) return res.status(422).json({ error: { message: "Nombre, slug y estado son obligatorios." } });
  const included = Array.isArray(req.body.included) ? req.body.included.map((x) => clean(x)).filter(Boolean).slice(0,30) : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO rumbo_catalog_products(slug,name,short_description,description,country,city,destination_iata,product_type,provider,provider_reference,duration_label,tag,included,status,featured,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16) RETURNING *`,
      [slug,name,clean(req.body.short_description)||null,clean(req.body.description)||null,clean(req.body.country)||null,clean(req.body.city)||null,clean(req.body.destination_iata).toUpperCase(),clean(req.body.product_type)||"package",clean(req.body.provider)||"Rumbo",clean(req.body.provider_reference)||null,clean(req.body.duration_label)||null,clean(req.body.tag)||null,JSON.stringify(included),status,Boolean(req.body.featured),Number(req.body.sort_order)||0],
    );
    const product = rows[0];
    const price = Number(req.body.price_amount);
    if (Number.isFinite(price) && price >= 0) {
      await client.query(
        `INSERT INTO rumbo_catalog_departures(product_id,departure_date,return_date,currency,price_amount,capacity,available_capacity,status)
         VALUES($1,NULLIF($2,'')::date,NULLIF($3,'')::date,$4,$5,$6,$7,'active')`,
        [product.id,clean(req.body.departure_date),clean(req.body.return_date),clean(req.body.currency).toUpperCase()||"USD",price,req.body.capacity===""||req.body.capacity==null?null:Number(req.body.capacity),req.body.capacity===""||req.body.capacity==null?null:Number(req.body.capacity)],
      );
    }
    const imageUrl = clean(req.body.image_url);
    if (imageUrl) await client.query(`INSERT INTO rumbo_catalog_images(product_id,url,alt_text,is_primary) VALUES($1,$2,$3,true)`,[product.id,imageUrl,clean(req.body.image_alt)||name]);
    await client.query("COMMIT");
    await audit(req.adminSession.email,"catalog.product_created","catalog_product",product.id,{name,status});
    res.status(201).json({ product });
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    if (error.code === "23505") return res.status(409).json({ error: { message: "Ya existe un producto con ese slug." } });
    console.error(error); res.status(500).json({ error: { message: "No pudimos crear el producto." } });
  } finally { client.release(); }
});

app.patch("/api/admin/catalog/:id", requireAdmin, async (req, res) => {
  const status = clean(req.body.status);
  if (status && !["draft","published","archived"].includes(status)) return res.status(422).json({ error: { message: "Estado inválido." } });
  const { rows } = await pool.query(
    `UPDATE rumbo_catalog_products SET
       name=COALESCE(NULLIF($2,''),name), short_description=COALESCE($3,short_description), description=COALESCE($4,description),
       country=COALESCE($5,country), city=COALESCE($6,city), destination_iata=COALESCE(NULLIF($7,''),destination_iata),
       duration_label=COALESCE($8,duration_label), tag=COALESCE($9,tag), status=COALESCE(NULLIF($10,''),status),
       featured=COALESCE($11,featured), sort_order=COALESCE($12,sort_order)
     WHERE id=$1 RETURNING *`,
    [req.params.id,clean(req.body.name),req.body.short_description ?? null,req.body.description ?? null,req.body.country ?? null,req.body.city ?? null,clean(req.body.destination_iata).toUpperCase(),req.body.duration_label ?? null,req.body.tag ?? null,status,typeof req.body.featured === "boolean" ? req.body.featured : null,Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : null],
  );
  if (!rows[0]) return res.status(404).json({ error: { message: "Producto no encontrado." } });
  await audit(req.adminSession.email,"catalog.product_updated","catalog_product",req.params.id,req.body);
  res.json({ product: rows[0] });
});

app.post("/api/admin/catalog/:id/departures", requireAdmin, async (req, res) => {
  const price = Number(req.body.price_amount);
  if (!Number.isFinite(price) || price < 0) return res.status(422).json({ error: { message: "Precio inválido." } });
  const { rows } = await pool.query(
    `INSERT INTO rumbo_catalog_departures(product_id,departure_date,return_date,currency,price_amount,capacity,available_capacity,status)
     VALUES($1,NULLIF($2,'')::date,NULLIF($3,'')::date,$4,$5,$6,$6,'active') RETURNING *`,
    [req.params.id,clean(req.body.departure_date),clean(req.body.return_date),clean(req.body.currency).toUpperCase()||"USD",price,req.body.capacity===""||req.body.capacity==null?null:Number(req.body.capacity)],
  );
  await audit(req.adminSession.email,"catalog.departure_created","catalog_product",req.params.id,{departure_id:rows[0].id});
  res.status(201).json({ departure: rows[0] });
});

app.post("/api/admin/catalog/:id/images", requireAdmin, async (req, res) => {
  const url = clean(req.body.url); if (!url) return res.status(422).json({ error: { message: "URL de imagen obligatoria." } });
  const primary = Boolean(req.body.is_primary);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (primary) await client.query(`UPDATE rumbo_catalog_images SET is_primary=false WHERE product_id=$1`,[req.params.id]);
    const { rows } = await client.query(`INSERT INTO rumbo_catalog_images(product_id,url,alt_text,sort_order,is_primary) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.id,url,clean(req.body.alt_text)||null,Number(req.body.sort_order)||0,primary]);
    await client.query("COMMIT");
    await audit(req.adminSession.email,"catalog.image_created","catalog_product",req.params.id,{image_id:rows[0].id});
    res.status(201).json({ image: rows[0] });
  } catch(error) { await client.query("ROLLBACK").catch(()=>{}); console.error(error); res.status(500).json({error:{message:"No pudimos agregar la imagen."}}); }
  finally { client.release(); }
});

app.use(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value != null && key !== "host" && key !== "content-length") headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    let body;
    if (!["GET","HEAD"].includes(req.method) && req.body && Object.keys(req.body).length) { body = JSON.stringify(req.body); headers.set("content-type","application/json"); }
    const upstream = await fetch(`http://127.0.0.1:${CORE_PORT}${req.originalUrl}`, { method:req.method, headers, body, redirect:"manual" });
    res.status(upstream.status);
    upstream.headers.forEach((value,key)=>{ if (!["content-encoding","transfer-encoding","connection"].includes(key.toLowerCase())) res.setHeader(key,value); });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error(error); res.status(502).json({ error: { message: "Rumbo core no respondió." } });
  }
});

app.listen(PORT,"0.0.0.0",()=>console.log(`Rumbo gateway listening on ${PORT}; core=${CORE_PORT}`));