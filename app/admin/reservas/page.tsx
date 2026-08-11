"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reservation = {
  id:string; reference:string; product_name:string; provider:string; origin_iata?:string; destination_iata?:string;
  departure_date?:string; return_date?:string; adults:number; children:number; currency?:string; price_display?:string;
  contact_name:string; contact_email:string; contact_phone:string; referral_code?:string; status:string; payment_status:string; created_at:string;
};

type Overview = { reservations?:Reservation[]; metrics?:{reservations?:number;reservations_open?:number}; message?:string };

export default function ReservationsAdminPage(){
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");

  useEffect(()=>{
    fetch("/api/admin/overview",{cache:"no-store"})
      .then(async response=>{
        const text=await response.text();
        const payload=text?JSON.parse(text) as Overview:{};
        if(!response.ok){ if(response.status===401||response.status===403){window.location.replace("/admin/acceso");return;} throw new Error(payload.message||"No pudimos cargar las reservas."); }
        setData(payload);
      })
      .catch(e=>setError(e instanceof Error?e.message:"No pudimos cargar las reservas."));
  },[]);

  const reservations=useMemo(()=>{
    const rows=data?.reservations||[]; const q=search.trim().toLowerCase(); if(!q) return rows;
    return rows.filter(r=>[r.reference,r.product_name,r.contact_name,r.contact_email,r.origin_iata,r.destination_iata,r.referral_code,r.status,r.payment_status].some(v=>String(v||"").toLowerCase().includes(q)));
  },[data,search]);

  return <main style={{minHeight:"100vh",background:"#f5f7fa",padding:34,color:"#17223b",fontFamily:"Arial, sans-serif"}}>
    <div style={{maxWidth:1250,margin:"0 auto"}}>
      <Link href="/admin" style={{color:"#315e7b",textDecoration:"none",fontWeight:800}}>← Administración Rumbo</Link>
      <header style={{margin:"24px 0"}}>
        <p style={{margin:0,color:"#177f93",fontSize:12,fontWeight:800,letterSpacing:1.2,textTransform:"uppercase"}}>Reservas</p>
        <h1 style={{margin:"7px 0",fontSize:38}}>Gestión de reservas</h1>
        <p style={{margin:0,color:"#6e798b"}}>Reservas capturadas por Rumbo y almacenadas en PostgreSQL.</p>
      </header>

      {error?<div style={{padding:14,border:"1px solid #f0b7b7",background:"#fff5f5",color:"#8e2d2d",borderRadius:10,marginBottom:18}}>{error}</div>:null}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:18}}>
        <article style={card}><span style={muted}>Reservas</span><strong style={metric}>{data?.metrics?.reservations??data?.reservations?.length??"—"}</strong></article>
        <article style={card}><span style={muted}>Abiertas</span><strong style={metric}>{data?.metrics?.reservations_open??"—"}</strong></article>
      </div>

      <section style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:16}}>
          <div><h2 style={{margin:0}}>Lista de reservas</h2><p style={{margin:"6px 0 0",color:"#718095"}}>Busca por referencia, cliente, producto, destino o referido.</p></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar reserva" style={{width:"min(380px,100%)",padding:"10px 12px",border:"1px solid #d5dae0",borderRadius:9}}/>
        </div>
        {!data&&!error?<p style={{color:"#718095"}}>Cargando reservas…</p>:null}
        {data?<div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1080}}>
            <thead><tr>{["Reserva","Cliente","Viaje","Fechas","Pasajeros","Precio","Pago","Estado"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{reservations.map(r=><tr key={r.id}>
              <td style={td}><strong>{r.reference}</strong><small style={small}>{r.product_name}</small><small style={small}>{r.provider}</small></td>
              <td style={td}><strong>{r.contact_name}</strong><small style={small}>{r.contact_email}</small><small style={small}>{r.contact_phone}</small></td>
              <td style={td}>{r.origin_iata||"—"} → {r.destination_iata||"—"}<small style={small}>{r.referral_code?`Referido: ${r.referral_code}`:"Venta directa"}</small></td>
              <td style={td}>{r.departure_date?new Date(`${r.departure_date}T12:00:00`).toLocaleDateString("es-PE"):"—"}<small style={small}>{r.return_date?`Retorno ${new Date(`${r.return_date}T12:00:00`).toLocaleDateString("es-PE")}`:""}</small></td>
              <td style={td}>{r.adults} ad. · {r.children} niñ.</td>
              <td style={td}>{r.price_display||"—"}<small style={small}>{r.currency||""}</small></td>
              <td style={td}><span style={pill}>{r.payment_status}</span></td>
              <td style={td}><span style={pill}>{r.status}</span></td>
            </tr>)}</tbody>
          </table>
          {!reservations.length?<p style={{color:"#718095"}}>Todavía no hay reservas para mostrar.</p>:null}
        </div>:null}
      </section>
    </div>
  </main>;
}

const card:React.CSSProperties={background:"white",border:"1px solid #e1e6ec",borderRadius:16,padding:20,boxShadow:"0 10px 28px rgba(24,45,70,.05)"};
const muted:React.CSSProperties={color:"#718095",fontSize:13,fontWeight:700};
const metric:React.CSSProperties={display:"block",fontSize:28,marginTop:8};
const th:React.CSSProperties={textAlign:"left",padding:"10px 12px",borderBottom:"1px solid #e7ebef",color:"#718095",fontSize:12};
const td:React.CSSProperties={padding:"13px 12px",borderBottom:"1px solid #edf0f3",fontSize:14,verticalAlign:"top"};
const small:React.CSSProperties={display:"block",marginTop:4,color:"#7d8796"};
const pill:React.CSSProperties={padding:"6px 9px",borderRadius:999,background:"#eef3f7",fontWeight:800};
