import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";
import { installUserManagementRoutes } from "./user-management-routes.mjs";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 4000);
const CORE_PORT = Number(process.env.RUMBO_CORE_PORT || 4001);
const API_KEY = process.env.RUMBO_API_KEY || "";
const DEMO_MODE = /^(1|true|yes)$/i.test(process.env.RUMBO_DEMO_MODE || "");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value || "").trim();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });

const core = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { ...process.env, PORT: String(CORE_PORT) }, stdio: "inherit" });
core.on("exit", (code) => { console.error(`Rumbo core exited with ${code}`); process.exit(code ?? 1); });

const app = express();
app.use(express.json({ limit: "512kb" }));

function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: { message: "RUMBO_API_KEY no está configurado." } });
  if (req.get("X-Rumbo-API-Key") !== API_KEY) return res.status(401).json({ error: { message: "API key inválida." } });
  next();
}

async function adminSession(req) {
  if (DEMO_MODE && req.get("X-Rumbo-Demo-Role") === "wholesaler_admin") return { account_id: null, email: "demo-admin@rumbo.local", role: "wholesaler_admin" };
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { rows } = await pool.query(`SELECT s.account_id,a.email,a.role FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1`, [sha256(token)]);
  return rows[0]?.role === "wholesaler_admin" ? rows[0] : null;
}

async function requireAdmin(req, res, next) {
  const session = await adminSession(req);
  if (!session) return res.status(401).json({ error: { message: "Se requiere una sesión administrativa." } });
  req.adminSession = session;
  next();
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await pool.query(`INSERT INTO rumbo_audit_events(actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)`, [actor, action, entityType, String(entityId), JSON.stringify(details)]);
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const coreHealth = await fetch(`http://127.0.0.1:${CORE_PORT}/health`).then((r) => r.ok).catch(() => false);
    res.status(coreHealth ? 200 : 503).json({ status: coreHealth ? "ok" : "degraded", service: "rumbo-api", catalog: "native", bookings: "native", demo_mode: DEMO_MODE });
  } catch { res.status(503).json({ status: "error" }); }
});

app.use(requireApiKey);
installUserManagementRoutes(app,{pool,requireAdmin,audit});

app.get("/api/referrals/:code", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  if (!/^RUMBO-[A-Z0-9-]{3,34}$/.test(code)) return res.status(404).json({ valid: false });
  const { rows } = await pool.query(`SELECT p.referral_code,p.first_name,p.last_name FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id WHERE p.referral_code=$1 AND a.status='active' LIMIT 1`, [code]);
  if (!rows[0]) return res.status(404).json({ valid: false });
  res.json({ valid: true, code: rows[0].referral_code, partner_name: `${rows[0].first_name} ${rows[0].last_name}`.trim() });
});

const departurePublicJson = `jsonb_build_object(
  'id',x.id,
  'origin_iata',x.origin_iata,
  'departure_date',x.departure_date,
  'return_date',x.return_date,
  'currency',x.currency,
  'price_amount',x.price_amount::float8,
  'taxes_amount',x.taxes_amount::float8,
  'suggested_price_amount',x.suggested_price_amount::float8,
  'capacity',x.capacity,
  'available_capacity',x.available_capacity,
  'low_stock_threshold',x.low_stock_threshold,
  'status',x.status,
  'sale_deadline',x.sale_deadline,
  'sale_timezone',x.sale_timezone,
  'min_passengers_per_booking',x.min_passengers_per_booking,
  'max_passengers_per_booking',x.max_passengers_per_booking,
  'confirmation_mode',x.confirmation_mode,
  'minimum_group_size',x.minimum_group_size,
  'availability_via_api',x.availability_via_api,
  'confirmation_label',CASE WHEN x.confirmation_mode='confirmed' THEN 'Salida confirmada' ELSE 'Sujeta a mínimo de pasajeros' END,
  'sale_open',CASE WHEN x.sale_deadline IS NULL OR x.sale_deadline>=now() THEN true ELSE false END,
  'policy_cancellation',COALESCE(NULLIF(x.policy_cancellation,''),p.policy_cancellation),
  'policy_changes',COALESCE(NULLIF(x.policy_changes,''),p.policy_changes),
  'policy_refund',COALESCE(NULLIF(x.policy_refund,''),p.policy_refund),
  'policy_no_show',COALESCE(NULLIF(x.policy_no_show,''),p.policy_no_show)
)`;

const catalogImagesJoin = `LEFT JOIN LATERAL (
  SELECT
    (array_agg(ci.url ORDER BY ci.is_primary DESC,ci.sort_order,ci.created_at))[1] AS image_url,
    (array_agg(ci.alt_text ORDER BY ci.is_primary DESC,ci.sort_order,ci.created_at))[1] AS alt_text,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',ci.id,
      'url',ci.url,
      'alt_text',ci.alt_text,
      'title',ci.title,
      'author_credit',ci.author_credit,
      'usage_license',ci.usage_license,
      'sort_order',ci.sort_order,
      'is_primary',ci.is_primary
    ) ORDER BY ci.is_primary DESC,ci.sort_order,ci.created_at),'[]'::jsonb) AS images
  FROM rumbo_catalog_images ci
  WHERE ci.product_id=p.id
) image_gallery ON true`;

const catalogTagsJoin = `LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',t.id,'code',t.code,'name',t.name,'tag_type',t.tag_type,'sort_order',pt.sort_order
  ) ORDER BY pt.sort_order,t.name),'[]'::jsonb) AS tags
  FROM rumbo_catalog_product_tags pt
  JOIN rumbo_catalog_tags t ON t.id=pt.tag_id AND t.active=true
  WHERE pt.product_id=p.id
) tag_gallery ON true`;

const catalogDetailsJoin = `LEFT JOIN LATERAL (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'package',(SELECT to_jsonb(pd)-'product_id'-'updated_at' FROM rumbo_catalog_package_details pd WHERE pd.product_id=p.id),
    'hotels',(SELECT COALESCE(jsonb_agg(to_jsonb(hd)-'product_id'-'updated_at' ORDER BY hd.id),'[]'::jsonb) FROM rumbo_catalog_hotel_details hd WHERE hd.product_id=p.id),
    'flights',(SELECT COALESCE(jsonb_agg(to_jsonb(fd)-'product_id'-'updated_at' ORDER BY fd.departure_local NULLS LAST,fd.id),'[]'::jsonb) FROM rumbo_catalog_flight_details fd WHERE fd.product_id=p.id),
    'experiences',(SELECT COALESCE(jsonb_agg(to_jsonb(ed)-'product_id'-'updated_at' ORDER BY ed.start_time NULLS LAST,ed.id),'[]'::jsonb) FROM rumbo_catalog_experience_details ed WHERE ed.product_id=p.id)
  )) AS product_details
) detail_record ON true`;

const catalogSelect = `
SELECT p.id,p.slug,p.name,p.short_description,p.description,p.country,p.country_code,p.city,p.destination_iata,
       p.product_type,p.provider,p.provider_reference,p.duration_label,p.tag,p.included,p.status,p.featured,p.sort_order,
       p.policy_cancellation,p.policy_changes,p.policy_refund,p.policy_no_show,
       d.id AS departure_id,d.origin_iata,d.departure_date,d.return_date,d.currency,d.price_amount::float8,d.taxes_amount::float8,d.suggested_price_amount::float8,
       d.capacity,d.available_capacity,d.low_stock_threshold,d.sale_deadline,d.sale_timezone,d.min_passengers_per_booking,d.max_passengers_per_booking,d.confirmation_mode,d.minimum_group_size,d.availability_via_api,
       stats.from_price_amount,stats.active_departure_count,stats.departures,
       image_gallery.image_url,image_gallery.alt_text,image_gallery.images,
       tag_gallery.tags,detail_record.product_details
FROM rumbo_catalog_products p
LEFT JOIN LATERAL (
  SELECT * FROM rumbo_catalog_departures d
   WHERE d.product_id=p.id AND d.status='active' AND (d.departure_date IS NULL OR d.departure_date>=current_date)
     AND (d.sale_deadline IS NULL OR d.sale_deadline>=now())
   ORDER BY d.departure_date NULLS LAST,d.price_amount LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT MIN(x.price_amount)::float8 AS from_price_amount,
         COUNT(*)::int AS active_departure_count,
         COALESCE(jsonb_agg(${departurePublicJson} ORDER BY x.departure_date NULLS LAST,x.price_amount),'[]'::jsonb) AS departures
    FROM rumbo_catalog_departures x
   WHERE x.product_id=p.id AND x.status='active' AND (x.departure_date IS NULL OR x.departure_date>=current_date)
     AND (x.sale_deadline IS NULL OR x.sale_deadline>=now())
) stats ON true
${catalogImagesJoin}
${catalogTagsJoin}
${catalogDetailsJoin}`;

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
  return { id: row.id, reference: row.reference, status: row.status, product_name: row.product_name, country: row.country, departure_date: row.departure_date, return_date: row.return_date, adults: row.adults, children: row.children, contact_channel: row.contact_channel, unit_price_amount: unit || null, total_amount: unit ? unit * travellers : null, price_display: row.price_display, currency: row.currency, remaining_capacity: departure?.available_capacity ?? null, confirmation_mode: departure?.confirmation_mode ?? null, confirmation_label: departure?.confirmation_mode === "minimum_required" ? "Sujeta a mínimo de pasajeros" : "Salida confirmada", payment_status: "pending", payment_url: null, hold_expires_at: null, created_at: row.created_at, updated_at: row.updated_at };
}

app.post("/api/bookings", async (req, res) => {
  const body = req.body || {};
  const idempotency = clean(body.idempotency_key);
  const productId = clean(body.catalog_product_id || body.rumbo_product_id || body.spree_product_id);
  const departureId = clean(body.catalog_departure_id || body.variant_id || body.spree_variant_id);
  const email = clean(body.contact_email).toLowerCase(), name = clean(body.contact_name), phone = clean(body.contact_phone);
  const adults = Number(body.adults || 1), children = Number(body.children || 0), travellers = adults + children;
  const referral = clean(body.referral_code).toUpperCase(), requestedOrigin = clean(body.origin_iata).toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(idempotency) || !productId || !email || !name || !phone || adults < 1 || adults > 18 || children < 0 || children > 18 || travellers > 18) return res.status(422).json({ error: { message: "La solicitud de reserva está incompleta." } });

  const existing = await pool.query(`SELECT * FROM rumbo_booking_requests WHERE idempotency_key=$1::uuid LIMIT 1`, [idempotency]);
  if (existing.rows[0]) {
    const dep = existing.rows[0].catalog_departure_id ? await pool.query(`SELECT price_amount::float8,available_capacity,confirmation_mode FROM rumbo_catalog_departures WHERE id=$1`, [existing.rows[0].catalog_departure_id]) : { rows: [] };
    return res.json(bookingResponse(existing.rows[0], dep.rows[0]));
  }
  if (referral) {
    const valid = await pool.query(`SELECT 1 FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id WHERE p.referral_code=$1 AND a.status='active'`, [referral]);
    if (!valid.rowCount) return res.status(422).json({ error: { message: "El enlace del Partner ya no es válido." } });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const product = (await client.query(`SELECT * FROM rumbo_catalog_products WHERE id=$1::uuid AND status='published' FOR SHARE`, [productId])).rows[0];
    if (!product) { await client.query("ROLLBACK"); return res.status(404).json({ error: { message: "El producto ya no está disponible." } }); }

    const values = [product.id];
    let depQuery = `SELECT * FROM rumbo_catalog_departures WHERE product_id=$1 AND status='active' AND (sale_deadline IS NULL OR sale_deadline>=now())`;
    if (departureId && /^[0-9a-f-]{36}$/i.test(departureId)) { values.push(departureId); depQuery += ` AND id=$${values.length}::uuid`; }
    else if (clean(body.departure_date)) { values.push(clean(body.departure_date)); depQuery += ` AND departure_date=$${values.length}::date`; }
    if (requestedOrigin && /^[A-Z]{3}$/.test(requestedOrigin)) { values.push(requestedOrigin); depQuery += ` AND (origin_iata IS NULL OR origin_iata=$${values.length})`; }
    depQuery += ` ORDER BY departure_date NULLS LAST,price_amount LIMIT 1 FOR UPDATE`;
    const departure = (await client.query(depQuery, values)).rows[0];
    if (!departure) { await client.query("ROLLBACK"); return res.status(409).json({ error: { message: "La venta de esa salida ya cerró o no está disponible para el origen seleccionado." } }); }
    if (travellers < Number(departure.min_passengers_per_booking || 1) || travellers > Number(departure.max_passengers_per_booking || 9)) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: { message: `Esta salida permite reservas de ${departure.min_passengers_per_booking} a ${departure.max_passengers_per_booking} pasajeros.` } });
    }
    if (departure.available_capacity != null && Number(departure.available_capacity) < travellers) { await client.query("ROLLBACK"); return res.status(409).json({ error: { message: "No quedan suficientes cupos para todos los viajeros." } }); }

    if (departure.available_capacity != null) {
      await client.query(`UPDATE rumbo_catalog_departures SET available_capacity=available_capacity-$2 WHERE id=$1`, [departure.id, travellers]);
      departure.available_capacity = Number(departure.available_capacity) - travellers;
    }
    await client.query(`SELECT set_config('rumbo.actor',$1,true)`, [email]);
    const priceDisplay = `${departure.currency} ${Number(departure.price_amount).toFixed(2)}`;
    const snapshot = { image: body.product_snapshot?.image, duration: product.duration_label, tag: product.tag, included: product.included || [], origin_iata: departure.origin_iata, confirmation_mode: departure.confirmation_mode, minimum_group_size: departure.minimum_group_size, sale_deadline: departure.sale_deadline };
    const inserted = await client.query(`INSERT INTO rumbo_booking_requests(idempotency_key,catalog_product_id,catalog_departure_id,spree_product_id,spree_variant_id,product_slug,product_name,provider,provider_reference,country,origin_iata,destination_iata,departure_date,return_date,adults,children,price_display,currency,contact_name,contact_email,contact_phone,contact_channel,referral_code,notes,product_snapshot,status,consent_accepted_at) VALUES($1::uuid,$2,$3,NULL,NULL,$4,$5,'Rumbo',$6,$7,NULLIF($8,''),NULLIF($9,''),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,'new',now()) RETURNING *`, [idempotency,product.id,departure.id,product.slug,product.name,product.provider_reference,product.country,departure.origin_iata || requestedOrigin,product.destination_iata,departure.departure_date,departure.return_date,adults,children,priceDisplay,departure.currency,name,email,phone,clean(body.contact_channel)||"whatsapp",referral||null,clean(body.notes)||null,JSON.stringify(snapshot)]);
    await client.query("COMMIT");
    res.status(201).json(bookingResponse(inserted.rows[0], departure));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {}); console.error(error); res.status(500).json({ error: { message: "No pudimos crear la reserva en Rumbo." } });
  } finally { client.release(); }
});

app.get("/api/bookings/:reference", async (req, res) => {
  const reference = clean(req.params.reference).toUpperCase(), email = clean(req.query.email).toLowerCase();
  if (!reference || !email) return res.status(422).json({ error: { message: "Referencia y correo son obligatorios." } });
  const row = (await pool.query(`SELECT * FROM rumbo_booking_requests WHERE reference=$1 AND lower(contact_email)=$2 LIMIT 1`, [reference,email])).rows[0];
  if (!row) return res.status(404).json({ error: { message: "No encontramos una reserva con esos datos." } });
  const dep = row.catalog_departure_id ? await pool.query(`SELECT price_amount::float8,available_capacity,confirmation_mode FROM rumbo_catalog_departures WHERE id=$1`, [row.catalog_departure_id]) : { rows: [] };
  res.json(bookingResponse(row, dep.rows[0]));
});

const adminCatalogSelect = `
SELECT p.id,p.slug,p.name,p.short_description,p.description,p.country,p.country_code,p.city,p.destination_iata,
       p.product_type,p.provider,p.provider_reference,p.duration_label,p.tag,p.included,p.status,p.featured,p.sort_order,
       p.policy_cancellation,p.policy_changes,p.policy_refund,p.policy_no_show,p.provider_updated_at,p.provider_product_url,p.observations,
       d.id AS departure_id,d.origin_iata,d.departure_date,d.return_date,d.currency,d.price_amount::float8,d.cost_amount::float8,d.taxes_amount::float8,d.suggested_price_amount::float8,
       (d.price_amount-COALESCE(d.cost_amount,d.price_amount))::float8 AS margin_amount,
       CASE WHEN d.price_amount>0 AND d.cost_amount IS NOT NULL THEN ROUND(((d.price_amount-d.cost_amount)/d.price_amount)*100,2)::float8 ELSE NULL END AS margin_pct,
       d.capacity,d.available_capacity,d.low_stock_threshold,d.sale_deadline,d.sale_timezone,d.min_passengers_per_booking,d.max_passengers_per_booking,
       d.confirmation_mode,d.minimum_group_size,d.provider_variant_reference,d.availability_via_api,d.api_rate_reference,d.api_inventory_reference,
       d.policy_cancellation AS variant_policy_cancellation,d.policy_changes AS variant_policy_changes,d.policy_refund AS variant_policy_refund,d.policy_no_show AS variant_policy_no_show,
       d.provider_updated_at AS departure_provider_updated_at,d.observations AS departure_observations,
       stats.from_price_amount,stats.active_departure_count,stats.departures,
       image_gallery.image_url,image_gallery.alt_text,image_gallery.images,
       tag_gallery.tags,detail_record.product_details
FROM rumbo_catalog_products p
LEFT JOIN LATERAL (
  SELECT * FROM rumbo_catalog_departures d WHERE d.product_id=p.id AND d.status='active' ORDER BY d.departure_date NULLS LAST,d.price_amount LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT MIN(x.price_amount)::float8 AS from_price_amount,COUNT(*)::int AS active_departure_count,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id',x.id,'origin_iata',x.origin_iata,'departure_date',x.departure_date,'return_date',x.return_date,
           'currency',x.currency,'price_amount',x.price_amount::float8,'cost_amount',x.cost_amount::float8,'taxes_amount',x.taxes_amount::float8,'suggested_price_amount',x.suggested_price_amount::float8,
           'margin_amount',(x.price_amount-COALESCE(x.cost_amount,x.price_amount))::float8,
           'margin_pct',CASE WHEN x.price_amount>0 AND x.cost_amount IS NOT NULL THEN ROUND(((x.price_amount-x.cost_amount)/x.price_amount)*100,2)::float8 ELSE NULL END,
           'capacity',x.capacity,'available_capacity',x.available_capacity,'low_stock_threshold',x.low_stock_threshold,'status',x.status,
           'sale_deadline',x.sale_deadline,'sale_timezone',x.sale_timezone,'min_passengers_per_booking',x.min_passengers_per_booking,'max_passengers_per_booking',x.max_passengers_per_booking,
           'confirmation_mode',x.confirmation_mode,'minimum_group_size',x.minimum_group_size,'provider_variant_reference',x.provider_variant_reference,
           'availability_via_api',x.availability_via_api,'api_rate_reference',x.api_rate_reference,'api_inventory_reference',x.api_inventory_reference,
           'policy_cancellation',x.policy_cancellation,'policy_changes',x.policy_changes,'policy_refund',x.policy_refund,'policy_no_show',x.policy_no_show,
           'provider_updated_at',x.provider_updated_at,'observations',x.observations
         ) ORDER BY x.departure_date NULLS LAST,x.price_amount),'[]'::jsonb) AS departures
    FROM rumbo_catalog_departures x WHERE x.product_id=p.id
) stats ON true
${catalogImagesJoin}
${catalogTagsJoin}
${catalogDetailsJoin}`;

app.get("/api/admin/catalog", requireAdmin, async (req, res) => {
  const sort = clean(req.query.sort);
  const order = sort === "margin" ? `COALESCE(margin_amount,0) DESC,p.created_at DESC` : `p.created_at DESC`;
  const { rows } = await pool.query(`${adminCatalogSelect} ORDER BY ${order} LIMIT 250`);
  res.json({ products: rows, sort });
});

function departureFields(body) {
  const price = Number(body.price_amount), capacity = body.capacity === "" || body.capacity == null ? null : Number(body.capacity);
  const availableCapacity = body.available_capacity === "" || body.available_capacity == null ? capacity : Number(body.available_capacity);
  const minPassengers = Math.max(1, Number(body.min_passengers_per_booking ?? 1));
  const maxPassengers = Math.min(18, Math.max(minPassengers, Number(body.max_passengers_per_booking ?? 9)));
  const cost = body.cost_amount === "" || body.cost_amount == null ? null : Number(body.cost_amount);
  const taxes = body.taxes_amount === "" || body.taxes_amount == null ? null : Number(body.taxes_amount);
  const suggestedPrice = body.suggested_price_amount === "" || body.suggested_price_amount == null ? null : Number(body.suggested_price_amount);
  const confirmationMode = clean(body.confirmation_mode) === "minimum_required" ? "minimum_required" : "confirmed";
  const minimumGroupSize = confirmationMode === "minimum_required" ? Math.max(1, Number(body.minimum_group_size ?? minPassengers)) : null;
  return {
    price,
    cost,
    taxes,
    suggestedPrice,
    capacity,
    availableCapacity,
    minPassengers,
    maxPassengers,
    confirmationMode,
    minimumGroupSize,
    providerVariantReference: clean(body.provider_variant_reference) || null,
    saleTimezone: clean(body.sale_timezone) || null,
    availabilityViaApi: Boolean(body.availability_via_api),
    apiRateReference: clean(body.api_rate_reference) || null,
    apiInventoryReference: clean(body.api_inventory_reference) || null,
    policyCancellation: clean(body.policy_cancellation) || null,
    policyChanges: clean(body.policy_changes) || null,
    policyRefund: clean(body.policy_refund) || null,
    policyNoShow: clean(body.policy_no_show) || null,
    providerUpdatedAt: clean(body.provider_updated_at) || null,
    observations: clean(body.observations) || null,
  };
}

function catalogBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = clean(value).toLowerCase();
  if (["1","true","yes","si","sí"].includes(normalized)) return true;
  if (["0","false","no"].includes(normalized)) return false;
  return null;
}

async function saveCatalogTags(client, productId, tags) {
  if (!Array.isArray(tags)) return;
  await client.query(`DELETE FROM rumbo_catalog_product_tags WHERE product_id=$1`, [productId]);
  for (let index = 0; index < tags.length; index += 1) {
    const raw = typeof tags[index] === "string" ? { name: tags[index] } : tags[index] || {};
    const name = clean(raw.name || raw.tag);
    if (!name) continue;
    const code = clean(raw.code || name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,60);
    const type = ["commercial","theme","audience","amenity","legacy"].includes(clean(raw.tag_type || raw.type)) ? clean(raw.tag_type || raw.type) : "commercial";
    const tag = (await client.query(
      `INSERT INTO rumbo_catalog_tags(code,name,tag_type) VALUES($1,$2,$3)
       ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,tag_type=EXCLUDED.tag_type,active=true
       RETURNING id`,
      [code || `TAG_${index+1}`,name,type],
    )).rows[0];
    await client.query(
      `INSERT INTO rumbo_catalog_product_tags(product_id,tag_id,sort_order,observations)
       VALUES($1,$2,$3,$4) ON CONFLICT(product_id,tag_id)
       DO UPDATE SET sort_order=EXCLUDED.sort_order,observations=EXCLUDED.observations`,
      [productId,tag.id,Number(raw.sort_order ?? raw.order ?? index) || 0,clean(raw.observations) || null],
    );
  }
}

async function saveCatalogDetails(client, productId, productType, details) {
  if (!details || typeof details !== "object") return;
  const type = clean(productType);
  if (type === "package") {
    const d = details.package && typeof details.package === "object" ? details.package : details;
    await client.query(
      `INSERT INTO rumbo_catalog_package_details(
         product_id,origin_iata,flight_included,airline,hotel_included,hotel_name,hotel_category,room_type,meal_plan,
         transfers_included,excursions_included,insurance_included,detailed_itinerary,documentation_requirements,operational_notes,updated_at
       ) VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
       ON CONFLICT(product_id) DO UPDATE SET
         origin_iata=EXCLUDED.origin_iata,flight_included=EXCLUDED.flight_included,airline=EXCLUDED.airline,
         hotel_included=EXCLUDED.hotel_included,hotel_name=EXCLUDED.hotel_name,hotel_category=EXCLUDED.hotel_category,
         room_type=EXCLUDED.room_type,meal_plan=EXCLUDED.meal_plan,transfers_included=EXCLUDED.transfers_included,
         excursions_included=EXCLUDED.excursions_included,insurance_included=EXCLUDED.insurance_included,
         detailed_itinerary=EXCLUDED.detailed_itinerary,documentation_requirements=EXCLUDED.documentation_requirements,
         operational_notes=EXCLUDED.operational_notes,updated_at=now()`,
      [
        productId,clean(d.origin_iata).toUpperCase(),catalogBoolean(d.flight_included),clean(d.airline)||null,
        catalogBoolean(d.hotel_included),clean(d.hotel_name)||null,clean(d.hotel_category)||null,clean(d.room_type)||null,
        clean(d.meal_plan)||null,catalogBoolean(d.transfers_included),clean(d.excursions_included)||null,
        catalogBoolean(d.insurance_included),clean(d.detailed_itinerary)||null,clean(d.documentation_requirements)||null,
        clean(d.operational_notes)||null,
      ],
    );
    return;
  }

  if (type === "hotel") {
    const rows = Array.isArray(details.hotels) ? details.hotels : [details.hotel || details];
    await client.query(`DELETE FROM rumbo_catalog_hotel_details WHERE product_id=$1`,[productId]);
    for (const d of rows) {
      if (!d || typeof d !== "object") continue;
      await client.query(
        `INSERT INTO rumbo_catalog_hotel_details(
           product_id,provider_hotel_id,hotel_name,star_category,address,latitude,longitude,check_in_time,check_out_time,
           provider_room_id,room_type,max_occupancy,provider_rate_plan_id,meal_plan,amenities,children_policy,pets_policy,observations
         ) VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::time,NULLIF($9,'')::time,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [productId,clean(d.provider_hotel_id)||null,clean(d.hotel_name)||null,d.star_category==null||d.star_category===""?null:Number(d.star_category),
         clean(d.address)||null,d.latitude==null||d.latitude===""?null:Number(d.latitude),d.longitude==null||d.longitude===""?null:Number(d.longitude),
         clean(d.check_in_time),clean(d.check_out_time),clean(d.provider_room_id)||null,clean(d.room_type)||null,
         d.max_occupancy==null||d.max_occupancy===""?null:Number(d.max_occupancy),clean(d.provider_rate_plan_id)||null,clean(d.meal_plan)||null,
         clean(d.amenities)||null,clean(d.children_policy)||null,clean(d.pets_policy)||null,clean(d.observations)||null],
      );
    }
    return;
  }

  if (type === "flight") {
    const rows = Array.isArray(details.flights) ? details.flights : [details.flight || details];
    await client.query(`DELETE FROM rumbo_catalog_flight_details WHERE product_id=$1`,[productId]);
    for (const d of rows) {
      if (!d || typeof d !== "object") continue;
      await client.query(
        `INSERT INTO rumbo_catalog_flight_details(
           product_id,departure_id,provider_variant_reference,airline_iata,flight_number,origin_iata,destination_iata,
           departure_local,arrival_local,origin_timezone,destination_timezone,cabin,fare_family,booking_class,stops,
           checked_baggage,cabin_baggage,seat_included,refundable,changes_allowed,provider_offer_reference,observations
         ) VALUES($1,NULLIF($2,'')::uuid,$3,NULLIF($4,''),$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,'')::timestamp,NULLIF($9,'')::timestamp,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [productId,clean(d.departure_id),clean(d.provider_variant_reference)||null,clean(d.airline_iata).toUpperCase(),
         clean(d.flight_number)||null,clean(d.origin_iata).toUpperCase(),clean(d.destination_iata).toUpperCase(),
         clean(d.departure_local),clean(d.arrival_local),clean(d.origin_timezone)||null,clean(d.destination_timezone)||null,
         clean(d.cabin)||null,clean(d.fare_family)||null,clean(d.booking_class)||null,d.stops==null||d.stops===""?null:Number(d.stops),
         clean(d.checked_baggage)||null,clean(d.cabin_baggage)||null,catalogBoolean(d.seat_included),catalogBoolean(d.refundable),
         catalogBoolean(d.changes_allowed),clean(d.provider_offer_reference)||null,clean(d.observations)||null],
      );
    }
    return;
  }

  if (type === "experience") {
    const rows = Array.isArray(details.experiences) ? details.experiences : [details.experience || details];
    await client.query(`DELETE FROM rumbo_catalog_experience_details WHERE product_id=$1`,[productId]);
    for (const d of rows) {
      if (!d || typeof d !== "object") continue;
      await client.query(
        `INSERT INTO rumbo_catalog_experience_details(
           product_id,provider_activity_id,meeting_point,latitude,longitude,duration,start_time,languages,minimum_age,maximum_age,
           accessibility,what_to_bring,restrictions,instant_confirmation,voucher_type,observations
         ) VALUES($1,$2,$3,$4,$5,$6,NULLIF($7,'')::time,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [productId,clean(d.provider_activity_id)||null,clean(d.meeting_point)||null,
         d.latitude==null||d.latitude===""?null:Number(d.latitude),d.longitude==null||d.longitude===""?null:Number(d.longitude),
         clean(d.duration)||null,clean(d.start_time),clean(d.languages)||null,
         d.minimum_age==null||d.minimum_age===""?null:Number(d.minimum_age),d.maximum_age==null||d.maximum_age===""?null:Number(d.maximum_age),
         clean(d.accessibility)||null,clean(d.what_to_bring)||null,clean(d.restrictions)||null,catalogBoolean(d.instant_confirmation),
         clean(d.voucher_type)||null,clean(d.observations)||null],
      );
    }
  }
}

app.post("/api/admin/catalog", requireAdmin, async (req, res) => {
  const name = clean(req.body.name);
  const slug = clean(req.body.slug).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const status = clean(req.body.status) || "draft";
  const productType = clean(req.body.product_type) || "package";
  if (!name || !slug || !["draft","published","archived"].includes(status) || !["package","hotel","flight","experience","other"].includes(productType)) {
    return res.status(422).json({ error: { message: "Nombre, slug, tipo de producto y estado son obligatorios." } });
  }
  const included = Array.isArray(req.body.included) ? req.body.included.map((x) => clean(x)).filter(Boolean).slice(0,60) : [];
  const countryCode = /^[A-Z]{2}$/.test(clean(req.body.country_code).toUpperCase()) ? clean(req.body.country_code).toUpperCase() : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const product = (await client.query(
      `INSERT INTO rumbo_catalog_products(
         slug,name,short_description,description,country,country_code,city,destination_iata,product_type,provider,provider_reference,
         duration_label,tag,included,status,featured,sort_order,policy_cancellation,policy_changes,policy_refund,policy_no_show,
         provider_updated_at,provider_product_url,observations
       ) VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,NULLIF($22,'')::timestamptz,$23,$24)
       RETURNING *`,
      [slug,name,clean(req.body.short_description)||null,clean(req.body.description)||null,clean(req.body.country)||null,countryCode,
       clean(req.body.city)||null,clean(req.body.destination_iata).toUpperCase(),productType,clean(req.body.provider)||"Rumbo",
       clean(req.body.provider_reference)||null,clean(req.body.duration_label)||null,clean(req.body.tag)||null,JSON.stringify(included),
       status,Boolean(req.body.featured),Number(req.body.sort_order)||0,clean(req.body.policy_cancellation)||null,clean(req.body.policy_changes)||null,
       clean(req.body.policy_refund)||null,clean(req.body.policy_no_show)||null,clean(req.body.provider_updated_at),
       clean(req.body.provider_product_url)||null,clean(req.body.observations)||null],
    )).rows[0];

    await saveCatalogTags(client, product.id, req.body.tags);
    await saveCatalogDetails(client, product.id, productType, req.body.details);

    const d = departureFields(req.body);
    if (Number.isFinite(d.price) && d.price >= 0) {
      await client.query(
        `INSERT INTO rumbo_catalog_departures(
           product_id,provider_variant_reference,origin_iata,departure_date,return_date,currency,price_amount,cost_amount,taxes_amount,suggested_price_amount,
           capacity,available_capacity,low_stock_threshold,sale_deadline,sale_timezone,min_passengers_per_booking,max_passengers_per_booking,
           confirmation_mode,minimum_group_size,availability_via_api,api_rate_reference,api_inventory_reference,
           policy_cancellation,policy_changes,policy_refund,policy_no_show,provider_updated_at,observations,status
         ) VALUES($1,$2,NULLIF($3,''),NULLIF($4,'')::date,NULLIF($5,'')::date,$6,$7,$8,$9,$10,$11,$12,$13,NULLIF($14,'')::timestamptz,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NULLIF($27,'')::timestamptz,$28,'active')`,
        [product.id,d.providerVariantReference,clean(req.body.origin_iata).toUpperCase(),clean(req.body.departure_date),clean(req.body.return_date),
         clean(req.body.currency).toUpperCase()||"USD",d.price,d.cost,d.taxes,d.suggestedPrice,d.capacity,d.availableCapacity,
         Math.max(0,Number(req.body.low_stock_threshold ?? 5)),clean(req.body.sale_deadline),d.saleTimezone,d.minPassengers,d.maxPassengers,
         d.confirmationMode,d.minimumGroupSize,d.availabilityViaApi,d.apiRateReference,d.apiInventoryReference,d.policyCancellation,d.policyChanges,
         d.policyRefund,d.policyNoShow,d.providerUpdatedAt,d.observations],
      );
    }

    const imageUrl = clean(req.body.image_url);
    if (imageUrl) {
      await client.query(
        `INSERT INTO rumbo_catalog_images(product_id,url,alt_text,title,author_credit,usage_license,sort_order,is_primary,provider_updated_at,observations)
         VALUES($1,$2,$3,$4,$5,$6,0,true,NULLIF($7,'')::timestamptz,$8)`,
        [product.id,imageUrl,clean(req.body.image_alt)||name,clean(req.body.image_title)||null,clean(req.body.image_author_credit)||null,
         clean(req.body.image_usage_license)||null,clean(req.body.image_provider_updated_at),clean(req.body.image_observations)||null],
      );
    }

    await client.query("COMMIT");
    await audit(req.adminSession.email,"catalog.product_created","catalog_product",product.id,{name,status,product_type:productType});
    res.status(201).json({ product });
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    if (error.code === "23505") return res.status(409).json({ error: { message: "Ya existe un producto con ese código o referencia." } });
    console.error(error);
    res.status(500).json({ error: { message: "No pudimos crear el producto." } });
  } finally { client.release(); }
});

app.patch("/api/admin/catalog/:id", requireAdmin, async (req, res) => {
  const status = clean(req.body.status);
  const productType = clean(req.body.product_type);
  if (status && !["draft","published","archived"].includes(status)) return res.status(422).json({ error: { message: "Estado inválido." } });
  if (productType && !["package","hotel","flight","experience","other"].includes(productType)) return res.status(422).json({ error: { message: "Tipo de producto inválido." } });
  const included = Array.isArray(req.body.included) ? JSON.stringify(req.body.included.map((x)=>clean(x)).filter(Boolean).slice(0,60)) : null;
  const code = clean(req.body.country_code).toUpperCase();
  const { rows } = await pool.query(
    `UPDATE rumbo_catalog_products SET
       name=COALESCE(NULLIF($2,''),name),
       short_description=COALESCE($3,short_description),
       description=COALESCE($4,description),
       country=COALESCE($5,country),
       country_code=COALESCE(NULLIF($6,'')::char(2),country_code),
       city=COALESCE($7,city),
       destination_iata=COALESCE(NULLIF($8,''),destination_iata),
       product_type=COALESCE(NULLIF($9,''),product_type),
       provider=COALESCE(NULLIF($10,''),provider),
       provider_reference=COALESCE(NULLIF($11,''),provider_reference),
       duration_label=COALESCE($12,duration_label),
       tag=COALESCE($13,tag),
       included=COALESCE($14::jsonb,included),
       status=COALESCE(NULLIF($15,''),status),
       featured=COALESCE($16,featured),
       sort_order=COALESCE($17,sort_order),
       policy_cancellation=COALESCE($18,policy_cancellation),
       policy_changes=COALESCE($19,policy_changes),
       policy_refund=COALESCE($20,policy_refund),
       policy_no_show=COALESCE($21,policy_no_show),
       provider_updated_at=COALESCE(NULLIF($22,'')::timestamptz,provider_updated_at),
       provider_product_url=COALESCE($23,provider_product_url),
       observations=COALESCE($24,observations)
     WHERE id=$1 RETURNING *`,
    [req.params.id,clean(req.body.name),req.body.short_description ?? null,req.body.description ?? null,req.body.country ?? null,
     /^[A-Z]{2}$/.test(code)?code:"",req.body.city ?? null,clean(req.body.destination_iata).toUpperCase(),productType,
     clean(req.body.provider),clean(req.body.provider_reference),req.body.duration_label ?? null,req.body.tag ?? null,included,status,
     typeof req.body.featured === "boolean" ? req.body.featured : null,Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : null,
     req.body.policy_cancellation ?? null,req.body.policy_changes ?? null,req.body.policy_refund ?? null,req.body.policy_no_show ?? null,
     clean(req.body.provider_updated_at),req.body.provider_product_url ?? null,req.body.observations ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: { message: "Producto no encontrado." } });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (Array.isArray(req.body.tags)) await saveCatalogTags(client,req.params.id,req.body.tags);
    if (req.body.details && typeof req.body.details === "object") await saveCatalogDetails(client,req.params.id,productType||rows[0].product_type,req.body.details);
    await client.query("COMMIT");
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error(error);
    return res.status(500).json({error:{message:"El producto se actualizó, pero no pudimos guardar sus tags o ficha específica."}});
  } finally { client.release(); }

  await audit(req.adminSession.email,"catalog.product_updated","catalog_product",req.params.id,req.body);
  res.json({ product: rows[0] });
});

app.put("/api/admin/catalog/:id/tags", requireAdmin, async (req,res)=>{
  if(!Array.isArray(req.body.tags)) return res.status(422).json({error:{message:"Envía una lista de tags."}});
  const client=await pool.connect();
  try{await client.query("BEGIN");await saveCatalogTags(client,req.params.id,req.body.tags);await client.query("COMMIT");await audit(req.adminSession.email,"catalog.tags_updated","catalog_product",req.params.id,{count:req.body.tags.length});res.json({ok:true})}
  catch(error){await client.query("ROLLBACK").catch(()=>{});console.error(error);res.status(500).json({error:{message:"No pudimos guardar los tags."}})}
  finally{client.release()}
});

app.put("/api/admin/catalog/:id/details", requireAdmin, async (req,res)=>{
  const product=(await pool.query(`SELECT product_type FROM rumbo_catalog_products WHERE id=$1`,[req.params.id])).rows[0];
  if(!product)return res.status(404).json({error:{message:"Producto no encontrado."}});
  const client=await pool.connect();
  try{await client.query("BEGIN");await saveCatalogDetails(client,req.params.id,product.product_type,req.body.details||req.body);await client.query("COMMIT");await audit(req.adminSession.email,"catalog.details_updated","catalog_product",req.params.id,{product_type:product.product_type});res.json({ok:true})}
  catch(error){await client.query("ROLLBACK").catch(()=>{});console.error(error);res.status(500).json({error:{message:"No pudimos guardar la ficha específica del producto."}})}
  finally{client.release()}
});

app.post("/api/admin/catalog/:id/departures", requireAdmin, async (req, res) => {
  const d = departureFields(req.body);
  const status = ["active","sold_out","inactive"].includes(clean(req.body.status)) ? clean(req.body.status) : "active";
  if (!Number.isFinite(d.price) || d.price < 0) return res.status(422).json({ error: { message: "Precio comercial final inválido." } });
  const { rows } = await pool.query(
    `INSERT INTO rumbo_catalog_departures(
       product_id,provider_variant_reference,origin_iata,departure_date,return_date,currency,price_amount,cost_amount,taxes_amount,suggested_price_amount,
       capacity,available_capacity,low_stock_threshold,sale_deadline,sale_timezone,min_passengers_per_booking,max_passengers_per_booking,
       confirmation_mode,minimum_group_size,availability_via_api,api_rate_reference,api_inventory_reference,
       policy_cancellation,policy_changes,policy_refund,policy_no_show,provider_updated_at,observations,status
     ) VALUES($1,$2,NULLIF($3,''),NULLIF($4,'')::date,NULLIF($5,'')::date,$6,$7,$8,$9,$10,$11,$12,$13,NULLIF($14,'')::timestamptz,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NULLIF($27,'')::timestamptz,$28,$29)
     RETURNING *, (price_amount-COALESCE(cost_amount,price_amount))::float8 AS margin_amount,
       CASE WHEN price_amount>0 AND cost_amount IS NOT NULL THEN ROUND(((price_amount-cost_amount)/price_amount)*100,2)::float8 ELSE NULL END AS margin_pct`,
    [req.params.id,d.providerVariantReference,clean(req.body.origin_iata).toUpperCase(),clean(req.body.departure_date),clean(req.body.return_date),
     clean(req.body.currency).toUpperCase()||"USD",d.price,d.cost,d.taxes,d.suggestedPrice,d.capacity,d.availableCapacity,
     Math.max(0,Number(req.body.low_stock_threshold ?? 5)),clean(req.body.sale_deadline),d.saleTimezone,d.minPassengers,d.maxPassengers,
     d.confirmationMode,d.minimumGroupSize,d.availabilityViaApi,d.apiRateReference,d.apiInventoryReference,d.policyCancellation,d.policyChanges,
     d.policyRefund,d.policyNoShow,d.providerUpdatedAt,d.observations,status],
  );
  await audit(req.adminSession.email,"catalog.departure_created","catalog_product",req.params.id,{departure_id:rows[0].id});
  res.status(201).json({ departure: rows[0] });
});

app.patch("/api/admin/catalog/:id/departures/:departureId", requireAdmin, async (req,res)=>{
  const d=departureFields(req.body);
  const status=["active","sold_out","inactive"].includes(clean(req.body.status))?clean(req.body.status):"active";
  if(!Number.isFinite(d.price)||d.price<0)return res.status(422).json({error:{message:"Precio comercial final inválido."}});
  const {rows}=await pool.query(
    `UPDATE rumbo_catalog_departures SET
       provider_variant_reference=$3,origin_iata=NULLIF($4,''),departure_date=NULLIF($5,'')::date,return_date=NULLIF($6,'')::date,
       currency=$7,price_amount=$8,cost_amount=$9,taxes_amount=$10,suggested_price_amount=$11,capacity=$12,
       available_capacity=$13,low_stock_threshold=$14,sale_deadline=NULLIF($15,'')::timestamptz,sale_timezone=$16,
       min_passengers_per_booking=$17,max_passengers_per_booking=$18,confirmation_mode=$19,minimum_group_size=$20,
       availability_via_api=$21,api_rate_reference=$22,api_inventory_reference=$23,policy_cancellation=$24,policy_changes=$25,
       policy_refund=$26,policy_no_show=$27,provider_updated_at=NULLIF($28,'')::timestamptz,observations=$29,status=$30
     WHERE product_id=$1 AND id=$2 RETURNING *,
       (price_amount-COALESCE(cost_amount,price_amount))::float8 AS margin_amount,
       CASE WHEN price_amount>0 AND cost_amount IS NOT NULL THEN ROUND(((price_amount-cost_amount)/price_amount)*100,2)::float8 ELSE NULL END AS margin_pct`,
    [req.params.id,req.params.departureId,d.providerVariantReference,clean(req.body.origin_iata).toUpperCase(),clean(req.body.departure_date),
     clean(req.body.return_date),clean(req.body.currency).toUpperCase()||"USD",d.price,d.cost,d.taxes,d.suggestedPrice,d.capacity,d.availableCapacity,
     Math.max(0,Number(req.body.low_stock_threshold ?? 5)),clean(req.body.sale_deadline),d.saleTimezone,d.minPassengers,d.maxPassengers,
     d.confirmationMode,d.minimumGroupSize,d.availabilityViaApi,d.apiRateReference,d.apiInventoryReference,d.policyCancellation,d.policyChanges,
     d.policyRefund,d.policyNoShow,d.providerUpdatedAt,d.observations,status],
  );
  if(!rows[0])return res.status(404).json({error:{message:"Salida no encontrada."}});
  await audit(req.adminSession.email,"catalog.departure_updated","catalog_product",req.params.id,{departure_id:req.params.departureId});
  res.json({departure:rows[0]});
});

app.post("/api/admin/catalog/:id/images", requireAdmin, async (req, res) => {
  const url = clean(req.body.url);
  if (!url) return res.status(422).json({ error: { message: "URL de imagen obligatoria." } });
  const primary = Boolean(req.body.is_primary), client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (primary) await client.query(`UPDATE rumbo_catalog_images SET is_primary=false WHERE product_id=$1`,[req.params.id]);
    const { rows } = await client.query(
      `INSERT INTO rumbo_catalog_images(
         product_id,url,alt_text,title,author_credit,usage_license,sort_order,is_primary,storage_provider,storage_key,bucket_name,provider_updated_at,observations
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,'')::timestamptz,$13) RETURNING *`,
      [req.params.id,url,clean(req.body.alt_text)||null,clean(req.body.title)||null,clean(req.body.author_credit)||null,
       clean(req.body.usage_license)||null,Number(req.body.sort_order)||0,primary,clean(req.body.storage_provider)||"external",
       clean(req.body.storage_key)||null,clean(req.body.bucket_name)||null,clean(req.body.provider_updated_at),clean(req.body.observations)||null],
    );
    await client.query("COMMIT");
    await audit(req.adminSession.email,"catalog.image_created","catalog_product",req.params.id,{image_id:rows[0].id});
    res.status(201).json({ image: rows[0] });
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error(error);
    res.status(500).json({error:{message:"No pudimos agregar la imagen."}});
  } finally { client.release(); }
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
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) { console.error(error); res.status(502).json({ error: { message: "Rumbo core no respondió." } }); }
});

app.listen(PORT,"0.0.0.0",()=>console.log(`Rumbo gateway listening on ${PORT}; core=${CORE_PORT}`));
