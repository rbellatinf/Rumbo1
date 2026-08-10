"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./acceso.module.css";

export default function AdminAccessPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") || "").trim(), password: String(form.get("password") || ""), remember: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No pudimos iniciar sesión.");
      if (payload.redirectTo !== "/admin") throw new Error("Esta cuenta no tiene permisos de administración de Rumbo.");
      window.location.replace("/admin");
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos iniciar sesión."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <Link className={styles.brand} href="/">rumbo<span>.</span></Link>
      <div className={styles.icon}><ShieldCheck /></div>
      <p className={styles.eyebrow}>Administración mayorista</p>
      <h1>Acceso a Rumbo Admin</h1>
      <p className={styles.lead}>Uso exclusivo para usuarios internos autorizados de Rumbo.</p>
      <form onSubmit={submit}>
        <label>Correo administrativo<input name="email" type="email" required autoComplete="email" /></label>
        <label>Contraseña<input name="password" type="password" required minLength={10} autoComplete="current-password" /></label>
        {error ? <div className={styles.error}>{error}</div> : null}
        <button disabled={busy} type="submit">{busy ? <><LoaderCircle className={styles.spin}/> Ingresando…</> : "Ingresar al backoffice"}</button>
      </form>
      <Link className={styles.back} href="/">← Volver a rumbo.pe</Link>
    </section>
  </main>;
}
