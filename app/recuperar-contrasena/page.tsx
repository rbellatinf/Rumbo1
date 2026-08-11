"use client";

import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import styles from "../admin/acceso/acceso.module.css";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setBusy(false); setError("Las contraseñas no coinciden."); return;
    }
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No pudimos actualizar la contraseña.");
      setMessage(payload.message || "Contraseña actualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos actualizar la contraseña.");
    } finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <Link className={styles.brand} href="/">rumbo<span>.</span></Link>
      <div className={styles.icon}><KeyRound /></div>
      <p className={styles.eyebrow}>Seguridad de cuenta</p>
      <h1>Crea una nueva contraseña</h1>
      <p className={styles.lead}>Usa al menos 10 caracteres. Al cambiarla cerraremos las sesiones anteriores de esta cuenta.</p>
      {!token ? <div className={styles.error}>El enlace de recuperación no contiene un token válido.</div> : <form onSubmit={submit}>
        <label>Nueva contraseña
          <div className={styles.passwordField}>
            <input name="password" type={showPassword ? "text" : "password"} required minLength={10} autoComplete="new-password" />
            <button className={styles.eyeButton} type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff/> : <Eye/>}</button>
          </div>
        </label>
        <label>Confirmar contraseña<input name="confirmation" type={showPassword ? "text" : "password"} required minLength={10} autoComplete="new-password" /></label>
        {message ? <div className={styles.error} style={{borderColor:"#b7e4c7",background:"#f3fff7",color:"#166534"}}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        <button disabled={busy || Boolean(message)} type="submit">{busy ? <><LoaderCircle className={styles.spin}/> Guardando…</> : "Guardar nueva contraseña"}</button>
      </form>}
      <Link className={styles.back} href="/acceso">← Volver al inicio de sesión</Link>
    </section>
  </main>;
}
