export const BOOKING_STATUSES = [
  "new",
  "validating",
  "quoted",
  "payment_pending",
  "payment_failed",
  "confirmed",
  "cancelled",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type ContactChannel = "whatsapp" | "phone" | "email";

export type BookingRequestInput = {
  idempotencyKey: string;
  product: {
    id: string;
    variantId?: string;
    slug: string;
    name: string;
    provider?: string;
    providerReference?: string;
    country?: string;
    price?: string;
    image?: string;
    duration?: string;
    tag?: string;
    included?: string[];
  };
  trip: {
    originIata?: string;
    destinationIata?: string;
    departureDate?: string;
    returnDate?: string;
    adults: number;
    children: number;
  };
  contact: {
    fullName: string;
    email: string;
    phone: string;
    channel: ContactChannel;
  };
  referralCode?: string;
  notes?: string;
  consent: boolean;
  website?: string;
};

export type BookingRecord = {
  id: string;
  reference: string;
  status: BookingStatus;
  product_name: string;
  country?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  adults: number;
  children: number;
  contact_channel: ContactChannel;
  unit_price_amount?: number | null;
  total_amount?: number | null;
  price_display?: string | null;
  currency?: string | null;
  remaining_capacity?: number | null;
  payment_status?: string | null;
  payment_url?: string | null;
  hold_expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferAvailability = {
  product_id: string;
  variant_id?: string;
  departure_date: string;
  return_date: string;
  total_capacity: number;
  remaining_capacity: number;
  price_amount: number;
  price_display: string;
  currency: string;
  bookable: boolean;
  hold_minutes: number;
};

export type BookingApiPayload = {
  idempotency_key: string;
  spree_product_id: string;
  spree_variant_id?: string;
  product_slug: string;
  product_name: string;
  provider: string;
  provider_reference?: string;
  country?: string;
  origin_iata?: string;
  destination_iata?: string;
  departure_date?: string;
  return_date?: string;
  adults: number;
  children: number;
  price_display?: string;
  currency?: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_channel: ContactChannel;
  referral_code?: string;
  notes?: string;
  consent: true;
  product_snapshot: {
    image?: string;
    duration?: string;
    tag?: string;
    included: string[];
  };
};

export class BookingValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Revisa los datos de la solicitud.");
    this.name = "BookingValidationError";
    this.fields = fields;
  }
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function cleanText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum: number): string | undefined {
  const text = cleanText(value, maximum);
  return text || undefined;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function decimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function iata(value: unknown): string | undefined {
  const code = cleanText(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function isoDate(value: unknown): string | undefined {
  const date = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
    ? date
    : undefined;
}

function currencyFromPrice(price?: string): string | undefined {
  if (!price) return undefined;
  if (/\bUSD\b|US\$/i.test(price)) return "USD";
  if (/\bPEN\b|S\//i.test(price)) return "PEN";
  if (/\bEUR\b|€/i.test(price)) return "EUR";
  return undefined;
}

export function parseBookingInput(value: unknown): BookingRequestInput {
  const source = record(value);
  const product = record(source?.product);
  const trip = record(source?.trip);
  const contact = record(source?.contact);
  const fields: Record<string, string> = {};

  const idempotencyKey = cleanText(source?.idempotencyKey, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    fields.idempotencyKey = "La referencia técnica de la solicitud no es válida.";
  }

  const productId = cleanText(product?.id, 80);
  const productSlug = cleanText(product?.slug, 200);
  const productName = cleanText(product?.name, 200);
  if (!productId) fields.product = "No pudimos identificar el producto.";
  if (!productSlug) fields.productSlug = "No pudimos identificar el paquete.";
  if (!productName) fields.productName = "El paquete no tiene un nombre válido.";

  const adults = integer(trip?.adults);
  const children = integer(trip?.children);
  if (adults === null || adults < 1 || adults > 9) {
    fields.adults = "Selecciona entre 1 y 9 adultos.";
  }
  if (children === null || children < 0 || children > 9) {
    fields.children = "Selecciona entre 0 y 9 niños.";
  }

  const departureDate = isoDate(trip?.departureDate);
  const returnDate = isoDate(trip?.returnDate);
  if (trip?.departureDate && !departureDate) {
    fields.departureDate = "La fecha de salida no es válida.";
  }
  if (trip?.returnDate && !returnDate) {
    fields.returnDate = "La fecha de regreso no es válida.";
  }
  if (
    departureDate &&
    returnDate &&
    Date.parse(returnDate) <= Date.parse(departureDate)
  ) {
    fields.returnDate = "La fecha de regreso debe ser posterior a la salida.";
  }

  const fullName = cleanText(contact?.fullName, 160);
  const email = cleanText(contact?.email, 254).toLowerCase();
  const phone = cleanText(contact?.phone, 40);
  const channel = cleanText(contact?.channel, 20) as ContactChannel;
  if (fullName.length < 2) fields.fullName = "Ingresa el nombre completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email = "Ingresa un correo válido.";
  }
  if (phone.replace(/\D/g, "").length < 7) {
    fields.phone = "Ingresa un teléfono válido.";
  }
  if (!(["whatsapp", "phone", "email"] as string[]).includes(channel)) {
    fields.channel = "Selecciona cómo prefieres que te contactemos.";
  }

  if (source?.consent !== true) {
    fields.consent = "Debes aceptar el tratamiento de datos.";
  }

  const website = cleanText(source?.website, 120);
  if (website) fields.website = "No se pudo validar el formulario.";

  if (Object.keys(fields).length > 0) throw new BookingValidationError(fields);

  const included = Array.isArray(product?.included)
    ? product.included
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    idempotencyKey,
    product: {
      id: productId,
      variantId: optionalText(product?.variantId, 80),
      slug: productSlug,
      name: productName,
      provider: optionalText(product?.provider, 40),
      providerReference: optionalText(product?.providerReference, 120),
      country: optionalText(product?.country, 100),
      price: optionalText(product?.price, 80),
      image: optionalText(product?.image, 2_000),
      duration: optionalText(product?.duration, 100),
      tag: optionalText(product?.tag, 80),
      included,
    },
    trip: {
      originIata: iata(trip?.originIata),
      destinationIata: iata(trip?.destinationIata),
      departureDate,
      returnDate,
      adults: adults as number,
      children: children as number,
    },
    contact: {
      fullName,
      email,
      phone,
      channel,
    },
    referralCode: optionalText(source?.referralCode, 40)?.toUpperCase(),
    notes: optionalText(source?.notes, 1_500),
    consent: true,
    website: undefined,
  };
}

export function toBookingApiPayload(
  booking: BookingRequestInput,
): BookingApiPayload {
  return {
    idempotency_key: booking.idempotencyKey,
    spree_product_id: booking.product.id,
    spree_variant_id: booking.product.variantId,
    product_slug: booking.product.slug,
    product_name: booking.product.name,
    provider: booking.product.provider ?? "Spree",
    provider_reference: booking.product.providerReference,
    country: booking.product.country,
    origin_iata: booking.trip.originIata,
    destination_iata: booking.trip.destinationIata,
    departure_date: booking.trip.departureDate,
    return_date: booking.trip.returnDate,
    adults: booking.trip.adults,
    children: booking.trip.children,
    price_display: booking.product.price,
    currency: currencyFromPrice(booking.product.price),
    contact_name: booking.contact.fullName,
    contact_email: booking.contact.email,
    contact_phone: booking.contact.phone,
    contact_channel: booking.contact.channel,
    referral_code: booking.referralCode,
    notes: booking.notes,
    consent: true,
    product_snapshot: {
      image: booking.product.image,
      duration: booking.product.duration,
      tag: booking.product.tag,
      included: booking.product.included ?? [],
    },
  };
}

export function parseBookingRecord(value: unknown): BookingRecord {
  const source = record(value);
  if (!source) throw new Error("La respuesta de reserva no es válida.");

  const reference = cleanText(source.reference, 24);
  const status = cleanText(source.status, 20) as BookingStatus;
  const productName = cleanText(source.product_name, 200);
  const createdAt = cleanText(source.created_at, 40);
  const updatedAt = cleanText(source.updated_at, 40);
  const adults = integer(source.adults);
  const children = integer(source.children);
  const channel = cleanText(source.contact_channel, 20) as ContactChannel;
  const unitPriceAmount = decimal(source.unit_price_amount);
  const totalAmount = decimal(source.total_amount);
  const remainingCapacity = integer(source.remaining_capacity);

  if (
    !reference ||
    !(BOOKING_STATUSES as readonly string[]).includes(status) ||
    !productName ||
    !createdAt ||
    !updatedAt ||
    adults === null ||
    children === null ||
    !(["whatsapp", "phone", "email"] as string[]).includes(channel)
  ) {
    throw new Error("La respuesta de reserva cambió de formato.");
  }

  return {
    id: cleanText(source.id, 40) || reference,
    reference,
    status,
    product_name: productName,
    country: optionalText(source.country, 100),
    departure_date: optionalText(source.departure_date, 10),
    return_date: optionalText(source.return_date, 10),
    adults,
    children,
    contact_channel: channel,
    unit_price_amount: unitPriceAmount,
    total_amount: totalAmount,
    price_display: optionalText(source.price_display, 80),
    currency: optionalText(source.currency, 3),
    remaining_capacity: remainingCapacity,
    payment_status: optionalText(source.payment_status, 20),
    payment_url: optionalText(source.payment_url, 2_000),
    hold_expires_at: optionalText(source.hold_expires_at, 40),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function parseOfferAvailability(value: unknown): OfferAvailability {
  const source = record(value);
  if (!source) throw new Error("La disponibilidad de la oferta no es válida.");

  const productId = cleanText(source.product_id, 80);
  const departureDate = isoDate(source.departure_date);
  const returnDate = isoDate(source.return_date);
  const totalCapacity = integer(source.total_capacity);
  const remainingCapacity = integer(source.remaining_capacity);
  const priceAmount = decimal(source.price_amount);
  const priceDisplay = cleanText(source.price_display, 80);
  const currency = cleanText(source.currency, 3).toUpperCase();
  const holdMinutes = integer(source.hold_minutes);

  if (
    !productId ||
    !departureDate ||
    !returnDate ||
    totalCapacity === null ||
    remainingCapacity === null ||
    priceAmount === null ||
    !priceDisplay ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof source.bookable !== "boolean" ||
    holdMinutes === null
  ) {
    throw new Error("La disponibilidad de la oferta cambió de formato.");
  }

  return {
    product_id: productId,
    variant_id: optionalText(source.variant_id, 80),
    departure_date: departureDate,
    return_date: returnDate,
    total_capacity: totalCapacity,
    remaining_capacity: remainingCapacity,
    price_amount: priceAmount,
    price_display: priceDisplay,
    currency,
    bookable: source.bookable,
    hold_minutes: holdMinutes,
  };
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: "Recibida",
  validating: "Validando disponibilidad",
  quoted: "Cotización enviada",
  payment_pending: "Cupo reservado · pago pendiente",
  payment_failed: "Pago pendiente de reintento",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  expired: "Reserva temporal vencida",
};
