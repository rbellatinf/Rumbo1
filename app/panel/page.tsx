/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileClock,
  LayoutDashboard,
  Link2,
  Package,
  Plane,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import styles from "./panel.module.css";

type PanelView = "associate" | "admin";

const sales = [
  {
    order: "RUM-1048",
    customer: "Mariana Salazar",
    package: "Cusco esencial",
    amount: "S/ 2,498",
    commission: "S/ 149.88",
    status: "Confirmada",
  },
  {
    order: "RUM-1039",
    customer: "Luis Paredes",
    package: "Punta Cana total",
    amount: "US$ 1,498",
    commission: "US$ 89.88",
    status: "Por validar",
  },
  {
    order: "RUM-1027",
    customer: "Andrea Díaz",
    package: "Cartagena con encanto",
    amount: "US$ 1,158",
    commission: "US$ 69.48",
    status: "Pagada",
  },
];

const packages = [
  {
    name: "Cusco esencial",
    dates: "12–15 oct",
    quota: "14 cupos",
    price: "S/ 1,249",
    state: "Publicado",
  },
  {
    name: "Punta Cana total",
    dates: "3–8 nov",
    quota: "8 cupos",
    price: "US$ 749",
    state: "Publicado",
  },
  {
    name: "Cartagena con encanto",
    dates: "20–24 nov",
    quota: "12 cupos",
    price: "US$ 579",
    state: "Borrador",
  },
];

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

export default function PanelPage() {
  const [view, setView] = useState<PanelView>("associate");
  const [copied, setCopied] = useState(false);
  const [approvedOrders, setApprovedOrders] = useState<string[]>(["RUM-1027"]);
  const referralUrl = "https://rumbo.pe/viajes?ref=RUMBO-RBF";

  const copyReferral = async () => {
    await navigator.clipboard?.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const approveCommission = (order: string) => {
    setApprovedOrders((current) =>
      current.includes(order) ? current : [...current, order],
    );
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a
          className={styles.brand}
          href="/"
          aria-label="Volver al inicio de Rumbo"
        >
          rumbo<span>.</span>
        </a>
        <nav aria-label="Navegación del portal">
          <a href="/">
            <ArrowLeft aria-hidden="true" />
            Volver a la tienda
          </a>
          <a href="#configuracion">
            <Settings2 aria-hidden="true" />
            Configuración
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Rumbo · MVP 1</p>
          <h1>Centro de operación</h1>
          <p>
            Ventas, asociados, licencias y comisión directa en un solo lugar.
          </p>
        </div>
        <div className={styles.demoNotice}>
          <FileClock aria-hidden="true" />
          <span>
            <strong>Datos demostrativos</strong>
            Se conectarán al backend Spree.
          </span>
        </div>
      </section>

      <div className={styles.viewSwitch} role="tablist" aria-label="Vista del portal">
        <button
          aria-selected={view === "associate"}
          className={view === "associate" ? styles.active : ""}
          onClick={() => setView("associate")}
          role="tab"
          type="button"
        >
          <UserRoundCheck aria-hidden="true" />
          Portal del asociado
        </button>
        <button
          aria-selected={view === "admin"}
          className={view === "admin" ? styles.active : ""}
          onClick={() => setView("admin")}
          role="tab"
          type="button"
        >
          <BriefcaseBusiness aria-hidden="true" />
          Backoffice
        </button>
      </div>

      {view === "associate" ? (
        <section className={styles.workspace} aria-label="Portal del asociado">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Hola, Ricardo</p>
              <h2>Resumen de tu actividad</h2>
            </div>
            <span className={styles.membership}>
              <BadgeCheck aria-hidden="true" />
              Membresía activa
            </span>
          </div>

          <div className={styles.metrics}>
            <MetricCard
              detail="3 confirmadas este mes"
              icon={ReceiptText}
              label="Ventas atribuidas"
              value="12"
            />
            <MetricCard
              detail="+18% frente al mes anterior"
              icon={CircleDollarSign}
              label="Monto vendido"
              value="S/ 34,920"
            />
            <MetricCard
              detail="Comisión directa al 6%"
              icon={ClipboardCheck}
              label="Comisión acumulada"
              value="S/ 2,095.20"
            />
            <MetricCard
              detail="Próxima revisión: 2 ago"
              icon={ShieldCheck}
              label="Por aprobar"
              value="S/ 487.40"
            />
          </div>

          <div className={styles.contentGrid}>
            <article className={`${styles.card} ${styles.referralCard}`}>
              <div className={styles.cardTitle}>
                <span>
                  <Link2 aria-hidden="true" />
                </span>
                <div>
                  <h3>Tu enlace personal</h3>
                  <p>Las ventas iniciadas aquí se atribuyen a tu código.</p>
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
                <span>
                  <strong>184</strong>
                  visitas
                </span>
                <span>
                  <strong>21</strong>
                  solicitudes
                </span>
                <span>
                  <strong>12</strong>
                  ventas
                </span>
              </div>
            </article>

            <article className={`${styles.card} ${styles.commissionCard}`}>
              <div className={styles.cardTitle}>
                <span>
                  <CircleDollarSign aria-hidden="true" />
                </span>
                <div>
                  <h3>Comisión directa</h3>
                  <p>Único nivel incluido en el MVP 1.</p>
                </div>
              </div>
              <div className={styles.rate}>
                <strong>6%</strong>
                <span>sobre ventas confirmadas</span>
              </div>
              <ol className={styles.flow}>
                <li className={styles.done}>Venta registrada</li>
                <li className={styles.done}>Pago confirmado</li>
                <li>Comisión aprobada</li>
                <li>Pago registrado</li>
              </ol>
            </article>
          </div>

          <article className={styles.tableCard}>
            <div className={styles.tableHeading}>
              <div>
                <h3>Últimas ventas</h3>
                <p>Pedidos atribuidos al enlace RUMBO-RBF.</p>
              </div>
              <button type="button">
                Ver historial
                <ExternalLink aria-hidden="true" />
              </button>
            </div>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Paquete</th>
                    <th>Venta</th>
                    <th>Comisión</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.order}>
                      <td>
                        <strong>{sale.order}</strong>
                      </td>
                      <td>{sale.customer}</td>
                      <td>{sale.package}</td>
                      <td>{sale.amount}</td>
                      <td>
                        <strong>{sale.commission}</strong>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${
                            sale.status === "Pagada"
                              ? styles.paid
                              : sale.status === "Por validar"
                                ? styles.pending
                                : ""
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : (
        <section className={styles.workspace} aria-label="Backoffice de Rumbo">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Administración</p>
              <h2>Control del MVP 1</h2>
            </div>
            <button className={styles.primaryAction} type="button">
              <Package aria-hidden="true" />
              Nuevo paquete
            </button>
          </div>

          <div className={styles.metrics}>
            <MetricCard
              detail="2 publicados · 1 borrador"
              icon={Plane}
              label="Paquetes"
              value="3"
            />
            <MetricCard
              detail="8 requieren validación"
              icon={ReceiptText}
              label="Pedidos"
              value="27"
            />
            <MetricCard
              detail="38 con membresía activa"
              icon={Users}
              label="Asociados"
              value="42"
            />
            <MetricCard
              detail="Pendientes de aprobación"
              icon={CircleDollarSign}
              label="Comisiones"
              value="S/ 1,486"
            />
          </div>

          <div className={styles.contentGrid}>
            <article className={styles.tableCard}>
              <div className={styles.tableHeading}>
                <div>
                  <h3>Comisiones por revisar</h3>
                  <p>Se calculan cuando el pago del pedido es confirmado.</p>
                </div>
              </div>
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Asociado</th>
                      <th>Base</th>
                      <th>6%</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => {
                      const approved = approvedOrders.includes(sale.order);
                      return (
                        <tr key={sale.order}>
                          <td>
                            <strong>{sale.order}</strong>
                          </td>
                          <td>Ricardo Bellatin</td>
                          <td>{sale.amount}</td>
                          <td>
                            <strong>{sale.commission}</strong>
                          </td>
                          <td>
                            <button
                              className={styles.approveButton}
                              disabled={approved}
                              onClick={() => approveCommission(sale.order)}
                              type="button"
                            >
                              <Check aria-hidden="true" />
                              {approved ? "Aprobada" : "Aprobar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={`${styles.card} ${styles.auditCard}`}>
              <div className={styles.cardTitle}>
                <span>
                  <ClipboardCheck aria-hidden="true" />
                </span>
                <div>
                  <h3>Control básico</h3>
                  <p>Actividad administrativa reciente.</p>
                </div>
              </div>
              <ul>
                <li>
                  <span>RB</span>
                  <p>
                    <strong>Comisión aprobada</strong>
                    Pedido RUM-1027 · hace 2 h
                  </p>
                </li>
                <li>
                  <span>MC</span>
                  <p>
                    <strong>Pago confirmado</strong>
                    Pedido RUM-1048 · hace 4 h
                  </p>
                </li>
                <li>
                  <span>RB</span>
                  <p>
                    <strong>Paquete actualizado</strong>
                    Cusco esencial · ayer
                  </p>
                </li>
              </ul>
            </article>
          </div>

          <article className={styles.tableCard}>
            <div className={styles.tableHeading}>
              <div>
                <h3>Catálogo de paquetes</h3>
                <p>Productos que luego se administrarán desde Spree.</p>
              </div>
              <button type="button">
                Exportar CSV
                <ExternalLink aria-hidden="true" />
              </button>
            </div>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Paquete</th>
                    <th>Fechas</th>
                    <th>Disponibilidad</th>
                    <th>Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((item) => (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.dates}</td>
                      <td>{item.quota}</td>
                      <td>
                        <strong>{item.price}</strong>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${
                            item.state === "Borrador" ? styles.pending : ""
                          }`}
                        >
                          {item.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      <footer className={styles.footer} id="configuracion">
        <span>
          <ShieldCheck aria-hidden="true" />
          MVP 1: comisión directa de un solo nivel.
        </span>
        <span>Sin emisión automática ni distribución multinivel.</span>
      </footer>
    </main>
  );
}
