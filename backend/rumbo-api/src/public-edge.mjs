import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 4000);
const GATEWAY_PORT = Number(process.env.RUMBO_GATEWAY_PORT || 4001);
const CORE_PORT = Number(process.env.RUMBO_CORE_PORT || 4002);
const AGENCY_PORT = Number(process.env.RUMBO_AGENCY_PORT || 4003);
const API_KEY = process.env.RUMBO_API_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.RUMBO_MAIL_FROM || "";
const PUBLIC_URL = (process.env.RUMBO_PUBLIC_URL || "https://rumbo-storefront.onrender.com").replace(/\/$/, "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const gateway = spawn(process.execPath, [new URL("./gateway.mjs", import.meta.url).pathname], {
  env: {
    ...process.env,
    PORT: String(GATEWAY_PORT),
    RUMBO_CORE_PORT: String(CORE_PORT),
  },
  stdio: "inherit",
});

const agency = spawn(process.execPath, [new URL("./agency-service.mjs", import.meta.url).pathname], {
  env: {
    ...process.env,
    PORT: String(AGENCY_PORT),
    RUMBO_GATEWAY_PORT: String(GATEWAY_PORT),
  },
  stdio: "inherit",
});

gateway.on("exit", (code) => {
  console.error(`Rumbo gateway exited with ${code}`);
  process.exit(code ?? 1);
});
agency.on("exit", (code) => {
  console.error(`Rumbo agency service exited with ${code}`);
  process.exit(code ?? 1);
});

const app = express();
app.disable("x-powered-by");
app.use(express.raw({ type: "*/*", limit: "1mb" }));

function requirePublicApiKey(req, res) {
  if (!API_KEY || req.get("X-Rumbo-API-Key") !== API_KEY) {
    res.status(401).json({ error: { message: "API key inválida." } });
    return false;
  }
  return true;
}

function rawJson(req) {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return {};
    return JSON.parse(req.body.toString("utf8"));
  } catch {
    return null;
  }
}

async function adminAccount(req) {
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT a.id,a.email,a.role FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1`,
    [sha256(token)],
  );
  return rows[0]?.role === "wholesaler_admin" ? rows[0] : null;
}

async function requireAdmin(req, res) {
  if (!requirePublicApiKey(req, res)) return null;
  const account = await adminAccount(req);
  if (!account) {
    res.status(401).json({ error: { message: "Se requiere una sesión administrativa de Rumbo." } });
    return null;
  }
  return account;
}

async function sendResetEmail(email, token) {
  if (!RESEND_API_KEY || !MAIL_FROM) {
    console.warn("Password recovery email skipped: RESEND_API_KEY or RUMBO_MAIL_FROM is missing.");
    return false;
  }
  const resetUrl = `${PUBLIC_URL}/recuperar-contrasena?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [email],
      subject: "Recupera tu contraseña de Rumbo",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17233b"><h2>Recupera tu acceso a Rumbo</h2><p>Recibimos una solicitud para cambiar tu contraseña.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#10223f;color:white;text-decoration:none;border-radius:8px">Crear nueva contraseña</a></p><p>Este enlace vence en 30 minutos y solo puede usarse una vez.</p><p>Si no solicitaste este cambio, puedes ignorar este correo.</p></div>`,
    }),
  });
  if (!response.ok) {
    console.error("Resend password recovery failed", response.status, (await response.text()).slice(0, 300));
    return false;
  }
  return true;
}

app.post("/api/access/forgot-password", async (req, res) => {
  if (!requirePublicApiKey(req, res)) return;
  const body = rawJson(req);
  if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const email = String(body.email || "").trim().toLowerCase();
  const generic = { message: "Si el correo está registrado, recibirás un enlace de recuperación en unos minutos." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(generic);
  try {
    const { rows } = await pool.query(`SELECT id,email FROM rumbo_accounts WHERE lower(email)=$1 AND status IN ('active','pending','disabled') LIMIT 1`, [email]);
    const account = rows[0];
    if (!account) return res.json(generic);
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(`UPDATE rumbo_password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE account_id=$1 AND used_at IS NULL`, [account.id]);
    await pool.query(
      `INSERT INTO rumbo_password_reset_tokens(account_id,token_hash,expires_at,requested_ip) VALUES($1,$2,now()+interval '30 minutes',NULLIF($3,'')::inet)`,
      [account.id, sha256(token), req.ip || ""],
    );
    await sendResetEmail(account.email, token);
    return res.json(generic);
  } catch (error) {
    console.error("forgot password failed", error);
    return res.status(500).json({ error: { message: "No pudimos procesar la recuperación en este momento." } });
  }
});

app.post("/api/access/reset-password", async (req, res) => {
  if (!requirePublicApiKey(req, res)) return;
  const body = rawJson(req);
  if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token || password.length < 10) return res.status(422).json({ error: { message: "La nueva contraseña debe tener al menos 10 caracteres." } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT t.id,t.account_id FROM rumbo_password_reset_tokens t WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() LIMIT 1 FOR UPDATE`,
      [sha256(token)],
    );
    const reset = rows[0];
    if (!reset) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: { message: "Este enlace de recuperación venció o ya fue utilizado." } });
    }
    const hash = await bcrypt.hash(password, 12);
    await client.query(`UPDATE rumbo_accounts SET password_hash=$2,must_change_password=false,failed_login_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1`, [reset.account_id, hash]);
    await client.query(`UPDATE rumbo_password_reset_tokens SET used_at=now() WHERE id=$1`, [reset.id]);
    await client.query(`UPDATE rumbo_auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1 AND revoked_at IS NULL`, [reset.account_id]);
    await client.query("COMMIT");
    return res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("reset password failed", error);
    return res.status(500).json({ error: { message: "No pudimos actualizar la contraseña." } });
  } finally {
    client.release();
  }
});

app.get("/api/admin/pricing", async (req, res) => {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const { rows: programs } = await pool.query(`SELECT p.*,COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.priority,r.created_at) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) AS rules FROM rumbo_pricing_programs p LEFT JOIN rumbo_pricing_rules r ON r.program_id=p.id GROUP BY p.id ORDER BY p.priority,p.created_at DESC`);
  res.json({ programs });
});

app.post("/api/admin/pricing/programs", async (req, res) => {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const body = rawJson(req); if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const type = String(body.program_type || "").trim();
  const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]+/g,"-");
  const name = String(body.name || "").trim();
  if (!code || !name || !["campaign","season","administrative"].includes(type)) return res.status(422).json({ error: { message: "Código, nombre y tipo son obligatorios." } });
  try {
    const { rows } = await pool.query(`INSERT INTO rumbo_pricing_programs(code,name,program_type,description,sale_start,sale_end,travel_start,travel_end,priority,status,created_by) VALUES($1,$2,$3,$4,NULLIF($5,'')::date,NULLIF($6,'')::date,NULLIF($7,'')::date,NULLIF($8,'')::date,$9,$10,$11) RETURNING *`, [code,name,type,String(body.description||"").trim()||null,String(body.sale_start||""),String(body.sale_end||""),String(body.travel_start||""),String(body.travel_end||""),Number(body.priority)||100,String(body.status||"active"),admin.id]);
    res.status(201).json({ program: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: { message: "Ya existe un programa con ese código." } });
    console.error(error); res.status(500).json({ error: { message: "No pudimos crear el programa de pricing." } });
  }
});

app.post("/api/admin/pricing/rules", async (req, res) => {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const body = rawJson(req); if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const name=String(body.name||"").trim(), effect=String(body.effect||""), calculation=String(body.calculation_type||""), scope=String(body.scope_type||"all");
  const value=Number(body.value); const scopeValue=scope==="all"?null:String(body.scope_value||"").trim().toUpperCase();
  if (!name || !["charge","discount"].includes(effect) || !["percent","fixed_booking","fixed_passenger"].includes(calculation) || !Number.isFinite(value) || value<0 || !["all","region","destination","product","tag","provider"].includes(scope) || (scope!=="all"&&!scopeValue)) return res.status(422).json({ error: { message: "Completa correctamente la regla de pricing." } });
  try {
    const { rows } = await pool.query(`INSERT INTO rumbo_pricing_rules(program_id,name,effect,calculation_type,value,currency,scope_type,scope_value,sale_start,sale_end,travel_start,travel_end,priority,stackable,is_active,created_by) VALUES(NULLIF($1,'')::uuid,$2,$3,$4,$5,NULLIF($6,''),$7,$8,NULLIF($9,'')::date,NULLIF($10,'')::date,NULLIF($11,'')::date,NULLIF($12,'')::date,$13,$14,$15,$16) RETURNING *`, [String(body.program_id||""),name,effect,calculation,value,calculation==="percent"?"":String(body.currency||"USD").trim().toUpperCase(),scope,scopeValue,String(body.sale_start||""),String(body.sale_end||""),String(body.travel_start||""),String(body.travel_end||""),Number(body.priority)||100,body.stackable!==false,body.is_active!==false,admin.id]);
    res.status(201).json({ rule: rows[0] });
  } catch(error) { console.error(error); res.status(500).json({ error: { message: "No pudimos crear la regla de pricing." } }); }
});

app.patch("/api/admin/pricing/rules/:id", async (req, res) => {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const body = rawJson(req); if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const { rows } = await pool.query(`UPDATE rumbo_pricing_rules SET is_active=COALESCE($2,is_active),updated_at=now() WHERE id=$1::uuid RETURNING *`, [req.params.id,typeof body.is_active==="boolean"?body.is_active:null]);
  if (!rows[0]) return res.status(404).json({ error: { message: "Regla no encontrada." } });
  res.json({ rule: rows[0] });
});

app.post("/api/admin/pricing/simulate", async (req, res) => {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const body = rawJson(req); if (!body) return res.status(400).json({ error: { message: "Formulario inválido." } });
  const base=Number(body.base_amount), travellers=Math.max(1,Number(body.travellers)||1), currency=String(body.currency||"USD").trim().toUpperCase();
  if (!Number.isFinite(base)||base<0) return res.status(422).json({ error: { message: "Precio base inválido." } });
  const saleDate=String(body.sale_date||new Date().toISOString().slice(0,10)), travelDate=String(body.travel_date||saleDate);
  const ctx={region:String(body.region||"").trim().toUpperCase(),destination:String(body.destination||"").trim().toUpperCase(),product:String(body.product||"").trim().toUpperCase(),tag:String(body.tag||"").trim().toUpperCase(),provider:String(body.provider||"").trim().toUpperCase()};
  const { rows } = await pool.query(`SELECT r.*,p.name AS program_name,p.program_type FROM rumbo_pricing_rules r LEFT JOIN rumbo_pricing_programs p ON p.id=r.program_id WHERE r.is_active=true AND (p.id IS NULL OR p.status='active') AND (r.sale_start IS NULL OR r.sale_start<=$1::date) AND (r.sale_end IS NULL OR r.sale_end>=$1::date) AND (r.travel_start IS NULL OR r.travel_start<=$2::date) AND (r.travel_end IS NULL OR r.travel_end>=$2::date) AND (p.sale_start IS NULL OR p.sale_start<=$1::date) AND (p.sale_end IS NULL OR p.sale_end>=$1::date) AND (p.travel_start IS NULL OR p.travel_start<=$2::date) AND (p.travel_end IS NULL OR p.travel_end>=$2::date) ORDER BY COALESCE(p.priority,100),r.priority,r.created_at`,[saleDate,travelDate]);
  let total=base; const applied=[];
  for (const r of rows) {
    const scopeKey=r.scope_type; const match=r.scope_type==="all" || (ctx[scopeKey] && ctx[scopeKey]===String(r.scope_value||"").toUpperCase());
    if (!match) continue;
    if (r.calculation_type!=="percent" && r.currency && r.currency!==currency) continue;
    let amount=0;
    if (r.calculation_type==="percent") amount=total*(Number(r.value)/100);
    else if (r.calculation_type==="fixed_booking") amount=Number(r.value);
    else amount=Number(r.value)*travellers;
    if (r.effect==="discount") amount=-amount;
    total=Math.max(0,total+amount);
    applied.push({ id:r.id,name:r.name,program_name:r.program_name,program_type:r.program_type,effect:r.effect,calculation_type:r.calculation_type,value:Number(r.value),amount:Number(amount.toFixed(2)),running_total:Number(total.toFixed(2)) });
    if (!r.stackable) break;
  }
  res.json({ currency,base_amount:Number(base.toFixed(2)),travellers,applied,total_amount:Number(total.toFixed(2)),delta_amount:Number((total-base).toFixed(2)) });
});

function agencyPath(pathname, method) {
  return pathname === "/api/access/login" ||
    pathname.startsWith("/api/agency/") ||
    pathname.startsWith("/api/admin/agency-") ||
    (pathname === "/api/bookings" && method === "POST");
}

app.use(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null || key === "host" || key === "content-length" || key.toLowerCase() === "x-rumbo-api-key") continue;
      headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    if (API_KEY) headers.set("X-Rumbo-API-Key", API_KEY);

    const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.isBuffer(req.body) ? req.body : undefined;
    const targetPort = agencyPath(req.path, req.method) ? AGENCY_PORT : GATEWAY_PORT;
    const upstream = await fetch(`http://127.0.0.1:${targetPort}${req.originalUrl}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: { message: "Rumbo API no respondió." } });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Rumbo public edge listening on ${PORT}; gateway=${GATEWAY_PORT}; core=${CORE_PORT}; agency=${AGENCY_PORT}`));
