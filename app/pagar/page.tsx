import { ArrowLeft, Clock3, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  createIzipayFormSession,
  IzipayError,
  type IzipayFormSession,
  type SignedCheckout,
  verifySignedCheckout,
} from "../../lib/izipay";
import IzipayPaymentForm from "./izipay-payment-form";
import styles from "./pagar.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pago seguro | Rumbo",
  description: "Completa el pago de tu reserva temporal con Izipay.",
};

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<SearchParams>;
};

function toUrlSearchParams(source: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.append(key, value);
    }
  }
  return params;
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function PaymentPage({ searchParams }: Props) {
  const rawParams = await searchParams;
  let checkout: SignedCheckout | null = null;
  let session: IzipayFormSession | null = null;
  let errorMessage = "";

  try {
    checkout = verifySignedCheckout(toUrlSearchParams(rawParams));
    session = await createIzipayFormSession(checkout);
  } catch (error) {
    errorMessage =
      error instanceof IzipayError
        ? error.message
        : "No pudimos preparar el pago. Inténtalo nuevamente desde Mis reservas.";
  }

  if (!checkout || !session) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/">
            rumbo<span>.</span>
          </Link>
        </header>
        <section className={styles.errorCard}>
          <ShieldCheck aria-hidden="true" />
          <p className={styles.kicker}>Pago no disponible</p>
          <h1>No pudimos abrir Izipay</h1>
          <p>{errorMessage}</p>
          <Link href="/reservas">Volver a Mis reservas</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          rumbo<span>.</span>
        </Link>
        <Link className={styles.back} href={checkout.returnUrl}>
          <ArrowLeft aria-hidden="true" />
          Volver a reservas
        </Link>
      </header>

      <section className={styles.shell}>
        <div className={styles.summary}>
          <p className={styles.kicker}>Checkout seguro</p>
          <h1>Completa el pago de tu viaje</h1>
          <p className={styles.description}>
            El precio y los cupos están bloqueados temporalmente. El pago se
            procesa dentro del formulario seguro de Izipay.
          </p>

          <dl className={styles.details}>
            <div>
              <dt>Reserva</dt>
              <dd>{checkout.reference}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                <CreditCard aria-hidden="true" />
                {formatMoney(checkout.amount, checkout.currency)}
              </dd>
            </div>
            <div>
              <dt>Disponible hasta</dt>
              <dd>
                <Clock3 aria-hidden="true" />
                {formatExpiry(checkout.expiresAt)}
              </dd>
            </div>
          </dl>

          <div className={styles.securityNote}>
            <ShieldCheck aria-hidden="true" />
            <p>
              Rumbo no recibe ni almacena el número, CVV o fecha de vencimiento
              de tu tarjeta. Izipay procesa esos datos directamente.
            </p>
          </div>
        </div>

        <div className={styles.paymentCard}>
          <IzipayPaymentForm {...session} />
          <small>
            No cierres esta pantalla hasta que Izipay muestre el resultado del
            pago.
          </small>
        </div>
      </section>
    </main>
  );
}
