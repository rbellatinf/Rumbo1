"use client";

import { Building2, CheckCircle2, Eye, EyeOff, Network, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import styles from "./acceso.module.css";

type AccessType = "partner" | "retailer";
type Mode = "login" | "register";

export default function AccessPage() {
  const [accessType, setAccessType] = useState<AccessType>("partner");
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <a className={styles.brand} href="/" aria-label="Rumbo, inicio">
          rumbo<span>.</span>
        </a>
        <div className={styles.brandContent}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <div className={styles.benefits}>
            <div><ShieldCheck /><span>Credenciales protegidas y sesiones auditables</span></div>
            <div><Network /><span>Red de referidos de un nivel, sin duplicidades</span></div>
            <div><CheckCircle2 /><span>Comisiones trazables desde la venta hasta el pago</span></div>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.accessSelector} aria-label="Tipo de acceso">
          <button
            className={accessType === "partner" ? styles.active : ""}
            onClick={() => { setAccessType("partner"); setSubmitted(false); }}
            type="button"
          >
            <UserRound /> Partner
          </button>
          <button
            className={accessType === "retailer" ? styles.active : ""}
            onClick={() => { setAccessType("retailer"); setSubmitted(false); }}
            type="button"
          >
            <Building2 /> Agencia minorista
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.modeTabs}>
            <button className={mode === "login" ? styles.modeActive : ""} onClick={() => { setMode("login"); setSubmitted(false); }} type="button">Iniciar sesión</button>
            <button className={mode === "register" ? styles.modeActive : ""} onClick={() => { setMode("register"); setSubmitted(false); }} type="button">Registrarme</button>
          </div>

          <div className={styles.heading}>
            <h2>{mode === "login" ? "Bienvenido de vuelta" : copy.registerLabel}</h2>
            <p>{mode === "login" ? "Ingresa con el correo registrado en Rumbo." : "Completa los datos para crear una solicitud de alta."}</p>
          </div>

          {submitted ? (
            <div className={styles.success}>
              <CheckCircle2 />
              <div>
                <strong>{mode === "login" ? "Formulario validado" : "Solicitud preparada"}</strong>
                <p>La pantalla y el modelo PostgreSQL ya están listos. La siguiente conexión será activar el servicio de autenticación contra la base desplegada.</p>
              </div>
            </div>
          ) : (
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
                  <label>Código del partner que te invitó <span>(opcional)</span><input name="sponsorCode" placeholder="Ej. RUMBO-RICARDO" /></label>
                </>
              ) : null}

              {mode === "register" && accessType === "retailer" ? (
                <>
                  <label>Razón social<input name="legalName" required /></label>
                  <div className={styles.gridTwo}>
                    <label>Nombre comercial<input name="tradeName" required /></label>
                    <label>RUC<input name="taxId" required inputMode="numeric" /></label>
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
                  <label className={styles.check}><input type="checkbox" /><span>Recordarme</span></label>
                  <a href="#">Olvidé mi contraseña</a>
                </div>
              )}

              <button className={styles.submit} type="submit">
                {mode === "login" ? "Ingresar" : copy.registerLabel}
              </button>
            </form>
          )}
        </div>
        <p className={styles.back}><a href="/">← Volver a rumbo.pe</a></p>
      </section>
    </main>
  );
}
