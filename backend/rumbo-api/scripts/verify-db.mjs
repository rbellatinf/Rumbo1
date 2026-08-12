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
  "rumbo_catalog_products",
  "rumbo_catalog_departures",
  "rumbo_catalog_images",
  "rumbo_catalog_regions",
  "rumbo_catalog_countries",
  "rumbo_catalog_tags",
  "rumbo_catalog_product_tags",
  "rumbo_catalog_source_links",
  "rumbo_catalog_departure_source_links",
  "rumbo_catalog_migration_runs",
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

  if (!missing.length) {
    const { rows: runs } = await pool.query(`SELECT source_products,migrated_products,migrated_departures,products_with_price,products_with_metadata,target_validation,warnings,status,finished_at FROM rumbo_catalog_migration_runs WHERE source_system='spree' ORDER BY started_at DESC LIMIT 1`);
    const run = runs[0];
    if (run) {
      console.log(`Migración Spree→Rumbo: ${run.migrated_products}/${run.source_products} productos; ${run.migrated_departures} salidas; ${run.products_with_price} con precio; ${run.products_with_metadata} con metadata; estado=${run.status}.`);
      if (Number(run.migrated_products) !== Number(run.source_products)) {
        console.error("Migración de catálogo incompleta: no todos los productos Spree tienen equivalente nativo.");
        process.exitCode = 3;
      }
      for (const target of ["panama", "miami"]) {
        const check = run.target_validation?.[target];
        if (!check) continue;
        console.log(`Validación ${target}: source=${check.source_found ?? 0}, native=${check.native_found ?? 0}.`);
        if (Number(check.source_found || 0) > 0 && Number(check.native_found || 0) === 0) {
          console.error(`Migración incompleta: ${target} existe en Spree pero no en Rumbo Catalog.`);
          process.exitCode = 4;
        }
      }
      if (Array.isArray(run.warnings) && run.warnings.length) console.warn(`Migración con ${run.warnings.length} advertencia(s). Revisar rumbo_catalog_migration_runs antes de retirar Spree.`);
    } else {
      console.warn("No hay corrida de migración Spree registrada. Si el catálogo legacy existe, no retires Spree todavía.");
    }
  }
} catch (error) {
  console.error("No se pudo verificar PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
