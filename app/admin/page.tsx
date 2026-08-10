"use client";

import { Building2, CircleDollarSign, ClipboardList, LoaderCircle, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

type AdminPayload = {
  metrics: { partners: number; partners_pending: number; retailers: number; retailers_pending: number; commissions: number; commissions_pending: number };
  partners: Array<{ account_id: string; first_name: string; last_name: string; document_type: string; document_number: string; phone?: string; referral_code: string; email: string; status: string; direct_referrals: number; created_at: string }>;
  retailers: Array<{ id: string; legal_name: string; trade_name: string; tax_id: string; contact_email?: string; phone?: string; status: string; member_count: number; created_at: string }>;
  commissions: Array<{ id: string; beneficiary_type: string; currency: string; base_amount: number; rate: number; commission_amount: number; status: string; reference: string; created_at: string }>;
  commission_settings: { partner_rate: number; sponsor_rate: number; retailer_rate: number; updated_at?: string };
  audit: Array<{ actor: string; action: string; entity_type: string; entity_id: string; created_at: string }>;
};

type Tab = "summary" | "partners" | "retailers" | "commissions" | "audit";

const money = (amount: number, currency: string) => new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount || 0);
const date = (value: string) => new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [rates, setRates] = useState({ partner: 6, sponsor: 0, retailer: 0 });

  async function load() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) window.location.replace("/acceso");
      throw new Error(payload.message || "No pudimos cargar el backoffice.");
    }
    setData(payload);
    setRates({
      partner: Number(payload.commission_settings?.partner_rate || 0) * 100,
      sponsor: Number(payload.commission_settings?.sponsor_rate || 0) * 100,
      retailer: Number(payload.commission_settings?.retailer_rate || 0) * 100,
    });
  }

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Error de carga")); }, []);

  async function changeStatus(type: "partners" | "retailers", id: string, status: string) {
    setBusy(`${type}:${id}`); setError("");
    try {
      const response = await fetch(`/api/admin/${type}/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No pudimos actualizar el estado.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos actualizar el estado."); }
    finally { setBusy(""); }
  }

  async function saveRates() {
    setBusy("rates"); setError("");
    try {
      const response = await fetch("/api/commission-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partner_rate: rates.partner / 100, sponsor_rate: rates.sponsor / 100, retailer_rate: rates.retailer / 100 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No pudimos guardar las comisiones.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar las comisiones."); }
    finally { setBusy(""); }
  }

  const pendingTotal = useMemo(() => data ? data.metrics.partners_pending + data.metrics.retailers_pending + data.metrics.commissions_pending : 0, [data]);

  if (!data) return <main className={styles.loading}><LoaderCircle className={styles.spin} /> {error || "Cargando administración de Rumbo…"}</main>;

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/">rumbo<span>.</span></Link>
        <p className={styles.sideLabel}>Administración mayorista</p>
        <nav>
          <button className={tab === "summary" ? styles.active : ""} onClick={() => setTab("summary")}><ShieldCheck /> Resumen</button>
          <button className={tab === "partners" ? styles.active : ""} onClick={() => setTab("partners")}><UsersRound /> Partners</button>
          <button className={tab === "retailers" ? styles.active : ""} onClick={() => setTab("retailers")}><Building2 /> Agencias</button>
          <button className={tab === "commissions" ? styles.active : ""} onClick={() => setTab("commissions")}><CircleDollarSign /> Comisiones</button>
          <button className={tab === "audit" ? styles.active : ""} onClick={() => setTab("audit")}><ClipboardList /> Auditoría</button>
        </nav>
        <Link className={styles.storeLink} href="/">← Volver a la tienda</Link>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Rumbo · Backoffice propio</p><h1>Administración</h1><p>Partners, agencias, comisiones y control operativo conectados a PostgreSQL.</p></div>
          <span className={styles.pending}>{pendingTotal} pendientes</span>
        </header>
        {error ? <div className={styles.error}>{error}</div> : null}

        {tab === "summary" ? <>
          <div className={styles.metrics}>
            <article><span>Partners</span><strong>{data.metrics.partners}</strong><small>{data.metrics.partners_pending} pendientes</small></article>
            <article><span>Agencias</span><strong>{data.metrics.retailers}</strong><small>{data.metrics.retailers_pending} pendientes</small></article>
            <article><span>Comisiones</span><strong>{data.metrics.commissions}</strong><small>{data.metrics.commissions_pending} pendientes</small></article>
            <article><span>Regla Partner</span><strong>{(data.commission_settings.partner_rate * 100).toFixed(1)}%</strong><small>tasa global vigente</small></article>
          </div>
          <section className={styles.card}><h2>Altas que requieren atención</h2><p className={styles.helper}>Aprueba primero las cuentas que ya tengan sus datos completos.</p>
            <div className={styles.quickGrid}><div><strong>{data.metrics.partners_pending}</strong><span>Partners por aprobar</span><button onClick={() => setTab("partners")}>Revisar</button></div><div><strong>{data.metrics.retailers_pending}</strong><span>Agencias por aprobar</span><button onClick={() => setTab("retailers")}>Revisar</button></div></div>
          </section>
        </> : null}

        {tab === "partners" ? <section className={styles.card}><h2>Partners</h2><p className={styles.helper}>Estado de alta, identidad, código de referido y red directa.</p><div className={styles.tableWrap}><table><thead><tr><th>Partner</th><th>Documento</th><th>Código</th><th>Red</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.partners.map((p) => <tr key={p.account_id}><td><strong>{p.first_name} {p.last_name}</strong><small>{p.email}</small></td><td>{p.document_type} {p.document_number}</td><td><code>{p.referral_code}</code></td><td>{p.direct_referrals}</td><td><span className={styles.status}>{p.status}</span></td><td><select disabled={busy === `partners:${p.account_id}`} value={p.status} onChange={(e) => changeStatus("partners", p.account_id, e.target.value)}><option value="pending">Pendiente</option><option value="active">Activo</option><option value="blocked">Bloqueado</option><option value="disabled">Deshabilitado</option></select></td></tr>)}</tbody></table></div></section> : null}

        {tab === "retailers" ? <section className={styles.card}><h2>Agencias minoristas</h2><p className={styles.helper}>Empresas registradas, usuarios asociados y estado comercial.</p><div className={styles.tableWrap}><table><thead><tr><th>Agencia</th><th>RUC</th><th>Contacto</th><th>Usuarios</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.retailers.map((r) => <tr key={r.id}><td><strong>{r.trade_name}</strong><small>{r.legal_name}</small></td><td>{r.tax_id}</td><td>{r.contact_email || "—"}</td><td>{r.member_count}</td><td><span className={styles.status}>{r.status}</span></td><td><select disabled={busy === `retailers:${r.id}`} value={r.status} onChange={(e) => changeStatus("retailers", r.id, e.target.value)}><option value="pending">Pendiente</option><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="rejected">Rechazada</option></select></td></tr>)}</tbody></table></div></section> : null}

        {tab === "commissions" ? <>
          <section className={styles.card}><h2>Reglas globales</h2><p className={styles.helper}>Los cambios afectan nuevas comisiones y no recalculan operaciones históricas.</p><div className={styles.rateGrid}>{(["partner","sponsor","retailer"] as const).map((key) => <label key={key}><span>{key === "partner" ? "Partner directo" : key === "sponsor" ? "Sponsor directo" : "Agencia minorista"}</span><div><input min="0" max="100" step="0.1" type="number" value={rates[key]} onChange={(e) => setRates((v) => ({ ...v, [key]: Number(e.target.value) }))} /><b>%</b></div></label>)}</div><button className={styles.primary} disabled={busy === "rates"} onClick={saveRates}>{busy === "rates" ? "Guardando…" : "Guardar reglas"}</button></section>
          <section className={styles.card}><h2>Comisiones generadas</h2><div className={styles.tableWrap}><table><thead><tr><th>Reserva</th><th>Beneficiario</th><th>Base</th><th>Tasa</th><th>Comisión</th><th>Estado</th></tr></thead><tbody>{data.commissions.map((c) => <tr key={c.id}><td>{c.reference}</td><td>{c.beneficiary_type}</td><td>{money(c.base_amount,c.currency)}</td><td>{(c.rate*100).toFixed(1)}%</td><td><strong>{money(c.commission_amount,c.currency)}</strong></td><td><span className={styles.status}>{c.status}</span></td></tr>)}</tbody></table></div></section>
        </> : null}

        {tab === "audit" ? <section className={styles.card}><h2>Auditoría reciente</h2><p className={styles.helper}>Cambios administrativos registrados por Rumbo.</p><div className={styles.audit}>{data.audit.map((a, i) => <div key={`${a.entity_id}-${i}`}><span>{date(a.created_at)}</span><strong>{a.action}</strong><p>{a.actor} · {a.entity_type} {a.entity_id}</p></div>)}</div></section> : null}
      </section>
    </main>
  );
}
