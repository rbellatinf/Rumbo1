"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  BOOKING_STATUS_LABELS,
  type BookingRecord,
} from "../../lib/booking-requests";
import styles from "./reservas.module.css";

function formatDate(value?: string | null) {
  if (!value) return "Por confirmar";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function ReservationsPage() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setBooking(null);
    setIsLoading(true);

    try {
      const query = new URLSearchParams({
        reference: reference.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
      });
      const response = await fetch(`/api/reservations?${query.toString()}`);
      const result = (await response.json()) as {
        booking?: BookingRecord;
        message?: string;
      };

      if (!response.ok || !result.booking) {
        throw new Error(result.message || "No pudimos consultar la solicitud.");
      }

      setBooking(result.booking);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos consultar la solicitud.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          rumbo<span>.</span>
        </Link>
        <Link className={styles.back} href="/">
          <ArrowLeft aria-hidden="true" />
          Volver a viajes
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p>Seguimiento de reservas</p>
          <h1>Consulta tu solicitud</h1>
          <span>
            Usa la referencia que recibiste y el correo del viajero principal.
            Mostramos únicamente el estado, sin exponer tus datos personales.
          </span>
        </div>

        <form className={styles.form} onSubmit={lookup}>
          <label>
            <span>Referencia</span>
            <div>
              <Search aria-hidden="true" />
              <input
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setReference(event.target.value.toUpperCase())}
                pattern="RUM-[0-9]{8}-[A-F0-9]{6}"
                placeholder="RUM-20260803-A1B2C3"
                required
                value={reference}
              />
            </div>
          </label>
          <label>
            <span>Correo</span>
            <div>
              <Mail aria-hidden="true" />
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@correo.com"
                required
                type="email"
                value={email}
              />
            </div>
          </label>
          <button disabled={isLoading} type="submit">
            {isLoading ? (
              <LoaderCircle aria-hidden="true" className={styles.spinner} />
            ) : (
              <Search aria-hidden="true" />
            )}
            {isLoading ? "Consultando…" : "Consultar estado"}
          </button>
          {message ? <p role="alert">{message}</p> : null}
        </form>
      </section>

      {booking ? (
        <section className={styles.result} aria-live="polite">
          <div className={styles.resultHeading}>
            <span>
              <CheckCircle2 aria-hidden="true" />
            </span>
            <div>
              <p>{booking.reference}</p>
              <h2>{BOOKING_STATUS_LABELS[booking.status]}</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>Paquete</dt>
              <dd>{booking.product_name}</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd>{booking.country || "Por confirmar"}</dd>
            </div>
            <div>
              <dt>Salida preferida</dt>
              <dd>
                <CalendarDays aria-hidden="true" />
                {formatDate(booking.departure_date)}
              </dd>
            </div>
            <div>
              <dt>Viajeros</dt>
              <dd>
                {booking.adults} adulto{booking.adults === 1 ? "" : "s"}
                {booking.children
                  ? ` · ${booking.children} niño${booking.children === 1 ? "" : "s"}`
                  : ""}
              </dd>
            </div>
          </dl>
          <div className={styles.notice}>
            <ShieldCheck aria-hidden="true" />
            <p>
              <strong>Aún no se realizó ningún cobro.</strong>
              Un asesor confirmará disponibilidad, tarifa y condiciones antes
              de solicitar el pago.
            </p>
          </div>
        </section>
      ) : (
        <section className={styles.empty}>
          <ShieldCheck aria-hidden="true" />
          <p>
            La referencia y el correo deben coincidir para proteger la
            información de la solicitud.
          </p>
        </section>
      )}
    </main>
  );
}
