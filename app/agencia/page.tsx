"use client";

import { Building2, CircleDollarSign, LogOut, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./agencia.module.css";

type SessionProfile = {
  type: "retailer";
  retailer_id: string;
  trade_name: string;
  legal_name: string;
  tax_id: string;
  retailer_status: string;
  member_role: string;
};

type SessionResponse = {
  profile?: SessionProfile;
  message?: string;
};

export default function AgencyPage() {
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [message, setMessage] = useState("Cargando tu agencia…");

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as SessionResponse;
        if (!response.ok || data.profile?.type !== "retailer") {
          throw new Error(data.message || "Esta cuenta no corresponde a una agencia.");
        }
        setProfile(data.profile);
      })
      .catch(() => {
        window.location.replace("/acceso");
      });
  }, []);

  async function logout() {
    setMessage("Cerrando sesión…");
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/acceso");
  }

  if (!profile) {
    return <main className={styles.loading}>{message}</main>;
  }

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="/">rumbo<span>.</span></a>
        <p>Agencia minorista</p>
        <nav>
          <a className={styles.active} href="#resumen"><Building2 /> Resumen</a>
          <a href="#usuarios"><UsersRound /> Usuarios</a>
          <a href="#liquidaciones"><CircleDollarSign /> Liquidaciones</a>
        </nav>
        <button onClick={logout} type="button"><LogOut /> Cerrar sesión</button>
      </aside>

      <section className={styles.content}>
        <header>
          <div>
            <p className={styles.eyebrow}>Portal de agencia</p>
            <h1>{profile.trade_name}</h1>
            <p>{profile.legal_name} · RUC {profile.tax_id}</p>
          </div>
          <span className={styles.status}>{profile.retailer_status === "active" ? "Activa" : "Alta pendiente"}</span>
        </header>

        <div className={styles.cards} id="resumen">
          <article>
            <span>Rol de usuario</span>
            <strong>{profile.member_role === "owner" ? "Propietario" : profile.member_role}</strong>
            <p>Permisos vinculados a esta agencia.</p>
          </article>
          <article>
            <span>Reservas</span>
            <strong>0</strong>
            <p>Se llenará con las ventas atribuidas a la agencia.</p>
          </article>
          <article>
            <span>Liquidaciones</span>
            <strong>S/ 0.00</strong>
            <p>Comisiones y descuentos comerciales pendientes.</p>
          </article>
        </div>

        <section className={styles.panel} id="usuarios">
          <div>
            <p className={styles.eyebrow}>Equipo comercial</p>
            <h2>Usuarios de la agencia</h2>
            <p>La estructura ya admite propietario, gerente, agente y finanzas. El alta de usuarios internos será el siguiente módulo.</p>
          </div>
          <button type="button" disabled>Agregar usuario</button>
        </section>

        <section className={styles.panel} id="liquidaciones">
          <div>
            <p className={styles.eyebrow}>Liquidación comercial</p>
            <h2>Comisiones y descuentos</h2>
            <p>Las reglas comerciales están modeladas en PostgreSQL y quedarán vinculadas a las reservas pagadas de esta agencia.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
