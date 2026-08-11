import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const clean=(v)=>String(v||"").trim();
function tempPassword(){return `Rumbo#${crypto.randomBytes(5).toString("base64url")}9a`}

export function installUserManagementRoutes(app,{pool,requireAdmin,audit}){
  app.get('/api/admin/internal-users',requireAdmin,async(_req,res)=>{
    const {rows}=await pool.query(`SELECT * FROM rumbo_internal_user_summary ORDER BY CASE WHEN internal_role='admin' THEN 0 ELSE 1 END,first_name,last_name`);
    res.json({users:rows});
  });

  app.post('/api/admin/internal-users',requireAdmin,async(req,res)=>{
    const email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),role=clean(req.body.role)||'counter';
    if(!email||!first||!last||!['admin','counter'].includes(role)) return res.status(422).json({error:{message:'Completa correo, nombres, apellidos y rol.'}});
    const password=tempPassword(),hash=await bcrypt.hash(password,12),client=await pool.connect();
    try{await client.query('BEGIN');
      const {rows}=await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,must_change_password) VALUES($1,$2,'wholesaler_admin','active',true) RETURNING id,email,status`,[email,hash]);
      await client.query(`INSERT INTO rumbo_internal_members(account_id,first_name,last_name,internal_role,phone,job_title,created_by_account_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[rows[0].id,first,last,role,clean(req.body.phone)||null,clean(req.body.job_title)||null,req.adminSession.account_id]);
      await client.query('COMMIT'); await audit(req.adminSession.email,'internal_user.created','account',rows[0].id,{email,role});
      res.status(201).json({user:{...rows[0],first_name:first,last_name:last,internal_role:role},credentials:{username:email,temporary_password:password,must_change_password:true}});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe un usuario con ese correo.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear el usuario Rumbo.'}})}finally{client.release()}
  });

  app.post('/api/admin/agencies',requireAdmin,async(req,res)=>{
    const trade=clean(req.body.trade_name),legal=clean(req.body.legal_name),tax=clean(req.body.tax_id);
    if(!trade||!legal||!tax) return res.status(422).json({error:{message:'Nombre comercial, razón social y RUC son obligatorios.'}});
    try{const {rows}=await pool.query(`INSERT INTO rumbo_retailers(trade_name,legal_name,tax_id,status,user_limit,inactivity_days,commercial_name,contact_name,contact_email,contact_phone,address,city,country,bank_name,bank_account_number,bank_cci,bank_account_currency,bank_account_holder,notes) VALUES($1,$2,$3,'active',$4,$5,$1,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,[trade,legal,tax,Math.max(1,Number(req.body.user_limit||10)),Math.max(1,Number(req.body.inactivity_days||30)),clean(req.body.contact_name)||null,clean(req.body.contact_email)||null,clean(req.body.contact_phone)||null,clean(req.body.address)||null,clean(req.body.city)||null,clean(req.body.country)||'Perú',clean(req.body.bank_name)||null,clean(req.body.bank_account_number)||null,clean(req.body.bank_cci)||null,clean(req.body.bank_account_currency)||'PEN',clean(req.body.bank_account_holder)||legal,clean(req.body.notes)||null]);await audit(req.adminSession.email,'retailer.created','retailer',rows[0].id,{trade_name:trade,tax_id:tax});res.status(201).json({agency:rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe una agencia con ese RUC o identificador.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear la agencia.'}})}
  });

  app.post('/api/admin/agency-people',requireAdmin,async(req,res)=>{
    const retailerId=clean(req.body.retailer_id),email=clean(req.body.email).toLowerCase(),first=clean(req.body.first_name),last=clean(req.body.last_name),role=clean(req.body.role)||'counter';
    if(!retailerId||!email||!first||!last||!['admin','counter'].includes(role))return res.status(422).json({error:{message:'Agencia, correo, nombres, apellidos y rol son obligatorios.'}});
    const agency=(await pool.query(`SELECT id,user_limit FROM rumbo_retailers WHERE id=$1`,[retailerId])).rows[0];if(!agency)return res.status(404).json({error:{message:'Agencia no encontrada.'}});
    const count=Number((await pool.query(`SELECT count(*)::int n FROM rumbo_retailer_members WHERE retailer_id=$1`,[retailerId])).rows[0]?.n||0);if(count>=agency.user_limit)return res.status(409).json({error:{message:'La agencia alcanzó su límite de usuarios.'}});
    const password=tempPassword(),hash=await bcrypt.hash(password,12),client=await pool.connect();try{await client.query('BEGIN');const {rows}=await client.query(`INSERT INTO rumbo_accounts(email,password_hash,role,status,must_change_password) VALUES($1,$2,'retailer','active',true) RETURNING id,email,status`,[email,hash]);await client.query(`INSERT INTO rumbo_retailer_members(retailer_id,account_id,member_role,first_name,last_name,created_by_account_id) VALUES($1,$2,$3,$4,$5,$6)`,[retailerId,rows[0].id,role,first,last,req.adminSession.account_id]);await client.query('COMMIT');await audit(req.adminSession.email,'retailer.person_created','retailer_user',rows[0].id,{retailer_id:retailerId,email,role});res.status(201).json({person:{...rows[0],first_name:first,last_name:last,member_role:role},credentials:{username:email,temporary_password:password,must_change_password:true}})}catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:{message:'Ya existe una persona con ese correo.'}});console.error(e);res.status(500).json({error:{message:'No pudimos crear la persona.'}})}finally{client.release()}
  });
}
