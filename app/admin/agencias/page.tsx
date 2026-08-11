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

type Overview = {
  retailers?: Retailer[];
  metrics?: { retailers?: number; retailers_pending?: number };
  message?: string;
};

export default function AgenciesAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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
          <p style={{ margin: 0, color: "#6e798b" }}>Agencias registradas en Rumbo, usuarios asociados y estado comercial.</p>
        </header>

        {error ? <div style={{ padding: 14, border: "1px solid #f0b7b7", background: "#fff5f5", color: "#8e2d2d", borderRadius: 10, marginBottom: 18 }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 18 }}>
          <article style={card}><span style={muted}>Agencias</span><strong style={metric}>{data?.metrics?.retailers ?? data?.retailers?.length ?? "—"}</strong></article>
          <article style={card}><span style={muted}>Pendientes</span><strong style={metric}>{data?.metrics?.retailers_pending ?? "—"}</strong></article>
          <article style={card}><span style={muted}>Usuarios totales</span><strong style={metric}>{data?.retailers?.reduce((n, r) => n + Number(r.member_count || 0), 0) ?? "—"}</strong></article>
        </div>

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <div><h2 style={{ margin: 0 }}>Agencias registradas</h2><p style={{ margin: "6px 0 0", color: "#718095" }}>Busca por nombre, razón social, RUC o correo.</p></div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agencia" style={{ width: "min(360px,100%)", padding: "10px 12px", border: "1px solid #d5dae0", borderRadius: 9 }} />
          </div>

          {!data && !error ? <p style={{ color: "#718095" }}>Cargando agencias…</p> : null}
          {data ? <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>{["Agencia", "RUC", "Contacto", "Usuarios", "Estado", "Gestión"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {retailers.map((r) => <tr key={r.id}>
                  <td style={td}><strong>{r.trade_name}</strong><small style={small}>{r.legal_name}</small></td>
                  <td style={td}>{r.tax_id}</td>
                  <td style={td}>{r.contact_email || "—"}<small style={small}>{r.phone || ""}</small></td>
                  <td style={td}>{r.member_count}</td>
                  <td style={td}><span style={{ padding: "6px 9px", borderRadius: 999, background: "#eef3f7", fontWeight: 800 }}>{r.status}</span></td>
                  <td style={td}><Link href="/admin/agencias/usuarios" style={{ color: "#123d64", fontWeight: 800, textDecoration: "none" }}>Ver usuarios</Link></td>
                </tr>)}
              </tbody>
            </table>
            {!retailers.length ? <p style={{ color: "#718095" }}>No hay agencias que coincidan con la búsqueda.</p> : null}
          </div> : null}
        </section>
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: "white", border: "1px solid #e1e6ec", borderRadius: 16, padding: 20, boxShadow: "0 10px 28px rgba(24,45,70,.05)" };
const muted: React.CSSProperties = { color: "#718095", fontSize: 13, fontWeight: 700 };
const metric: React.CSSProperties = { display: "block", fontSize: 28, marginTop: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e7ebef", color: "#718095", fontSize: 12 };
const td: React.CSSProperties = { padding: "13px 12px", borderBottom: "1px solid #edf0f3", fontSize: 14, verticalAlign: "top" };
const small: React.CSSProperties = { display: "block", marginTop: 4, color: "#7d8796" };
