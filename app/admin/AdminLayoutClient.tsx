"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

const tabLabels: Record<string,string> = {
  summary: "Resumen",
  reservations: "Reservas",
  partners: "Partners",
  retailers: "Agencias",
  commissions: "Comisiones",
  audit: "Auditoría",
};

export default function AdminLayoutClient({children}:{children:ReactNode}){
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const [collapsed,setCollapsed]=useState(false);
  const isMain=pathname==="/admin";

  useEffect(()=>{
    if(!isMain)return;
    const requested=searchParams.get("tab");
    const label=requested?tabLabels[requested]:null;
    if(!label)return;
    const timer=window.setTimeout(()=>{
      const buttons=Array.from(document.querySelectorAll("main aside nav button")) as HTMLButtonElement[];
      const target=buttons.find(button=>button.textContent?.trim().includes(label));
      target?.click();
    },0);
    return()=>window.clearTimeout(timer);
  },[isMain,searchParams]);

  useEffect(()=>{
    if(!isMain)return;
    const expandCapacity=()=>{
      const spans=Array.from(document.querySelectorAll("main span")) as HTMLSpanElement[];
      for(const span of spans){
        const match=span.textContent?.trim().match(/^(\d+)\/(\d+) activos$/);
        if(!match)continue;
        const active=Number(match[1]);
        const limit=Number(match[2]);
        const section=span.closest("section");
        const sectionText=section?.textContent||"";
        const totalMatch=sectionText.match(/(\d+) usuarios\s*·\s*5 por página/);
        const total=totalMatch?Number(totalMatch[1]):active;
        const inactive=Math.max(0,total-active);
        const available=Math.max(0,limit-total);
        span.textContent=`${active} activos · ${inactive} inactivos · ${available} disponibles`;
        span.title=`Capacidad: ${total} de ${limit} usuarios creados`;
      }
    };
    expandCapacity();
    const observer=new MutationObserver(expandCapacity);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[isMain]);

  return <div className={collapsed&&isMain?"rumbo-admin-collapsed":""}>
    <div style={{display:"flex",gap:8,padding:"8px 22px",background:"#fff",borderBottom:"1px solid #e4e7ec",fontSize:12,flexWrap:"wrap"}}>
      <Link href="/admin" style={navItem}>Backoffice</Link>
      <Link href="/admin?tab=partners" style={navItem}>Partners</Link>
      <Link href="/admin?tab=retailers" style={navItem}>Agencias</Link>
      <Link href="/admin/usuarios" style={navItem}>Usuarios</Link>
      <Link href="/admin/pricing" style={navItem}>Pricing</Link>
    </div>
    {isMain?<button aria-label={collapsed?"Expandir menú":"Contraer menú"} title={collapsed?"Expandir menú":"Contraer menú"} onClick={()=>setCollapsed(v=>!v)} style={{position:"fixed",zIndex:40,top:72,left:collapsed?38:226,width:38,height:34,borderRadius:8,border:"1px solid #d0d5dd",background:"white",color:"#344054",fontSize:20,lineHeight:1,fontWeight:900,cursor:"pointer",boxShadow:"0 2px 8px rgba(16,34,63,.08)",transition:"left .2s ease"}}>☰</button>:null}
    {children}
    <style jsx global>{`
      .rumbo-admin-collapsed main[class] { grid-template-columns:72px minmax(0,1fr) !important; }
      .rumbo-admin-collapsed main[class] > aside:first-child { padding-left:10px !important; padding-right:10px !important; }
      .rumbo-admin-collapsed main[class] > aside:first-child > a:first-child,
      .rumbo-admin-collapsed main[class] > aside:first-child > p,
      .rumbo-admin-collapsed main[class] > aside:first-child > a:last-child { display:none !important; }
      .rumbo-admin-collapsed main[class] > aside:first-child nav button { justify-content:center !important; gap:0 !important; padding-left:8px !important; padding-right:8px !important; font-size:0 !important; }
      .rumbo-admin-collapsed main[class] > aside:first-child nav button svg { width:20px !important; height:20px !important; margin:0 !important; }
      .rumbo-admin-collapsed main[class] > section { max-width:none !important; }
      @media(max-width:980px){
        .rumbo-admin-collapsed main[class] { grid-template-columns:1fr !important; }
      }
    `}</style>
  </div>;
}

const navItem:CSSProperties={padding:"6px 10px",borderRadius:7,color:"#475467",textDecoration:"none",fontWeight:700,background:"#f7f8fa"};
