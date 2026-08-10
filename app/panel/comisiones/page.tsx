"use client";

import {
  ArrowLeft,
  BadgePercent,
  Building2,
  Check,
  CircleDollarSign,
  LoaderCircle,
  Network,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./comisiones.module.css";

type CommissionKey = "partner" | "sponsor" | "retailer";
type CommissionState = Record<CommissionKey, number>;

type CommissionApiPayload = {
  partner_rate?: number;
  sponsor_rate?: number;
  retailer_rate?: number;
  updated_at?: string;
  message?: string;
};

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

function fromApi(payload: CommissionApiPayload): CommissionState {
  return {
    partner: clampPercent((payload.partner_rate ?? 0.06) * 100),
    sponsor: clampPercent((payload.sponsor_rate ?? 0) * 100),
    retailer: clampPercent((payload.retailer_rate ?? 0) * 100),
  };
}

export default function CommissionSettingsPage() {
  const [values, setValues] = useState<CommissionState>(defaults);
  const [savedValues, setSavedValues] = useState<CommissionState>(defaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/commission-settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as CommissionApiPayload;
        if (!response.ok) throw new Error(payload.message || "No pudimos cargar las comisiones.");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const loaded = fromApi(payload);
        setValues(loaded);
        setSavedValues(loaded);
        setUpdatedAt(payload.updated_at ?? null);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "No pudimos cargar las comisiones.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const changed = useMemo(
    () => Object.keys(values).some((key) => values[key as CommissionKey] !== savedValues[key as CommissionKey]),
    [savedValues, values],
  );

  function change(key: CommissionKey, rawValue: string) {
    const value = rawValue === "" ? 0 : clampPercent(Number(rawValue));
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/commission-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_rate: values.partner / 100,
          sponsor_rate: values.sponsor / 100,
          retailer_rate: values.retailer / 100,
        }),
      });
      const payload = (await response.json()) as CommissionApiPayload;
      if (!response.ok) throw new Error(payload.message || "No pudimos guardar las comisiones.");

      const persisted = fromApi(payload);
      setValues(persisted);
      setSavedValues(persisted);
      setUpdatedAt(payload.updated_at ?? null);
      setSaved(true);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "No pudimos guardar las comisiones.");
    } finally {
      setIsSaving(false);
    }
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
            PostgreSQL conectado
          </span>
        </div>

        {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}

        <form className={styles.form} onSubmit={submit}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Porcentajes generales</h2>
                <p>
                  Estos valores funcionan como regla base y se guardan en PostgreSQL. Los cambios aplican a nuevas comisiones; no recalculan comisiones históricas ya generadas.
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
                      disabled={isLoading || isSaving}
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
              {isLoading ? (
                "Cargando configuración desde PostgreSQL…"
              ) : isSaving ? (
                "Guardando en PostgreSQL…"
              ) : saved ? (
                <span className={styles.saved}><Check aria-hidden="true" /> Configuración guardada en PostgreSQL.</span>
              ) : changed ? (
                "Tienes cambios sin guardar."
              ) : updatedAt ? (
                `Última actualización: ${new Date(updatedAt).toLocaleString("es-PE")}`
              ) : (
                "No hay cambios pendientes."
              )}
            </p>
            <div>
              <button
                className={styles.secondary}
                disabled={!changed || isLoading || isSaving}
                onClick={() => {
                  setValues(savedValues);
                  setSaved(false);
                  setError("");
                }}
                type="button"
              >
                Descartar
              </button>
              <button className={styles.primary} disabled={!changed || isLoading || isSaving} type="submit">
                {isSaving ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : <Save aria-hidden="true" />}
                {isSaving ? "Guardando" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
