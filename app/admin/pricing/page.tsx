"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Rule = { id:string; name:string; effect:"charge"|"discount"; calculation_type:"percent"|"fixed_booking"|"fixed_passenger"; value:number; currency?:string|null; scope_type:string; scope_value?:string|null; priority:number; is_active:boolean };
type Program = { id:string; code:string; name:string; program_type:"campaign"|"season"|"administrative"; description?:string; sale_start?:string|null; sale_end?:string|null; travel_start?:string|null; travel_end?:string|null; priority:number; status:string; rules:Rule[] };
type Simulation = { currency:string; base_amount:number; travellers:number; delta_amount:number; total_amount:number; applied:Array<{id:string;name:string;program_name?:string;program_type?:string;amount:number;running_total:number}> };

const field: React.CSSProperties = { padding:"9px 10px", border:"1px solid #cfd5df", borderRadius:7, width:"100%", background:"white" };
const label: React.CSSProperties = { display:"grid", gap:5, fontSize:12, color:"#475467" };
const grid: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 };

export default function PricingAdminPage(){
  const [programs,setPrograms]=useState<Program[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [simulation,setSimulation]=useState<Simulation|null>(null);
  const [selectedProgram,setSelectedProgram]=useState("");
  const [simulatorOpen,setSimulatorOpen]=useState(false);

  async function load(){
    const r=await fetch("/api/admin/pricing",{cache:"no-store"}); const p=await r.json();
    if(!r.ok){ if(r.status===401) location.replace("/admin/acceso"); throw new Error(p.message||"No pudimos cargar Pricing."); }
    setPrograms(p.programs||[]); if(!selectedProgram&&p.programs?.[0]) setSelectedProgram(p.programs[0].id);
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    if(!simulatorOpen) return;
    const close=(e:KeyboardEvent)=>{ if(e.key==="Escape") setSimulatorOpen(false); };
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[simulatorOpen]);

  async function submitProgram(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy("program"); setError("");
    const f=new FormData(e.currentTarget); const body=Object.fromEntries(f.entries());
    const r=await fetch("/api/admin/pricing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"program",...body})}); const p=await r.json();
    if(!r.ok)setError(p.message||"No pudimos crear el programa."); else { e.currentTarget.reset(); await load(); }
    setBusy("");
  }

  async function submitRule(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy("rule"); setError("");
    const f=new FormData(e.currentTarget); const body=Object.fromEntries(f.entries());
    const r=await fetch("/api/admin/pricing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rule",...body,program_id:selectedProgram})}); const p=await r.json();
    if(!r.ok)setError(p.message||"No pudimos crear la regla."); else { e.currentTarget.reset(); await load(); }
    setBusy("");
  }

  async function simulate(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy("simulate"); setError(""); const f=new FormData(e.currentTarget);
    const r=await fetch("/api/admin/pricing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"simulate",...Object.fromEntries(f.entries())})}); const p=await r.json();
    if(!r.ok)setError(p.message||"No pudimos simular el precio."); else setSimulation(p); setBusy("");
  }

  async function toggle(rule:Rule){
    await fetch("/api/admin/pricing",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:rule.id,is_active:!rule.is_active})}); await load();
  }

  const rules=useMemo(()=>programs.flatMap(p=>(p.rules||[]).map(r=>({...r,program:p}))),[programs]);

  return <main style={{minHeight:"100vh",background:"#f6f7f9",color:"#17233b",padding:"18px 24px 40px"}}>
    <div style={{maxWidth:1400,margin:"auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:12}}>
        <div><p style={{margin:0,color:"#e9573b",fontSize:10,fontWeight:800,letterSpacing:1.4,textTransform:"uppercase"}}>Rumbo · Administración mayorista</p><h1 style={{margin:"4px 0",fontSize:32}}>Pricing</h1><p style={{margin:0,color:"#667085",fontSize:13}}>Campañas, temporadas y cargos que forman el precio final al cliente. Separado de Comisiones.</p></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>{setSimulation(null);setSimulatorOpen(true);}} style={{padding:"9px 13px",border:0,borderRadius:8,background:"#ff6b4a",color:"white",fontWeight:750,cursor:"pointer"}}>Simular precio</button><Link href="/admin" style={{padding:"9px 12px",border:"1px solid #d0d5dd",borderRadius:8,textDecoration:"none",color:"#344054",background:"white"}}>← Backoffice</Link></div>
      </header>
      {error?<div style={{padding:10,border:"1px solid #fecaca",background:"#fff5f5",color:"#991b1b",borderRadius:8,marginBottom:12}}>{error}</div>:null}

      <section style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,alignItems:"start"}}>
        <form onSubmit={submitProgram} style={{background:"white",border:"1px solid #e4e7ec",borderRadius:12,padding:15}}>
          <h2 style={{margin:"0 0 10px",fontSize:17}}>1. Programa comercial</h2>
          <div style={grid}>
            <label style={label}>Tipo<select name="program_type" style={field} defaultValue="campaign"><option value="campaign">Campaña</option><option value="season">Temporada</option><option value="administrative">Cargo administrativo</option></select></label>
            <label style={label}>Código<input name="code" style={field} placeholder="VERANO-2027" required/></label>
            <label style={label}>Nombre<input name="name" style={field} placeholder="Temporada alta verano" required/></label>
            <label style={label}>Prioridad<input name="priority" type="number" defaultValue="100" style={field}/></label>
            <label style={label}>Venta desde<input name="sale_start" type="date" style={field}/></label><label style={label}>Venta hasta<input name="sale_end" type="date" style={field}/></label>
            <label style={label}>Viaje desde<input name="travel_start" type="date" style={field}/></label><label style={label}>Viaje hasta<input name="travel_end" type="date" style={field}/></label>
          </div>
          <label style={{...label,marginTop:10}}>Descripción<textarea name="description" style={{...field,minHeight:62}}/></label>
          <button disabled={busy==="program"} style={{marginTop:10,padding:"9px 13px",border:0,borderRadius:8,background:"#10223f",color:"white",fontWeight:700}}>{busy==="program"?"Guardando…":"Crear programa"}</button>
        </form>

        <form onSubmit={submitRule} style={{background:"white",border:"1px solid #e4e7ec",borderRadius:12,padding:15}}>
          <h2 style={{margin:"0 0 10px",fontSize:17}}>2. Regla de precio</h2>
          <div style={grid}>
            <label style={label}>Programa<select value={selectedProgram} onChange={e=>setSelectedProgram(e.target.value)} style={field} required>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label style={label}>Nombre<input name="name" style={field} placeholder="Asia +2% administrativo" required/></label>
            <label style={label}>Efecto<select name="effect" style={field}><option value="charge">Cargo +</option><option value="discount">Descuento −</option></select></label>
            <label style={label}>Cálculo<select name="calculation_type" style={field}><option value="percent">Porcentaje</option><option value="fixed_booking">Monto fijo por reserva</option><option value="fixed_passenger">Monto fijo por pasajero</option></select></label>
            <label style={label}>Valor<input name="value" type="number" step="0.01" min="0" style={field} required/></label>
            <label style={label}>Moneda (si es fijo)<select name="currency" style={field}><option>USD</option><option>PEN</option><option>EUR</option><option>GBP</option></select></label>
            <label style={label}>Ámbito<select name="scope_type" style={field}><option value="all">Todo</option><option value="region">Región</option><option value="destination">Destino</option><option value="product">Producto</option><option value="tag">Etiqueta</option><option value="provider">Proveedor</option></select></label>
            <label style={label}>Valor ámbito<input name="scope_value" style={field} placeholder="ASIA / DISNEY / MIA"/></label>
            <label style={label}>Prioridad<input name="priority" type="number" defaultValue="100" style={field}/></label>
          </div>
          <button disabled={busy==="rule"||!selectedProgram} style={{marginTop:10,padding:"9px 13px",border:0,borderRadius:8,background:"#10223f",color:"white",fontWeight:700}}>{busy==="rule"?"Guardando…":"Crear regla"}</button>
        </form>
      </section>

      <section style={{marginTop:12,background:"white",border:"1px solid #e4e7ec",borderRadius:12,padding:15}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div><h2 style={{margin:"0 0 4px",fontSize:17}}>Reglas activas</h2><p style={{margin:0,color:"#667085",fontSize:12}}>Estas reglas forman el precio cuando sus condiciones coinciden.</p></div><button onClick={()=>{setSimulation(null);setSimulatorOpen(true);}} style={{padding:"8px 12px",border:"1px solid #d0d5dd",borderRadius:8,background:"white",color:"#344054",fontWeight:700,cursor:"pointer"}}>Simular precio</button></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Programa","Tipo","Regla","Ámbito","Cálculo","Valor","Prioridad","Estado"].map(h=><th key={h} style={{padding:"8px 7px",borderBottom:"1px solid #e4e7ec",textAlign:"left",fontSize:10,color:"#667085"}}>{h}</th>)}</tr></thead><tbody>
          {rules.map((x:any)=><tr key={x.id}><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.program.name}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.program.program_type}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}><b>{x.name}</b></td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.scope_type}{x.scope_value?` · ${x.scope_value}`:""}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.effect} · {x.calculation_type}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.value}{x.calculation_type==="percent"?"%":` ${x.currency||""}`}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}>{x.priority}</td><td style={{padding:"8px 7px",borderBottom:"1px solid #eef0f3"}}><button onClick={()=>toggle(x)} style={{border:"1px solid #d0d5dd",background:x.is_active?"#ecfdf3":"#f2f4f7",borderRadius:999,padding:"5px 9px"}}>{x.is_active?"Activa":"Pausada"}</button></td></tr>)}
        </tbody></table></div>
      </section>
    </div>

    {simulatorOpen?<div onMouseDown={()=>setSimulatorOpen(false)} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(16,34,63,.58)",backdropFilter:"blur(2px)",display:"grid",placeItems:"center",padding:20}}>
      <section onMouseDown={e=>e.stopPropagation()} style={{width:"min(920px,96vw)",maxHeight:"90vh",overflowY:"auto",background:"white",borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,.28)",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,marginBottom:14}}><div><p style={{margin:"0 0 4px",color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.3}}>Pricing Rumbo</p><h2 style={{margin:0,fontSize:22}}>Simular precio</h2><p style={{margin:"5px 0 0",color:"#667085",fontSize:12}}>Prueba cómo las reglas activas modifican un precio base.</p></div><button onClick={()=>setSimulatorOpen(false)} aria-label="Cerrar" style={{border:"1px solid #d0d5dd",background:"white",borderRadius:8,width:34,height:34,fontSize:20,cursor:"pointer"}}>×</button></div>
        <form onSubmit={simulate}><div style={grid}>
          <label style={label}>Precio base<input name="base_amount" type="number" step="0.01" defaultValue="1000" style={field} required/></label><label style={label}>Moneda<select name="currency" style={field}><option>USD</option><option>PEN</option><option>EUR</option><option>GBP</option></select></label>
          <label style={label}>Pasajeros<input name="travellers" type="number" min="1" defaultValue="2" style={field}/></label><label style={label}>Región<input name="region" placeholder="ASIA" style={field}/></label>
          <label style={label}>Destino<input name="destination" placeholder="NRT" style={field}/></label><label style={label}>Etiqueta<input name="tag" placeholder="DISNEY" style={field}/></label>
          <label style={label}>Producto<input name="product" style={field}/></label><label style={label}>Proveedor<input name="provider" style={field}/></label>
          <label style={label}>Fecha venta<input name="sale_date" type="date" style={field}/></label><label style={label}>Fecha viaje<input name="travel_date" type="date" style={field}/></label>
        </div><button disabled={busy==="simulate"} style={{marginTop:12,padding:"10px 14px",border:0,borderRadius:8,background:"#ff6b4a",color:"white",fontWeight:750,cursor:"pointer"}}>{busy==="simulate"?"Calculando…":"Calcular precio"}</button></form>
        {simulation?<div style={{marginTop:16,display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}><div style={{background:"#f8fafc",padding:14,borderRadius:10,border:"1px solid #eef0f3"}}><small style={{color:"#667085"}}>Precio base</small><strong style={{display:"block",fontSize:20,marginBottom:10}}>{simulation.currency} {simulation.base_amount.toFixed(2)}</strong><small style={{color:"#667085"}}>Ajuste total</small><strong style={{display:"block",marginBottom:10}}>{simulation.delta_amount>=0?"+":""}{simulation.currency} {simulation.delta_amount.toFixed(2)}</strong><small style={{color:"#667085"}}>Precio final</small><strong style={{display:"block",fontSize:27,color:"#10223f"}}>{simulation.currency} {simulation.total_amount.toFixed(2)}</strong></div><div><p style={{margin:"0 0 8px",fontSize:12,fontWeight:800,color:"#475467",textTransform:"uppercase",letterSpacing:.7}}>Regla aplicada</p>{simulation.applied.length?simulation.applied.map(a=><div key={a.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,padding:"10px 0",borderBottom:"1px solid #eef0f3"}}><div><strong style={{display:"block",fontSize:13}}>{a.name}</strong><small style={{color:"#667085"}}>{a.program_name||"Regla de pricing"}{a.program_type?` · ${a.program_type}`:""}</small></div><div style={{textAlign:"right"}}><b style={{display:"block",color:a.amount>=0?"#067647":"#b42318"}}>{a.amount>=0?"+":""}{simulation.currency} {a.amount.toFixed(2)}</b><small style={{color:"#667085"}}>Acum. {simulation.currency} {a.running_total.toFixed(2)}</small></div></div>):<div style={{padding:14,border:"1px dashed #cfd5df",borderRadius:10,background:"#f8fafc",color:"#667085",fontWeight:700}}>Sin regla aplicada</div>}</div></div>:null}
      </section>
    </div>:null}
  </main>;
}
