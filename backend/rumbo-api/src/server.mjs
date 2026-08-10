import crypto from "node:crypto";
import express from "express";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
const PORT = Number(process.env.PORT || 4000);
const API_KEY = process.env.RUMBO_API_KEY || "";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value || "").trim();

function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: { message: "RUMBO_API_KEY no está configurado." } });
  if (req.get("X-Rumbo-API-Key") !== API_KEY) return res.status(401).json({ error: { message: "API key inválida." } });
  next();
}

async function currentSession(req) {
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.id, s.account_id, a.email, a.role, a.status
       FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1`,
    [sha256(token)],
  );
  return rows[0] || null;
}

async function requireSession(req, res, next) {
  const session = await currentSession(req);
  if (!session) return res.status(401).json({ error: { message: "La sesión venció o no es válida." } });
  req.rumboSession = session;
  next();
}

async function issueSession(client, accountId, remember, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const hours = remember ? 720 : 12;
  await client.query(
    `INSERT INTO rumbo_auth_sessions (account_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, NULLIF($3,'')::inet, $4, now() + ($5 || ' hours')::interval)`,
    [accountId, sha256(token), req.ip || "", req.get("user-agent") || null, String(hours)],
  );
  return token;
}

async function accountPayload(accountId) {
  const { rows: accounts } = await pool.query(`SELECT id, email, role, status, last_login_at FROM rumbo_accounts WHERE id = $1`, [accountId]);
  const account = accounts[0];
  if (!account) return null;
  if (account.role === "partner") {
    const { rows } = await pool.query(
      `SELECT p.first_name, p.last_name, p.referral_code, p.sponsor_partner_id,
              COALESCE(a.membership_status, account.status) AS membership_status
         FROM rumbo_partner_profiles p JOIN rumbo_accounts account ON account.id = p.account_id
         LEFT JOIN rumbo_associates a ON a.id = p.associate_id WHERE p.account_id = $1`, [accountId]);
    return { account, profile: rows[0] ? { type: "partner", ...rows[0] } : null, redirect_to: "/panel" };
  }
  const { rows } = await pool.query(
    `SELECT r.id AS retailer_id, r.trade_name, r.legal_name, r.tax_id, r.status AS retailer_status, m.member_role
       FROM rumbo_retailer_members m JOIN rumbo_retailers r ON r.id = m.retailer_id WHERE m.account_id = $1`, [accountId]);
  return { account, profile: rows[0] ? { type: "retailer", ...rows[0] } : null, redirect_to: rows[0] ? "/agencia" : "/" };
}

function referralStem(firstName, lastName) {
  const stem = `${firstName}-${lastName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22);
  return stem || "PARTNER";
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "rumbo-api" }); }
  catch { res.status(503).json({ status: "error" }); }
});
app.use(requireApiKey);

app.post("/api/access/register", async (req, res) => {
  const accessType = clean(req.body.access_type);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: { message: "Correo inválido." } });
  if (password.length < 8) return res.status(422).json({ error: { message: "La contraseña debe tener al menos 8 caracteres." } });
  if (!["partner", "retailer"].includes(accessType)) return res.status(422).json({ error: { message: "Tipo de cuenta inválido." } });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT 1 FROM rumbo_accounts WHERE lower(email) = $1`, [email]);
    if (exists.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: { message: "Ya existe una cuenta con ese correo." } }); }

    const passwordHash = await bcrypt.hash(password, 12);
    const role = accessType === "partner" ? "partner" : "retailer_owner";
    const { rows: accounts } = await client.query(
      `INSERT INTO rumbo_accounts (email, password_hash, role, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
      [email, passwordHash, role],
    );
    const accountId = accounts[0].id;

    if (accessType === "partner") {
      const firstName = clean(req.body.first_name); const lastName = clean(req.body.last_name);
      const documentNumber = clean(req.body.document_number).toUpperCase(); const phone = clean(req.body.phone);
      const sponsorCode = clean(req.body.sponsor_code).toUpperCase();
      if (!firstName || !lastName || !documentNumber) throw new Error("PARTNER_FIELDS");
      let sponsor = null;
      if (sponsorCode) {
        const result = await client.query(`SELECT account_id, referral_code FROM rumbo_partner_profiles WHERE referral_code = $1`, [sponsorCode]);
        sponsor = result.rows[0]; if (!sponsor) throw new Error("SPONSOR_NOT_FOUND");
      }
      let referralCode;
      do { referralCode = `RUMBO-${referralStem(firstName, lastName)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`; }
      while ((await client.query(`SELECT 1 FROM rumbo_partner_profiles WHERE referral_code=$1 UNION SELECT 1 FROM rumbo_associates WHERE referral_code=$1`, [referralCode])).rowCount);

      const { rows: associates } = await client.query(
        `INSERT INTO rumbo_associates (spree_customer_id, referral_code, membership_status, direct_commission_rate)
         VALUES ($1,$2,'pending',0.06) RETURNING id`, [`rumbo-account:${accountId}`, referralCode]);
      await client.query(
        `INSERT INTO rumbo_partner_profiles
          (account_id, associate_id, sponsor_partner_id, first_name, last_name, document_type, document_number, phone, referral_code, terms_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
        [accountId, associates[0].id, sponsor?.account_id || null, firstName, lastName, /^\d{8}$/.test(documentNumber) ? "DNI" : "CE", documentNumber, phone || null, referralCode]);
      if (sponsor) await client.query(
        `INSERT INTO rumbo_referral_relationships (sponsor_partner_id,referred_partner_id,referral_code,level,status)
         VALUES ($1,$2,$3,1,'active')`, [sponsor.account_id, accountId, sponsor.referral_code]);
    } else {
      const legalName = clean(req.body.legal_name); const tradeName = clean(req.body.trade_name);
      const taxId = clean(req.body.tax_id).replace(/\D/g, ""); const representative = clean(req.body.representative); const phone = clean(req.body.phone);
      if (!legalName || !tradeName || !taxId || !representative) throw new Error("RETAILER_FIELDS");
      const { rows: retailers } = await client.query(
        `INSERT INTO rumbo_retailers (legal_name,trade_name,tax_id,phone,contact_email,status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
        [legalName, tradeName, taxId, phone || null, email]);
      const parts = representative.split(/\s+/, 2);
      await client.query(
        `INSERT INTO rumbo_retailer_members (retailer_id,account_id,member_role,first_name,last_name,phone,is_primary_contact)
         VALUES ($1,$2,'owner',$3,$4,$5,true)`, [retailers[0].id, accountId, parts[0], parts[1] || "—", phone || null]);
    }

    const token = await issueSession(client, accountId, true, req);
    await client.query("COMMIT");
    res.status(201).json({ ...(await accountPayload(accountId)), token });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.message === "SPONSOR_NOT_FOUND") return res.status(422).json({ error: { message: "El código del Partner que te invitó no existe." } });
    if (["PARTNER_FIELDS", "RETAILER_FIELDS"].includes(error.message)) return res.status(422).json({ error: { message: "Faltan datos obligatorios del registro." } });
    if (error.code === "23505") return res.status(409).json({ error: { message: "Ya existe una cuenta, documento, RUC o código con esos datos." } });
    console.error(error); res.status(500).json({ error: { message: "No pudimos crear la cuenta." } });
  } finally { client.release(); }
});

app.post("/api/access/login", async (req, res) => {
  const email = clean(req.body.email).toLowerCase(); const password = String(req.body.password || "");
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id,email,password_hash,role,status,failed_login_attempts,locked_until FROM rumbo_accounts WHERE lower(email)=$1 LIMIT 1`, [email]);
    const account = rows[0]; const locked = account?.locked_until && new Date(account.locked_until) > new Date();
    const valid = account && ["pending","active"].includes(account.status) && !locked && await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      if (account) await client.query(`UPDATE rumbo_accounts SET failed_login_attempts=failed_login_attempts+1, locked_until=CASE WHEN failed_login_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END, updated_at=now() WHERE id=$1`, [account.id]);
      return res.status(401).json({ error: { message: locked ? "Cuenta temporalmente bloqueada." : "Correo o contraseña incorrectos." } });
    }
    await client.query("BEGIN");
    await client.query(`UPDATE rumbo_accounts SET failed_login_attempts=0,locked_until=NULL,last_login_at=now(),updated_at=now() WHERE id=$1`, [account.id]);
    const token = await issueSession(client, account.id, Boolean(req.body.remember), req); await client.query("COMMIT");
    res.json({ ...(await accountPayload(account.id)), token });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error(error); res.status(500).json({ error: { message: "No pudimos iniciar sesión." } }); }
  finally { client.release(); }
});

app.get("/api/access/me", requireSession, async (req, res) => res.json(await accountPayload(req.rumboSession.account_id)));
app.post("/api/access/logout", requireSession, async (req, res) => { await pool.query("UPDATE rumbo_auth_sessions SET revoked_at=now() WHERE id=$1", [req.rumboSession.id]); res.status(204).end(); });

app.get("/api/commission-settings", requireSession, async (_req, res) => {
  const { rows } = await pool.query(`SELECT partner_rate::float8,sponsor_rate::float8,retailer_rate::float8,updated_at FROM rumbo_global_commission_settings WHERE id=1`);
  res.json(rows[0] || { partner_rate: 0.06, sponsor_rate: 0, retailer_rate: 0, updated_at: null });
});
app.patch("/api/commission-settings", requireSession, async (req, res) => {
  const values=[req.body.partner_rate,req.body.sponsor_rate,req.body.retailer_rate].map(Number);
  if(values.some((v)=>!Number.isFinite(v)||v<0||v>1)) return res.status(422).json({error:{message:"Los porcentajes deben estar entre 0% y 100%."}});
  const {rows}=await pool.query(`INSERT INTO rumbo_global_commission_settings(id,partner_rate,sponsor_rate,retailer_rate) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET partner_rate=EXCLUDED.partner_rate,sponsor_rate=EXCLUDED.sponsor_rate,retailer_rate=EXCLUDED.retailer_rate,updated_at=now() RETURNING partner_rate::float8,sponsor_rate::float8,retailer_rate::float8,updated_at`,values); res.json(rows[0]);
});

app.get("/api/partner/dashboard", requireSession, async (req, res) => {
  if(req.rumboSession.role!=="partner") return res.status(403).json({error:{message:"Este recurso es solo para Partners."}});
  const accountId=req.rumboSession.account_id;
  const {rows:profiles}=await pool.query(`SELECT p.account_id,p.associate_id,p.first_name,p.last_name,p.referral_code,COALESCE(a.membership_status,account.status) AS membership_status,COALESCE(g.partner_rate,0.06)::float8 AS commission_rate,COALESCE(g.sponsor_rate,0)::float8 AS sponsor_rate FROM rumbo_partner_profiles p JOIN rumbo_accounts account ON account.id=p.account_id LEFT JOIN rumbo_associates a ON a.id=p.associate_id LEFT JOIN rumbo_global_commission_settings g ON g.id=1 WHERE p.account_id=$1`,[accountId]);
  const profile=profiles[0]; if(!profile) return res.status(404).json({error:{message:"No encontramos el perfil del Partner."}});
  const [reservationsResult,salesResult,commissionsResult,networkResult]=await Promise.all([
    pool.query(`SELECT reference,product_name,contact_name AS customer,status,COALESCE((SELECT status FROM rumbo_booking_payments bp WHERE bp.booking_request_id=b.id),'pending') AS payment_status,total_amount::float8,currency,departure_date,return_date,created_at FROM rumbo_booking_requests b WHERE referral_code=$1 ORDER BY created_at DESC LIMIT 50`,[profile.referral_code]),
    pool.query(`SELECT sa.spree_order_id AS reference,b.contact_name AS customer,b.product_name,sa.gross_amount::float8,sa.currency,sa.payment_status,c.commission_amount::float8,c.status AS commission_status,sa.confirmed_at AS attributed_at FROM rumbo_sale_attributions sa LEFT JOIN rumbo_booking_requests b ON b.id=sa.booking_request_id LEFT JOIN rumbo_commissions c ON c.sale_attribution_id=sa.id AND c.beneficiary_type='partner' AND c.beneficiary_id=$1 WHERE sa.referred_partner_id=$1 OR c.beneficiary_id=$1 ORDER BY sa.confirmed_at DESC NULLS LAST LIMIT 50`,[accountId]),
    pool.query(`SELECT currency,COALESCE(sum(commission_amount) FILTER(WHERE status IN('approved','paid')),0)::float8 AS accumulated,COALESCE(sum(commission_amount) FILTER(WHERE status='pending'),0)::float8 AS pending FROM rumbo_commissions WHERE beneficiary_id=$1 AND beneficiary_type IN('partner','sponsor') GROUP BY currency`,[accountId]),
    pool.query(`SELECT p.account_id,concat_ws(' ',p.first_name,p.last_name) AS name,p.referral_code,a.status,p.created_at AS joined_at FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id WHERE p.sponsor_partner_id=$1 ORDER BY p.created_at DESC`,[accountId])]);
  const soldAmounts={}; for(const sale of salesResult.rows) soldAmounts[sale.currency]=(soldAmounts[sale.currency]||0)+Number(sale.gross_amount||0);
  const accumulated={}; const pending={}; for(const row of commissionsResult.rows){accumulated[row.currency]=Number(row.accumulated||0);pending[row.currency]=Number(row.pending||0);}
  res.json({profile,metrics:{reservations:reservationsResult.rowCount,confirmed_sales:salesResult.rows.filter((s)=>["confirmed","paid"].includes(s.payment_status)).length,direct_network:networkResult.rowCount,sold_amounts:soldAmounts,accumulated_commissions:accumulated,pending_commissions:pending},reservations:reservationsResult.rows,sales:salesResult.rows,network:networkResult.rows});
});

app.listen(PORT,"0.0.0.0",()=>console.log(`Rumbo API listening on ${PORT}`));
