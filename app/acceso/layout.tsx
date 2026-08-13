import type { ReactNode } from "react";
import Link from "next/link";

export default function AccessLayout({children}:{children:ReactNode}){
  return <>
    <Link href="/admin/acceso" style={{position:"fixed",top:18,right:18,zIndex:80,padding:"10px 14px",borderRadius:12,background:"#10223f",color:"#fff",textDecoration:"none",fontSize:13,fontWeight:800,boxShadow:"0 8px 24px rgba(16,34,63,.18)"}}>Admin Rumbo</Link>
    {children}
  </>;
}
