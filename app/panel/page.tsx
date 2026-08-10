/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  LayoutDashboard,
  Link2,
  ReceiptText,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./panel.module.css";

type MoneyMap = Record<string, number>;

type PartnerDashboard = {
  profile: {
    first_name: string;
    last_name: string;
    referral_code: string;
    membership_status: string;
    commission_rate: number;
    sponsor_rate: number;
  };
  metrics: {
    reservations: number;
    confirmed_sales: number;
    direct_network: number;
    sold_amounts: MoneyMap;
    accumulated_commissions: MoneyMap;
    pending_commissions: MoneyMap;
  };
  reservations: Array<{
    reference: string;
    product_name: string;
    customer: string;
    status: string;
    payment_status: string;
    total_amount?: number | null;
    currency?: string | null;
    departure_date?: string | null;
    return_date?: string | null;
    created_at?: string | null;
  }>;
  sales: Array<{
    reference: string;
    customer?: string | null;
    product_name?: string | null;
    gross_amount: number;
    currency: string;
    payment_status: string;
    commission_amount?: number | null;
    commission_status?: string | null;
    attributed_at?: string | null;
  }>;
  network: Array<{
    account_id: string;
    name: string;
    referral_code?: string | null;
    status: string;
    joined_at?: string | null;
  }>;
};

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={styles.metricIcon}>
        <Icon aria-hidden="true" />
      </span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function money(amount: number, currency?: string | null) {
  if (!currency) return amount.toFixed(2);
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function moneyMap(values: MoneyMap) {
  const entries = Object.entries(values);
  if (entries.length === 0) return "Sin movimientos";
  return entries.map(([currency, amount]) => money(amount, currency)).join(" · ");
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    new: "Recibida",
    validating: "Validando",
    quoted: "Cotizada",
    payment_pending: "Pago pendiente",
    payment_failed: "Pago fallido",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    expired: "Vencida",
    pending: "Pendiente",
    approved: "Aprobada",
    paid: "Pagada",
    rejected: "Rechazada",
    reversed: "Revertida",
    refunded: "Reembolsada",
    active: "Activo",
  };
  return value ? labels[value] ?? value : "—";
}

export default function PanelPage() {
  const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/partner/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as PartnerDashboard & { message?: string };
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            window.location.href = "/acceso";
            return null;
          }
          throw new Error(payload.message || "No pudimos cargar tu portal.");
        }
        return payload;
      })
      .then((payload) => {
        if (active && payload) setDashboard(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "No pudimos cargar tu portal.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const referralUrl = useMemo(() => {
    if (!dashboard || typeof window === "undefined") return "";
    return `${window.location.origin}/?ref=${encodeURIComponent(dashboard.profile.referral_code)}`;
  }, [dashboard]);

  const copyReferral = async () => {
    if (!referralUrl) return;
    await navigator.clipboard?.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/">rumbo<span>.</span></a>
        </header>
        <section className={styles.workspace}>
          <article className={styles.card}>
            <div className={styles.cardTitle}>
              <span><ShieldCheck aria-hidden="true" /></span>
              <div><h3>Cargando tu portal</h3><p>Consultando ventas, reservas y comisiones en PostgreSQL.</p></div>
            </div>
          </article>
        </section>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/">rumbo<span>.</span></a>
        </header>
        <section className={styles.workspace}>
          <article className={styles.card}>
            <div className={styles.cardTitle}>
              <span><ShieldCheck aria-hidden="true" /></span>
              <div><h3>No pudimos cargar el portal</h3><p>{error || "Inténtalo nuevamente."}</p></div>
            </div>
          </article>
        </section>
      </main>
    );
  }

  const { profile, metrics, reservations, sales, network } = dashboard;
  const membershipLabel = statusLabel(profile.membership_status);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Volver al inicio de Rumbo">
          rumbo<span>.</span>
        </a>
        <nav aria-label="Navegación del portal">
          <a href="/">
            <ArrowLeft aria-hidden="true" />
            Volver a la tienda
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Portal del Partner</p>
          <h1>Tu negocio en Rumbo</h1>
          <p>Ventas, reservas, comisiones y red directa alimentadas desde PostgreSQL.</p>
        </div>
      </section>

      <section className={styles.workspace} aria-label="Portal del Partner">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Hola, {profile.first_name}</p>
            <h2>Resumen de tu actividad</h2>
          </div>
          <span className={styles.membership}>
            <BadgeCheck aria-hidden="true" />
            {membershipLabel}
          </span>
        </div>

        <div className={styles.metrics}>
          <MetricCard
            detail={`${metrics.reservations} reserva${metrics.reservations === 1 ? "" : "s"} atribuida${metrics.reservations === 1 ? "" : "s"}`}
            icon={ReceiptText}
            label="Ventas confirmadas"
            value={String(metrics.confirmed_sales)}
          />
          <MetricCard
            detail="Separado por moneda"
            icon={CircleDollarSign}
            label="Monto vendido"
            value={moneyMap(metrics.sold_amounts)}
          />
          <MetricCard
            detail={`Tasa vigente ${(profile.commission_rate * 100).toFixed(1)}%`}
            icon={ClipboardCheck}
            label="Comisión acumulada"
            value={moneyMap(metrics.accumulated_commissions)}
          />
          <MetricCard
            detail="Pendiente o aprobada, aún no pagada"
            icon={ShieldCheck}
            label="Comisión pendiente"
            value={moneyMap(metrics.pending_commissions)}
          />
        </div>

        <div className={styles.contentGrid}>
          <article className={`${styles.card} ${styles.referralCard}`}>
            <div className={styles.cardTitle}>
              <span><Link2 aria-hidden="true" /></span>
              <div>
                <h3>Tu enlace personal</h3>
                <p>Código real: {profile.referral_code}</p>
              </div>
            </div>
            <div className={styles.copyField}>
              <code>{referralUrl}</code>
              <button onClick={copyReferral} type="button">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className={styles.referralStats}>
              <span><strong>{metrics.reservations}</strong>reservas</span>
              <span><strong>{metrics.confirmed_sales}</strong>ventas</span>
              <span><strong>{metrics.direct_network}</strong>referidos directos</span>
            </div>
          </article>

          <article className={`${styles.card} ${styles.commissionCard}`}>
            <div className={styles.cardTitle}>
              <span><CircleDollarSign aria-hidden="true" /></span>
              <div>
                <h3>Comisión vigente</h3>
                <p>Regla global configurada por Rumbo.</p>
              </div>
            </div>
            <div className={styles.rate}>
              <strong>{(profile.commission_rate * 100).toFixed(1)}%</strong>
              <span>sobre ventas pagadas y atribuidas</span>
            </div>
            <ol className={styles.flow}>
              <li className={styles.done}>Reserva atribuida</li>
              <li className={styles.done}>Pago confirmado</li>
              <li>Comisión aprobada</li>
              <li>Pago de comisión registrado</li>
            </ol>
          </article>
        </div>

        <article className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <div>
              <h3>Ventas atribuidas</h3>
              <p>Ventas reales asociadas a {profile.referral_code}.</p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr><th>Reserva</th><th>Cliente</th><th>Paquete</th><th>Venta</th><th>Comisión</th><th>Estado</th></tr></thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={6}>Todavía no tienes ventas confirmadas atribuidas.</td></tr>
                ) : sales.map((sale) => (
                  <tr key={sale.reference}>
                    <td><strong>{sale.reference}</strong></td>
                    <td>{sale.customer || "—"}</td>
                    <td>{sale.product_name || "—"}</td>
                    <td>{money(sale.gross_amount, sale.currency)}</td>
                    <td><strong>{sale.commission_amount == null ? "—" : money(sale.commission_amount, sale.currency)}</strong></td>
                    <td><span className={`${styles.status} ${sale.commission_status === "paid" ? styles.paid : sale.commission_status === "pending" || sale.commission_status === "approved" ? styles.pending : ""}`}>{statusLabel(sale.commission_status || sale.payment_status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <div>
              <h3>Reservas atribuidas</h3>
              <p>Incluye reservas aún pendientes de pago o confirmación.</p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr><th>Referencia</th><th>Cliente</th><th>Paquete</th><th>Viaje</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>
                {reservations.length === 0 ? (
                  <tr><td colSpan={6}>Todavía no tienes reservas atribuidas.</td></tr>
                ) : reservations.map((booking) => (
                  <tr key={booking.reference}>
                    <td><strong>{booking.reference}</strong></td>
                    <td>{booking.customer}</td>
                    <td>{booking.product_name}</td>
                    <td>{booking.departure_date ? `${dateLabel(booking.departure_date)} → ${dateLabel(booking.return_date)}` : "—"}</td>
                    <td>{booking.total_amount == null ? "—" : money(booking.total_amount, booking.currency)}</td>
                    <td><span className={`${styles.status} ${booking.status === "payment_pending" ? styles.pending : booking.status === "confirmed" ? styles.paid : ""}`}>{statusLabel(booking.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <div>
              <h3>Red directa</h3>
              <p>Partners registrados directamente con tu código.</p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr><th>Partner</th><th>Código</th><th>Alta</th><th>Nivel</th><th>Estado</th></tr></thead>
              <tbody>
                {network.length === 0 ? (
                  <tr><td colSpan={5}>Todavía no tienes Partners directos en tu red.</td></tr>
                ) : network.map((member) => (
                  <tr key={member.account_id}>
                    <td><strong>{member.name}</strong></td>
                    <td>{member.referral_code || "—"}</td>
                    <td>{dateLabel(member.joined_at)}</td>
                    <td>Directo</td>
                    <td><span className={styles.status}>{statusLabel(member.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <footer className={styles.footer}>
        <span><UserRoundCheck aria-hidden="true" />Datos del Partner conectados a PostgreSQL.</span>
        <span><CalendarDays aria-hidden="true" />Actualizados al cargar el portal.</span>
      </footer>
    </main>
  );
}
