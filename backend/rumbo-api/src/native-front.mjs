import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";
import { installAirLabsRuntimeRoutes } from "./airlabs-runtime-routes.mjs";
import { installIntegrationConfigRoutes } from "./integration-config-routes.mjs";
import { installIntegrationObservabilityRoutes } from "./integration-observability-routes.mjs";
import { installNativeRuntimeRoutes } from "./native-runtime-routes.mjs";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 4000);
const INNER_PORT = Number(process.env.RUMBO_EDGE_PORT || 4005);
const API_KEY = process.env.RUMBO_API_KEY || "";
const DEMO_MODE = /^(1|true|yes)$/i.test(process.env.RUMBO_DEMO_MODE || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const inner = spawn(process.execPath, [new URL("./public-edge.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: String(INNER_PORT) },
  stdio: "inherit",
});
inner.on("exit", (code) => {
  console.error(`Rumbo inner edge exited with ${code}`);
  process.exit(code ?? 1);
});

const app = express();
app.set("trust proxy", true);

// These native admin endpoints need decoded JSON bodies. The rest of the edge keeps
// the raw body so it can proxy requests without mutating provider payloads/webhooks.
const jsonParser = express.json({ limit: "2mb" });
app.use("/api/admin/integration-configs", jsonParser);
app.use("/api/admin/integration-observability", jsonParser);
app.use("/api/integration-observability", jsonParser);
app.use(express.raw({ type: "*/*", limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const innerOk = await fetch(`http://127.0.0.1:${INNER_PORT}/health`, {
      signal: AbortSignal.timeout(3000),
    }).then((r) => r.ok).catch(() => false);
    res.status(innerOk ? 200 : 503).json({
      status: innerOk ? "ok" : "degraded",
      service: "rumbo-native-front",
      runtime: "native",
    });
  } catch {
    res.status(503).json({ status: "error", service: "rumbo-native-front" });
  }
});

app.use("/api", (req, res, next) => {
  if (!API_KEY) return res.status(503).json({ error: { message: "RUMBO_API_KEY no está configurado." } });
  if (req.get("X-Rumbo-API-Key") !== API_KEY) return res.status(401).json({ error: { message: "API key inválida." } });
  next();
});

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
       FROM rumbo_auth_sessions s
       JOIN rumbo_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1
        AND s.revoked_at IS NULL
        AND s.expires_at>now()
        AND a.status='active'
      LIMIT 1`,
    [sha256(token)],
  );
  return rows[0]?.role === "wholesaler_admin" ? rows[0] : null;
}

async function requireAdmin(req, res, next) {
  const session = await adminSession(req);
  if (!session) return res.status(401).json({ error: { message: "Se requiere una sesión administrativa de Rumbo." } });
  req.adminSession = session;
  next();
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await pool.query(
    `INSERT INTO rumbo_audit_events(actor,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,$4,$5::jsonb)`,
    [actor, action, entityType, String(entityId), JSON.stringify(details)],
  );
}

// Exact AirLabs routes are mounted first so caching/rate-limit handling takes
// precedence over the older generic integration handlers during the cutover.
installAirLabsRuntimeRoutes(app, { pool, requireAdmin, audit });
installIntegrationConfigRoutes(app, { pool, requireAdmin, audit });
installIntegrationObservabilityRoutes(app, { pool, requireAdmin, audit });
installNativeRuntimeRoutes(app, { pool });

app.use(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null || key === "host" || key === "content-length") continue;
      headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const body = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : Buffer.isBuffer(req.body)
        ? req.body
        : req.body && typeof req.body === "object"
          ? Buffer.from(JSON.stringify(req.body))
          : undefined;
    const upstream = await fetch(`http://127.0.0.1:${INNER_PORT}${req.originalUrl}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: { message: "Rumbo API no respondió." } });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Rumbo native front listening on ${PORT}; inner edge=${INNER_PORT}`));
