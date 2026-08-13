import { ArrowLeft, Clock3, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { openIzipayCheckout, PaymentApiError } from "../../lib/rumbo-payment-api";
import IzipayPaymentForm from "./izipay-payment-form";
import styles from "./pagar.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"Pago seguro | Rumbo",description:"Completa el pago de tu reserva temporal con Izipay."};
type SearchParams=Record<string,string|string[]|undefined>;
type Props={searchParams:Promise<SearchParams>};
const formatMoney=(amount:string,currency:string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency,maximumFractionDigits:2}).format(Number(amount));
const formatExpiry=(value:string)=>new Intl.DateTimeFormat("es-PE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

export default async function PaymentPage({searchParams}:Props){
 const raw=await searchParams;let prepared:Awaited<ReturnType<typeof openIzipayCheckout>>|null=null,errorMessage="";
 try{prepared=await openIzipayCheckout(raw)}catch(error){errorMessage=error instanceof PaymentApiError?error.message:"No pudimos preparar el pago. Inténtalo nuevamente desde Mis reservas."}
 if(!prepared)return <main className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/">rumbo<span>.</span></Link></header><section className={styles.errorCard}><ShieldCheck aria-hidden="true"/><p className={styles.kicker}>Pago no disponible</p><h1>No pudimos abrir Izipay</h1><p>{errorMessage}</p><Link href="/reservas">Volver a Mis reservas</Link></section></main>;
 const {checkout,session}=prepared;
 return <main className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/">rumbo<span>.</span></Link><Link className={styles.back} href={checkout.returnUrl||"/reservas"}><ArrowLeft aria-hidden="true"/>Volver a reservas</Link></header><section className={styles.shell}><div className={styles.summary}><p className={styles.kicker}>Checkout seguro</p><h1>Completa el pago de tu viaje</h1><p className={styles.description}>Rumbo API validó la reserva, el monto y la vigencia del bloqueo antes de abrir el formulario seguro de Izipay.</p><dl className={styles.details}><div><dt>Reserva</dt><dd>{checkout.reference}</dd></div><div><dt>Total</dt><dd><CreditCard aria-hidden="true"/>{formatMoney(checkout.amount,checkout.currency)}</dd></div><div><dt>Disponible hasta</dt><dd><Clock3 aria-hidden="true"/>{formatExpiry(checkout.expiresAt)}</dd></div></dl><div className={styles.securityNote}><ShieldCheck aria-hidden="true"/><p>Rumbo no recibe ni almacena el número, CVV o fecha de vencimiento de tu tarjeta. Izipay procesa esos datos directamente.</p></div></div><div className={styles.paymentCard}><IzipayPaymentForm {...session}/><small>No cierres esta pantalla hasta que Izipay muestre el resultado del pago.</small></div></section></main>
}
