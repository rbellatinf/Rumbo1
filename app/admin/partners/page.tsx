"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Partner={account_id:string;first_name:string;last_name:string;document_type:string;document_number:string;phone?:string;referral_code:string;email:string;status:string;direct_referrals:number;created_at:string};
type Overview={partners?:Partner[];message?:string};
const th:React.CSSProperties={textAlign:"left",padding:"7px 9px",border:"1px solid #dfe4ea",background:"#eef2f5",color:"#536273",fontSize:10,fontWeight:800,textTransform:"uppercase"};
const td:React.CSSProperties={padding:"7px 9px",border:"1px solid #e3e7eb",fontSize:12,verticalAlign:"middle"};
const primary:React.CSSProperties={background:"#10223f",color:"white",padding:"8px 11px",borderRadius:8,textDecoration:"none",fontWeight:800,fontSize:12};

export default function PartnersPage(){
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1);
 useEffect(()=>{fetch("/api/admin/overview",{cache:"no-store"}).then(async r=>{const p=await r.json();if(!r.ok){if(r.status===401||r.status===403)location.replace("/admin/acceso");throw new Error(p.message||"No pudimos cargar partners.")}setData(p)}).catch(e=>setError(e.message))},[]);
 const partners=useMemo(()=>{const rows=data?.partners||[],q=search.trim().toLowerCase();return q?rows.filter(p=>[p.first_name,p.last_name,p.email,p.document_number,p.referral_code].some(v=>String(v||"").toLowerCase().includes(q))):rows},[data,search]);
 const perPage=10,pages=Math.max(1,Math.ceil(partners.length/perPage)),rows=partners.slice((page-1)*perPage,page*perPage);
 return <main style={{minHeight:"100vh",background:"#f5f7fa",padding:"18px 24px",color:"#17223b"}}><div style={{maxWidth:1180,margin:"0 auto"}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12}}><div><p style={{margin:0,color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>Rumbo · Administración mayorista</p><h1 style={{margin:"4px 0 0",fontSize:32}}>Partners</h1><p style={{margin:"5px 0 0",color:"#667085",fontSize:12}}>Vista compacta · 10 partners por página.</p></div><div style={{display:"flex",gap:8}}><Link href="/admin" style={{...primary,background:"white",color:"#344054",border:"1px solid #d0d5dd"}}>← Backoffice</Link><Link href="/admin/partners/nuevo" style={primary}>+ Nuevo partner</Link></div></div>
   {error?<div style={{marginTop:12,padding:10,border:"1px solid #fecaca",background:"#fff5f5",color:"#991b1b",borderRadius:8}}>{error}</div>:null}
   <section style={{background:"white",border:"1px solid #e4e7ec",borderRadius:12,padding:15,marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:9}}><h2 style={{margin:0,fontSize:17}}>Lista de partners</h2><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:12,color:"#667085"}}>Página {page} de {pages}</span><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Buscar partner" style={{width:280,padding:"8px 10px",border:"1px solid #d0d5dd",borderRadius:7}}/></div></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}><thead><tr>{["Partner","Documento","Correo","Código","Red","Estado"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{rows.map(p=><tr key={p.account_id}><td style={td}><strong>{p.first_name} {p.last_name}</strong></td><td style={td}>{p.document_type} {p.document_number}</td><td style={td}>{p.email}</td><td style={td}><code>{p.referral_code}</code></td><td style={td}>{p.direct_referrals}</td><td style={td}><span style={{padding:"4px 7px",borderRadius:999,background:"#eef3f7",fontWeight:800,fontSize:10}}>{p.status}</span></td></tr>)}</tbody></table></div><div style={{display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center",marginTop:9,fontSize:12,color:"#667085"}}><span>{partners.length} partners</span><button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Anterior</button><button disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente ›</button></div></section>
 </div></main>
}
