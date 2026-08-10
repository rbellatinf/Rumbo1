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

const requiredTables = [
  "rumbo_accounts",
  "rumbo_auth_sessions",
  "rumbo_partner_profiles",
  "rumbo_retailers",
  "rumbo_retailer_members",
  "rumbo_referral_relationships",
  "rumbo_booking_requests",
  "rumbo_booking_status_history",
  "rumbo_booking_payments",
  "rumbo_sale_attributions",
  "rumbo_commissions",
  "rumbo_global_commission_settings",
  "rumbo_audit_events",
];

try {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(rows.map((row) => row.table_name));
  const missing = requiredTables.filter((name) => !found.has(name));
  if (missing.length) {
    console.error(`PostgreSQL incompleto. Faltan tablas: ${missing.join(", ")}`);
    process.exitCode = 2;
  } else {
    console.log(`PostgreSQL OK: ${requiredTables.length} tablas Rumbo verificadas.`);
  }
} catch (error) {
  console.error("No se pudo verificar PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
