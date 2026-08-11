"use client";

import { LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "../admin/acceso/acceso.module.css";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") || "").trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No pudimos procesar la recuperación.");
      setMessage(payload.message || "Si el correo está registrado, recibirás un enlace de recuperación.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos procesar la recuperación.");
    } finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <Link className={styles.brand} href="/">rumbo<span>.</span></Link>
      <div className={styles.icon}><Mail /></div>
      <p className={styles.eyebrow}>Recuperación de acceso</p>
      <h1>Olvidé mi contraseña</h1>
      <p className={styles.lead}>Ingresa el correo registrado. Si existe una cuenta, enviaremos un enlace de recuperación válido por 30 minutos.</p>
      <form onSubmit={submit}>
        <label>Correo registrado<input name="email" type="email" required autoComplete="email" /></label>
        {message ? <div className={styles.error} style={{borderColor:"#b7e4c7",background:"#f3fff7",color:"#166534"}}><ShieldCheck size={14}/> {message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        <button disabled={busy} type="submit">{busy ? <><LoaderCircle className={styles.spin}/> Enviando…</> : "Enviar enlace de recuperación"}</button>
      </form>
      <Link className={styles.back} href="/acceso">← Volver al inicio de sesión</Link>
    </section>
  </main>;
}
