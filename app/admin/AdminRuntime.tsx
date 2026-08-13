"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import AdminLayoutClient from "./AdminLayoutClient";

export default function AdminRuntime({children}:{children:ReactNode}){
  const [enhancementsReady,setEnhancementsReady]=useState(false);

  useEffect(()=>{
    if(window.location.pathname!=="/admin"){
      setEnhancementsReady(true);
      return;
    }

    let stopped=false;
    let timer:number|undefined;
    const waitForBaseAdmin=()=>{
      if(stopped)return;
      const sidebar=document.querySelector("main aside nav");
      const content=document.querySelector("main aside + section");
      if(sidebar&&content){
        setEnhancementsReady(true);
        return;
      }
      timer=window.setTimeout(waitForBaseAdmin,120);
    };
    waitForBaseAdmin();
    return()=>{stopped=true;if(timer)window.clearTimeout(timer)};
  },[]);

  // El Admin base siempre queda visible. Los módulos avanzados se montan
  // recién cuando el sidebar y el contenido principal ya existen.
  if(!enhancementsReady)return <>{children}</>;
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
