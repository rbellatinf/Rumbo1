"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Retailer = {
  id: string;
  legal_name: string;
  trade_name: string;
  tax_id: string;
  contact_email?: string;
  phone?: string;
  status: string;
  member_count: number;
  created_at: string;
};

type AgencyMember = {
  account_id: string;
  first_name: string;
  last_name: string;
  member_role: "admin" | "counter";
  email: string;
  status: string;
  display_status?: string;
  last_login_at?: string | null;
};

type Overview = {
  retailers?: Retailer[];
  metrics?: { retailers?: number; retailers_pending?: number };
  message?: string;
};

type AgencyDashboard = {
  retailer?: { id:string; trade_name:string; legal_name:string; tax_id:string; user_limit:number; inactivity_days:number };
  members?: AgencyMember[];
  user_capacity?: { active:number; total:number; limit:number };
  message?: string;
};

export default function AgenciesAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Retailer | null>(null);
  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [capacity, setCapacity] = useState<{active:number;total:number;limit:number}|null>(null);
  const [memberMessage, setMemberMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        const text = await response.text();
        const payload = text ? JSON.parse(text) as Overview : {};
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            window.location.replace("/admin/acceso");
            return;
          }
          throw new Error(payload.message || "No pudimos cargar las agencias.");
        }
        setData(payload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No pudimos cargar las agencias."));
  }, []);

  const retailers = useMemo(() => {
    const rows = data?.retailers || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.trade_name, r.legal_name, r.tax_id, r.contact_email].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [data, search]);

  async function selectAgency(agency: Retailer) {
    setSelected(agency);
    setMembers([]);
    setCapacity(null);
    setMemberMessage("Cargando usuarios…");
    try {
      const response = await fetch(`/api/admin/agencies/${agency.id}/users`, { cache:"no-store" });
      const text = await response.text();
      const payload = text ? JSON.parse(text) as AgencyDashboard : {};
      if (!response.ok) throw new Error(payload.message || "No pudimos cargar los usuarios de la agencia.");
      setMembers(payload.members || []);
      setCapacity(payload.user_capacity || null);
      setMemberMessage("");
    } catch (e) {
      setMemberMessage(e instanceof Error ? e.message : "No pudimos cargar los usuarios de la agencia.");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fa", padding: 34, color: "#17223b", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin" style={{ color: "#315e7b", textDecoration: "none", fontWeight: 800 }}>← Administración Rumbo</Link>
          <Link href="/admin/agencias/usuarios" style={{ background: "#123d64", color: "white", padding: "10px 14px", borderRadius: 10, textDecoration: "none", fontWeight: 800 }}>Usuarios y reactivaciones</Link>
        </div>

        <header style={{ margin: "24px 0" }}>
          <p style={{ margin: 0, color: "#177f93", fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>Agencias minoristas</p>
          <h1 style={{ margin: "7px 0", fontSize: 38 }}>Gestión de agencias</h1>
          <p style={{ margin: 0, color: "#6e798b" }}>Selecciona una agencia para revisar sus usuarios y actividad.</p>
        </header>

        {error ? <div style={{ padding: 14, border: "1px solid #f0b7b7", background: "#fff5f5", color: "#8e2d2d", borderRadius: 10, marginBottom: 18 }}>{error}</div> : null}

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <div><h2 style={{ margin: 0 }}>Lista de agencias</h2><p style={{ margin: "6px 0 0", color: "#718095" }}>Haz clic en una fila para seleccionarla.</p></div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agencia" style={{ width: "min(360px,100%)", padding: "10px 12px", border: "1px solid #d5dae0", borderRadius: 9 }} />
          </div>

          {!data && !error ? <p style={{ color: "#718095" }}>Cargando agencias…</p> : null}
          {data ? <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>{["Agencia", "RUC", "Contacto", "Usuarios", "Estado"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {retailers.map((r) => <tr key={r.id} onClick={() => selectAgency(r)} style={{ cursor:"pointer", background:selected?.id===r.id?"#eef5fb":"transparent" }}>
                  <td style={td}><strong>{r.trade_name}</strong><small style={small}>{r.legal_name}</small></td>
                  <td style={td}>{r.tax_id}</td>
                  <td style={td}>{r.contact_email || "—"}<small style={small}>{r.phone || ""}</small></td>
                  <td style={td}>{r.member_count}</td>
                  <td style={td}><span style={{ padding: "6px 9px", borderRadius: 999, background: "#eef3f7", fontWeight: 800 }}>{r.status}</span></td>
                </tr>)}
              </tbody>
            </table>
            {!retailers.length ? <p style={{ color: "#718095" }}>No hay agencias que coincidan con la búsqueda.</p> : null}
          </div> : null}
        </section>

        <section style={{ ...card, marginTop:20 }}>
          <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div>
              <p style={{margin:0,color:"#177f93",fontSize:12,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2}}>Usuarios</p>
              <h2 style={{margin:"6px 0 4px"}}>{selected ? selected.trade_name : "Selecciona una agencia"}</h2>
              {selected ? <p style={{margin:0,color:"#718095"}}>{selected.legal_name} · {selected.tax_id}</p> : <p style={{margin:0,color:"#718095"}}>La lista de usuarios aparecerá aquí.</p>}
            </div>
            {capacity ? <strong style={{padding:"8px 12px",borderRadius:999,background:"#fff2cb",color:"#765a00"}}>{capacity.active}/{capacity.limit} usuarios activos</strong> : null}
          </div>

          {memberMessage ? <p style={{color:"#718095",marginTop:18}}>{memberMessage}</p> : null}
          {selected && !memberMessage ? <div style={{overflowX:"auto",marginTop:18}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
              <thead><tr>{["Usuario","Rol","Correo","Último inicio","Estado"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{members.map(m=><tr key={m.account_id}><td style={td}><strong>{m.first_name} {m.last_name}</strong></td><td style={td}>{m.member_role==="admin"?"Administrador":"Counter"}</td><td style={td}>{m.email}</td><td style={td}>{m.last_login_at?new Date(m.last_login_at).toLocaleString("es-PE"):"Nunca"}</td><td style={td}><span style={{padding:"6px 9px",borderRadius:999,background:"#eef3f7",fontWeight:800}}>{m.display_status || m.status}</span></td></tr>)}</tbody>
            </table>
            {!members.length ? <p style={{color:"#718095"}}>Esta agencia no tiene usuarios registrados.</p> : null}
          </div> : null}
        </section>
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: "white", border: "1px solid #e1e6ec", borderRadius: 16, padding: 20, boxShadow: "0 10px 28px rgba(24,45,70,.05)" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e7ebef", color: "#718095", fontSize: 12 };
const td: React.CSSProperties = { padding: "13px 12px", borderBottom: "1px solid #edf0f3", fontSize: 14, verticalAlign: "top" };
const small: React.CSSProperties = { display: "block", marginTop: 4, color: "#7d8796" };
