"use client";

import { Building2, ChevronDown, CircleUserRound, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PublicAccessMenu(){
  const pathname=usePathname();
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(pathname!=="/"){setHost(null);return;}
    const find=()=>{const next=document.querySelector(".header-actions") as HTMLElement|null;if(next)setHost(next);const legacy=document.querySelector("a.header-action.account") as HTMLElement|null;if(legacy)legacy.style.display="none";};
    find();const observer=new MutationObserver(find);observer.observe(document.body,{subtree:true,childList:true});
    return()=>{observer.disconnect();const legacy=document.querySelector("a.header-action.account") as HTMLElement|null;if(legacy)legacy.style.display="";};
  },[pathname]);
  useEffect(()=>{if(!open)return;const close=(event:MouseEvent)=>{if(wrap.current&&!wrap.current.contains(event.target as Node))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[open]);
  if(pathname!=="/"||!host)return null;
  return createPortal(<div ref={wrap} style={{position:"relative",zIndex:70}}><button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-haspopup="menu" style={{height:46,display:"flex",alignItems:"center",gap:8,padding:"0 15px",border:"1px solid rgba(255,255,255,.38)",borderRadius:999,background:"rgba(255,255,255,.96)",color:"#10223f",fontWeight:800,fontSize:14,cursor:"pointer",boxShadow:"0 8px 24px rgba(16,34,63,.12)"}}><CircleUserRound size={19}/><span>Iniciar sesión</span><ChevronDown size={15}/></button>{open?<div role="menu" style={{position:"absolute",right:0,top:"calc(100% + 9px)",width:270,padding:8,border:"1px solid #e4e7ec",borderRadius:15,background:"white",boxShadow:"0 18px 50px rgba(16,34,63,.2)",color:"#10223f"}}><a href="/acceso/partner" role="menuitem" onClick={()=>setOpen(false)} style={{display:"flex",gap:11,alignItems:"center",padding:"12px 11px",borderRadius:10,color:"#10223f",textDecoration:"none"}}><span style={{width:38,height:38,display:"grid",placeItems:"center",borderRadius:10,background:"#fff1ed",color:"#e9573b"}}><UsersRound size={19}/></span><span><strong style={{display:"block",fontSize:14}}>Soy Partner</strong><small style={{display:"block",marginTop:2,color:"#667085"}}>Ventas, afiliados y comisiones</small></span></a><a href="/acceso/minorista" role="menuitem" onClick={()=>setOpen(false)} style={{display:"flex",gap:11,alignItems:"center",padding:"12px 11px",borderRadius:10,color:"#10223f",textDecoration:"none"}}><span style={{width:38,height:38,display:"grid",placeItems:"center",borderRadius:10,background:"#eef4f8",color:"#31566f"}}><Building2 size={19}/></span><span><strong style={{display:"block",fontSize:14}}>Soy Agencia</strong><small style={{display:"block",marginTop:2,color:"#667085"}}>Administrador o Counter minorista</small></span></a></div>:null}</div>,host);
}
