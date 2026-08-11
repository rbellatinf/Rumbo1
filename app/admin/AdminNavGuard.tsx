"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CatalogPanel from "./CatalogPanel";

const tabByLabel: Record<string,string> = {
  "Resumen":"summary",
  "Reservas":"reservations",
  "Partners":"partners",
  "Agencias":"retailers",
  "Comisiones":"commissions",
  "Auditoría":"audit",
};

type ExtraModule="users"|"catalog"|"pricing"|null;

export default function AdminNavGuard(){
  const searchParams=useSearchParams();
  const initial=searchParams.get("module");
  const [module,setModule]=useState<ExtraModule>(initial==="users"||initial==="catalog"||initial==="pricing"?initial:null);

  useEffect(()=>{
    const requested=searchParams.get("module");
    setModule(requested==="users"||requested==="catalog"||requested==="pricing"?requested:null);
  },[searchParams]);

  useEffect(()=>{
    const active=module==="users"||module==="catalog"||module==="pricing";
    document.body.classList.toggle("rumbo-external-module-active",active);
    document.body.classList.toggle("rumbo-catalog-active",module==="catalog");

    const buttons=Array.from(document.querySelectorAll("main aside nav button")) as HTMLButtonElement[];
    for(const button of buttons){
      if(active){
        button.style.setProperty("background","transparent","important");
        button.style.setProperty("color","#667085","important");
        button.style.setProperty("box-shadow","none","important");
      }else{
        button.style.removeProperty("background");
        button.style.removeProperty("color");
        button.style.removeProperty("box-shadow");
      }
    }
    document.querySelectorAll(".rumbo-catalog-nav").forEach(el=>el.classList.toggle("rumbo-catalog-active-link",module==="catalog"));
    return()=>{
      document.body.classList.remove("rumbo-external-module-active","rumbo-catalog-active");
      for(const button of buttons){button.style.removeProperty("background");button.style.removeProperty("color");button.style.removeProperty("box-shadow")}
    };
  },[module]);

  useEffect(()=>{
    const installCatalogLink=()=>{
      const nav=document.querySelector("main aside nav");
      if(!nav||nav.querySelector(".rumbo-catalog-nav"))return;
      const link=document.createElement("a");
      link.href="/admin?module=catalog";
      link.className="rumbo-catalog-nav";
      link.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 12 2l8 3.5v13L12 22l-8-3.5v-13ZM4 5.5l8 3.5 8-3.5M12 9v13"/></svg><span>Catálogo</span>';
      const pricing=nav.querySelector('[data-module="pricing"]');
      const commissions=Array.from(nav.querySelectorAll("button")).find(b=>b.textContent?.includes("Comisiones"))||null;
      nav.insertBefore(link,pricing||commissions);
      link.classList.toggle("rumbo-catalog-active-link",module==="catalog");
    };
    installCatalogLink();
    const observer=new MutationObserver(installCatalogLink);
    observer.observe(document.body,{subtree:true,childList:true});
    return()=>{observer.disconnect();document.querySelectorAll(".rumbo-catalog-nav").forEach(el=>el.remove())};
  },[module]);

  useEffect(()=>{
    const onClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement;
      const catalog=target.closest(".rumbo-catalog-nav") as HTMLAnchorElement|null;
      if(catalog){
        event.preventDefault();
        event.stopPropagation();
        setModule("catalog");
        history.replaceState(null,"","/admin?module=catalog");
        return;
      }
      const extra=target.closest(".rumbo-extra-nav") as HTMLElement|null;
      if(extra){
        const requested=extra.dataset.module;
        if(requested==="users"||requested==="pricing")setModule(requested);
        return;
      }
      const button=target.closest("main aside nav button") as HTMLButtonElement|null;
      if(!button)return;
      const label=button.textContent?.trim()||"";
      const tab=Object.entries(tabByLabel).find(([name])=>label.includes(name))?.[1];
      if(!tab)return;
      setModule(null);
      history.replaceState(null,"",`/admin?tab=${tab}`);
      // No preventDefault/stopPropagation: el onClick original del backoffice debe ejecutar setTab().
    };
    document.addEventListener("click",onClick,true);
    return()=>document.removeEventListener("click",onClick,true);
  },[]);

  return <>
    {module==="catalog"?<div className="rumbo-embedded-content rumbo-catalog-content"><CatalogPanel/></div>:null}
    <style jsx global>{`
      body.rumbo-external-module-active main aside nav button {
        background: transparent !important;
        color: #667085 !important;
        box-shadow: none !important;
      }
      body.rumbo-external-module-active main aside nav button svg { color:#667085 !important; }
      body.rumbo-catalog-active main[class] > section { visibility:hidden !important; }
      main aside nav .rumbo-catalog-nav{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:10px;color:#667085;text-decoration:none;font-weight:700;box-sizing:border-box}
      main aside nav .rumbo-catalog-nav:hover,main aside nav .rumbo-catalog-active-link{background:#102b50!important;color:white!important}
      main aside nav .rumbo-catalog-nav svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
      .rumbo-admin-collapsed main aside nav .rumbo-catalog-nav{justify-content:center!important;gap:0!important;padding-left:8px!important;padding-right:8px!important;font-size:0!important}
      .rumbo-admin-collapsed main aside nav .rumbo-catalog-nav span{display:none!important}
      .rumbo-admin-collapsed main aside nav .rumbo-catalog-nav svg{width:20px!important;height:20px!important;margin:0!important}
    `}</style>
  </>;
}
