import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

const required = [
  "RUMBO_DEMO_ADMIN_EMAIL",
  "RUMBO_DEMO_ADMIN_PASSWORD",
  "RUMBO_DEMO_PARTNER_EMAIL",
  "RUMBO_DEMO_PARTNER_PASSWORD",
  "RUMBO_DEMO_RETAILER_EMAIL",
  "RUMBO_DEMO_RETAILER_PASSWORD",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} no está configurado.`);
}

const adminEmail = process.env.RUMBO_DEMO_ADMIN_EMAIL.trim().toLowerCase();
const adminPassword = process.env.RUMBO_DEMO_ADMIN_PASSWORD;
const partnerEmail = process.env.RUMBO_DEMO_PARTNER_EMAIL.trim().toLowerCase();
const partnerPassword = process.env.RUMBO_DEMO_PARTNER_PASSWORD;
const retailerEmail = process.env.RUMBO_DEMO_RETAILER_EMAIL.trim().toLowerCase();
const retailerPassword = process.env.RUMBO_DEMO_RETAILER_PASSWORD;

async function upsertAccount(client, email, password, role, status = "active") {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await client.query(
    `INSERT INTO rumbo_accounts (email, password_hash, role, status, email_verified_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT ((lower(email))) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           email_verified_at = COALESCE(rumbo_accounts.email_verified_at, now()),
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = now()
     RETURNING id`,
    [email, hash, role, status],
  );
  return rows[0].id;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const adminId = await upsertAccount(client, adminEmail, adminPassword, "wholesaler_admin", "active");

    const partnerId = await upsertAccount(client, partnerEmail, partnerPassword, "partner", "active");
    const partnerCode = "RUMBO-DEMO-PARTNER";

    let { rows: associates } = await client.query(
      `SELECT id FROM rumbo_associates WHERE referral_code = $1 LIMIT 1`,
      [partnerCode],
    );
    let associateId = associates[0]?.id;
    if (!associateId) {
      const inserted = await client.query(
        `INSERT INTO rumbo_associates (spree_customer_id, referral_code, membership_status, direct_commission_rate, activated_at)
         VALUES ($1,$2,'active',0.06,now()) RETURNING id`,
        [`rumbo-account:${partnerId}`, partnerCode],
      );
      associateId = inserted.rows[0].id;
    } else {
      await client.query(
        `UPDATE rumbo_associates SET membership_status='active', activated_at=COALESCE(activated_at,now()), updated_at=now() WHERE id=$1`,
        [associateId],
      );
    }

    await client.query(
      `INSERT INTO rumbo_partner_profiles
        (account_id, associate_id, first_name, last_name, document_type, document_number, phone, referral_code, public_slug, terms_accepted_at)
       VALUES ($1,$2,'Partner','Demo','DNI','99999991','999999991',$3,'partner-demo',now())
       ON CONFLICT (account_id) DO UPDATE
         SET associate_id=EXCLUDED.associate_id,
             first_name=EXCLUDED.first_name,
             last_name=EXCLUDED.last_name,
             phone=EXCLUDED.phone,
             referral_code=EXCLUDED.referral_code,
             public_slug=EXCLUDED.public_slug,
             updated_at=now()`,
      [partnerId, associateId, partnerCode],
    );

    const retailerOwnerId = await upsertAccount(client, retailerEmail, retailerPassword, "retailer_owner", "active");
    let { rows: retailers } = await client.query(`SELECT id FROM rumbo_retailers WHERE tax_id='20999999991' LIMIT 1`);
    let retailerId = retailers[0]?.id;
    if (!retailerId) {
      const inserted = await client.query(
        `INSERT INTO rumbo_retailers
          (legal_name,trade_name,tax_id,country_code,phone,contact_email,status,approved_at,approved_by)
         VALUES ('Rumbo Agencia Demo S.A.C.','Agencia Demo','20999999991','PE','999999992',$1,'active',now(),$2)
         RETURNING id`,
        [retailerEmail, adminId],
      );
      retailerId = inserted.rows[0].id;
    } else {
      await client.query(
        `UPDATE rumbo_retailers SET status='active', contact_email=$1, approved_at=COALESCE(approved_at,now()), approved_by=$2, updated_at=now() WHERE id=$3`,
        [retailerEmail, adminId, retailerId],
      );
    }

    await client.query(
      `INSERT INTO rumbo_retailer_members
        (retailer_id,account_id,member_role,first_name,last_name,phone,is_primary_contact)
       VALUES ($1,$2,'owner','Agencia','Demo','999999992',true)
       ON CONFLICT (retailer_id,account_id) DO UPDATE
         SET member_role='owner', first_name='Agencia', last_name='Demo', phone='999999992', is_primary_contact=true`,
      [retailerId, retailerOwnerId],
    );

    await client.query(
      `INSERT INTO rumbo_global_commission_settings (id,partner_rate,sponsor_rate,retailer_rate)
       VALUES (1,0.06,0,0)
       ON CONFLICT(id) DO NOTHING`,
    );

    await client.query("COMMIT");

    console.log(JSON.stringify({
      admin: { email: adminEmail, path: "/admin/acceso" },
      partner: { email: partnerEmail, path: "/acceso", referral_code: partnerCode },
      retailer: { email: retailerEmail, path: "/acceso", trade_name: "Agencia Demo" },
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
