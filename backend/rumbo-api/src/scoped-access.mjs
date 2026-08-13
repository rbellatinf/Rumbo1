import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");

export async function scopedSession(req){const h=req.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;const token=h.slice(7).trim();if(!token)return null;const {rows}=await pool.query(`SELECT s.account_id,a.email,a.role,a.status,m.retailer_id,m.member_role FROM rumbo_auth_sessions s JOIN rumbo_accounts a ON a.id=s.account_id LEFT JOIN rumbo_retailer_members m ON m.account_id=a.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1`,[sha256(token)]);return rows[0]||null}
export function requireRoles(...roles){return async(req,res,next)=>{const s=await scopedSession(req);if(!s)return res.status(401).json({error:{message:"La sesión venció o no es válida."}});if(!roles.includes(s.role))return res.status(403).json({error:{message:"No tienes permiso para este módulo."}});req.rumboScopedSession=s;next()}}
export function requireRetailerAdmin(){return async(req,res,next)=>{const s=await scopedSession(req);if(!s)return res.status(401).json({error:{message:"La sesión venció o no es válida."}});if(!s.retailer_id||s.member_role!=="admin")return res.status(403).json({error:{message:"Este módulo es exclusivo del administrador de la agencia."}});req.rumboScopedSession=s;next()}}
export function assertSameRetailer(req,res,retailerId){if(req.rumboScopedSession?.retailer_id!==retailerId){res.status(403).json({error:{message:"No puedes consultar información de otra agencia."}});return false}return true}
export {pool};
