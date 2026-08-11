"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RequestRow = {
  id:string; retailer_id:string; request_type:"create"|"reactivate"; target_account_id?:string|null;
  requested_email?:string|null; first_name?:string|null; last_name?:string|null; requested_role?:"admin"|"counter"|null;
  status:string; notes?:string|null; trade_name:string; legal_name:string; tax_id:string; requested_by_email?:string|null; created_at:string;
};

function temporaryPassword() {
  const seed = crypto.randomUUID().replace(/-/g,"").slice(0,10);
  return `Ru-${seed}!9`;
}

export default function AgencyUsersAdminPage() {
  const [rows,setRows] = useState<RequestRow[]>([]);
  const [message,setMessage] = useState("Cargando solicitudes…");
  const [busy,setBusy] = useState("");
  const [credential,setCredential] = useState<{email:string;password:string}|null>(null);

  async function load() {
    const response = await fetch("/api/admin/agency-user-requests", { cache:"no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "No pudimos cargar las solicitudes.");
    setRows(payload.requests || []); setMessage("");
  }
  useEffect(()=>{ load().catch((e)=>setMessage(e instanceof Error?e.message:"Error de carga")); },[]);

  async function resolve(row:RequestRow) {
    setBusy(row.id); setCredential(null); setMessage("");
    try {
      if (row.request_type === "reactivate" && row.target_account_id) {
        const response = await fetch(`/api/admin/agency-users/${row.target_account_id}/reactivate`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({request_id:row.id}) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "No pudimos reactivar el usuario.");
        setMessage("Usuario reactivado. Tendrá 30 días desde hoy para volver a ingresar.");
      } else {
        const password = temporaryPassword();
        const response = await fetch("/api/admin/agency-users", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ retailer_id:row.retailer_id, email:row.requested_email, first_name:row.first_name, last_name:row.last_name, role:row.requested_role, temporary_password:password, request_id:row.id }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "No pudimos crear el usuario.");
        setCredential({ email:String(row.requested_email||""), password });
        setMessage("Usuario creado. La contraseña temporal se muestra una sola vez aquí.");
      }
      await load();
    } catch(e) { setMessage(e instanceof Error?e.message:"No pudimos procesar la solicitud."); }
    finally { setBusy(""); }
  }

  const pending = rows.filter(r=>r.status==="pending");
  return <main style={{minHeight:"100vh",background:"#f5f7fa",padding:"34px",fontFamily:"Arial, sans-serif",color:"#17223b"}}>
    <div style={{maxWidth:1180,margin:"0 auto"}}>
      <Link href="/admin" style={{color:"#37627e",textDecoration:"none",fontWeight:700}}>← Administración Rumbo</Link>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",margin:"22px 0"}}>
        <div><p style={{margin:0,color:"#177f93",fontSize:12,fontWeight:800,letterSpacing:1.3,textTransform:"uppercase"}}>Agencias minoristas</p><h1 style={{fontSize:38,margin:"7px 0"}}>Usuarios y reactivaciones</h1><p style={{margin:0,color:"#6f7a8b"}}>Rumbo crea los accesos. Las agencias solo los solicitan.</p></div>
        <strong style={{padding:"9px 12px",borderRadius:999,background:"#fff2cb",color:"#765a00"}}>{pending.length} pendientes</strong>
      </div>
      {message ? <div style={{padding:"12px 14px",borderRadius:11,background:"white",border:"1px solid #dfe5eb",marginBottom:16}}>{message}</div>:null}
      {credential ? <div style={{padding:16,borderRadius:12,background:"#eef8f2",border:"1px solid #bfdfc8",marginBottom:18}}><strong>Credencial temporal</strong><p style={{margin:"8px 0 0"}}>Usuario: <code>{credential.email}</code> · Contraseña: <code>{credential.password}</code></p></div>:null}
      <section style={{background:"white",border:"1px solid #e1e6ec",borderRadius:16,padding:22,boxShadow:"0 12px 30px rgba(24,45,70,.05)"}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}><thead><tr>{["Agencia","Solicitud","Usuario","Rol","Solicitado por","Estado","Acción"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:12,color:"#718095",borderBottom:"1px solid #e7ebef"}}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td style={td}><strong>{r.trade_name}</strong><small style={small}>{r.tax_id}</small></td><td style={td}>{r.request_type==="create"?"Nueva alta":"Reactivación"}<small style={small}>{new Date(r.created_at).toLocaleDateString("es-PE")}</small></td><td style={td}>{r.request_type==="create"?<><strong>{r.first_name} {r.last_name}</strong><small style={small}>{r.requested_email}</small></>:<span>Usuario existente</span>}</td><td style={td}>{r.requested_role==="admin"?"Administrador":r.requested_role==="counter"?"Counter":"—"}</td><td style={td}>{r.requested_by_email||"Agencia"}</td><td style={td}><strong>{r.status}</strong></td><td style={td}>{r.status==="pending"?<button disabled={busy===r.id} onClick={()=>resolve(r)} style={{border:0,borderRadius:9,padding:"9px 11px",background:"#123d64",color:"white",fontWeight:800,cursor:"pointer"}}>{busy===r.id?"Procesando…":r.request_type==="create"?"Crear usuario":"Reactivar"}</button>:"—"}</td></tr>)}</tbody></table></div>
        {!rows.length?<p style={{color:"#748093"}}>No hay solicitudes todavía.</p>:null}
      </section>
    </div>
  </main>;
}

const td:React.CSSProperties={padding:"13px 12px",borderBottom:"1px solid #edf0f3",fontSize:14,verticalAlign:"top"};
const small:React.CSSProperties={display:"block",marginTop:4,color:"#7d8796"};
