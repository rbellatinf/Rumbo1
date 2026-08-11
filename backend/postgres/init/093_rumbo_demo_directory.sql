-- Directorio de prueba para validar grillas, paginación y atribución.
-- Todos los datos están identificados como TEST y son idempotentes.

DO $$
DECLARE
  i integer;
  j integer;
  v_retailer_id uuid;
  v_account_id uuid;
  v_trade_name text;
  v_legal_name text;
  v_email text;
  v_member_count integer;
  v_first_names text[] := ARRAY['Lucía','Carlos','Mariana','Diego','Valeria','Andrés','Camila','Jorge','Paola','Renato'];
  v_last_names text[] := ARRAY['Torres','Ramos','Salazar','Vega','Castro','Mendoza','Rojas','Paredes','Navarro','Flores'];
  v_agencies text[] := ARRAY[
    'Andes Travel','Costa Tours','Pacífico Viajes','Mundo Travel','Destino Perú',
    'Horizonte Tours','Ruta Latina','Viajes del Sol','Conexión Travel'
  ];
  -- Hash bcrypt de una clave temporal de prueba. Nunca se almacena la clave en texto plano.
  v_test_hash text := '$2b$12$wKCzuCmwu.T9.TRUsFva8Osu/W3nKzWmwtrn/aOPwchFgGh.GPoxO';
BEGIN
  -- New Travel ya existe como agencia 1. Creamos 9 adicionales para llegar a 10.
  FOR i IN 1..9 LOOP
    v_trade_name := v_agencies[i];
    v_legal_name := v_trade_name || ' (Pruebas)';
    v_member_count := 1 + (i % 3); -- 1, 2 o 3 usuarios.

    INSERT INTO rumbo_retailers(
      legal_name,trade_name,tax_id,country_code,city,contact_email,status,user_limit,inactivity_days,approved_at
    ) VALUES (
      v_legal_name,v_trade_name,'TEST-AG-' || lpad(i::text,2,'0'),'PE','Lima',
      'admin.ag' || lpad(i::text,2,'0') || '@rumbo-test.pe','active',10,30,now()
    )
    ON CONFLICT (tax_id) DO UPDATE SET
      legal_name=EXCLUDED.legal_name,
      trade_name=EXCLUDED.trade_name,
      city=EXCLUDED.city,
      contact_email=EXCLUDED.contact_email,
      status='active',
      user_limit=10,
      inactivity_days=30,
      approved_at=COALESCE(rumbo_retailers.approved_at,now()),
      updated_at=now()
    RETURNING id INTO v_retailer_id;

    FOR j IN 1..v_member_count LOOP
      v_email := CASE WHEN j=1
        THEN 'admin.ag' || lpad(i::text,2,'0') || '@rumbo-test.pe'
        ELSE 'counter' || (j-1)::text || '.ag' || lpad(i::text,2,'0') || '@rumbo-test.pe'
      END;

      INSERT INTO rumbo_accounts(email,password_hash,role,status,email_verified_at,must_change_password)
      VALUES(
        v_email,
        v_test_hash,
        CASE WHEN j=1 THEN 'retailer_owner' ELSE 'retailer_agent' END,
        'active',now(),true
      )
      ON CONFLICT ((lower(email))) DO UPDATE SET
        role=EXCLUDED.role,
        status='active',
        email_verified_at=COALESCE(rumbo_accounts.email_verified_at,now()),
        updated_at=now()
      RETURNING id INTO v_account_id;

      INSERT INTO rumbo_retailer_members(
        retailer_id,account_id,member_role,first_name,last_name,is_primary_contact
      ) VALUES(
        v_retailer_id,v_account_id,
        CASE WHEN j=1 THEN 'admin' ELSE 'counter' END,
        v_first_names[((i+j-2) % array_length(v_first_names,1))+1],
        v_last_names[((i*2+j-2) % array_length(v_last_names,1))+1],
        j=1
      )
      ON CONFLICT (retailer_id,account_id) DO UPDATE SET
        member_role=EXCLUDED.member_role,
        first_name=EXCLUDED.first_name,
        last_name=EXCLUDED.last_name,
        is_primary_contact=EXCLUDED.is_primary_contact,
        disabled_at=NULL,
        disabled_reason=NULL;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  i integer;
  v_account_id uuid;
  v_sponsor_id uuid;
  v_email text;
  v_test_hash text := '$2b$12$LAEnT/bG8SduTlK9l.IYAuHeGz7gF8tAImtKMC0oep.//Gu0AN2Ge';
  v_first_names text[] := ARRAY['Mateo','Sofía','Alejandro','Daniela','Sebastián','Martina','Nicolás','Fernanda','Gabriel','Julieta','Tomás','Isabella','Santiago','Renata','Emilio','Antonella','Lucas','Mía'];
  v_last_names text[] := ARRAY['García','López','Martínez','Sánchez','Romero','Díaz','Herrera','Medina','Silva','Ortega','Campos','Reyes','Morales','Cruz','Vargas','Peña','Fuentes','León'];
BEGIN
  FOR i IN 1..18 LOOP
    v_email := 'partner' || lpad(i::text,2,'0') || '@rumbo-test.pe';

    INSERT INTO rumbo_accounts(email,password_hash,role,status,email_verified_at,must_change_password)
    VALUES(v_email,v_test_hash,'partner','active',now(),true)
    ON CONFLICT ((lower(email))) DO UPDATE SET
      role='partner',status='active',email_verified_at=COALESCE(rumbo_accounts.email_verified_at,now()),updated_at=now()
    RETURNING id INTO v_account_id;

    INSERT INTO rumbo_partner_profiles(
      account_id,first_name,last_name,document_type,document_number,phone,referral_code,public_slug,
      commission_rate,network_commission_rate,terms_accepted_at
    ) VALUES(
      v_account_id,
      v_first_names[i],v_last_names[i],
      'DNI','TESTP' || lpad(i::text,5,'0'),
      '+51 900 100 ' || lpad(i::text,3,'0'),
      'RUMBO-P' || lpad(i::text,3,'0'),
      'partner-test-' || lpad(i::text,2,'0'),
      0.0600,0.0000,now()
    )
    ON CONFLICT (account_id) DO UPDATE SET
      first_name=EXCLUDED.first_name,
      last_name=EXCLUDED.last_name,
      document_type=EXCLUDED.document_type,
      document_number=EXCLUDED.document_number,
      phone=EXCLUDED.phone,
      referral_code=EXCLUDED.referral_code,
      public_slug=EXCLUDED.public_slug,
      commission_rate=EXCLUDED.commission_rate,
      terms_accepted_at=COALESCE(rumbo_partner_profiles.terms_accepted_at,now()),
      updated_at=now();
  END LOOP;

  -- Crea una red directa de prueba para Partners 7–18 bajo Partners 1–6.
  FOR i IN 7..18 LOOP
    SELECT account_id INTO v_account_id FROM rumbo_partner_profiles WHERE referral_code='RUMBO-P' || lpad(i::text,3,'0');
    SELECT account_id INTO v_sponsor_id FROM rumbo_partner_profiles WHERE referral_code='RUMBO-P' || lpad((((i-7) % 6)+1)::text,3,'0');

    UPDATE rumbo_partner_profiles
      SET sponsor_partner_id=v_sponsor_id, updated_at=now()
      WHERE account_id=v_account_id;

    INSERT INTO rumbo_referral_relationships(sponsor_partner_id,referred_partner_id,referral_code,level,status)
    VALUES(v_sponsor_id,v_account_id,'RUMBO-P' || lpad((((i-7) % 6)+1)::text,3,'0'),1,'active')
    ON CONFLICT (referred_partner_id) DO UPDATE SET
      sponsor_partner_id=EXCLUDED.sponsor_partner_id,
      referral_code=EXCLUDED.referral_code,
      status='active',
      ended_at=NULL;
  END LOOP;
END $$;
