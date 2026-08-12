"use client";

import { useEffect } from "react";

export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("Rumbo UI runtime error",error)},[error]);
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f6f7f9",padding:24,fontFamily:"Arial, sans-serif",color:"#10223f"}}>
    <section style={{width:"min(620px,100%)",background:"white",border:"1px solid #e4e7ec",borderRadius:18,padding:28,boxShadow:"0 18px 50px rgba(16,34,63,.12)"}}>
      <p style={{margin:0,color:"#e9573b",fontSize:12,fontWeight:800,textTransform:"uppercase",letterSpacing:".1em"}}>Rumbo</p>
      <h1 style={{margin:"8px 0",fontSize:28}}>No pudimos mostrar esta pantalla</h1>
      <p style={{margin:"0 0 18px",color:"#667085",lineHeight:1.5}}>La aplicación encontró un error de interfaz. Tus datos no se borraron. Puedes reintentar la carga.</p>
      <button onClick={reset} style={{border:0,borderRadius:10,padding:"11px 16px",background:"#10223f",color:"white",fontWeight:800,cursor:"pointer"}}>Reintentar</button>
      {error.digest?<p style={{marginTop:14,color:"#98a2b3",fontSize:11}}>Referencia: {error.digest}</p>:null}
    </section>
  </main>;
}
