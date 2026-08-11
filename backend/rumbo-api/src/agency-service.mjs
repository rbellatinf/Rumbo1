import crypto from "node:crypto";
import express from "express";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "512kb" }));

const PORT = Number(process.env.PORT || 4003);
const GATEWAY_PORT = Number(process.env.RUMBO_GATEWAY_PORT || 4001);
const API_KEY = process.env.RUMBO_API_KEY || "";
const DEMO_MODE = /^(1|true|yes)$/i.test(process.env.RUMBO_DEMO_MODE || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
const clean = (v) => String(v || "").trim();
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: { message: "RUMBO_API_KEY no está configurado." } });
  if (req.get("X-Rumbo-API-Key") !== API_KEY) return res.status(401).json({ error: { message: "API key inválida." } });
  next();
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await pool.query(
    `INSERT INTO rumbo_audit_events(actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)`,
    [actor, action, entityType, String(entityId), JSON.stringify(details)],
  );
}

async function currentSession(req) {
  const header = req.get("Authorization") || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      const { rows } = await pool.query(
        `SELECT s.id AS session_id,s.account_id,a.email,a.role,a.status,m.retailer_id,m.member_role
           FROM rumbo_auth_sessions s
           JOIN rumbo_accounts a ON a.id=s.account_id
           LEFT JOIN rumbo_retailer_members m ON m.account_id=a.id
          WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
          LIMIT 1`,
        [sha256(token)],
      );
      return rows[0] || null;
    }
  }
  if (!DEMO_MODE) return null;
  const demoRole = req.get("X-Rumbo-Demo-Role");
  if (demoRole === "retailer") {
    const { rows } = await pool.query(
      `SELECT a.id AS account_id,a.email,a.role,a.status,m.retailer_id,m.member_role
         FROM rumbo_retailer_members m JOIN rumbo_accounts a ON a.id=m.account_id
        ORDER BY CASE WHEN m.member_role='admin' THEN 0 ELSE 1 END,m.created_at LIMIT 1`,
    );
    return rows[0] ? { ...rows[0], demo: true, session_id: null } : null;
  }
  if (demoRole === "wholesaler_admin") {
    return { account_id: null, email: "demo-admin@rumbo.local", role: "wholesaler_admin", status: "active", demo: true };
  }
  return null;
}

async function requireSession(req, res, next) {
  const session = await currentSession(req);
  if (!session) return res.status(401).json({ error: { message: "La sesión venció o no es válida." } });
  req.rumboSession = session;
  next();
}

function requireWholesaler(req, res, next) {
  if (req.rumboSession?.role !== "wholesaler_admin") return res.status(403).json({ error: { message: "Se requiere administración de Rumbo." } });
  next();
}

function requireRetailerAdmin(req, res, next) {
  if (!req.rumboSession?.retailer_id || req.rumboSession.member_role !== "admin") {
    return res.status(403).json({ error: { message: "Solo un administrador de la agencia puede solicitar usuarios." } });
  }
  next();
}

async function accountPayload(accountId) {
  const { rows: accounts } = await pool.query(`SELECT id,email,role,status,last_login_at FROM rumbo_accounts WHERE id=$1`, [accountId]);
  const account = accounts[0];
  if (!account) return null;
  const { rows } = await pool.query(
    `SELECT r.id AS retailer_id,r.trade_name,r.legal_name,r.tax_id,r.status AS retailer_status,
            r.user_limit,r.inactivity_days,m.member_role,m.first_name,m.last_name
       FROM rumbo_retailer_members m JOIN rumbo_retailers r ON r.id=m.retailer_id
      WHERE m.account_id=$1`,
    [accountId],
  );
  return rows[0]
    ? { account, profile: { type: "retailer", ...rows[0] }, redirect_to: "/agencia" }
    : { account, profile: null, redirect_to: "/" };
}

async function issueSession(client, accountId, remember, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const hours = remember ? 720 : 12;
  await client.query(
    `INSERT INTO rumbo_auth_sessions(account_id,token_hash,ip_address,user_agent,expires_at)
     VALUES($1,$2,NULLIF($3,'')::inet,$4,now()+($5||' hours')::interval)`,
    [accountId, sha256(token), req.ip || "", req.get("user-agent") || null, String(hours)],
  );
  return token;
}

async function proxyToGateway(req, res) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || key === "host" || key === "content-length") continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  if (API_KEY) headers.set("X-Rumbo-API-Key", API_KEY);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {});
  if (body) headers.set("content-type", "application/json");
  const upstream = await fetch(`http://127.0.0.1:${GATEWAY_PORT}${req.originalUrl}`, { method: req.method, headers, body, redirect: "manual" });
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) res.setHeader(key, value);
  });
  res.send(buffer);
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "rumbo-agency" }); }
  catch { res.status(503).json({ status: "error" }); }
});
app.use(requireApiKey);

// Intercepta el login de usuarios de agencia para materializar la regla de 30 días.
// Partners y administradores Rumbo siguen usando el flujo existente del core.
app.post("/api/access/login", async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  if (!email) return proxyToGateway(req, res);
  await pool.query(`SELECT rumbo_disable_inactive_retailer_users()`).catch(() => {});
  const { rows } = await pool.query(
    `SELECT a.id,a.email,a.password_hash,a.role,a.status,a.locked_until,m.retailer_id,m.member_role,m.disabled_reason
       FROM rumbo_accounts a LEFT JOIN rumbo_retailer_members m ON m.account_id=a.id
      WHERE lower(a.email)=$1 LIMIT 1`,
    [email],
  );
  const account = rows[0];
  if (!account || !account.retailer_id) return proxyToGateway(req, res);
  if (account.status === "disabled" && account.disabled_reason === "inactivity_30d") {
    return res.status(423).json({ error: { message: "Tu usuario fue desactivado por 30 días sin ingreso. Solicita la reactivación a Rumbo." } });
  }
  const password = String(req.body.password || "");
  const valid = account.status === "active" && (!account.locked_until || new Date(account.locked_until) <= new Date()) && await bcrypt.compare(password, account.password_hash);
  if (!valid) return res.status(401).json({ error: { message: "Correo o contraseña incorrectos." } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE rumbo_accounts SET last_login_at=now(),failed_login_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1`, [account.id]);
    const token = await issueSession(client, account.id, Boolean(req.body.remember), req);
    await client.query("COMMIT");
    res.json({ ...(await accountPayload(account.id)), token });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    res.status(500).json({ error: { message: "No pudimos iniciar sesión." } });
  } finally { client.release(); }
});

app.get("/api/agency/dashboard", requireSession, async (req, res) => {
  await pool.query(`SELECT rumbo_disable_inactive_retailer_users()`).catch(() => {});
  let session = req.rumboSession;
  if (!session.retailer_id && DEMO_MODE) {
    const { rows } = await pool.query(`SELECT a.id AS account_id,a.email,a.role,a.status,m.retailer_id,m.member_role FROM rumbo_retailer_members m JOIN rumbo_accounts a ON a.id=m.account_id ORDER BY CASE WHEN m.member_role='admin' THEN 0 ELSE 1 END,m.created_at LIMIT 1`);
    session = rows[0] || session;
  }
  if (!session.retailer_id) return res.status(404).json({ error: { message: "No hay una agencia disponible para esta sesión." } });

  const retailerId = session.retailer_id;
  const isAdmin = session.member_role === "admin";
  const [retailer, members, requests, reservations, performance, commissions] = await Promise.all([
    pool.query(`SELECT id,trade_name,legal_name,tax_id,status,user_limit,inactivity_days FROM rumbo_retailers WHERE id=$1`, [retailerId]),
    pool.query(`SELECT account_id,first_name,last_name,member_role,email,status,display_status,last_login_at,created_at,disabled_at,disabled_reason FROM rumbo_retailer_user_summary WHERE retailer_id=$1 ORDER BY CASE WHEN member_role='admin' THEN 0 ELSE 1 END,first_name,last_name`, [retailerId]),
    isAdmin ? pool.query(`SELECT id,request_type,target_account_id,requested_email,first_name,last_name,requested_role,status,notes,created_at,resolved_at FROM rumbo_retailer_user_requests WHERE retailer_id=$1 ORDER BY created_at DESC LIMIT 50`, [retailerId]) : Promise.resolve({ rows: [] }),
    pool.query(`SELECT id,reference,product_name,contact_name,currency,price_display,status,departure_date,return_date,sold_by_account_id,created_at FROM rumbo_booking_requests WHERE retailer_id=$1 ${isAdmin ? "" : "AND sold_by_account_id=$2"} ORDER BY created_at DESC LIMIT 100`, isAdmin ? [retailerId] : [retailerId, session.account_id]),
    pool.query(`SELECT m.account_id,m.first_name,m.last_name,m.member_role,a.status,a.last_login_at,COUNT(b.id)::int AS reservations,COALESCE(SUM((regexp_replace(COALESCE(b.price_display,'0'),'[^0-9.]','','g'))::numeric * (b.adults+b.children)),0)::float8 AS estimated_sales FROM rumbo_retailer_members m JOIN rumbo_accounts a ON a.id=m.account_id LEFT JOIN rumbo_booking_requests b ON b.sold_by_account_id=m.account_id AND b.retailer_id=m.retailer_id WHERE m.retailer_id=$1 GROUP BY m.account_id,m.first_name,m.last_name,m.member_role,a.status,a.last_login_at ORDER BY estimated_sales DESC,reservations DESC`, [retailerId]),
    pool.query(`SELECT c.currency,COALESCE(sum(c.commission_amount) FILTER(WHERE c.status IN('approved','paid')),0)::float8 AS accumulated,COALESCE(sum(c.commission_amount) FILTER(WHERE c.status='pending'),0)::float8 AS pending FROM rumbo_commissions c JOIN rumbo_sale_attributions s ON s.id=c.sale_attribution_id WHERE c.beneficiary_type='retailer' AND c.beneficiary_id=$1 GROUP BY c.currency`, [retailerId]),
  ]);
  const activeUsers = members.rows.filter((m) => m.status === "active").length;
  res.json({
    retailer: retailer.rows[0],
    current_user: { account_id: session.account_id, email: session.email, role: session.member_role },
    permissions: { can_view_all_sales: isAdmin, can_request_users: isAdmin },
    user_capacity: { active: activeUsers, total: members.rows.length, limit: retailer.rows[0]?.user_limit || 0 },
    members: isAdmin ? members.rows : members.rows.filter((m) => m.account_id === session.account_id),
    requests: requests.rows,
    reservations: reservations.rows,
    counter_performance: isAdmin ? performance.rows : performance.rows.filter((p) => p.account_id === session.account_id),
    commissions: commissions.rows,
  });
});

app.post("/api/agency/user-requests", requireSession, requireRetailerAdmin, async (req, res) => {
  const retailerId = req.rumboSession.retailer_id;
  const type = clean(req.body.request_type);
  if (!['create','reactivate'].includes(type)) return res.status(422).json({ error: { message: "Tipo de solicitud inválido." } });
  const retailer = (await pool.query(`SELECT user_limit FROM rumbo_retailers WHERE id=$1`, [retailerId])).rows[0];
  const count = Number((await pool.query(`SELECT count(*)::int AS n FROM rumbo_retailer_members WHERE retailer_id=$1`, [retailerId])).rows[0]?.n || 0);
  if (type === 'create' && count >= Number(retailer?.user_limit || 0)) return res.status(409).json({ error: { message: "La agencia alcanzó su límite de usuarios. Solicita a Rumbo una ampliación de cupo." } });
  let values;
  if (type === 'create') {
    const email = clean(req.body.email).toLowerCase(), first = clean(req.body.first_name), last = clean(req.body.last_name), role = clean(req.body.role);
    if (!email || !first || !last || !['admin','counter'].includes(role)) return res.status(422).json({ error: { message: "Completa correo, nombres, apellidos y rol." } });
    values = [retailerId, req.rumboSession.account_id, type, email, first, last, role, clean(req.body.notes) || null];
    const { rows } = await pool.query(`INSERT INTO rumbo_retailer_user_requests(retailer_id,requested_by_account_id,request_type,requested_email,first_name,last_name,requested_role,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, values);
    await audit(req.rumboSession.email, 'retailer.user_requested', 'retailer', retailerId, { request_id: rows[0].id, email, role });
    return res.status(201).json({ request: rows[0] });
  }
  const target = clean(req.body.target_account_id);
  const member = (await pool.query(`SELECT 1 FROM rumbo_retailer_members WHERE retailer_id=$1 AND account_id=$2`, [retailerId, target])).rowCount;
  if (!member) return res.status(404).json({ error: { message: "Ese usuario no pertenece a tu agencia." } });
  const { rows } = await pool.query(`INSERT INTO rumbo_retailer_user_requests(retailer_id,requested_by_account_id,request_type,target_account_id,notes) VALUES($1,$2,'reactivate',$3,$4) RETURNING *`, [retailerId, req.rumboSession.account_id, target, clean(req.body.notes) || null]);
  await audit(req.rumboSession.email, 'retailer.reactivation_requested', 'retailer_user', target, { request_id: rows[0].id });
  res.status(201).json({ request: rows[0] });
});

app.get("/api/admin/agency-user-requests", requireSession, requireWholesaler, async (_req, res) => {
  const { rows } = await pool.query(`SELECT q.*,r.trade_name,r.legal_name,r.tax_id,ra.email AS requested_by_email FROM rumbo_retailer_user_requests q JOIN rumbo_retailers r ON r.id=q.retailer_id LEFT JOIN rumbo_accounts ra ON ra.id=q.requested_by_account_id ORDER BY CASE WHEN q.status='pending' THEN 0 ELSE 1 END,q.created_at DESC LIMIT 250`);
  res.json({ requests: rows });
});

app.post("/api/admin/agency-users", requireSession, requireWholesaler, async (req, res) => {
  const retailerId = clean(req.body.retailer_id), email = clean(req.body.email).toLowerCase(), first = clean(req.body.first_name), last = clean(req.body.last_name), memberRole = clean(req.body.role), password = String(req.body.temporary_password || "");
  if (!retailerId || !email || !first || !last || !['admin','counter'].includes(memberRole) || password.length < 8) return res.status(422).json({ error: { message: "Agencia, correo, nombre, rol y contraseña temporal de 8+ caracteres son obligatorios." } });
  const retailer = (await pool.query(`SELECT user_limit FROM rumbo_retailers WHERE id=$1`, [retailerId])).rows[0];
  if (!retailer) return res.status(404).json({ error: { message: "Agencia no encontrada." } });
  const count = Number((await pool.query(`SELECT count(*)::int AS n FROM rumbo_retailer_members WHERE retailer_id=$1`, [retailerId])).rows[0]?.n || 0);
  if (count >= retailer.user_limit) return res.status(409).json({ error: { message: "La agencia alcanzó su límite de usuarios." } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);
    const accountRole = memberRole === 'admin' ? 'retailer_owner' : 'retailer_agent';
    const { rows: accounts } = await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,email_verified_at) VALUES($1,$2,$3,'active',now()) RETURNING id,email,status`, [email, hash, accountRole]);
    const account = accounts[0];
    await client.query(`INSERT INTO rumbo_retailer_members(retailer_id,account_id,member_role,first_name,last_name,is_primary_contact,created_by_account_id) VALUES($1,$2,$3,$4,$5,false,$6)`, [retailerId, account.id, memberRole, first, last, req.rumboSession.account_id]);
    if (clean(req.body.request_id)) await client.query(`UPDATE rumbo_retailer_user_requests SET status='completed',resolved_by_account_id=$2,resolved_at=now(),updated_at=now() WHERE id=$1`, [clean(req.body.request_id), req.rumboSession.account_id]);
    await client.query('COMMIT');
    await audit(req.rumboSession.email, 'retailer.user_created', 'retailer_user', account.id, { retailer_id: retailerId, role: memberRole });
    res.status(201).json({ user: { ...account, retailer_id: retailerId, member_role: memberRole, first_name: first, last_name: last } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: { message: "Ya existe una cuenta con ese correo." } });
    console.error(error); res.status(500).json({ error: { message: "No pudimos crear el usuario de agencia." } });
  } finally { client.release(); }
});

app.patch("/api/admin/agency-users/:accountId/reactivate", requireSession, requireWholesaler, async (req, res) => {
  const accountId = req.params.accountId;
  const { rows } = await pool.query(`UPDATE rumbo_accounts a SET status='active',last_login_at=now(),updated_at=now() FROM rumbo_retailer_members m WHERE a.id=$1 AND m.account_id=a.id RETURNING a.id,a.email,a.status,m.retailer_id,m.member_role`, [accountId]);
  if (!rows[0]) return res.status(404).json({ error: { message: "Usuario de agencia no encontrado." } });
  await pool.query(`UPDATE rumbo_retailer_members SET disabled_at=NULL,disabled_reason=NULL,reactivated_at=now(),reactivated_by_account_id=$2 WHERE account_id=$1`, [accountId, req.rumboSession.account_id]);
  if (clean(req.body.request_id)) await pool.query(`UPDATE rumbo_retailer_user_requests SET status='completed',resolved_by_account_id=$2,resolved_at=now(),updated_at=now() WHERE id=$1`, [clean(req.body.request_id), req.rumboSession.account_id]);
  await audit(req.rumboSession.email, 'retailer.user_reactivated', 'retailer_user', accountId, { retailer_id: rows[0].retailer_id });
  res.json({ user: rows[0] });
});

// Reserva nativa: conserva el endpoint existente y, si hay sesión de agencia,
// añade la atribución de agencia + usuario vendedor después de crearla.
app.post("/api/bookings", async (req, res) => {
  try {
    const session = await currentSession(req);
    const headers = { "Content-Type": "application/json", "X-Rumbo-API-Key": API_KEY };
    const upstream = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/bookings`, { method: "POST", headers, body: JSON.stringify(req.body || {}) });
    const text = await upstream.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (upstream.ok && payload.reference && session?.retailer_id && session?.account_id) {
      await pool.query(`UPDATE rumbo_booking_requests SET retailer_id=$2,sold_by_account_id=$3 WHERE reference=$1`, [payload.reference, session.retailer_id, session.account_id]);
      await audit(session.email, 'booking.retailer_attributed', 'booking', payload.reference, { retailer_id: session.retailer_id, sold_by_account_id: session.account_id });
    }
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(text);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: { message: "No pudimos procesar la reserva de agencia." } });
  }
});

app.listen(PORT, "127.0.0.1", () => console.log(`Rumbo agency service listening on ${PORT}; gateway=${GATEWAY_PORT}`));
