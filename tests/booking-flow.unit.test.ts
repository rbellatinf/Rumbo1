import assert from "node:assert/strict";
import test from "node:test";

import {
  BookingValidationError,
  parseBookingInput,
  parseBookingRecord,
  parseOfferAvailability,
  toBookingApiPayload,
} from "../lib/booking-requests.ts";

const validBooking = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  product: {
    id: "prod_panama",
    variantId: "variant_panama",
    slug: "paquete-panama",
    name: "Paquete Panamá 5 días / 4 noches",
    provider: "Spree",
    providerReference: "prod_panama",
    country: "Panamá",
    price: "US$ 699",
    image: "https://images.example.test/panama.jpg",
    duration: "5 días / 4 noches",
    tag: "Caribe",
    included: ["Hotel", "Traslados"],
  },
  trip: {
    originIata: "lim",
    destinationIata: "pty",
    departureDate: "2026-09-14",
    returnDate: "2026-09-18",
    adults: 2,
    children: 1,
  },
  contact: {
    fullName: "  Ricardo Bellatin  ",
    email: " RICARDO@EXAMPLE.COM ",
    phone: "+51 999 999 999",
    channel: "whatsapp",
  },
  referralCode: " rumbo-rbf ",
  notes: "Habitación familiar",
  consent: true,
  website: "",
};

test("normalizes a complete booking request for PostgreSQL", () => {
  const booking = parseBookingInput(validBooking);
  const payload = toBookingApiPayload(booking);

  assert.equal(booking.contact.fullName, "Ricardo Bellatin");
  assert.equal(booking.contact.email, "ricardo@example.com");
  assert.equal(booking.trip.originIata, "LIM");
  assert.equal(booking.trip.destinationIata, "PTY");
  assert.equal(booking.referralCode, "RUMBO-RBF");
  assert.equal(payload.spree_product_id, "prod_panama");
  assert.equal(payload.currency, "USD");
  assert.deepEqual(payload.product_snapshot.included, ["Hotel", "Traslados"]);
});

test("rejects invalid contact, dates, consent, and honeypot values", () => {
  assert.throws(
    () =>
      parseBookingInput({
        ...validBooking,
        trip: {
          ...validBooking.trip,
          returnDate: validBooking.trip.departureDate,
          adults: 0,
        },
        contact: {
          ...validBooking.contact,
          email: "not-an-email",
          phone: "123",
        },
        consent: false,
        website: "https://spam.example",
      }),
    (error: unknown) => {
      assert.ok(error instanceof BookingValidationError);
      assert.deepEqual(Object.keys(error.fields).sort(), [
        "adults",
        "consent",
        "email",
        "phone",
        "returnDate",
        "website",
      ]);
      return true;
    },
  );
});

test("parses the public Spree booking response without exposing PII", () => {
  const booking = parseBookingRecord({
    id: "RUM-20260803-A1B2C3",
    reference: "RUM-20260803-A1B2C3",
    status: "payment_pending",
    product_name: "Paquete Panamá 5 días / 4 noches",
    country: "Panamá",
    departure_date: "2026-09-14",
    return_date: "2026-09-18",
    adults: 2,
    children: 1,
    contact_channel: "whatsapp",
    unit_price_amount: 699,
    total_amount: 2097,
    price_display: "US$ 699",
    currency: "USD",
    remaining_capacity: 123,
    payment_status: "pending",
    payment_url: null,
    hold_expires_at: "2026-08-03T20:15:00Z",
    created_at: "2026-08-03T20:00:00Z",
    updated_at: "2026-08-03T20:00:00Z",
    contact_email: "must-not-be-read@example.com",
  });

  assert.equal(booking.reference, "RUM-20260803-A1B2C3");
  assert.equal(booking.status, "payment_pending");
  assert.equal(booking.total_amount, 2097);
  assert.equal(booking.remaining_capacity, 123);
  assert.equal("contact_email" in booking, false);
});

test("parses server-verified price and capacity", () => {
  const availability = parseOfferAvailability({
    product_id: "prod_panama",
    variant_id: "variant_panama",
    departure_date: "2026-09-14",
    return_date: "2026-09-18",
    total_capacity: 126,
    remaining_capacity: 123,
    price_amount: 699,
    price_display: "US$ 699",
    currency: "USD",
    bookable: true,
    hold_minutes: 15,
  });

  assert.equal(availability.bookable, true);
  assert.equal(availability.remaining_capacity, 123);
  assert.equal(availability.price_amount, 699);
});
