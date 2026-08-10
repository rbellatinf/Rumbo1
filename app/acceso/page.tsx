"use client";

import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Network,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "./acceso.module.css";

type AccessType = "partner" | "retailer";
type Mode = "login" | "register";

type AuthResult = {
  redirectTo?: string;
  message?: string;
};

export default function AccessPage() {
  const [accessType, setAccessType] = useState<AccessType>("partner");
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const copy = useMemo(() => {
    if (accessType === "partner") {
      return {
        eyebrow: "Portal de partners",
        title: "Vende, comparte tu enlace y sigue tus comisiones.",
        description:
          "Tu cuenta personal concentra tus ventas, referidos directos, reservas atribuidas y comisiones pendientes o pagadas.",
        registerLabel: "Crear cuenta de partner",
      };
    }

    return {
      eyebrow: "Portal de agencias",
      title: "Gestiona tu agencia minorista desde un solo lugar.",
      description:
        "Registra la empresa, habilita usuarios de venta y revisa reservas, tarifas comerciales y liquidaciones.",
      registerLabel: "Registrar agencia minorista",
    };
  }, [accessType]);

  function reset(nextType?: AccessType, nextMode?: Mode) {
    if (nextType) setAccessType(nextType);
    if (nextMode) setMode(nextMode);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      access_type: accessType,
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };

    if (mode === "login") {
      payload.remember = form.get("remember") === "on";
    } else if (accessType === "partner") {
      payload.first_name = String(form.get("firstName") ?? "").trim();
      payload.last_name = String(form.get("lastName") ?? "").trim();
      payload.document_number = String(form.get("documentNumber") ?? "").trim();
      payload.phone = String(form.get("phone") ?? "").trim();
      payload.sponsor_code = String(form.get("sponsorCode") ?? "").trim().toUpperCase();
    } else {
      payload.legal_name = String(form.get("legalName") ?? "").trim();
      payload.trade_name = String(form.get("tradeName") ?? "").trim();
      payload.tax_id = String(form.get("taxId") ?? "").trim();
      payload.representative = String(form.get("representative") ?? "").trim();
      payload.phone = String(form.get("phone") ?? "").trim();
    }

    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as AuthResult;

      if (!response.ok) {
        throw new Error(result.message || "No pudimos completar el acceso.");
      }

      window.location.assign(result.redirectTo || (accessType === "partner" ? "/panel" : "/agencia"));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos completar el acceso.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <Link className={styles.brand} href="/" aria-label="Rumbo, inicio">
          rumbo<span>.</span>
        </Link>
        <div className={styles.brandContent}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <div className={styles.benefits}>
            <div><ShieldCheck /><span>Credenciales protegidas y sesiones auditables</span></div>
            <div><Network /><span>Red de referidos directos con trazabilidad</span></div>
            <div><CheckCircle2 /><span>Comisiones trazables desde la venta hasta el pago</span></div>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.accessSelector} aria-label="Tipo de acceso">
          <button className={accessType === "partner" ? styles.active : ""} onClick={() => reset("partner")} type="button">
            <UserRound /> Partner
          </button>
          <button className={accessType === "retailer" ? styles.active : ""} onClick={() => reset("retailer")} type="button">
            <Building2 /> Agencia minorista
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.modeTabs}>
            <button className={mode === "login" ? styles.modeActive : ""} onClick={() => reset(undefined, "login")} type="button">Iniciar sesión</button>
            <button className={mode === "register" ? styles.modeActive : ""} onClick={() => reset(undefined, "register")} type="button">Registrarme</button>
          </div>

          <div className={styles.heading}>
            <h2>{mode === "login" ? "Bienvenido de vuelta" : copy.registerLabel}</h2>
            <p>{mode === "login" ? "Ingresa con el correo registrado en Rumbo." : "Completa los datos para crear tu cuenta y perfil comercial."}</p>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {mode === "register" && accessType === "partner" ? (
              <>
                <div className={styles.gridTwo}>
                  <label>Nombres<input name="firstName" required autoComplete="given-name" /></label>
                  <label>Apellidos<input name="lastName" required autoComplete="family-name" /></label>
                </div>
                <div className={styles.gridTwo}>
                  <label>Documento<input name="documentNumber" required placeholder="DNI o CE" /></label>
                  <label>Celular<input name="phone" required autoComplete="tel" /></label>
                </div>
                <label>Código del partner que te invitó <span>(opcional)</span><input name="sponsorCode" placeholder="Ej. RUMBO-RICARDO-A12F" /></label>
              </>
            ) : null}

            {mode === "register" && accessType === "retailer" ? (
              <>
                <label>Razón social<input name="legalName" required /></label>
                <div className={styles.gridTwo}>
                  <label>Nombre comercial<input name="tradeName" required /></label>
                  <label>RUC<input name="taxId" required inputMode="numeric" pattern="[0-9]{11}" /></label>
                </div>
                <div className={styles.gridTwo}>
                  <label>Representante<input name="representative" required /></label>
                  <label>Celular<input name="phone" required autoComplete="tel" /></label>
                </div>
              </>
            ) : null}

            <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
            <label>
              Contraseña
              <div className={styles.passwordField}>
                <input name="password" type={showPassword ? "text" : "password"} minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            {mode === "register" ? (
              <label className={styles.check}><input type="checkbox" required /><span>Acepto los términos, la política de privacidad y el tratamiento de datos.</span></label>
            ) : (
              <div className={styles.loginOptions}>
                <label className={styles.check}><input name="remember" type="checkbox" /><span>Recordarme</span></label>
                <a href="mailto:soporte@rumbo.pe?subject=Recuperar%20acceso%20Rumbo">Olvidé mi contraseña</a>
              </div>
            )}

            {error ? (
              <div className={styles.success} role="alert" style={{ borderColor: "#efc4c4", background: "#fff5f5", color: "#8b2d2d" }}>
                <ShieldCheck />
                <div><strong>No pudimos completar la operación</strong><p>{error}</p></div>
              </div>
            ) : null}

            <button className={styles.submit} disabled={isSubmitting} type="submit">
              {isSubmitting ? <><LoaderCircle className="button-loader" /> Procesando…</> : mode === "login" ? "Ingresar" : copy.registerLabel}
            </button>
          </form>
        </div>
        <p className={styles.back}><Link href="/">← Volver a rumbo.pe</Link></p>
      </section>
    </main>
  );
}
