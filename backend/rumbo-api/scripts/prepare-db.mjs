import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no está configurado.");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = [
  "070_rumbo_catalog.sql",
  "071_rumbo_catalog_search.sql",
  "072_rumbo_catalog_commercial_rules.sql",
  "080_rumbo_native_bookings.sql",
  "090_rumbo_retailer_users.sql",
  "091_rumbo_test_accounts.sql",
  "092_rumbo_password_reset.sql",
  "093_rumbo_demo_directory.sql",
  "094_rumbo_pricing_engine.sql",
  "095_rumbo_user_agency_management.sql",
  "096_rumbo_person_details.sql",
  "097_rumbo_catalog_taxonomy_migration.sql",
  "098_rumbo_catalog_geography_autofill.sql",
  "099_rumbo_catalog_image_storage.sql",
  "100_rumbo_integration_observability.sql",
  "101_rumbo_integration_configs.sql",
];
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

try {
  for (const file of migrations) {
    const migrationPath = path.resolve(here, `../../postgres/init/${file}`);
    const sql = await fs.readFile(migrationPath, "utf8");
    await pool.query(sql);
    console.log(`Rumbo DB prepare OK: ${file}`);
  }
} catch (error) {
  console.error("No se pudo preparar PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
