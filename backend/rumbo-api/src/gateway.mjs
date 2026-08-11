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

// Existing API is served by the core while management endpoints above remain in the gateway.
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
