-- Agencia minorista: dos roles internos (admin y counter), control de cupos,
-- desactivación por inactividad y solicitudes de alta/reactivación.

ALTER TABLE rumbo_retailers
  ADD COLUMN IF NOT EXISTS user_limit integer NOT NULL DEFAULT 10 CHECK (user_limit >= 1 AND user_limit <= 500),
  ADD COLUMN IF NOT EXISTS inactivity_days smallint NOT NULL DEFAULT 30 CHECK (inactivity_days BETWEEN 1 AND 365);

-- Normaliza los cuatro roles históricos al modelo definitivo de dos roles.
UPDATE rumbo_retailer_members
SET member_role = CASE
  WHEN member_role IN ('owner', 'manager', 'finance') THEN 'admin'
  ELSE 'counter'
END
WHERE member_role NOT IN ('admin', 'counter');

ALTER TABLE rumbo_retailer_members
  DROP CONSTRAINT IF EXISTS rumbo_retailer_members_member_role_check;

ALTER TABLE rumbo_retailer_members
  ADD CONSTRAINT rumbo_retailer_members_member_role_check
  CHECK (member_role IN ('admin', 'counter'));

ALTER TABLE rumbo_retailer_members
  ADD COLUMN IF NOT EXISTS created_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_reason varchar(40),
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL;

-- Atribución explícita de la venta a la agencia y al counter/admin que la creó.
ALTER TABLE rumbo_booking_requests
  ADD COLUMN IF NOT EXISTS retailer_id uuid REFERENCES rumbo_retailers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rumbo_booking_requests_retailer_idx
  ON rumbo_booking_requests(retailer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rumbo_booking_requests_sold_by_idx
  ON rumbo_booking_requests(sold_by_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rumbo_retailer_user_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES rumbo_retailers(id) ON DELETE CASCADE,
  requested_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  request_type varchar(16) NOT NULL CHECK (request_type IN ('create', 'reactivate')),
  target_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  requested_email varchar(254),
  first_name varchar(100),
  last_name varchar(120),
  requested_role varchar(16) CHECK (requested_role IN ('admin', 'counter')),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  notes text,
  resolved_by_account_id uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (request_type = 'create' AND requested_email IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND requested_role IS NOT NULL)
    OR
    (request_type = 'reactivate' AND target_account_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS rumbo_retailer_user_requests_queue_idx
  ON rumbo_retailer_user_requests(status, created_at);
CREATE INDEX IF NOT EXISTS rumbo_retailer_user_requests_retailer_idx
  ON rumbo_retailer_user_requests(retailer_id, created_at DESC);

-- Se ejecuta desde la API al iniciar sesión y al consultar el portal de agencia.
-- De esta manera el estado se materializa en PostgreSQL sin requerir un cron externo.
CREATE OR REPLACE FUNCTION rumbo_disable_inactive_retailer_users()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer := 0;
BEGIN
  WITH stale AS (
    SELECT a.id
    FROM rumbo_accounts a
    JOIN rumbo_retailer_members m ON m.account_id = a.id
    JOIN rumbo_retailers r ON r.id = m.retailer_id
    WHERE a.status = 'active'
      AND COALESCE(a.last_login_at, a.created_at) < now() - make_interval(days => r.inactivity_days)
  ), disabled AS (
    UPDATE rumbo_accounts a
       SET status = 'disabled', updated_at = now()
      FROM stale s
     WHERE a.id = s.id
    RETURNING a.id
  )
  UPDATE rumbo_retailer_members m
     SET disabled_at = COALESCE(m.disabled_at, now()),
         disabled_reason = 'inactivity_30d'
    FROM disabled d
   WHERE m.account_id = d.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE VIEW rumbo_retailer_user_summary AS
SELECT
  m.retailer_id,
  m.account_id,
  m.first_name,
  m.last_name,
  m.member_role,
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
