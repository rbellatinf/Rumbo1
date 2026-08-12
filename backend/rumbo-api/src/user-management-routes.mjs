import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { installIntegrationObservabilityRoutes } from "./integration-observability-routes.mjs";

const clean=(v)=>String(v||"").trim();
const sha256=(v)=>crypto.createHash("sha256").update(v).digest("hex");
function tempPassword(){return `Rumbo#${crypto.randomBytes(5).toString("base64url")}9a`}
function referralCode(first,last){const seed=`${first}-${last}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,18);return `RUMBO-${seed}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`}

export function installUserManagementRoutes(app,{pool,requireAdmin,audit}){
  installIntegrationObservabilityRoutes(app,{pool,requireAdmin,audit});

  async function requireInternalAdmin(req,res,next){
    if(!req.adminSession?.account_id) return next();
    const {rows}=await pool.query(`SELECT internal_role FROM rumbo_internal_members WHERE account_id=$1 LIMIT 1`,[req.adminSession.account_id]);
    if(rows[0]?.internal_role!=="admin") return res.status(403).json({error:{message:"Solo un Administrador Rumbo puede realizar esta acción."}});
    next();
  }

  async function retailerAdminFromRequest(req){
    const header=req.get("Authorization")||"";
    if(!header.startsWith("Bearer ")) return null;
    const token=header.slice(7).trim(); if(!token) return null;
    const {rows}=await pool.query(`SELECT s.account_id,a.email,m.retailer_id,m.member_role FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id=s.account_id JOIN rumbo_retailer_members m ON m.account_id=a.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1`,[sha256(token)]);
    return rows[0]?.member_role==='admin'?rows[0]:null;
  }

  async function createAgencyPerson({retailerId,email,first,last,role,documentType,documentNumber,dateOfBirth,phone,createdBy,actor,res}){
    const agency=(await pool.query(`SELECT id,user_limit FROM rumbo_retailers WHERE id=$1`,[retailerId])).rows[0];if(!agency)return res.status(404).json({error:{message:'Agencia no encontrada.'}});
    const count=Number((await pool.query(`SELECT count(*)::int n FROM rumbo_retailer_members WHERE retailer_id=$1`,[retailerId])).rows[0]?.n||0);if(count>=agency.user_limit)return res.status(409).json({error:{message:'La agencia alcanzó su límite de usuarios.'}});
    const password=tempPassword(),hash=await bcrypt.hash(password,12),accountRole=role==='admin'?'retailer_owner':'retailer_agent',client=await pool.connect();
    try{await client.query('BEGIN');const {rows}=await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'active',true) RETURNING id,email,status`,[email,hash,accountRole]);await client.query(`INSERT INTO rumbo_retailer_members(retailer_id,account_id,member_role,first_name,last_name,phone,document_type,document_number,date_of_birth,created_by_account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,'')::date,$10)`,[retailerId,rows[0].id,role,first,last,phone||null,documentType||'DNI',documentNumber||null,dateOfBirth||'',createdBy]);await client.query('COMMIT');await audit(actor,'retailer.person_created','retailer_user',rows[0].id,{retailer_id:retailerId,email,role});return res.status(201).json({person:{...rows[0],first_name:first,last_name:last,member_role:role,document_type:documentType||'DNI',document_number:documentNumber||null,date_of_birth:dateOfBirth||null,phone:phone||null},credentials:{username:email,temporary_password:password,must_change_password:true}})}catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe una persona con ese correo o documento.'}});console.error(e);return res.status(500).json({error:{message:'No pudimos crear la persona.'}})}finally{client.release()}
  }

  app.post('/api/admin/catalog/:id/images',requireAdmin,async(req,res)=>{
    const url=clean(req.body.url),storageProvider=clean(req.body.storage_provider)||null,storageKey=clean(req.body.storage_key)||null,bucketName=clean(req.body.bucket_name)||null;
    if(!url)return res.status(422).json({error:{message:'URL de imagen obligatoria.'}});
    if(storageProvider&&storageProvider!=='cloudflare-r2'&&storageProvider!=='external'&&storageProvider!=='legacy-spree')return res.status(422).json({error:{message:'Proveedor de almacenamiento inválido.'}});
    const primary=Boolean(req.body.is_primary),metadata=req.body.metadata&&typeof req.body.metadata==='object'&&!Array.isArray(req.body.metadata)?req.body.metadata:{},client=await pool.connect();
    try{
      await client.query('BEGIN');
      if(primary)await client.query(`UPDATE rumbo_catalog_images SET is_primary=false WHERE product_id=$1`,[req.params.id]);
      const {rows}=await client.query(`INSERT INTO rumbo_catalog_images(product_id,url,alt_text,sort_order,is_primary,storage_provider,storage_key,bucket_name,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,[req.params.id,url,clean(req.body.alt_text)||null,Number(req.body.sort_order)||0,primary,storageProvider,storageKey,bucketName,JSON.stringify(metadata)]);
      await client.query('COMMIT');
      await audit(req.adminSession.email,'catalog.image_created','catalog_product',req.params.id,{image_id:rows[0].id,storage_provider:storageProvider,storage_key:storageKey,bucket_name:bucketName});
      return res.status(201).json({image:rows[0]});
    }catch(e){
      await client.query('ROLLBACK').catch(()=>{});
      if(e.code==='23503')return res.status(404).json({error:{message:'Producto no encontrado.'}});
      if(e.code==='23505')return res.status(409).json({error:{message:'Ese objeto de imagen ya está asociado al catálogo.'}});
      console.error(e);return res.status(500).json({error:{message:'No pudimos agregar la imagen.'}});
    }finally{client.release()}
  });

  app.get('/api/admin/internal-users',requireAdmin,async(_req,res)=>{
    const {rows}=await pool.query(`SELECT * FROM rumbo_internal_user_summary ORDER BY CASE WHEN internal_role='admin' THEN 0 ELSE 1 END,first_name,last_name`);
    res.json({users:rows});
  });

  app.get('/api/admin/person-detail',requireAdmin,async(req,res)=>{
    const type=clean(req.query.type),id=clean(req.query.id);
    if(!id||!['partner','internal','retailer'].includes(type))return res.status(422).json({error:{message:'Tipo e identificador son obligatorios.'}});
    let query='';
    if(type==='partner') query=`SELECT p.account_id,p.first_name,p.last_name,p.document_type,p.document_number,p.date_of_birth,p.phone,p.referral_code,p.public_slug,p.commission_rate,p.network_commission_rate,p.created_at,a.email,a.status,a.last_login_at FROM rumbo_partner_profiles p JOIN rumbo_accounts a ON a.id=p.account_id WHERE p.account_id=$1 LIMIT 1`;
    if(type==='internal') query=`SELECT i.account_id,i.first_name,i.last_name,i.internal_role,i.job_title,i.phone,i.document_type,i.document_number,i.date_of_birth,i.created_at,a.email,a.status,a.last_login_at FROM rumbo_internal_members i JOIN rumbo_accounts a ON a.id=i.account_id WHERE i.account_id=$1 LIMIT 1`;
    if(type==='retailer') query=`SELECT m.account_id,m.retailer_id,m.first_name,m.last_name,m.member_role,m.phone,m.document_type,m.document_number,m.date_of_birth,m.created_at,a.email,a.status,a.last_login_at,r.trade_name,r.legal_name,r.tax_id FROM rumbo_retailer_members m JOIN rumbo_accounts a ON a.id=m.account_id JOIN rumbo_retailers r ON r.id=m.retailer_id WHERE m.account_id=$1 LIMIT 1`;
    const {rows}=await pool.query(query,[id]); if(!rows[0])return res.status(404).json({error:{message:'Persona no encontrada.'}});res.json({person:{...rows[0],person_type:type}});
  });

  app.post('/api/admin/internal-users',requireAdmin,requireInternalAdmin,async(req,res)=>{
    const email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),role=clean(req.body.role)||'counter',documentType=clean(req.body.document_type)||'DNI',documentNumber=clean(req.body.document_number),dateOfBirth=clean(req.body.date_of_birth),phone=clean(req.body.phone);
    if(!email||!first||!last||!documentNumber||!['admin','counter'].includes(role)||!['DNI','CE','PASSPORT'].includes(documentType)) return res.status(422).json({error:{message:'Completa correo, nombres, apellidos, rol y documento.'}});
    const password=tempPassword(),hash=await bcrypt.hash(password,12),client=await pool.connect();
    try{await client.query('BEGIN');
      const {rows}=await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,must_change_password) VALUES($1,$2,'wholesaler_admin','active',true) RETURNING id,email,status`,[email,hash]);
      await client.query(`INSERT INTO rumbo_internal_members(account_id,first_name,last_name,internal_role,phone,job_title,document_type,document_number,date_of_birth,created_by_account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,'')::date,$10)`,[rows[0].id,first,last,role,phone||null,clean(req.body.job_title)||null,documentType,documentNumber,dateOfBirth||'',req.adminSession.account_id]);
      await client.query('COMMIT'); await audit(req.adminSession.email,'internal_user.created','account',rows[0].id,{email,role});
      res.status(201).json({user:{...rows[0],first_name:first,last_name:last,internal_role:role,document_type:documentType,document_number:documentNumber,date_of_birth:dateOfBirth||null,phone:phone||null},credentials:{username:email,temporary_password:password,must_change_password:true}});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe un usuario con ese correo o documento.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear el usuario Rumbo.'}})}finally{client.release()}
  });

  app.post('/api/admin/partners',requireAdmin,requireInternalAdmin,async(req,res)=>{
    const email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),documentType=clean(req.body.document_type)||'DNI',documentNumber=clean(req.body.document_number),phone=clean(req.body.phone),dateOfBirth=clean(req.body.date_of_birth);
    if(!email||!first||!last||!documentNumber||!['DNI','CE','PASSPORT','RUC'].includes(documentType)) return res.status(422).json({error:{message:'Completa correo, nombres, apellidos y documento.'}});
    const password=tempPassword(),hash=await bcrypt.hash(password,12),referral=referralCode(first,last),client=await pool.connect();
    try{await client.query('BEGIN');const {rows}=await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,must_change_password) VALUES($1,$2,'partner','active',true) RETURNING id,email,status`,[email,hash]);await client.query(`INSERT INTO rumbo_partner_profiles(account_id,first_name,last_name,document_type,document_number,date_of_birth,phone,referral_code,terms_accepted_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::date,$7,$8,now())`,[rows[0].id,first,last,documentType,documentNumber,dateOfBirth||'',phone||null,referral]);await client.query('COMMIT');await audit(req.adminSession.email,'partner.created','partner',rows[0].id,{email,referral_code:referral});res.status(201).json({partner:{account_id:rows[0].id,email,first_name:first,last_name:last,document_type:documentType,document_number:documentNumber,date_of_birth:dateOfBirth||null,phone,referral_code:referral,status:'active'},credentials:{username:email,temporary_password:password,must_change_password:true}})}catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe un Partner con ese correo, documento o código.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear el Partner.'}})}finally{client.release()}
  });

  app.post('/api/admin/agencies',requireAdmin,requireInternalAdmin,async(req,res)=>{
    const trade=clean(req.body.trade_name),legal=clean(req.body.legal_name),tax=clean(req.body.tax_id);
    if(!trade||!legal||!tax) return res.status(422).json({error:{message:'Nombre comercial, razón social y RUC son obligatorios.'}});
    try{const {rows}=await pool.query(`INSERT INTO rumbo_retailers(trade_name,legal_name,tax_id,status,user_limit,inactivity_days,commercial_name,contact_name,contact_email,contact_phone,address,city,country,bank_name,bank_account_number,bank_cci,bank_account_currency,bank_account_holder,notes) VALUES($1,$2,$3,'active',$4,$5,$1,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,[trade,legal,tax,Math.max(1,Number(req.body.user_limit||10)),Math.max(1,Number(req.body.inactivity_days||30)),clean(req.body.contact_name)||null,clean(req.body.contact_email)||null,clean(req.body.contact_phone)||null,clean(req.body.address)||null,clean(req.body.city)||null,clean(req.body.country)||'Perú',clean(req.body.bank_name)||null,clean(req.body.bank_account_number)||null,clean(req.body.bank_cci)||null,clean(req.body.bank_account_currency)||'PEN',clean(req.body.bank_account_holder)||legal,clean(req.body.notes)||null]);await audit(req.adminSession.email,'retailer.created','retailer',rows[0].id,{trade_name:trade,tax_id:tax});res.status(201).json({agency:rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe una agencia con ese RUC o identificador.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear la agencia.'}})}
  });

  app.post('/api/admin/agency-people',requireAdmin,requireInternalAdmin,async(req,res)=>{
    const retailerId=clean(req.body.retailer_id),email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),role=clean(req.body.role)||'counter',documentType=clean(req.body.document_type)||'DNI',documentNumber=clean(req.body.document_number),dateOfBirth=clean(req.body.date_of_birth),phone=clean(req.body.phone);
    if(!retailerId||!email||!first||!last||!documentNumber||!['admin','counter'].includes(role))return res.status(422).json({error:{message:'Agencia, correo, nombres, apellidos, documento y rol son obligatorios.'}});
    return createAgencyPerson({retailerId,email,first,last,role,documentType,documentNumber,dateOfBirth,phone,createdBy:req.adminSession.account_id,actor:req.adminSession.email,res});
  });

  app.post('/api/retailer-admin/people',async(req,res)=>{
    const session=await retailerAdminFromRequest(req);if(!session)return res.status(403).json({error:{message:'Solo un Administrador de la agencia puede crear personas.'}});
    const email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),role=clean(req.body.role)||'counter',documentType=clean(req.body.document_type)||'DNI',documentNumber=clean(req.body.document_number),dateOfBirth=clean(req.body.date_of_birth),phone=clean(req.body.phone);
    if(!email||!first||!last||!documentNumber||!['admin','counter'].includes(role))return res.status(422).json({error:{message:'Correo, nombres, apellidos, documento y rol son obligatorios.'}});
    return createAgencyPerson({retailerId:session.retailer_id,email,first,last,role,documentType,documentNumber,dateOfBirth,phone,createdBy:session.account_id,actor:session.email,res});
  });
}
