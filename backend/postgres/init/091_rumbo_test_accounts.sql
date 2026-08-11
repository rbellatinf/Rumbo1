-- Credenciales de prueba: solo se almacenan hashes bcrypt, nunca contraseñas en texto plano.
-- Crea el administrador mayorista de Rumbo y una agencia de prueba New Travel
-- con un administrador y un counter activos.

ALTER TABLE rumbo_accounts
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

INSERT INTO rumbo_accounts(email,password_hash,role,status,email_verified_at,must_change_password)
VALUES
  ('admin@rumbo.pe','$2b$12$LAEnT/bG8SduTlK9l.IYAuHeGz7gF8tAImtKMC0oep.//Gu0AN2Ge','wholesaler_admin','active',now(),true),
  ('admin@newtravel.pe','$2b$12$0eqnXTV/2zwVKWlwIjfuUuCjtjEwseF5Ki2SF160Yisz6JihDQrbq','retailer_owner','active',now(),true),
  ('counter1@newtravel.pe','$2b$12$wKCzuCmwu.T9.TRUsFva8Osu/W3nKzWmwtrn/aOPwchFgGh.GPoxO','retailer_agent','active',now(),true)
ON CONFLICT ((lower(email))) DO UPDATE
SET role=EXCLUDED.role,
    status='active',
    password_hash=EXCLUDED.password_hash,
    email_verified_at=COALESCE(rumbo_accounts.email_verified_at,now()),
    must_change_password=true,
    updated_at=now();

INSERT INTO rumbo_retailers(legal_name,trade_name,tax_id,country_code,contact_email,status,user_limit,inactivity_days,approved_at)
VALUES('New Travel (Pruebas)','New Travel','TEST-NEWTRAVEL','PE','admin@newtravel.pe','active',10,30,now())
ON CONFLICT (tax_id) DO UPDATE
SET legal_name=EXCLUDED.legal_name,
    trade_name=EXCLUDED.trade_name,
    contact_email=EXCLUDED.contact_email,
    status='active',
    user_limit=EXCLUDED.user_limit,
    inactivity_days=EXCLUDED.inactivity_days,
    approved_at=COALESCE(rumbo_retailers.approved_at,now()),
    updated_at=now();

WITH r AS (
  SELECT id FROM rumbo_retailers WHERE tax_id='TEST-NEWTRAVEL'
), a AS (
  SELECT id,email FROM rumbo_accounts WHERE lower(email) IN ('admin@newtravel.pe','counter1@newtravel.pe')
)
INSERT INTO rumbo_retailer_members(retailer_id,account_id,member_role,first_name,last_name,is_primary_contact)
SELECT r.id,a.id,
       CASE WHEN lower(a.email)='admin@newtravel.pe' THEN 'admin' ELSE 'counter' END,
       CASE WHEN lower(a.email)='admin@newtravel.pe' THEN 'Admin' ELSE 'Counter' END,
       'New Travel',
       lower(a.email)='admin@newtravel.pe'
FROM r CROSS JOIN a
ON CONFLICT (retailer_id,account_id) DO UPDATE
SET member_role=EXCLUDED.member_role,
    first_name=EXCLUDED.first_name,
    last_name=EXCLUDED.last_name,
    is_primary_contact=EXCLUDED.is_primary_contact,
    disabled_at=NULL,
    disabled_reason=NULL;
