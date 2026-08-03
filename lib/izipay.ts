import { createHmac, timingSafeEqual } from "node:crypto";

const CHECKOUT_FIELDS = [
  "amount",
  "currency",
  "expires_at",
  "payment_id",
  "reference",
  "return_url",
  "webhook_url",
] as const;

const REFERENCE_PATTERN = /^RUM-\d{8}-[A-F0-9]{6}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class IzipayError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 422) {
    super(message);
    this.name = "IzipayError";
    this.code = code;
    this.status = status;
  }
}

export type SignedCheckout = {
  amount: string;
  currency: string;
  expiresAt: string;
  paymentId: string;
  reference: string;
  returnUrl: string;
  webhookUrl: string;
  signature: string;
};

export type NormalizedPaymentEvent = {
  event_id: string;
  event_type: string;
  booking_reference: string;
  provider_payment_id: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  amount: string;
  currency: string;
};

export type IzipayFormSession = {
  formToken: string;
  publicKey: string;
  resultUrl: string;
  paymentScriptUrl: string;
  themeScriptUrl: string;
  themeStylesheetUrl: string;
};

type JsonRecord = Record<string, unknown>;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new IzipayError(
      `Falta configurar ${name}.`,
      "configuration_missing",
      503,
    );
  }
  return value;
}

function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function secureHexEqual(expected: string, received: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{64}$/i.test(received)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function canonicalCheckoutPayload(params: URLSearchParams): string {
  const entries = CHECKOUT_FIELDS.map((field) => {
    const values = params.getAll(field);
    if (values.length !== 1 || !values[0]) {
      throw new IzipayError(
        "El enlace de pago está incompleto.",
        "invalid_checkout",
      );
    }
    return [field, values[0]] as [string, string];
  });

  return new URLSearchParams(entries.sort(([left], [right]) => left.localeCompare(right))).toString();
}

function requireSecureUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IzipayError(`${field} no contiene una URL válida.`, "invalid_checkout");
  }

  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new IzipayError(`${field} debe usar HTTPS.`, "invalid_checkout");
  }
  return url.toString();
}

export function verifySignedCheckout(
  params: URLSearchParams,
  secret = process.env.RUMBO_PAYMENT_CHECKOUT_SECRET?.trim(),
  now = new Date(),
): SignedCheckout {
  if (!secret) {
    throw new IzipayError(
      "El checkout de Rumbo todavía no está configurado.",
      "configuration_missing",
      503,
    );
  }

  const signature = params.get("signature")?.toLowerCase() ?? "";
  const canonical = canonicalCheckoutPayload(params);
  const expected = hmacHex(secret, canonical);
  if (!secureHexEqual(expected, signature)) {
    throw new IzipayError("El enlace de pago no superó la validación de seguridad.", "invalid_signature", 401);
  }

  const amount = params.get("amount") ?? "";
  const currency = (params.get("currency") ?? "").toUpperCase();
  const expiresAt = params.get("expires_at") ?? "";
  const paymentId = params.get("payment_id") ?? "";
  const reference = (params.get("reference") ?? "").toUpperCase();
  const returnUrl = requireSecureUrl(params.get("return_url") ?? "", "return_url");
  const webhookUrl = requireSecureUrl(params.get("webhook_url") ?? "", "webhook_url");

  if (!/^\d{1,10}\.\d{2}$/.test(amount) || Number(amount) <= 0) {
    throw new IzipayError("El monto del enlace de pago no es válido.", "invalid_checkout");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new IzipayError("La moneda del enlace de pago no es válida.", "invalid_checkout");
  }
  if (!UUID_PATTERN.test(paymentId) || !REFERENCE_PATTERN.test(reference)) {
    throw new IzipayError("La referencia del enlace de pago no es válida.", "invalid_checkout");
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new IzipayError("El bloqueo de precio y cupos ya venció.", "checkout_expired", 409);
  }

  return {
    amount,
    currency,
    expiresAt: expiry.toISOString(),
    paymentId,
    reference,
    returnUrl,
    webhookUrl,
    signature,
  };
}

export function toMinorUnits(amount: string): number {
  if (!/^\d{1,10}\.\d{2}$/.test(amount)) {
    throw new IzipayError("El monto no tiene el formato esperado.", "invalid_amount");
  }

  const [whole, fraction] = amount.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction);
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new IzipayError("El monto está fuera del rango permitido.", "invalid_amount");
  }
  return Number(minor);
}

function minorUnitsToAmount(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new IzipayError("Izipay no devolvió un monto válido.", "invalid_izipay_answer");
  }

  const minor = BigInt(raw);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function mapOrderStatus(
  status: string,
): NormalizedPaymentEvent["status"] | null {
  switch (status.toUpperCase()) {
    case "PAID":
      return "paid";
    case "UNPAID":
    case "REFUSED":
      return "failed";
    case "RUNNING":
    case "PARTIALLY_PAID":
      return "pending";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
      return "refunded";
    default:
      return null;
  }
}

export function normalizeIzipayAnswer(answerRaw: string): NormalizedPaymentEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answerRaw);
  } catch {
    throw new IzipayError("Izipay devolvió una respuesta ilegible.", "invalid_izipay_answer");
  }

  const answer = asRecord(parsed);
  const orderDetails = asRecord(answer.orderDetails);
  const transactions = Array.isArray(answer.transactions) ? answer.transactions : [];
  const transaction = asRecord(transactions[0]);

  const orderStatus = text(answer.orderStatus).toUpperCase();
  const status = mapOrderStatus(orderStatus);
  const reference = text(orderDetails.orderId || answer.orderId).toUpperCase();
  const providerPaymentId = text(transaction.uuid || answer.transactionUuid);
  const currency = text(transaction.currency || orderDetails.orderCurrency || answer.currency).toUpperCase();
  const amount = minorUnitsToAmount(
    transaction.amount ?? orderDetails.orderTotalAmount ?? answer.amount,
  );

  if (!status) {
    throw new IzipayError(
      `Izipay devolvió un estado no reconocido: ${orderStatus || "vacío"}.`,
      "unsupported_izipay_status",
      409,
    );
  }
  if (!REFERENCE_PATTERN.test(reference) || !providerPaymentId) {
    throw new IzipayError("La respuesta de Izipay no identifica la reserva.", "invalid_izipay_answer");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new IzipayError("Izipay devolvió una moneda inválida.", "invalid_izipay_answer");
  }

  return {
    event_id: `${providerPaymentId}:${orderStatus}`.slice(0, 160),
    event_type: `payment.${status}`,
    booking_reference: reference,
    provider_payment_id: providerPaymentId,
    status,
    amount,
    currency,
  };
}

export function verifyIzipayAnswerHash(
  answerRaw: string,
  receivedHash: string,
  secret = process.env.IZIPAY_HMAC_SHA256_KEY?.trim(),
): boolean {
  if (!secret) {
    throw new IzipayError(
      "Falta configurar IZIPAY_HMAC_SHA256_KEY.",
      "configuration_missing",
      503,
    );
  }
  return secureHexEqual(hmacHex(secret, answerRaw), receivedHash.toLowerCase());
}

function publicStorefrontUrl(): string {
  return requireSecureUrl(env("RUMBO_STOREFRONT_URL"), "RUMBO_STOREFRONT_URL").replace(/\/$/, "");
}

export async function createIzipayFormSession(
  checkout: SignedCheckout,
): Promise<IzipayFormSession> {
  const apiUrl = env("IZIPAY_API_URL").replace(/\/$/, "");
  const username = env("IZIPAY_USERNAME");
  const password = env("IZIPAY_PASSWORD");
  const publicKey = env("IZIPAY_PUBLIC_KEY");
  const customerEmail = env("IZIPAY_DEFAULT_CUSTOMER_EMAIL");
  const storefront = publicStorefrontUrl();

  const allowedCurrencies = new Set(
    (process.env.IZIPAY_ALLOWED_CURRENCIES || "PEN,USD")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
  if (!allowedCurrencies.has(checkout.currency)) {
    throw new IzipayError(
      `Izipay no está habilitado para ${checkout.currency}.`,
      "unsupported_currency",
      409,
    );
  }

  const response = await fetch(`${apiUrl}/api-payment/V4/Charge/CreatePayment`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: toMinorUnits(checkout.amount),
      currency: checkout.currency,
      orderId: checkout.reference,
      customer: {
        email: customerEmail,
        reference: checkout.reference,
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { answer?: { formToken?: string }; message?: string }
    | null;
  const formToken = payload?.answer?.formToken?.trim();
  if (!response.ok || !formToken) {
    throw new IzipayError(
      "Izipay no pudo iniciar el pago. Inténtalo nuevamente.",
      "izipay_session_failed",
      502,
    );
  }

  const staticBase = (
    process.env.IZIPAY_STATIC_BASE_URL ||
    "https://static.micuentaweb.pe/static/js/krypton-client/V4.0"
  ).replace(/\/$/, "");

  return {
    formToken,
    publicKey,
    resultUrl: `${storefront}/api/payments/izipay/result`,
    paymentScriptUrl: `${staticBase}/stable/kr-payment-form.min.js`,
    themeScriptUrl: `${staticBase}/ext/classic.js`,
    themeStylesheetUrl: `${staticBase}/ext/classic.css`,
  };
}

export async function forwardIzipayEvent(
  event: NormalizedPaymentEvent,
): Promise<void> {
  const apiUrl = env("SPREE_API_URL").replace(/\/$/, "");
  const secret =
    process.env.RUMBO_PAYMENT_WEBHOOK_SECRET_IZIPAY?.trim() ||
    process.env.RUMBO_PAYMENT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new IzipayError(
      "Falta configurar el secreto interno del webhook Izipay.",
      "configuration_missing",
      503,
    );
  }

  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = hmacHex(secret, `${timestamp}.${body}`);
  const response = await fetch(`${apiUrl}/api/v3/store/payment_webhooks/izipay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Rumbo-Timestamp": timestamp,
      "X-Rumbo-Signature": signature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new IzipayError(
      "El pago fue recibido, pero Rumbo todavía no pudo sincronizarlo.",
      "payment_sync_failed",
      502,
    );
  }
}

export async function processIzipayCallback(
  answerRaw: string,
  receivedHash: string,
): Promise<NormalizedPaymentEvent> {
  if (!verifyIzipayAnswerHash(answerRaw, receivedHash)) {
    throw new IzipayError("La firma de Izipay no es válida.", "invalid_izipay_hash", 401);
  }

  const event = normalizeIzipayAnswer(answerRaw);
  await forwardIzipayEvent(event);
  return event;
}
