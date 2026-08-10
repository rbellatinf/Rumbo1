"use client";

import { ArrowLeft, CalendarDays, Mail, MapPin, Phone, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./reservation.module.css";

type Detail = { reservation: Record<string, any>; history: Array<Record<string, any>>; attribution?: Record<string, any> | null };

export default function ReservationDetailPage(){
  const params=useParams<{id:string}>(); const [data,setData]=useState<Detail|null>(null); const [notes,setNotes]=useState(""); const [status,setStatus]=useState(""); const [message,setMessage]=useState("");
  async function load(){const r=await fetch(`/api/admin/reservations/${params.id}`,{cache:"no-store"});const p=await r.json();if(!r.ok)throw new Error(p.message||"No pudimos cargar la reserva.");setData(p);setNotes(p.reservation.notes||"");setStatus(p.reservation.status||"new");}
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[params.id]);
  async function save(){setMessage("Guardando…");const r=await fetch(`/api/admin/reservations/${params.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,notes})});const p=await r.json();if(!r.ok){setMessage(p.message||"No pudimos guardar.");return;}setMessage("Cambios guardados en PostgreSQL.");await load();}
  if(!data)return <main className={styles.loading}>{message||"Cargando reserva…"}</main>;
  const b=data.reservation;
  return <main className={styles.page}>
    <header className={styles.top}><Link href="/admin"><ArrowLeft/> Volver a Reservas</Link><span>Rumbo · Backoffice</span></header>
    <section className={styles.hero}><div><p>Reserva</p><h1>{b.reference}</h1><span>{b.product_name}</span></div><div className={styles.actions}><select value={status} onChange={e=>setStatus(e.target.value)}><option value="new">Nueva</option><option value="validating">Validando</option><option value="quoted">Cotizada</option><option value="confirmed">Confirmada</option><option value="cancelled">Cancelada</option><option value="expired">Vencida</option></select><button onClick={save}><Save/> Guardar</button></div></section>
    {message?<p className={styles.message}>{message}</p>:null}
    <div className={styles.grid}>
      <section className={styles.card}><h2>Cliente</h2><p><UserRound/> <strong>{b.contact_name}</strong></p><p><Mail/> {b.contact_email}</p><p><Phone/> {b.contact_phone}</p><small>Canal preferido: {b.contact_channel||"—"}</small></section>
      <section className={styles.card}><h2>Viaje</h2><p><MapPin/> <strong>{b.origin_iata||"—"} → {b.destination_iata||"—"}</strong></p><p><CalendarDays/> {b.departure_date||"—"} {b.return_date?`→ ${b.return_date}`:""}</p><small>{b.adults} adulto(s) · {b.children} niño(s) · Proveedor: {b.provider}</small></section>
      <section className={styles.card}><h2>Atribución comercial</h2><p><strong>{data.attribution?.partner_name||"Venta directa"}</strong></p><p>{b.referral_code||"Sin código de referido"}</p><small>{data.attribution?.referral_code?"Partner identificado por el código de la reserva.":"No hay Partner atribuido."}</small></section>
      <section className={styles.card}><h2>Estado</h2><p><strong>{b.status}</strong></p><p>Pago: {b.payment_status}</p><small>Creada: {new Date(b.created_at).toLocaleString("es-PE")}</small></section>
    </div>
    <section className={styles.card}><h2>Observaciones internas</h2><p className={styles.helper}>Notas operativas del mayorista. No se muestran al cliente.</p><textarea rows={6} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Agregar observaciones, coordinaciones con proveedor o incidencias…"/></section>
    <section className={styles.card}><h2>Historial de estados</h2>{data.history.length? <div className={styles.timeline}>{data.history.map((h,i)=><div key={i}><strong>{h.previous_status||"Inicio"} → {h.new_status}</strong><span>{new Date(h.created_at).toLocaleString("es-PE")} · {h.actor}</span>{h.reason?<p>{h.reason}</p>:null}</div>)}</div>:<p className={styles.helper}>Todavía no hay cambios de estado registrados.</p>}</section>
  </main>;
}
