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


export type PassengerType = "adult" | "child";

export type BookingTraveller = {
  passengerType: PassengerType;
  firstName: string;
  lastName: string;
  documentType?: string;
  documentNumber?: string;
  nationalityCode?: string;
  dateOfBirth?: string;
};

export type BookingPolicySnapshot = {
  cancellation?: string | null;
  changes?: string | null;
  refund?: string | null;
  noShow?: string | null;
};

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
    details?: Record<string, unknown>;
    policies?: BookingPolicySnapshot;
  };
  trip: {
    originIata?: string;
    destinationIata?: string;
    departureDate?: string;
    returnDate?: string;
    adults: number;
    children: number;
  };
  travellers: BookingTraveller[];
  contact: {
    fullName: string;
    email: string;
    phone: string;
    channel: ContactChannel;
  };
  referralCode?: string;
  notes?: string;
  consent: boolean;
  policiesAccepted: boolean;
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
  pricing_snapshot?: Record<string, unknown>;
  policy_snapshot?: BookingPolicySnapshot;
  traveller_snapshot?: Array<Record<string, unknown>>;
  policies_accepted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferAvailability = {
  product_id: string;
  variant_id: string;
  departure_date: string;
  return_date: string;
  total_capacity: number;
  remaining_capacity: number;
  price_amount: number;
  taxes_amount?: number | null;
  suggested_price_amount?: number | null;
  price_display: string;
  total_amount: number;
  currency: string;
  bookable: boolean;
  hold_minutes: number;
  min_passengers_per_booking: number;
  max_passengers_per_booking: number;
  confirmation_mode: "confirmed" | "minimum_required";
  confirmation_label: string;
  sale_deadline?: string | null;
  policies: BookingPolicySnapshot;
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
  policies_accepted: true;
  travellers: Array<{
    passenger_type: PassengerType;
    first_name: string;
    last_name: string;
    document_type?: string;
    document_number?: string;
    nationality_code?: string;
    date_of_birth?: string;
  }>;
  product_snapshot: {
    image?: string;
    duration?: string;
    tag?: string;
    included: string[];
    details?: Record<string, unknown>;
    policies?: BookingPolicySnapshot;
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

function policySnapshot(value: unknown): BookingPolicySnapshot | undefined {
  const source = record(value);
  if (!source) return undefined;
  return {
    cancellation: optionalText(source.cancellation, 3000),
    changes: optionalText(source.changes, 3000),
    refund: optionalText(source.refund, 3000),
    noShow: optionalText(source.noShow ?? source.no_show, 3000),
  };
}


export function parseBookingInput(value: unknown): BookingRequestInput {
  const source = record(value);
  const product = record(source?.product);
  const trip = record(source?.trip);
  const contact = record(source?.contact);
  const fields: Record<string, string> = {};

  const idempotencyKey = cleanText(source?.idempotencyKey, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) fields.idempotencyKey = "La referencia técnica de la solicitud no es válida.";

  const productId = cleanText(product?.id, 80), productSlug = cleanText(product?.slug, 200), productName = cleanText(product?.name, 200);
  if (!productId) fields.product = "No pudimos identificar el producto.";
  if (!productSlug) fields.productSlug = "No pudimos identificar el paquete.";
  if (!productName) fields.productName = "El paquete no tiene un nombre válido.";

  const adults = integer(trip?.adults), children = integer(trip?.children);
  if (adults === null || adults < 1 || adults > 18) fields.adults = "Selecciona entre 1 y 18 adultos.";
  if (children === null || children < 0 || children > 17) fields.children = "Selecciona entre 0 y 17 niños.";
  if (adults !== null && children !== null && adults + children > 18) fields.travellers = "La reserva admite hasta 18 viajeros.";

  const departureDate = isoDate(trip?.departureDate), returnDate = isoDate(trip?.returnDate);
  if (trip?.departureDate && !departureDate) fields.departureDate = "La fecha de salida no es válida.";
  if (trip?.returnDate && !returnDate) fields.returnDate = "La fecha de regreso no es válida.";
  if (departureDate && returnDate && Date.parse(returnDate) <= Date.parse(departureDate)) fields.returnDate = "La fecha de regreso debe ser posterior a la salida.";

  const fullName = cleanText(contact?.fullName, 160), email = cleanText(contact?.email, 254).toLowerCase(), phone = cleanText(contact?.phone, 40), channel = cleanText(contact?.channel, 20) as ContactChannel;
  if (fullName.length < 2) fields.fullName = "Ingresa el nombre completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Ingresa un correo válido.";
  if (phone.replace(/\D/g, "").length < 7) fields.phone = "Ingresa un teléfono válido.";
  if (!(["whatsapp", "phone", "email"] as string[]).includes(channel)) fields.channel = "Selecciona cómo prefieres que te contactemos.";
  if (source?.consent !== true) fields.consent = "Debes aceptar el tratamiento de datos.";
  if (source?.policiesAccepted !== true) fields.policiesAccepted = "Debes aceptar las condiciones del viaje antes de pagar.";

  const rawTravellers = Array.isArray(source?.travellers) ? source.travellers : [];
  const expected = (adults ?? 0) + (children ?? 0);
  if (rawTravellers.length !== expected) fields.travellers = "Completa los datos de todos los viajeros.";
  const travellers: BookingTraveller[] = rawTravellers.flatMap((value,index) => {
    const item = record(value);
    if (!item) return [];
    const passengerType = cleanText(item.passengerType ?? item.passenger_type,20) as PassengerType;
    const firstName = cleanText(item.firstName ?? item.first_name,120), lastName = cleanText(item.lastName ?? item.last_name,120);
    const nationalityCode = optionalText(item.nationalityCode ?? item.nationality_code,2)?.toUpperCase();
    const dateOfBirth = isoDate(item.dateOfBirth ?? item.date_of_birth);
    if (!(["adult","child"] as string[]).includes(passengerType) || !firstName || !lastName || (nationalityCode && !/^[A-Z]{2}$/.test(nationalityCode))) {
      fields[`traveller${index+1}`] = `Revisa los datos del viajero ${index+1}.`;
      return [];
    }
    return [{
      passengerType, firstName, lastName,
      documentType: optionalText(item.documentType ?? item.document_type,30)?.toUpperCase(),
      documentNumber: optionalText(item.documentNumber ?? item.document_number,80)?.toUpperCase(),
      nationalityCode, dateOfBirth,
    }];
  });
  const adultTravellers = travellers.filter(item=>item.passengerType==="adult").length;
  const childTravellers = travellers.filter(item=>item.passengerType==="child").length;
  if (adults !== null && adultTravellers !== adults) fields.travellers = "Completa exactamente los adultos seleccionados.";
  if (children !== null && childTravellers !== children) fields.travellers = "Completa exactamente los niños seleccionados.";

  const website = cleanText(source?.website, 120);
  if (website) fields.website = "No se pudo validar el formulario.";
  if (Object.keys(fields).length > 0) throw new BookingValidationError(fields);

  const included = Array.isArray(product?.included)
    ? product.included.filter((item): item is string => typeof item === "string").map(item=>item.trim().slice(0,160)).filter(Boolean).slice(0,40)
    : [];

  return {
    idempotencyKey,
    product: {
      id: productId,
      variantId: optionalText(product?.variantId,80),
      slug: productSlug,
      name: productName,
      provider: optionalText(product?.provider,40),
      providerReference: optionalText(product?.providerReference,120),
      country: optionalText(product?.country,100),
      price: optionalText(product?.price,80),
      image: optionalText(product?.image,2000),
      duration: optionalText(product?.duration,100),
      tag: optionalText(product?.tag,80),
      included,
      details: record(product?.details) ?? undefined,
      policies: policySnapshot(product?.policies),
    },
    trip: {
      originIata: iata(trip?.originIata),
      destinationIata: iata(trip?.destinationIata),
      departureDate,
      returnDate,
      adults: adults as number,
      children: children as number,
    },
    travellers,
    contact: { fullName,email,phone,channel },
    referralCode: optionalText(source?.referralCode,40)?.toUpperCase(),
    notes: optionalText(source?.notes,1500),
    consent: true,
    policiesAccepted: true,
    website: undefined,
  };
}


export function toBookingApiPayload(booking: BookingRequestInput): BookingApiPayload {
  return {
    idempotency_key: booking.idempotencyKey,
    spree_product_id: booking.product.id,
    spree_variant_id: booking.product.variantId,
    product_slug: booking.product.slug,
    product_name: booking.product.name,
    provider: booking.product.provider ?? "Rumbo",
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
    policies_accepted: true,
    travellers: booking.travellers.map(item=>({
      passenger_type:item.passengerType,
      first_name:item.firstName,
      last_name:item.lastName,
      document_type:item.documentType,
      document_number:item.documentNumber,
      nationality_code:item.nationalityCode,
      date_of_birth:item.dateOfBirth,
    })),
    product_snapshot: {
      image: booking.product.image,
      duration: booking.product.duration,
      tag: booking.product.tag,
      included: booking.product.included ?? [],
      details: booking.product.details,
      policies: booking.product.policies,
    },
  };
}


export function parseBookingRecord(value: unknown): BookingRecord {
  const source = record(value);
  if (!source) throw new Error("La respuesta de reserva no es válida.");
  const reference = cleanText(source.reference,24), status = cleanText(source.status,20) as BookingStatus, productName = cleanText(source.product_name,200);
  const createdAt = cleanText(source.created_at,40), updatedAt = cleanText(source.updated_at,40), adults = integer(source.adults), children = integer(source.children);
  const channel = cleanText(source.contact_channel,20) as ContactChannel;
  if (!reference || !(BOOKING_STATUSES as readonly string[]).includes(status) || !productName || !createdAt || !updatedAt || adults===null || children===null || !(["whatsapp","phone","email"] as string[]).includes(channel)) throw new Error("La respuesta de reserva cambió de formato.");
  return {
    id:cleanText(source.id,40)||reference,reference,status,product_name:productName,country:optionalText(source.country,100),
    departure_date:optionalText(source.departure_date,10),return_date:optionalText(source.return_date,10),adults,children,contact_channel:channel,
    unit_price_amount:decimal(source.unit_price_amount),total_amount:decimal(source.total_amount),price_display:optionalText(source.price_display,80),
    currency:optionalText(source.currency,3),remaining_capacity:integer(source.remaining_capacity),payment_status:optionalText(source.payment_status,20),
    payment_url:optionalText(source.payment_url,2000),hold_expires_at:optionalText(source.hold_expires_at,40),
    pricing_snapshot:record(source.pricing_snapshot)??undefined,policy_snapshot:policySnapshot(source.policy_snapshot),
    traveller_snapshot:Array.isArray(source.traveller_snapshot)?source.traveller_snapshot.filter((item):item is Record<string,unknown>=>Boolean(record(item))):undefined,
    policies_accepted_at:optionalText(source.policies_accepted_at,40),created_at:createdAt,updated_at:updatedAt,
  };
}

export function parseOfferAvailability(value: unknown): OfferAvailability {
  const source = record(value);
  if (!source) throw new Error("La disponibilidad de la oferta no es válida.");
  const productId=cleanText(source.product_id,80),variantId=cleanText(source.variant_id,80),departureDate=isoDate(source.departure_date),returnDate=isoDate(source.return_date);
  const totalCapacity=integer(source.total_capacity),remainingCapacity=integer(source.remaining_capacity),priceAmount=decimal(source.price_amount);
  const taxesAmount=decimal(source.taxes_amount),suggestedPriceAmount=decimal(source.suggested_price_amount),totalAmount=decimal(source.total_amount);
  const priceDisplay=cleanText(source.price_display,80),currency=cleanText(source.currency,3).toUpperCase(),holdMinutes=integer(source.hold_minutes);
  const minPassengers=integer(source.min_passengers_per_booking),maxPassengers=integer(source.max_passengers_per_booking);
  const confirmationMode=cleanText(source.confirmation_mode,30) as OfferAvailability["confirmation_mode"],confirmationLabel=cleanText(source.confirmation_label,120);
  if (!productId || !variantId || !departureDate || !returnDate || totalCapacity===null || remainingCapacity===null || priceAmount===null || totalAmount===null || !priceDisplay || !/^[A-Z]{3}$/.test(currency) || typeof source.bookable!=="boolean" || holdMinutes===null || minPassengers===null || maxPassengers===null || !(["confirmed","minimum_required"] as string[]).includes(confirmationMode)) throw new Error("La disponibilidad de la oferta cambió de formato.");
  return {
    product_id:productId,variant_id:variantId,departure_date:departureDate,return_date:returnDate,total_capacity:totalCapacity,
    remaining_capacity:remainingCapacity,price_amount:priceAmount,taxes_amount:taxesAmount,suggested_price_amount:suggestedPriceAmount,
    price_display:priceDisplay,total_amount:totalAmount,currency,bookable:source.bookable,hold_minutes:holdMinutes,
    min_passengers_per_booking:minPassengers,max_passengers_per_booking:maxPassengers,confirmation_mode:confirmationMode,
    confirmation_label:confirmationLabel||"Salida confirmada",sale_deadline:optionalText(source.sale_deadline,40),
    policies:policySnapshot(source.policies)||{},
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
