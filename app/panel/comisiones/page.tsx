"use client";

import {
  ArrowLeft,
  BadgePercent,
  Building2,
  Check,
  CircleDollarSign,
  Network,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import styles from "./comisiones.module.css";

type CommissionKey = "partner" | "sponsor" | "retailer";

type CommissionState = Record<CommissionKey, number>;

const defaults: CommissionState = {
  partner: 6,
  sponsor: 0,
  retailer: 0,
};

const cards = [
  {
    key: "partner" as const,
    title: "Comisión directa del Partner",
    icon: UserRound,
    helper:
      "Porcentaje que recibe el Partner que originó la venta con su enlace o código personal. Se calcula sobre la base comisionable de una venta pagada y confirmada.",
    example: "Ejemplo: venta S/ 1,000 · 6% = S/ 60 para el Partner.",
  },
  {
    key: "sponsor" as const,
    title: "Comisión por referido",
    icon: Network,
    helper:
      "Porcentaje adicional para el Partner que invitó directamente al vendedor. En el MVP solo aplica a un nivel hacia arriba y nunca reemplaza la comisión directa del vendedor.",
    example: "Ejemplo: venta S/ 1,000 · 1% = S/ 10 para el sponsor directo.",
  },
  {
    key: "retailer" as const,
    title: "Comisión de Agencia minorista",
    icon: Building2,
    helper:
      "Porcentaje que corresponde a una agencia minorista cuando la reserva se atribuye a esa agencia. Se liquida a la empresa, no al usuario individual que registró la venta.",
    example: "Ejemplo: venta S/ 1,000 · 4% = S/ 40 para la agencia.",
  },
];

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function CommissionSettingsPage() {
  const [values, setValues] = useState<CommissionState>(defaults);
  const [savedValues, setSavedValues] = useState<CommissionState>(defaults);
  const [saved, setSaved] = useState(false);

  const changed = useMemo(
    () => Object.keys(values).some((key) => values[key as CommissionKey] !== savedValues[key as CommissionKey]),
    [savedValues, values],
  );

  function change(key: CommissionKey, rawValue: string) {
    const value = rawValue === "" ? 0 : clampPercent(Number(rawValue));
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedValues(values);
    setSaved(true);
  }

  const totalPotential = values.partner + values.sponsor;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Rumbo, inicio">
          rumbo<span>.</span>
        </a>
        <a className={styles.back} href="/panel">
          <ArrowLeft aria-hidden="true" />
          Volver al backoffice
        </a>
      </header>

      <div className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Configuración · Comisiones</p>
            <h1>Reglas de comisión</h1>
            <p className={styles.lead}>
              Define los porcentajes comerciales que Rumbo utilizará para calcular nuevas comisiones.
            </p>
          </div>
          <span className={styles.statusBadge}>
            <ShieldCheck aria-hidden="true" />
            Configuración mayorista
          </span>
        </div>

        <form className={styles.form} onSubmit={submit}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Porcentajes generales</h2>
                <p>
                  Estos valores funcionan como regla base. Más adelante podremos permitir excepciones por Partner, agencia, campaña o producto.
                </p>
              </div>
              <BadgePercent aria-hidden="true" />
            </div>

            <div className={styles.ruleList}>
              {cards.map(({ key, title, icon: Icon, helper, example }) => (
                <div className={styles.rule} key={key}>
                  <div className={styles.ruleIcon}>
                    <Icon aria-hidden="true" />
                  </div>
                  <div className={styles.ruleCopy}>
                    <label htmlFor={`commission-${key}`}>{title}</label>
                    <p>{helper}</p>
                    <small>{example}</small>
                  </div>
                  <div className={styles.percentField}>
                    <input
                      aria-label={`${title}, porcentaje`}
                      id={`commission-${key}`}
                      inputMode="decimal"
                      max="100"
                      min="0"
                      onChange={(event) => change(key, event.target.value)}
                      step="0.1"
                      type="number"
                      value={values[key]}
                    />
                    <span>%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Cómo se aplican</h2>
                <p>Resumen simple antes de guardar la configuración.</p>
              </div>
              <CircleDollarSign aria-hidden="true" />
            </div>

            <div className={styles.summaryGrid}>
              <div>
                <span>Venta de Partner</span>
                <strong>{values.partner.toFixed(1)}%</strong>
                <small>Para quien originó y cerró la venta.</small>
              </div>
              <div>
                <span>Referido directo</span>
                <strong>{values.sponsor.toFixed(1)}%</strong>
                <small>Solo si el vendedor tiene sponsor activo.</small>
              </div>
              <div>
                <span>Agencia minorista</span>
                <strong>{values.retailer.toFixed(1)}%</strong>
                <small>Solo en ventas atribuidas a una agencia.</small>
              </div>
            </div>

            <div className={styles.notice}>
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Una venta de Partner podría distribuir hasta {totalPotential.toFixed(1)}%</strong>
                <p>
                  Corresponde a comisión directa + referido. La comisión de agencia es un canal distinto y no se suma automáticamente a una venta de Partner.
                </p>
              </div>
            </div>
          </section>

          <div className={styles.actions}>
            <p>
              {saved ? (
                <span className={styles.saved}><Check aria-hidden="true" /> Configuración guardada en esta sesión.</span>
              ) : changed ? (
                "Tienes cambios sin guardar."
              ) : (
                "No hay cambios pendientes."
              )}
            </p>
            <div>
              <button
                className={styles.secondary}
                disabled={!changed}
                onClick={() => {
                  setValues(savedValues);
                  setSaved(false);
                }}
                type="button"
              >
                Descartar
              </button>
              <button className={styles.primary} disabled={!changed} type="submit">
                <Save aria-hidden="true" />
                Guardar cambios
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
