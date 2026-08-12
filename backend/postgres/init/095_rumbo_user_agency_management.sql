-- Gestión administrativa de usuarios Rumbo y datos operativos/financieros de agencias.

ALTER TABLE rumbo_retailers
  ADD COLUMN IF NOT EXISTS commercial_name varchar(180),
  ADD COLUMN IF NOT EXISTS contact_name varchar(180),
  ADD COLUMN IF NOT EXISTS contact_email varchar(254),
  ADD COLUMN IF NOT EXISTS contact_phone varchar(40),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city varchar(120),
  ADD COLUMN IF NOT EXISTS country varchar(80) DEFAULT 'Perú',
  ADD COLUMN IF NOT EXISTS bank_name varchar(120),
  ADD COLUMN IF NOT EXISTS bank_account_number varchar(80),
  ADD COLUMN IF NOT EXISTS bank_cci varchar(40),
  ADD COLUMN IF NOT EXISTS bank_account_currency char(3) DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS bank_account_holder varchar(180),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS rumbo_internal_members (
  account_id uuid PRIMARY KEY REFERENCES rumbo_accounts(id) ON DELETE CASCADE,
  first_name varchar(100) NOT NULL,
  last_name varchar(120) NOT NULL,
  internal_role varchar(24) NOT NULL DEFAULT 'counter' CHECK (internal_role IN ('admin','counter')),
  phone varchar(40),
  job_title varchar(120),
  created_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Registra como admin interno cualquier wholesaler_admin histórico que aún no tenga perfil.
INSERT INTO rumbo_internal_members(account_id,first_name,last_name,internal_role,job_title)
SELECT a.id,'Administrador','Rumbo','admin','Administrador Rumbo'
FROM rumbo_accounts a
WHERE a.role='wholesaler_admin'
ON CONFLICT (account_id) DO NOTHING;

-- 096 amplía esta vista con documento y fecha de nacimiento. Como db:prepare
-- vuelve a ejecutar 095 en cada arranque, no debemos intentar reemplazar una
-- definición posterior con menos columnas. La vista base se crea solo si falta.
DO $$
BEGIN
  IF to_regclass('public.rumbo_internal_user_summary') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW rumbo_internal_user_summary AS
      SELECT a.id AS account_id,i.first_name,i.last_name,i.internal_role,i.phone,i.job_title,
             a.email,a.status,a.last_login_at,a.must_change_password,a.created_at
      FROM rumbo_internal_members i
      JOIN rumbo_accounts a ON a.id=i.account_id
    $view$;
  END IF;
END;
$$;
