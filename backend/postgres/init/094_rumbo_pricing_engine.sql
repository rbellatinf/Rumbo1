-- Motor de pricing propio de Rumbo. Exclusivo para administración mayorista.
-- Se mantiene separado de comisiones: pricing determina el precio cliente;
-- comisiones determinan cuánto se paga al canal/partner sobre la venta.

CREATE TABLE IF NOT EXISTS rumbo_pricing_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) UNIQUE NOT NULL,
  name varchar(160) NOT NULL,
  program_type varchar(24) NOT NULL CHECK (program_type IN ('campaign','season','administrative')),
  description text,
  sale_start date,
  sale_end date,
  travel_start date,
  travel_end date,
  priority integer NOT NULL DEFAULT 100,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','expired')),
  created_by uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sale_end IS NULL OR sale_start IS NULL OR sale_end >= sale_start),
  CHECK (travel_end IS NULL OR travel_start IS NULL OR travel_end >= travel_start)
);

CREATE TABLE IF NOT EXISTS rumbo_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES rumbo_pricing_programs(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  effect varchar(16) NOT NULL CHECK (effect IN ('charge','discount')),
  calculation_type varchar(24) NOT NULL CHECK (calculation_type IN ('percent','fixed_booking','fixed_passenger')),
  value numeric(12,4) NOT NULL CHECK (value >= 0),
  currency char(3),
  scope_type varchar(24) NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all','region','destination','product','tag','provider')),
  scope_value varchar(160),
  sale_start date,
  sale_end date,
  travel_start date,
  travel_end date,
  priority integer NOT NULL DEFAULT 100,
  stackable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES rumbo_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type='all' AND scope_value IS NULL) OR (scope_type<>'all' AND scope_value IS NOT NULL)),
  CHECK ((calculation_type='percent' AND currency IS NULL) OR calculation_type<>'percent'),
  CHECK (sale_end IS NULL OR sale_start IS NULL OR sale_end >= sale_start),
  CHECK (travel_end IS NULL OR travel_start IS NULL OR travel_end >= travel_start)
);

CREATE INDEX IF NOT EXISTS rumbo_pricing_programs_status_idx ON rumbo_pricing_programs(status,priority);
CREATE INDEX IF NOT EXISTS rumbo_pricing_rules_lookup_idx ON rumbo_pricing_rules(is_active,scope_type,scope_value,priority);
CREATE INDEX IF NOT EXISTS rumbo_pricing_rules_program_idx ON rumbo_pricing_rules(program_id);

-- Reglas iniciales de demostración para probar el motor. No afectan precios
-- mientras el storefront no llame al evaluador de pricing.
INSERT INTO rumbo_pricing_programs(code,name,program_type,description,priority,status)
VALUES
 ('ADMIN-ASIA','Cargo administrativo Asia','administrative','Cargo administrativo adicional para productos con destino Asia.',50,'active'),
 ('ADMIN-DISNEY','Cargo administrativo Disney','administrative','Cargo administrativo adicional para paquetes etiquetados Disney.',55,'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO rumbo_pricing_rules(program_id,name,effect,calculation_type,value,scope_type,scope_value,priority,is_active)
SELECT p.id,'Asia +2% gastos administrativos','charge','percent',2.0000,'region','ASIA',50,true
FROM rumbo_pricing_programs p WHERE p.code='ADMIN-ASIA'
  AND NOT EXISTS (SELECT 1 FROM rumbo_pricing_rules r WHERE r.program_id=p.id AND r.name='Asia +2% gastos administrativos');

INSERT INTO rumbo_pricing_rules(program_id,name,effect,calculation_type,value,scope_type,scope_value,priority,is_active)
SELECT p.id,'Disney +2% gastos administrativos','charge','percent',2.0000,'tag','DISNEY',55,true
FROM rumbo_pricing_programs p WHERE p.code='ADMIN-DISNEY'
  AND NOT EXISTS (SELECT 1 FROM rumbo_pricing_rules r WHERE r.program_id=p.id AND r.name='Disney +2% gastos administrativos');
