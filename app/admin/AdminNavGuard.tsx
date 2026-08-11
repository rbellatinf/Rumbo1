"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const tabByLabel: Record<string,string> = {
  "Resumen":"summary",
  "Reservas":"reservations",
  "Partners":"partners",
  "Agencias":"retailers",
  "Comisiones":"commissions",
  "Auditoría":"audit",
};

export default function AdminNavGuard(){
  const searchParams=useSearchParams();

  useEffect(()=>{
    const module=searchParams.get("module");
    document.body.classList.toggle("rumbo-external-module-active",module==="users"||module==="pricing");
    return()=>document.body.classList.remove("rumbo-external-module-active");
  },[searchParams]);

  useEffect(()=>{
    const onClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement;
      const extra=target.closest(".rumbo-extra-nav") as HTMLElement|null;
      if(extra){
        document.body.classList.add("rumbo-external-module-active");
        return;
      }
      const button=target.closest("main aside nav button") as HTMLButtonElement|null;
      if(!button)return;
      const label=button.textContent?.trim()||"";
      const tab=Object.entries(tabByLabel).find(([name])=>label.includes(name))?.[1];
      if(!tab)return;
      event.preventDefault();
      event.stopPropagation();
      document.body.classList.remove("rumbo-external-module-active");
      window.location.assign(`/admin?tab=${tab}`);
    };
    document.addEventListener("click",onClick,true);
    return()=>document.removeEventListener("click",onClick,true);
  },[]);

  return <style jsx global>{`
    body.rumbo-external-module-active main aside nav button {
      background: transparent !important;
      color: #667085 !important;
      box-shadow: none !important;
    }
    body.rumbo-external-module-active main aside nav button svg {
      color: #667085 !important;
    }
  `}</style>;
}
