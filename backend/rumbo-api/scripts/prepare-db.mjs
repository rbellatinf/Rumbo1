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
const migrationPath = path.resolve(here, "../../postgres/init/070_rumbo_catalog.sql");
const sql = await fs.readFile(migrationPath, "utf8");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  console.log("Rumbo DB prepare OK: catálogo nativo verificado/aplicado.");
} catch (error) {
  console.error("No se pudo preparar PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
