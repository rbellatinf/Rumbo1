"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import UsersPanel from "./UsersPanel";
import CatalogPanel from "./CatalogPanel";
import PricingPanel from "./PricingPanel";
import IntegrationsPanel from "./IntegrationsPanel";
import ReservationsPanel from "./ReservationsPanel";

const tabLabels:Record<string,string>={summary:"Resumen",reservations:"Reservas",partners:"Partners",retailers:"Agencias",commissions:"Comisiones",audit:"Auditoría"};
type ModalKind="agency"|"person"|"partner"|"agencyDetail"|"personDetail"|null;
type EmbeddedModule="users"|"catalog"|"pricing"|"integrations"|"reservations"|null;
type Agency={id:string;trade_name:string;legal_name:string;tax_id:string;contact_email?:string;phone?:string;status?:string;member_count?:number;[key:string]:unknown};
type Credentials={username:string;temporary_password:string};
type PersonDetail={person_type:string;account_id:string;first_name:string;last_name:string;email:string;status:string;phone?:string|null;document_type?:string|null;document_number?:string|null;date_of_birth?:string|null;last_login_at?:string|null;internal_role?:string;member_role?:string;job_title?:string|null;referral_code?:string|null;trade_name?:string|null;tax_id?:string|null;created_at?:string|null;commission_rate?:number;network_commission_rate?:number};

export default function AdminLayoutClient({children}:{children:ReactNode}){
  const pathname=usePathname(),searchParams=useSearchParams();
  const [collapsed,setCollapsed]=useState(false),[adminReady,setAdminReady]=useState(false),[embedded,setEmbedded]=useState<EmbeddedModule>(null),[modal,setModal]=useState<ModalKind>(null),[retailerId,setRetailerId]=useState(""),[selectedAgency,setSelectedAgency]=useState<Agency|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[credentials,setCredentials]=useState<Credentials|null>(null),[detail,setDetail]=useState<Agency|null>(null),[personDetail,setPersonDetail]=useState<PersonDetail|null>(null);
  const isMain=pathname==="/admin";

  useEffect(()=>{
    if(!isMain){setAdminReady(true);return}
    setAdminReady(false);
    const check=()=>{const sidebar=document.querySelector("main aside nav"),content=document.querySelector("main aside + section");if(sidebar&&content)setAdminReady(true)};
    check();const observer=new MutationObserver(check);observer.observe(document.body,{subtree:true,childList:true});return()=>observer.disconnect();
  },[isMain]);

  useEffect(()=>{
    if(!isMain||!adminReady)return;
    const requestedTab=searchParams.get("tab");
    if(requestedTab&&tabLabels[requestedTab])setEmbedded(null);
  },[isMain,adminReady,searchParams]);

  useEffect(()=>{
    if(!isMain||!adminReady)return;
    const requested=searchParams.get("module");
    const next:EmbeddedModule=requested==="users"||requested==="catalog"||requested==="pricing"||requested==="integrations"||requested==="reservations"?requested:null;
    setEmbedded(next);
    const nav=document.querySelector("main aside nav");if(!nav)return;
    const makeLink=(module:Exclude<EmbeddedModule,"reservations"|null>,label:string,svg:string)=>{const a=document.createElement("a");a.href=`/admin?module=${module}`;a.className="rumbo-extra-nav";a.dataset.rumboExtra="true";a.dataset.module=module;a.innerHTML=`${svg}<span>${label}</span>`;return a};
    const commissions=Array.from(nav.querySelectorAll("button")).find(b=>b.textContent?.includes("Comisiones"))||null;
    const audit=Array.from(nav.querySelectorAll("button")).find(b=>b.textContent?.includes("Auditoría"))||null;
    if(!nav.querySelector('[data-module="users"]'))nav.insertBefore(makeLink("users","Usuarios",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'),commissions);
    if(!nav.querySelector('[data-module="catalog"]'))nav.insertBefore(makeLink("catalog","Catálogo",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 12 2l8 3.5v13L12 22l-8-3.5v-13ZM4 5.5l8 3.5 8-3.5M12 9v13"/></svg>'),commissions);
    if(!nav.querySelector('[data-module="pricing"]'))nav.insertBefore(makeLink("pricing","Pricing",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82ZM7.5 7.5h.01"/></svg>'),commissions);
    if(!nav.querySelector('[data-module="integrations"]'))nav.insertBefore(makeLink("integrations","APIs",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9V5a3 3 0 0 1 6 0v4M5 9h12v4a6 6 0 0 1-12 0V9ZM3 13h2M17 13h4M9 19v3M13 19v3"/></svg>'),audit);
    return()=>nav.querySelectorAll('[data-rumbo-extra="true"]').forEach(el=>el.remove());
  },[isMain,adminReady,searchParams]);

  useEffect(()=>{
    if(!isMain||!adminReady)return;
    document.querySelectorAll(".rumbo-extra-nav").forEach(el=>el.classList.toggle("rumbo-extra-active",(el as HTMLElement).dataset.module===embedded));
    document.querySelectorAll("main aside nav button").forEach(el=>el.classList.toggle("rumbo-native-embedded-active",embedded==="reservations"&&Boolean(el.textContent?.includes("Reservas"))));
  },[isMain,adminReady,embedded]);

  useEffect(()=>{
    if(!isMain||!adminReady)return;
    let stopped=false;
    const enhance=async()=>{
      const spans=Array.from(document.querySelectorAll("main span")) as HTMLSpanElement[];
      for(const span of spans){const match=span.textContent?.trim().match(/^(\d+)\/(\d+) activos$/);if(!match)continue;const active=Number(match[1]),limit=Number(match[2]),section=span.closest("section"),sectionText=section?.textContent||"",totalMatch=sectionText.match(/(\d+) usuarios\s*·\s*5 por página/),total=totalMatch?Number(totalMatch[1]):active,inactive=Math.max(0,total-active),available=Math.max(0,limit-total);span.textContent=`${active} activos · ${inactive} inactivos · ${available} disponibles`;span.title=`Capacidad: ${total} de ${limit} usuarios creados`}
      for(const table of Array.from(document.querySelectorAll("main table"))){
        const headers=Array.from(table.querySelectorAll("thead th"));
        const rucIdx=headers.findIndex(h=>h.textContent?.trim().toUpperCase()==="RUC");if(rucIdx>=0)for(const row of Array.from(table.querySelectorAll("tbody tr"))){const cell=row.children.item(rucIdx) as HTMLElement|null;if(cell){cell.classList.add("rumbo-ruc-link");cell.title="Ver detalle de la empresa"}}
      }
      try{
        const overview=await fetch("/api/admin/overview",{cache:"no-store"}).then(r=>r.json());if(stopped)return;
        for(const table of Array.from(document.querySelectorAll("main table"))){
          let headers=Array.from(table.querySelectorAll("thead th"));
          const docIdx=headers.findIndex(h=>h.textContent?.trim().toUpperCase()==="DOCUMENTO");
          if(docIdx>=0){for(const row of Array.from(table.querySelectorAll("tbody tr"))){const cell=row.children.item(docIdx) as HTMLElement|null;if(!cell||cell.querySelector(".rumbo-person-doc-link"))continue;const text=cell.textContent?.trim()||"";const partner=(overview.partners||[]).find((p:any)=>text.includes(String(p.document_number||"")));if(partner&&partner.document_number)cell.innerHTML=`<button type="button" class="rumbo-person-doc-link" data-person-type="partner" data-person-id="${partner.account_id}">${partner.document_type||"DNI"} ${partner.document_number}</button>`}}
          headers=Array.from(table.querySelectorAll("thead th"));
          const emailIdx=headers.findIndex(h=>h.textContent?.trim().toUpperCase()==="CORREO"),userIdx=headers.findIndex(h=>h.textContent?.trim().toUpperCase()==="USUARIO"),existingDoc=headers.findIndex(h=>h.textContent?.trim().toUpperCase()==="DOCUMENTO");
          if(userIdx>=0&&emailIdx>=0&&existingDoc<0){const section=table.closest("section"),agencyName=section?.querySelector("h2")?.textContent?.trim(),agency=(overview.retailers||[]).find((a:any)=>a.trade_name===agencyName);if(!agency)continue;const people=await fetch(`/api/admin/agencies/${agency.id}/users`,{cache:"no-store"}).then(r=>r.json()).then(p=>p.members||[]).catch(()=>[]);if(stopped)return;const th=document.createElement("th");th.textContent="Documento";const headRow=table.querySelector("thead tr");headRow?.insertBefore(th,headRow.children.item(userIdx+1));for(const row of Array.from(table.querySelectorAll("tbody tr"))){const emailCell=row.children.item(emailIdx+(emailIdx>userIdx?1:0)) as HTMLElement|null,email=emailCell?.textContent?.trim()||"",person=people.find((p:any)=>p.email===email);const td=document.createElement("td");td.innerHTML=person?.document_number?`<button type="button" class="rumbo-person-doc-link" data-person-type="retailer" data-person-id="${person.account_id}">${person.document_type||"DNI"} ${person.document_number}</button>`:"—";row.insertBefore(td,row.children.item(userIdx+1))}}
        }
      }catch{}
    };
    enhance();const observer=new MutationObserver(()=>{window.clearTimeout((observer as any)._timer);(observer as any)._timer=window.setTimeout(enhance,40)});observer.observe(document.body,{subtree:true,childList:true,characterData:true});return()=>{stopped=true;observer.disconnect()};
  },[isMain,adminReady]);

  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      const target=event.target as HTMLElement;
      const extra=target.closest(".rumbo-extra-nav") as HTMLAnchorElement|null;if(extra){event.preventDefault();const requested=extra.dataset.module;const next:EmbeddedModule=requested==="users"||requested==="catalog"||requested==="pricing"||requested==="integrations"?requested:null;setEmbedded(next);if(next)history.replaceState(null,"",`/admin?module=${next}`);return}
      const nativeButton=target.closest("main aside nav button") as HTMLButtonElement|null;
      if(nativeButton){
        if(nativeButton.textContent?.includes("Reservas")){event.preventDefault();event.stopPropagation();setEmbedded("reservations");history.replaceState(null,"","/admin?module=reservations");return}
        setEmbedded(null);return;
      }
      const personButton=target.closest(".rumbo-person-doc-link") as HTMLButtonElement|null;if(personButton){event.preventDefault();event.stopPropagation();const type=personButton.dataset.personType,id=personButton.dataset.personId;if(type&&id){setPersonDetail(null);setModal("personDetail");fetch(`/api/admin/user-management?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,{cache:"no-store"}).then(r=>r.json()).then(p=>{if(p.person)setPersonDetail(p.person)}).catch(()=>{})}return}
      const anchor=target.closest("a") as HTMLAnchorElement|null;if(anchor){const url=new URL(anchor.href,location.origin);if(url.pathname==="/admin/agencias/nueva"){event.preventDefault();setModal("agency");setError("");return}if(url.pathname==="/admin/agencias/personas/nueva"){event.preventDefault();const id=url.searchParams.get("retailer")||"";setRetailerId(id);setSelectedAgency(null);setModal("person");setError("");fetch("/api/admin/overview",{cache:"no-store"}).then(r=>r.json()).then(p=>{const agency=(p.retailers||[]).find((a:Agency)=>a.id===id);if(agency)setSelectedAgency(agency)}).catch(()=>{});return}if(url.pathname==="/admin/partners/nuevo"){event.preventDefault();setModal("partner");setError("");return}}
      const rucCell=target.closest("td.rumbo-ruc-link") as HTMLTableCellElement|null;if(rucCell){event.preventDefault();event.stopPropagation();const taxId=rucCell.textContent?.trim()||"";fetch("/api/admin/overview",{cache:"no-store"}).then(r=>r.json()).then(p=>{const agency=(p.retailers||[]).find((a:Agency)=>a.tax_id===taxId);if(agency){setDetail(agency);setModal("agencyDetail")}}).catch(()=>{})}
    };
    document.addEventListener("click",click,true);return()=>document.removeEventListener("click",click,true);
  },[]);

  useEffect(()=>{if(!modal)return;const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")closeModal()};document.addEventListener("keydown",esc);return()=>document.removeEventListener("keydown",esc)},[modal]);
  function closeModal(){setModal(null);setError("");setCredentials(null);setDetail(null);setPersonDetail(null);setSelectedAgency(null)}
  function refreshBackoffice(){window.location.href=modal==="partner"?"/admin?tab=partners":"/admin?tab=retailers"}
  async function submitAgency(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");try{const f=new FormData(e.currentTarget),r=await fetch("/api/admin/user-management",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"agency",...Object.fromEntries(f.entries())})}),p=await r.json();if(!r.ok)throw new Error(p.message||"No pudimos crear la agencia.");refreshBackoffice()}catch(e){setError(e instanceof Error?e.message:"No pudimos crear la agencia.")}finally{setBusy(false)}}
  async function submitPerson(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");try{const f=new FormData(e.currentTarget),r=await fetch("/api/admin/user-management",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"agency_person",retailer_id:retailerId,...Object.fromEntries(f.entries())})}),p=await r.json();if(!r.ok)throw new Error(p.message||"No pudimos crear la persona.");setCredentials(p.credentials)}catch(e){setError(e instanceof Error?e.message:"No pudimos crear la persona.")}finally{setBusy(false)}}
  async function submitPartner(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");try{const f=new FormData(e.currentTarget),r=await fetch("/api/admin/partners",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(f.entries()))}),p=await r.json();if(!r.ok)throw new Error(p.message||"No pudimos crear el Partner.");setCredentials(p.credentials)}catch(e){setError(e instanceof Error?e.message:"No pudimos crear el Partner.")}finally{setBusy(false)}}

  const embeddedPanel=embedded==="users"?<UsersPanel/>:embedded==="catalog"?<CatalogPanel/>:embedded==="pricing"?<PricingPanel/>:embedded==="integrations"?<IntegrationsPanel/>:embedded==="reservations"?<ReservationsPanel/>:null;

  return <div className={`${collapsed&&isMain?"rumbo-admin-collapsed ":""}${embedded?"rumbo-admin-embedded":""}`}>
    {isMain&&adminReady&&collapsed?<div className="rumbo-collapsed-r" aria-hidden="true"><span className="letter">R</span><span className="dot">.</span></div>:null}
    {isMain&&adminReady?<button aria-label={collapsed?"Expandir menú":"Contraer menú"} title={collapsed?"Expandir menú":"Contraer menú"} onClick={()=>setCollapsed(v=>!v)} className="rumbo-menu-toggle">☰</button>:null}
    <div style={isMain&&!adminReady?{visibility:"hidden",height:0,overflow:"hidden"}:undefined}>{children}</div>
    {isMain&&adminReady&&embedded?<div className="rumbo-embedded-content">{embeddedPanel}</div>:null}
    {modal?<div style={overlay} onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div style={modalBox}>
      {modal==="person"&&selectedAgency?<div style={agencyBadge}><span style={{fontSize:10,color:"#667085",textTransform:"uppercase",letterSpacing:".08em",fontWeight:800}}>Agencia seleccionada</span><strong style={{display:"block",marginTop:2,fontSize:14,color:"#17233b"}}>{selectedAgency.trade_name}</strong><small style={{display:"block",marginTop:1,color:"#667085"}}>RUC {selectedAgency.tax_id}</small></div>:null}
      <button onClick={closeModal} style={closeButton} aria-label="Cerrar">×</button>
      {modal==="agency"?<><p style={eyebrow}>Agencias</p><h2 style={title}>Nueva agencia</h2><p style={muted}>Completa los datos legales, operativos y bancarios.</p><form onSubmit={submitAgency} style={grid}><Field name="trade_name" label="Nombre comercial" required/><Field name="legal_name" label="Razón social" required/><Field name="tax_id" label="RUC" required/><Field name="contact_name" label="Contacto principal"/><Field name="contact_email" label="Correo" type="email"/><Field name="contact_phone" label="Teléfono"/><Field name="address" label="Dirección"/><Field name="city" label="Ciudad" defaultValue="Lima"/><Field name="country" label="País" defaultValue="Perú"/><Field name="user_limit" label="Límite de usuarios" type="number" defaultValue="10"/><Field name="inactivity_days" label="Días de inactividad" type="number" defaultValue="30"/><Field name="bank_name" label="Banco principal"/><Field name="bank_account_holder" label="Titular de cuenta"/><Field name="bank_account_number" label="Número de cuenta"/><Field name="bank_cci" label="CCI"/><label style={fieldLabel}>Moneda<select name="bank_account_currency" defaultValue="PEN" style={input}><option>PEN</option><option>USD</option><option>EUR</option></select></label><label style={{...fieldLabel,gridColumn:"1/-1"}}>Observaciones<textarea name="notes" style={{...input,minHeight:65}}/></label>{error?<p style={errorStyle}>{error}</p>:null}<button disabled={busy} style={primary}>{busy?"Creando…":"Crear agencia"}</button></form></>:null}
      {modal==="person"?<><p style={eyebrow}>Personas de agencia</p><h2 style={title}>Nueva persona</h2><p style={muted}>El usuario quedará asociado únicamente a la agencia seleccionada.</p>{credentials?<CredentialsPanel credentials={credentials} onDone={refreshBackoffice}/>:<form onSubmit={submitPerson} style={grid}><label style={fieldLabel}>Rol<select name="role" defaultValue="counter" style={input}><option value="counter">Counter</option><option value="admin">Administrador</option></select></label><Field name="first_name" label="Nombres" required/><Field name="last_name" label="Apellidos" required/><label style={fieldLabel}>Tipo documento<select name="document_type" defaultValue="DNI" style={input}><option>DNI</option><option>CE</option><option>PASSPORT</option></select></label><Field name="document_number" label="Nro. documento" required/><Field name="date_of_birth" label="Fecha de nacimiento" type="date"/><Field name="phone" label="Teléfono"/><Field name="email" label="Correo de acceso" type="email" required wide/>{error?<p style={errorStyle}>{error}</p>:null}<button disabled={busy} style={primary}>{busy?"Creando…":"Crear persona"}</button></form>}</>:null}
      {modal==="partner"?<><p style={eyebrow}>Partners</p><h2 style={title}>Nuevo partner</h2><p style={muted}>Crea su acceso y código de referido.</p>{credentials?<CredentialsPanel credentials={credentials} onDone={refreshBackoffice}/>:<form onSubmit={submitPartner} style={grid}><Field name="first_name" label="Nombres" required/><Field name="last_name" label="Apellidos" required/><Field name="email" label="Correo" type="email" required/><label style={fieldLabel}>Tipo documento<select name="document_type" defaultValue="DNI" style={input}><option>DNI</option><option>CE</option><option>PASSPORT</option><option>RUC</option></select></label><Field name="document_number" label="Nro. documento" required/><Field name="date_of_birth" label="Fecha de nacimiento" type="date"/><Field name="phone" label="Teléfono"/>{error?<p style={errorStyle}>{error}</p>:null}<button disabled={busy} style={primary}>{busy?"Creando…":"Crear partner"}</button></form>}</>:null}
      {modal==="agencyDetail"&&detail?<><p style={eyebrow}>Detalle de empresa</p><h2 style={title}>{detail.trade_name}</h2><p style={muted}>{detail.legal_name}</p><div style={detailGrid}><Detail label="RUC" value={detail.tax_id}/><Detail label="Estado" value={String(detail.status||"—")}/><Detail label="Contacto" value={String(detail.contact_email||"—")}/><Detail label="Teléfono" value={String(detail.phone||"—")}/><Detail label="Usuarios" value={String(detail.member_count??"—")}/><Detail label="Creada" value={detail.created_at?new Date(String(detail.created_at)).toLocaleDateString("es-PE"):"—"}/></div></>:null}
      {modal==="personDetail"?<>{personDetail?<><p style={eyebrow}>Detalle de persona</p><h2 style={title}>{personDetail.first_name} {personDetail.last_name}</h2><p style={muted}>{personDetail.person_type==="partner"?"Partner":personDetail.person_type==="internal"?"Usuario Rumbo":`Persona de ${personDetail.trade_name||"agencia"}`}</p><div style={detailGrid}><Detail label="Documento" value={`${personDetail.document_type||"DNI"} ${personDetail.document_number||"—"}`}/><Detail label="Fecha de nacimiento" value={personDetail.date_of_birth?new Date(`${personDetail.date_of_birth}T12:00:00`).toLocaleDateString("es-PE"):"—"}/><Detail label="Correo" value={personDetail.email||"—"}/><Detail label="Teléfono" value={personDetail.phone||"—"}/><Detail label="Rol" value={personDetail.internal_role||personDetail.member_role||(personDetail.person_type==="partner"?"Partner":"—")}/><Detail label="Cargo" value={personDetail.job_title||"—"}/><Detail label="Estado" value={personDetail.status||"—"}/><Detail label="Último ingreso" value={personDetail.last_login_at?new Date(personDetail.last_login_at).toLocaleString("es-PE"):"Nunca"}/>{personDetail.referral_code?<Detail label="Código referido" value={personDetail.referral_code}/>:null}{personDetail.tax_id?<Detail label="RUC agencia" value={personDetail.tax_id}/>:null}</div></>:<p style={muted}>Cargando detalle…</p>}</>:null}
    </div></div>:null}
    <style jsx global>{`
      .rumbo-ruc-link{color:#175cd3!important;text-decoration:underline!important;text-underline-offset:2px;cursor:pointer!important;font-weight:700}
      .rumbo-person-doc-link{appearance:none;border:0;background:transparent;padding:0;color:#175cd3;text-decoration:underline;text-underline-offset:2px;font:inherit;font-weight:700;cursor:pointer}
      .rumbo-menu-toggle{position:fixed;z-index:60;top:58px;left:214px;width:34px;height:34px;border-radius:9px;border:1px solid #d0d5dd;background:white;color:#344054;font-size:19px;line-height:1;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(16,34,63,.12);transition:left .2s ease,top .2s ease}
      .rumbo-collapsed-r{position:fixed;z-index:61;top:14px;left:13px;width:46px;height:30px;display:flex;align-items:baseline;justify-content:center;color:#10223f;font-weight:900;line-height:1}.rumbo-collapsed-r .letter{font-size:24px}.rumbo-collapsed-r .dot{font-size:24px;color:#ff6b4a;margin-left:1px}
      main aside nav .rumbo-extra-nav{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:10px;color:#667085;text-decoration:none;font-weight:700;box-sizing:border-box}
      main aside nav .rumbo-extra-nav:hover,main aside nav .rumbo-extra-active{background:#102b50!important;color:white!important}
      main aside nav .rumbo-extra-nav svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
      .rumbo-admin-embedded main aside nav button{background:transparent!important;color:#667085!important;box-shadow:none!important}
      .rumbo-admin-embedded main aside nav button svg{color:#667085!important}
      .rumbo-admin-embedded main aside nav button.rumbo-native-embedded-active{background:#102b50!important;color:white!important}
      .rumbo-admin-embedded main aside nav button.rumbo-native-embedded-active svg{color:white!important}
      .rumbo-admin-embedded main[class]>section{visibility:hidden!important}
      .rumbo-embedded-content{position:fixed;z-index:25;top:0;right:0;bottom:0;left:260px;overflow:auto;background:#f6f7f9;padding:28px 32px;transition:left .2s ease}
      .rumbo-admin-collapsed .rumbo-embedded-content{left:72px}
      .rumbo-admin-collapsed .rumbo-menu-toggle{left:19px;top:50px}
      .rumbo-admin-collapsed main[class]{grid-template-columns:72px minmax(0,1fr)!important}
      .rumbo-admin-collapsed main[class]>aside:first-child{padding-left:10px!important;padding-right:10px!important;padding-top:96px!important}
      .rumbo-admin-collapsed main[class]>aside:first-child>a:first-child,.rumbo-admin-collapsed main[class]>aside:first-child>p,.rumbo-admin-collapsed main[class]>aside:first-child>a:last-child{display:none!important}
      .rumbo-admin-collapsed main[class]>aside:first-child nav button,.rumbo-admin-collapsed main aside nav .rumbo-extra-nav{justify-content:center!important;gap:0!important;padding-left:8px!important;padding-right:8px!important;font-size:0!important}
      .rumbo-admin-collapsed main aside nav .rumbo-extra-nav span{display:none!important}
      .rumbo-admin-collapsed main[class]>aside:first-child nav button svg,.rumbo-admin-collapsed main aside nav .rumbo-extra-nav svg{width:20px!important;height:20px!important;margin:0!important}
      .rumbo-admin-collapsed main[class]>section{max-width:none!important}
      @media(max-width:980px){.rumbo-admin-collapsed main[class]{grid-template-columns:1fr!important}.rumbo-embedded-content,.rumbo-admin-collapsed .rumbo-embedded-content{left:0;padding:20px}}
    `}</style>
  </div>
}

function Field({name,label,type="text",required=false,defaultValue,wide=false}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string;wide?:boolean}){return <label style={{...fieldLabel,gridColumn:wide?"1/-1":undefined}}>{label}<input name={name} type={type} required={required} defaultValue={defaultValue} style={input}/></label>}
function Detail({label,value}:{label:string;value:string}){return <div style={{padding:"10px 12px",border:"1px solid #e4e7ec",borderRadius:9,background:"#f8fafc"}}><small style={{display:"block",color:"#667085"}}>{label}</small><strong>{value}</strong></div>}
function CredentialsPanel({credentials,onDone}:{credentials:Credentials;onDone:()=>void}){return <div><p style={{...muted,marginTop:12}}>Guarda estas credenciales. La contraseña es temporal.</p><div style={{background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:10,padding:14,marginTop:12}}><small>Usuario</small><strong style={{display:"block",fontSize:17}}>{credentials.username}</strong><small style={{display:"block",marginTop:10}}>Contraseña temporal</small><strong style={{display:"block",fontSize:20}}>{credentials.temporary_password}</strong></div><button onClick={onDone} style={primary}>Entendido</button></div>}

const overlay:CSSProperties={position:"fixed",inset:0,zIndex:2000,background:"rgba(15,23,42,.62)",display:"grid",placeItems:"center",padding:20,overflowY:"auto"};
const modalBox:CSSProperties={position:"relative",width:"min(820px,100%)",maxHeight:"calc(100vh - 40px)",overflowY:"auto",background:"white",borderRadius:16,padding:22,boxShadow:"0 28px 80px rgba(0,0,0,.3)"};
const closeButton:CSSProperties={position:"absolute",right:14,top:10,border:0,background:"transparent",fontSize:28,cursor:"pointer",color:"#667085"};
const agencyBadge:CSSProperties={position:"absolute",right:58,top:15,minWidth:190,maxWidth:320,padding:"7px 12px",border:"1px solid #e4e7ec",borderRadius:10,background:"#f8fafc",textAlign:"right",boxShadow:"0 2px 8px rgba(16,34,63,.05)"};
const grid:CSSProperties={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:16};
const fieldLabel:CSSProperties={display:"grid",gap:5,fontSize:12,color:"#475467",fontWeight:700};
const input:CSSProperties={padding:"9px 10px",border:"1px solid #cfd5df",borderRadius:7,width:"100%",background:"white",fontSize:13};
const primary:CSSProperties={marginTop:10,border:0,borderRadius:8,padding:"10px 14px",background:"#10223f",color:"white",fontWeight:800,cursor:"pointer"};
const eyebrow:CSSProperties={margin:0,color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".12em"};
const title:CSSProperties={margin:"4px 0 3px",fontSize:24};
const muted:CSSProperties={margin:0,color:"#667085"};
const errorStyle:CSSProperties={gridColumn:"1/-1",margin:0,color:"#b42318",background:"#fef3f2",padding:9,borderRadius:7};
const detailGrid:CSSProperties={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9,marginTop:15};
