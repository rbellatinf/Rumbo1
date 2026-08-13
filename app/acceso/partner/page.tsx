"use client";

import { Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "../acceso.module.css";

export default function PartnerLoginPage() {
  const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setError(""); setLoading(true);
    const form=new FormData(event.currentTarget);
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({access_type:"partner",email:String(form.get("email")||"").trim(),password:String(form.get("password")||""),remember:form.get("remember")==="on"})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.message||"No pudimos iniciar sesión.");
      if(result?.account?.role!=="partner") { await fetch("/api/auth/logout",{method:"POST"}).catch(()=>{}); throw new Error("Esta cuenta no pertenece al portal de Partners."); }
      window.location.assign("/panel");
    }catch(e){setError(e instanceof Error?e.message:"No pudimos iniciar sesión.");}finally{setLoading(false);}
  }
  return <main className={styles.page}>
    <section className={styles.brandPanel}><Link className={styles.brand} href="/">rumbo<span>.</span></Link><div className={styles.brandContent}><p className={styles.eyebrow}>Portal de partners</p><h1>Tu negocio con Rumbo, en un solo lugar.</h1><p>Consulta reservas atribuidas, tu enlace de referido y las comisiones generadas por tus ventas.</p><div className={styles.benefits}><div><ShieldCheck/><span>Acceso exclusivo para Partners registrados</span></div></div></div></section>
    <section className={styles.formPanel}><div className={styles.card}><div className={styles.heading}><p className={styles.eyebrow}>PARTNERS</p><h2>Iniciar sesión</h2><p>Ingresa con el correo asociado a tu perfil de Partner.</p></div><form className={styles.form} onSubmit={submit}><label>Correo electrónico<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<div className={styles.passwordField}><input name="password" type={showPassword?"text":"password"} required autoComplete="current-password"/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label="Mostrar u ocultar contraseña">{showPassword?<EyeOff/>:<Eye/>}</button></div></label><div className={styles.loginOptions}><label className={styles.check}><input name="remember" type="checkbox"/><span>Recordarme</span></label><Link href="/olvide-contrasena">Olvidé mi contraseña</Link></div>{error?<div className={styles.success} role="alert"><ShieldCheck/><div><strong>No pudimos ingresar</strong><p>{error}</p></div></div>:null}<button className={styles.submit} disabled={loading}>{loading?<><LoaderCircle className="button-loader"/> Ingresando…</>:"Ingresar como Partner"}</button></form></div><p className={styles.back}>¿Eres una agencia? <Link href="/acceso/minorista">Acceso minorista →</Link></p></section>
  </main>;
}
