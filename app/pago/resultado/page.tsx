import { AlertTriangle, CheckCircle2, Clock3, Search } from "lucide-react";
import Link from "next/link";
import styles from "./resultado.module.css";

export const metadata = {
  title: "Resultado del pago | Rumbo",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "review";
  const reference =
    typeof params.reference === "string" ? params.reference.toUpperCase() : "";

  const paid = status === "paid";
  const failed = status === "failed";
  const pending = status === "pending";
  const Icon = paid ? CheckCircle2 : pending ? Clock3 : AlertTriangle;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          rumbo<span>.</span>
        </Link>
      </header>

      <section className={styles.card}>
        <span className={paid ? styles.success : pending ? styles.pending : styles.warning}>
          <Icon aria-hidden="true" />
        </span>
        <p className={styles.kicker}>Resultado Izipay</p>
        <h1>
          {paid
            ? "Pago confirmado"
            : failed
              ? "El pago no se completó"
              : pending
                ? "Pago en procesamiento"
                : "Pago en validación"}
        </h1>
        <p>
          {paid
            ? "Izipay validó el pago y Rumbo recibió la confirmación automática."
            : failed
              ? "Izipay informó que la operación no fue aprobada. Puedes revisar la reserva e intentar nuevamente mientras el cupo siga vigente."
              : pending
                ? "Izipay todavía está procesando la operación. Revisa el estado antes de intentar otro pago."
                : "No pudimos completar la validación automática. El pago podría haber sido procesado; no vuelvas a pagar hasta consultar la reserva."}
        </p>

        {reference ? (
          <div className={styles.reference}>
            <span>Referencia Rumbo</span>
            <strong>{reference}</strong>
          </div>
        ) : null}

        <Link className={styles.primary} href="/reservas">
          <Search aria-hidden="true" />
          Consultar mi reserva
        </Link>
        <Link className={styles.secondary} href="/">
          Volver a viajes
        </Link>
      </section>
    </main>
  );
}
