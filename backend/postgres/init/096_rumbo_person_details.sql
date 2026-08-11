-- Datos personales comunes para Partners, usuarios internos Rumbo y personas de agencias.

ALTER TABLE rumbo_partner_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE rumbo_internal_members
  ADD COLUMN IF NOT EXISTS document_type varchar(12) NOT NULL DEFAULT 'DNI',
  ADD COLUMN IF NOT EXISTS document_number varchar(24),
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE rumbo_retailer_members
  ADD COLUMN IF NOT EXISTS document_type varchar(12) NOT NULL DEFAULT 'DNI',
  ADD COLUMN IF NOT EXISTS document_number varchar(24),
  ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_internal_members_document_uidx
  ON rumbo_internal_members(document_type, document_number)
  WHERE document_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_retailer_members_document_uidx
  ON rumbo_retailer_members(document_type, document_number)
  WHERE document_number IS NOT NULL;

CREATE OR REPLACE VIEW rumbo_internal_user_summary AS
SELECT a.id AS account_id,i.first_name,i.last_name,i.internal_role,i.phone,i.job_title,
       i.document_type,i.document_number,i.date_of_birth,
       a.email,a.status,a.last_login_at,a.must_change_password,a.created_at
FROM rumbo_internal_members i
JOIN rumbo_accounts a ON a.id=i.account_id;

CREATE OR REPLACE VIEW rumbo_retailer_user_summary AS
SELECT
  m.retailer_id,
  m.account_id,
  m.first_name,
  m.last_name,
  m.member_role,
  m.phone,
  m.document_type,
  m.document_number,
  m.date_of_birth,
  a.email,
  a.status,
  a.last_login_at,
  a.created_at,
  m.disabled_at,
  m.disabled_reason,
  CASE
    WHEN a.status = 'active' THEN 'active'
    WHEN m.disabled_reason = 'inactivity_30d' THEN 'inactive_30d'
    ELSE a.status
  END AS display_status
FROM rumbo_retailer_members m
JOIN rumbo_accounts a ON a.id = m.account_id;
