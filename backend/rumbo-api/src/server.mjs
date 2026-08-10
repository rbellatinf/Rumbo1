import crypto from "node:crypto";
import express from "express";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: "256kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

const PORT = Number(process.env.PORT || 4000);
const API_KEY = process.env.RUMBO_API_KEY || "";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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
       FROM rumbo_auth_sessions s
       JOIN rumbo_accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1`,
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
  const hours = remember ? 24 * 30 : 12;
  await client.query(
    `INSERT INTO rumbo_auth_sessions (account_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3::inet, $4, now() + ($5 || ' hours')::interval)`,
    [accountId, sha256(token), req.ip || null, req.get("user-agent") || null, String(hours)],
  );
  return token;
}

async function accountPayload(accountId) {
  const { rows: accounts } = await pool.query(
    `SELECT id, email, role, status, last_login_at FROM rumbo_accounts WHERE id = $1`,
    [accountId],
  );
  const account = accounts[0];
  if (!account) return null;

  if (account.role === "partner") {
    const { rows } = await pool.query(
      `SELECT p.first_name, p.last_name, p.referral_code, p.sponsor_partner_id,
              COALESCE(a.membership_status, account.status) AS membership_status
         FROM rumbo_partner_profiles p
         JOIN rumbo_accounts account ON account.id = p.account_id
         LEFT JOIN rumbo_associates a ON a.id = p.associate_id
        WHERE p.account_id = $1`,
      [accountId],
    );
    return { account, profile: rows[0] ? { type: "partner", ...rows[0] } : null, redirect_to: "/panel" };
  }

  const { rows } = await pool.query(
    `SELECT r.id AS retailer_id, r.trade_name, r.legal_name, r.tax_id,
            r.status AS retailer_status, m.member_role
       FROM rumbo_retailer_members m
       JOIN rumbo_retailers r ON r.id = m.retailer_id
      WHERE m.account_id = $1`,
    [accountId],
  );
  return { account, profile: rows[0] ? { type: "retailer", ...rows[0] } : null, redirect_to: rows[0] ? "/agencia" : "/" };
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "rumbo-api" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use(requireApiKey);

app.post("/api/access/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, email, password_hash, role, status, failed_login_attempts, locked_until
         FROM rumbo_accounts WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const account = rows[0];
    const locked = account?.locked_until && new Date(account.locked_until) > new Date();
    const allowed = account && ["pending", "active"].includes(account.status) && !locked;
    const valid = allowed && await bcrypt.compare(password, account.password_hash);

    if (!valid) {
      if (account) {
        await client.query(
          `UPDATE rumbo_accounts
              SET failed_login_attempts = failed_login_attempts + 1,
                  locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
                  updated_at = now()
            WHERE id = $1`,
          [account.id],
        );
      }
      return res.status(401).json({ error: { message: locked ? "Cuenta temporalmente bloqueada." : "Correo o contraseña incorrectos." } });
    }

    await client.query("BEGIN");
    await client.query(
      `UPDATE rumbo_accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = $1`,
      [account.id],
    );
    const token = await issueSession(client, account.id, Boolean(req.body.remember), req);
    await client.query("COMMIT");
    res.json({ ...(await accountPayload(account.id)), token });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    res.status(500).json({ error: { message: "No pudimos iniciar sesión." } });
  } finally {
    client.release();
  }
});

app.get("/api/access/me", requireSession, async (req, res) => {
  res.json(await accountPayload(req.rumboSession.account_id));
});

app.post("/api/access/logout", requireSession, async (req, res) => {
  await pool.query("UPDATE rumbo_auth_sessions SET revoked_at = now() WHERE id = $1", [req.rumboSession.id]);
  res.status(204).end();
});

app.get("/api/commission-settings", requireSession, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT partner_rate::float8, sponsor_rate::float8, retailer_rate::float8, updated_at
       FROM rumbo_global_commission_settings WHERE id = 1`,
  );
  res.json(rows[0] || { partner_rate: 0.06, sponsor_rate: 0, retailer_rate: 0, updated_at: null });
});

app.patch("/api/commission-settings", requireSession, async (req, res) => {
  const values = [req.body.partner_rate, req.body.sponsor_rate, req.body.retailer_rate].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    return res.status(422).json({ error: { message: "Los porcentajes deben estar entre 0% y 100%." } });
  }
  const { rows } = await pool.query(
    `INSERT INTO rumbo_global_commission_settings (id, partner_rate, sponsor_rate, retailer_rate)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET partner_rate = EXCLUDED.partner_rate,
           sponsor_rate = EXCLUDED.sponsor_rate,
           retailer_rate = EXCLUDED.retailer_rate,
           updated_at = now()
     RETURNING partner_rate::float8, sponsor_rate::float8, retailer_rate::float8, updated_at`,
    values,
  );
  res.json(rows[0]);
});

app.get("/api/partner/dashboard", requireSession, async (req, res) => {
  if (req.rumboSession.role !== "partner") return res.status(403).json({ error: { message: "Este recurso es solo para Partners." } });
  const accountId = req.rumboSession.account_id;
  const { rows: profiles } = await pool.query(
    `SELECT p.account_id, p.associate_id, p.first_name, p.last_name, p.referral_code,
            COALESCE(a.membership_status, account.status) AS membership_status,
            g.partner_rate::float8 AS commission_rate, g.sponsor_rate::float8 AS sponsor_rate
       FROM rumbo_partner_profiles p
       JOIN rumbo_accounts account ON account.id = p.account_id
       LEFT JOIN rumbo_associates a ON a.id = p.associate_id
       LEFT JOIN rumbo_global_commission_settings g ON g.id = 1
      WHERE p.account_id = $1`,
    [accountId],
  );
  const profile = profiles[0];
  if (!profile) return res.status(404).json({ error: { message: "No encontramos el perfil del Partner." } });

  const [reservationsResult, salesResult, commissionsResult, networkResult] = await Promise.all([
    pool.query(
      `SELECT reference, product_name, contact_name AS customer, status,
              COALESCE((SELECT status FROM rumbo_booking_payments bp WHERE bp.booking_request_id = b.id), 'pending') AS payment_status,
              total_amount::float8, currency, departure_date, return_date, created_at
         FROM rumbo_booking_requests b
        WHERE referral_code = $1
        ORDER BY created_at DESC LIMIT 50`,
      [profile.referral_code],
    ),
    pool.query(
      `SELECT sa.spree_order_id AS reference, b.contact_name AS customer, b.product_name,
              sa.gross_amount::float8, sa.currency, sa.payment_status,
              c.commission_amount::float8, c.status AS commission_status, sa.confirmed_at AS attributed_at
         FROM rumbo_sale_attributions sa
         LEFT JOIN rumbo_booking_requests b ON b.id = sa.booking_request_id
         LEFT JOIN rumbo_commissions c ON c.sale_attribution_id = sa.id
          AND c.beneficiary_type = 'partner' AND c.beneficiary_id = $1
        WHERE sa.referred_partner_id = $1 OR c.beneficiary_id = $1
        ORDER BY sa.confirmed_at DESC NULLS LAST LIMIT 50`,
      [accountId],
    ),
    pool.query(
      `SELECT currency,
              COALESCE(sum(commission_amount) FILTER (WHERE status IN ('approved','paid')),0)::float8 AS accumulated,
              COALESCE(sum(commission_amount) FILTER (WHERE status = 'pending'),0)::float8 AS pending
         FROM rumbo_commissions
        WHERE beneficiary_id = $1 AND beneficiary_type IN ('partner','sponsor')
        GROUP BY currency`,
      [accountId],
    ),
    pool.query(
      `SELECT p.account_id, concat_ws(' ', p.first_name, p.last_name) AS name,
              p.referral_code, a.status, p.created_at AS joined_at
         FROM rumbo_partner_profiles p
         JOIN rumbo_accounts a ON a.id = p.account_id
        WHERE p.sponsor_partner_id = $1
        ORDER BY p.created_at DESC`,
      [accountId],
    ),
  ]);

  const soldAmounts = {};
  for (const sale of salesResult.rows) soldAmounts[sale.currency] = (soldAmounts[sale.currency] || 0) + Number(sale.gross_amount || 0);
  const accumulated = {};
  const pending = {};
  for (const row of commissionsResult.rows) { accumulated[row.currency] = Number(row.accumulated || 0); pending[row.currency] = Number(row.pending || 0); }

  res.json({
    profile,
    metrics: {
      reservations: reservationsResult.rowCount,
      confirmed_sales: salesResult.rows.filter((sale) => sale.payment_status === "confirmed" || sale.payment_status === "paid").length,
      direct_network: networkResult.rowCount,
      sold_amounts: soldAmounts,
      accumulated_commissions: accumulated,
      pending_commissions: pending,
    },
    reservations: reservationsResult.rows,
    sales: salesResult.rows,
    network: networkResult.rows,
  });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Rumbo API listening on ${PORT}`));
