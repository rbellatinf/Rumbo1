"use client";

import { Building2, CircleDollarSign, ClipboardList, LoaderCircle, Plane, Search, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

type Retailer = { id: string; legal_name: string; trade_name: string; tax_id: string; contact_email?: string; phone?: string; status: string; member_count: number; created_at: string };
type AgencyMember = { account_id: string; first_name: string; last_name: string; member_role: "admin" | "counter"; email: string; status: string; display_status?: string; last_login_at?: string | null };
type AdminPayload = {
  metrics: { partners: number; partners_pending: number; retailers: number; retailers_pending: number; commissions: number; commissions_pending: number; reservations: number; reservations_open: number };
  partners: Array<{ account_id: string; first_name: string; last_name: string; document_type: string; document_number: string; phone?: string; referral_code: string; email: string; status: string; direct_referrals: number; created_at: string }>;
  retailers: Retailer[];
  commissions: Array<{ id: string; beneficiary_type: string; currency: string; base_amount: number; rate: number; commission_amount: number; status: string; reference: string; created_at: string }>;
  reservations: Array<{ id: string; reference: string; product_name: string; provider: string; origin_iata?: string; destination_iata?: string; departure_date?: string; return_date?: string; adults: number; children: number; currency?: string; price_display?: string; contact_name: string; contact_email: string; contact_phone: string; referral_code?: string; status: string; payment_status: string; created_at: string }>;
  commission_settings: { partner_rate: number; sponsor_rate: number; retailer_rate: number; updated_at?: string };
  audit: Array<{ actor: string; action: string; entity_type: string; entity_id: string; created_at: string }>;
  demo_mode?: boolean;
};

type Tab = "summary" | "reservations" | "partners" | "retailers" | "commissions" | "audit";
const money = (amount: number, currency: string) => new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount || 0);
const date = (value: string) => new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const shortDate = (value?: string) => value ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "—";

const gridTable: React.CSSProperties = { width:"100%", borderCollapse:"collapse", tableLayout:"fixed", fontSize:13 };
const gridTh: React.CSSProperties = { textAlign:"left", padding:"7px 9px", border:"1px solid #dfe4ea", background:"#eef2f5", color:"#536273", fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:.25 };
const gridTd: React.CSSProperties = { padding:"6px 9px", border:"1px solid #e3e7eb", verticalAlign:"middle", lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };
const pager: React.CSSProperties = { display:"flex", justifyContent:"flex-end", alignItems:"center", gap:8, marginTop:9, fontSize:12, color:"#687587" };
const pagerButton: React.CSSProperties = { border:"1px solid #ccd4dc", background:"white", borderRadius:5, padding:"5px 9px", fontWeight:700, cursor:"pointer" };

export default function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState({ partner: 6, sponsor: 0, retailer: 0 });
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [agencyMembers, setAgencyMembers] = useState<AgencyMember[]>([]);
  const [agencyCapacity, setAgencyCapacity] = useState<{ active:number; total:number; limit:number } | null>(null);
  const [agencyMessage, setAgencyMessage] = useState("");
  const [agencyPage, setAgencyPage] = useState(1);
  const [userPage, setUserPage] = useState(1);

  async function load() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) window.location.replace("/admin/acceso");
      throw new Error(payload.message || "No pudimos cargar el backoffice.");
    }
    setData(payload);
    setRates({ partner: Number(payload.commission_settings?.partner_rate || 0) * 100, sponsor: Number(payload.commission_settings?.sponsor_rate || 0) * 100, retailer: Number(payload.commission_settings?.retailer_rate || 0) * 100 });
  }

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Error de carga")); }, []);

  async function selectRetailer(retailer: Retailer) {
    setSelectedRetailer(retailer);
    setAgencyMembers([]);
    setAgencyCapacity(null);
    setAgencyMessage("Cargando usuarios…");
    setUserPage(1);
    try {
      const response = await fetch(`/api/admin/agencies/${retailer.id}/users`, { cache: "no-store" });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(payload.message || "No pudimos cargar los usuarios de la agencia.");
      setAgencyMembers(payload.members || []);
      setAgencyCapacity(payload.user_capacity || null);
      setAgencyMessage("");
    } catch (e) {
      setAgencyMessage(e instanceof Error ? e.message : "No pudimos cargar los usuarios de la agencia.");
    }
  }

  async function changeStatus(type: "partners" | "retailers" | "reservations", id: string, status: string) {
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

  const pendingTotal = useMemo(() => data ? data.metrics.partners_pending + data.metrics.retailers_pending + data.metrics.commissions_pending + data.metrics.reservations_open : 0, [data]);
  const filteredReservations = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.reservations;
    return data.reservations.filter((r) => [r.reference, r.product_name, r.contact_name, r.contact_email, r.referral_code, r.origin_iata, r.destination_iata].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [data, search]);

  const agenciesPerPage = 10;
  const agencyPages = Math.max(1, Math.ceil((data?.retailers.length || 0) / agenciesPerPage));
  const pagedAgencies = data?.retailers.slice((agencyPage - 1) * agenciesPerPage, agencyPage * agenciesPerPage) || [];
  const usersPerPage = 5;
  const userPages = Math.max(1, Math.ceil(agencyMembers.length / usersPerPage));
  const pagedUsers = agencyMembers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  if (!data) return <main className={styles.loading}><LoaderCircle className={styles.spin} /> {error || "Cargando administración de Rumbo…"}</main>;

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/">rumbo<span>.</span></Link>
        <p className={styles.sideLabel}>Administración mayorista</p>
        <nav>
          <button className={tab === "summary" ? styles.active : ""} onClick={() => setTab("summary")}><ShieldCheck /> Resumen</button>
          <button className={tab === "reservations" ? styles.active : ""} onClick={() => setTab("reservations")}><Plane /> Reservas</button>
          <button className={tab === "partners" ? styles.active : ""} onClick={() => setTab("partners")}><UsersRound /> Partners</button>
          <button className={tab === "retailers" ? styles.active : ""} onClick={() => setTab("retailers")}><Building2 /> Agencias</button>
          <button className={tab === "commissions" ? styles.active : ""} onClick={() => setTab("commissions")}><CircleDollarSign /> Comisiones</button>
          <button className={tab === "audit" ? styles.active : ""} onClick={() => setTab("audit")}><ClipboardList /> Auditoría</button>
        </nav>
        <Link className={styles.storeLink} href="/">← Volver a la tienda</Link>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Rumbo · Backoffice propio</p><h1>Administración</h1><p>Reservas, Partners, agencias, comisiones y control operativo conectados a PostgreSQL.</p></div>
          <div><span className={styles.pending}>{pendingTotal} por atender</span>{data.demo_mode ? <p className={styles.helper}>Modo demo · acceso libre</p> : null}</div>
        </header>
        {error ? <div className={styles.error}>{error}</div> : null}

        {tab === "summary" ? <>
          <div className={styles.metrics}>
            <article><span>Reservas</span><strong>{data.metrics.reservations}</strong><small>{data.metrics.reservations_open} abiertas</small></article>
            <article><span>Partners</span><strong>{data.metrics.partners}</strong><small>{data.metrics.partners_pending} pendientes</small></article>
            <article><span>Agencias</span><strong>{data.metrics.retailers}</strong><small>{data.metrics.retailers_pending} pendientes</small></article>
            <article><span>Comisiones</span><strong>{data.metrics.commissions}</strong><small>{data.metrics.commissions_pending} pendientes</small></article>
          </div>
          <section className={styles.card}><h2>Operación que requiere atención</h2><p className={styles.helper}>Accesos rápidos al trabajo pendiente del mayorista.</p>
            <div className={styles.quickGrid}><div><strong>{data.metrics.reservations_open}</strong><span>Reservas abiertas</span><button onClick={() => setTab("reservations")}>Revisar</button></div><div><strong>{data.metrics.partners_pending + data.metrics.retailers_pending}</strong><span>Altas por aprobar</span><button onClick={() => setTab("partners")}>Revisar</button></div></div>
          </section>
        </> : null}

        {tab === "reservations" ? <section className={styles.card}>
          <h2>Reservas</h2><p className={styles.helper}>Operaciones capturadas por Rumbo. El estado y el pago se leen directamente de PostgreSQL.</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}><Search size={17} /><input style={{ width: "min(420px,100%)", padding: "10px 12px", border: "1px solid #d0d5dd", borderRadius: 9 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar reserva, cliente, destino o referido" /></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Reserva</th><th>Cliente</th><th>Viaje</th><th>Salida</th><th>Referido</th><th>Pago</th><th>Estado</th></tr></thead><tbody>{filteredReservations.map((r) => <tr key={r.id}><td><strong>{r.reference}</strong><small>{r.product_name}</small></td><td><strong>{r.contact_name}</strong><small>{r.contact_email}</small></td><td>{r.origin_iata || "—"} → {r.destination_iata || "—"}<small>{r.adults} ad. · {r.children} niñ.</small></td><td>{shortDate(r.departure_date)}</td><td><code>{r.referral_code || "Directo"}</code></td><td><span className={styles.status}>{r.payment_status}</span></td><td><select disabled={busy === `reservations:${r.id}`} value={r.status} onChange={(e) => changeStatus("reservations", r.id, e.target.value)}><option value="new">Nueva</option><option value="validating">Validando</option><option value="quoted">Cotizada</option><option value="confirmed">Confirmada</option><option value="cancelled">Cancelada</option><option value="expired">Vencida</option></select></td></tr>)}</tbody></table></div>
          {filteredReservations.length === 0 ? <p className={styles.helper}>Todavía no hay reservas para mostrar.</p> : null}
        </section> : null}

        {tab === "partners" ? <section className={styles.card}><h2>Partners</h2><p className={styles.helper}>Estado de alta, identidad, código de referido y red directa.</p><div className={styles.tableWrap}><table><thead><tr><th>Partner</th><th>Documento</th><th>Código</th><th>Red</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.partners.map((p) => <tr key={p.account_id}><td><strong>{p.first_name} {p.last_name}</strong><small>{p.email}</small></td><td>{p.document_type} {p.document_number}</td><td><code>{p.referral_code}</code></td><td>{p.direct_referrals}</td><td><span className={styles.status}>{p.status}</span></td><td><select disabled={busy === `partners:${p.account_id}`} value={p.status} onChange={(e) => changeStatus("partners", p.account_id, e.target.value)}><option value="pending">Pendiente</option><option value="active">Activo</option><option value="blocked">Bloqueado</option><option value="disabled">Deshabilitado</option></select></td></tr>)}</tbody></table></div></section> : null}

        {tab === "retailers" ? <div style={{display:"flex", flexDirection:"column", minHeight:"calc(100vh - 190px)"}}>
          <section className={styles.card} style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,marginBottom:9}}>
              <div><h2 style={{marginBottom:2}}>Agencias minoristas</h2><p className={styles.helper} style={{margin:0}}>Vista compacta · 10 agencias por página. Haz clic en una fila.</p></div>
              <span style={{fontSize:12,color:"#6d7887"}}>Página {agencyPage} de {agencyPages}</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={gridTable}>
                <thead><tr><th style={{...gridTh,width:"24%"}}>Agencia</th><th style={{...gridTh,width:"17%"}}>RUC</th><th style={{...gridTh,width:"25%"}}>Contacto</th><th style={{...gridTh,width:"10%"}}>Usuarios</th><th style={{...gridTh,width:"11%"}}>Estado</th><th style={{...gridTh,width:"13%"}}>Acción</th></tr></thead>
                <tbody>{pagedAgencies.map((r) => <tr key={r.id} onClick={() => selectRetailer(r)} style={{cursor:"pointer",background:selectedRetailer?.id===r.id?"#dfeef9":"white"}}>
                  <td style={gridTd} title={`${r.trade_name} / ${r.legal_name}`}><strong>{r.trade_name}</strong><span style={{display:"block",fontSize:11,color:"#778394",marginTop:2}}>{r.legal_name}</span></td>
                  <td style={gridTd}>{r.tax_id}</td>
                  <td style={gridTd} title={r.contact_email || ""}>{r.contact_email || "—"}</td>
                  <td style={gridTd}>{r.member_count}</td>
                  <td style={gridTd}><span className={styles.status}>{r.status}</span></td>
                  <td style={gridTd} onClick={(e)=>e.stopPropagation()}><select style={{width:"100%",fontSize:12,padding:"4px 5px"}} disabled={busy === `retailers:${r.id}`} value={r.status} onChange={(e) => changeStatus("retailers", r.id, e.target.value)}><option value="pending">Pendiente</option><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="rejected">Rechazada</option></select></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div style={pager}><span>{data.retailers.length} agencias</span><button style={pagerButton} disabled={agencyPage<=1} onClick={()=>setAgencyPage((p)=>Math.max(1,p-1))}>‹ Anterior</button><button style={pagerButton} disabled={agencyPage>=agencyPages} onClick={()=>setAgencyPage((p)=>Math.min(agencyPages,p+1))}>Siguiente ›</button></div>
          </section>

          <section className={styles.card} style={{marginTop:"auto",padding:16,minHeight:245}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-end",flexWrap:"wrap",marginBottom:9}}>
              <div><p className={styles.eyebrow} style={{marginBottom:3}}>Usuarios</p><h2 style={{margin:"0 0 2px"}}>{selectedRetailer ? selectedRetailer.trade_name : "Selecciona una agencia"}</h2><p className={styles.helper} style={{margin:0}}>{selectedRetailer ? `${selectedRetailer.legal_name} · ${selectedRetailer.tax_id}` : "La lista de usuarios aparecerá aquí."}</p></div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>{agencyCapacity ? <span className={styles.pending}>{agencyCapacity.active}/{agencyCapacity.limit} activos</span> : null}{selectedRetailer ? <span style={{fontSize:12,color:"#6d7887"}}>Página {userPage} de {userPages}</span> : null}</div>
            </div>
            {agencyMessage ? <p className={styles.helper}>{agencyMessage}</p> : null}
            {selectedRetailer && !agencyMessage ? <>
              <div style={{overflowX:"auto"}}><table style={gridTable}><thead><tr><th style={{...gridTh,width:"24%"}}>Usuario</th><th style={{...gridTh,width:"16%"}}>Rol</th><th style={{...gridTh,width:"29%"}}>Correo</th><th style={{...gridTh,width:"20%"}}>Último inicio</th><th style={{...gridTh,width:"11%"}}>Estado</th></tr></thead><tbody>{pagedUsers.map((m) => <tr key={m.account_id}><td style={gridTd}><strong>{m.first_name} {m.last_name}</strong></td><td style={gridTd}>{m.member_role === "admin" ? "Administrador" : "Counter"}</td><td style={gridTd} title={m.email}>{m.email}</td><td style={gridTd}>{m.last_login_at ? new Date(m.last_login_at).toLocaleString("es-PE") : "Nunca"}</td><td style={gridTd}><span className={styles.status}>{m.display_status || m.status}</span></td></tr>)}</tbody></table></div>
              {agencyMembers.length===0?<p className={styles.helper}>Esta agencia no tiene usuarios registrados.</p>:<div style={pager}><span>{agencyMembers.length} usuarios · 5 por página</span><button style={pagerButton} disabled={userPage<=1} onClick={()=>setUserPage((p)=>Math.max(1,p-1))}>‹ Anterior</button><button style={pagerButton} disabled={userPage>=userPages} onClick={()=>setUserPage((p)=>Math.min(userPages,p+1))}>Siguiente ›</button></div>}
            </> : null}
          </section>
        </div> : null}

        {tab === "commissions" ? <>
          <section className={styles.card}><h2>Reglas globales</h2><p className={styles.helper}>Los cambios afectan nuevas comisiones y no recalculan operaciones históricas.</p><div className={styles.rateGrid}>{(["partner","sponsor","retailer"] as const).map((key) => <label key={key}><span>{key === "partner" ? "Partner directo" : key === "sponsor" ? "Sponsor directo" : "Agencia minorista"}</span><div><input min="0" max="100" step="0.1" type="number" value={rates[key]} onChange={(e) => setRates((v) => ({ ...v, [key]: Number(e.target.value) }))} /><b>%</b></div></label>)}</div><button className={styles.primary} disabled={busy === "rates"} onClick={saveRates}>{busy === "rates" ? "Guardando…" : "Guardar reglas"}</button></section>
          <section className={styles.card}><h2>Comisiones generadas</h2><div className={styles.tableWrap}><table><thead><tr><th>Reserva</th><th>Beneficiario</th><th>Base</th><th>Tasa</th><th>Comisión</th><th>Estado</th></tr></thead><tbody>{data.commissions.map((c) => <tr key={c.id}><td>{c.reference}</td><td>{c.beneficiary_type}</td><td>{money(c.base_amount,c.currency)}</td><td>{(c.rate*100).toFixed(1)}%</td><td><strong>{money(c.commission_amount,c.currency)}</strong></td><td><span className={styles.status}>{c.status}</span></td></tr>)}</tbody></table></div></section>
        </> : null}

        {tab === "audit" ? <section className={styles.card}><h2>Auditoría reciente</h2><p className={styles.helper}>Cambios administrativos registrados por Rumbo.</p><div className={styles.audit}>{data.audit.map((a, i) => <div key={`${a.entity_id}-${i}`}><span>{date(a.created_at)}</span><strong>{a.action}</strong><p>{a.actor} · {a.entity_type} {a.entity_id}</p></div>)}</div></section> : null}
      </section>
    </main>
  );
}
