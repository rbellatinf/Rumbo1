-- Reconciliación idempotente de cuentas TEST Partner con su perfil operativo.
-- Corrige bases persistentes donde la cuenta pudo existir antes de que el seed de perfiles
-- se incorporara a 093_rumbo_demo_directory.sql.

DO $$
DECLARE
  i integer;
  v_account_id uuid;
  v_sponsor_id uuid;
  v_email text;
  v_code text;
  v_document text;
  v_first_names text[] := ARRAY['Mateo','Sofía','Alejandro','Daniela','Sebastián','Martina','Nicolás','Fernanda','Gabriel','Julieta','Tomás','Isabella','Santiago','Renata','Emilio','Antonella','Lucas','Mía'];
  v_last_names text[] := ARRAY['García','López','Martínez','Sánchez','Romero','Díaz','Herrera','Medina','Silva','Ortega','Campos','Reyes','Morales','Cruz','Vargas','Peña','Fuentes','León'];
BEGIN
  FOR i IN 1..18 LOOP
    v_email := 'partner' || lpad(i::text,2,'0') || '@rumbo-test.pe';
    v_code := 'RUMBO-P' || lpad(i::text,3,'0');
    v_document := 'TESTP' || lpad(i::text,5,'0');

    SELECT id INTO v_account_id
      FROM rumbo_accounts
      WHERE lower(email)=lower(v_email) AND role='partner'
      LIMIT 1;

    IF v_account_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM rumbo_partner_profiles WHERE account_id=v_account_id)
       AND NOT EXISTS (SELECT 1 FROM rumbo_partner_profiles WHERE referral_code=v_code)
       AND NOT EXISTS (SELECT 1 FROM rumbo_partner_profiles WHERE document_type='DNI' AND document_number=v_document)
    THEN
      INSERT INTO rumbo_partner_profiles(
        account_id,first_name,last_name,document_type,document_number,phone,
        referral_code,public_slug,commission_rate,network_commission_rate,terms_accepted_at
      ) VALUES (
        v_account_id,v_first_names[i],v_last_names[i],'DNI',v_document,
        '+51 900 100 ' || lpad(i::text,3,'0'),v_code,
        'partner-test-' || lpad(i::text,2,'0'),0.0600,0.0000,now()
      );
    END IF;
  END LOOP;

  -- Restablece únicamente la red TEST conocida, después de garantizar que existan perfiles.
  FOR i IN 7..18 LOOP
    SELECT account_id INTO v_account_id
      FROM rumbo_partner_profiles
      WHERE referral_code='RUMBO-P' || lpad(i::text,3,'0');
    SELECT account_id INTO v_sponsor_id
      FROM rumbo_partner_profiles
      WHERE referral_code='RUMBO-P' || lpad((((i-7) % 6)+1)::text,3,'0');

    IF v_account_id IS NOT NULL AND v_sponsor_id IS NOT NULL THEN
      UPDATE rumbo_partner_profiles
        SET sponsor_partner_id=v_sponsor_id, updated_at=now()
        WHERE account_id=v_account_id;

      INSERT INTO rumbo_referral_relationships(
        sponsor_partner_id,referred_partner_id,referral_code,level,status
      ) VALUES (
        v_sponsor_id,v_account_id,
        'RUMBO-P' || lpad((((i-7) % 6)+1)::text,3,'0'),1,'active'
      )
      ON CONFLICT (referred_partner_id) DO UPDATE SET
        sponsor_partner_id=EXCLUDED.sponsor_partner_id,
        referral_code=EXCLUDED.referral_code,
        status='active',
        ended_at=NULL;
    END IF;
  END LOOP;
END $$;
