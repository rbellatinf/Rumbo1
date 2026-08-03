import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewResetUrl = new URL(
  "../backend/postgres/init/019_reset_booking_operations_view.sql",
  import.meta.url,
);
const schemaUrl = new URL(
  "../backend/postgres/init/020_rumbo_bookings.sql",
  import.meta.url,
);
const automaticSchemaUrl = new URL(
  "../backend/postgres/init/030_rumbo_automatic_reservations.sql",
  import.meta.url,
);
const paymentSchemaUrl = new URL(
  "../backend/postgres/init/040_rumbo_payment_gateway.sql",
  import.meta.url,
);
const routesUrl = new URL(
  "../backend/spree/extensions/config/initializers/rumbo_booking_routes.rb",
  import.meta.url,
);
const storeControllerUrl = new URL(
  "../backend/spree/extensions/app/controllers/spree/api/v3/store/booking_requests_controller.rb",
  import.meta.url,
);
const webhookControllerUrl = new URL(
  "../backend/spree/extensions/app/controllers/spree/api/v3/store/payment_webhooks_controller.rb",
  import.meta.url,
);
const checkoutServiceUrl = new URL(
  "../backend/spree/extensions/app/services/rumbo/payments/checkout_session.rb",
  import.meta.url,
);
const paymentModelUrl = new URL(
  "../backend/spree/extensions/app/models/rumbo/booking_payment.rb",
  import.meta.url,
);
const paymentProxyUrl = new URL(
  "../app/api/payments/session/route.ts",
  import.meta.url,
);
const dockerfileUrl = new URL("../backend/spree/Dockerfile", import.meta.url);

test("PostgreSQL schema includes durable booking and status history tables", async () => {
  const sql = await readFile(schemaUrl, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_booking_requests/i);
  assert.match(sql, /idempotency_key uuid UNIQUE NOT NULL/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_booking_status_history/i);
  assert.match(sql, /rumbo_booking_validate_transition_trigger/i);
  assert.match(sql, /rumbo_booking_write_history_insert_trigger/i);
  assert.match(sql, /rumbo_booking_write_audit_trigger/i);
  assert.match(sql, /CREATE OR REPLACE VIEW rumbo_booking_operations/i);
});

test("booking operation views can be rebuilt on every Render restart", async () => {
  const [resetSql, automaticSql] = await Promise.all([
    readFile(viewResetUrl, "utf8"),
    readFile(automaticSchemaUrl, "utf8"),
  ]);

  assert.match(resetSql, /DROP VIEW IF EXISTS rumbo_booking_operations/i);
  assert.match(automaticSql, /DROP VIEW IF EXISTS rumbo_booking_operations/i);
  assert.match(automaticSql, /CREATE VIEW rumbo_booking_operations/i);
});

test("PostgreSQL atomically holds inventory and prepares payment tracking", async () => {
  const sql = await readFile(automaticSchemaUrl, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_offer_inventory/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_booking_holds/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_booking_payments/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /RUMBO_INSUFFICIENT_CAPACITY/i);
  assert.match(sql, /rumbo_booking_reserve_capacity_trigger/i);
  assert.match(sql, /rumbo_booking_create_hold_trigger/i);
  assert.match(sql, /rumbo_booking_payments_apply_trigger/i);
  assert.match(sql, /rumbo_expire_stale_booking_holds/i);
  assert.match(sql, /RUMBO_ACTIVE_HOLD_REQUIRED_FOR_CONFIRMATION/i);
  assert.match(sql, /RUMBO_PAYMENT_CANNOT_COMPLETE/i);
  assert.match(sql, /FOR UPDATE OF i/i);
  assert.match(sql, /status IN \('active', 'converted'\)/i);
  assert.match(sql, /CREATE OR REPLACE VIEW rumbo_offer_availability/i);
});

test("payment events are idempotent and store no card payload", async () => {
  const sql = await readFile(paymentSchemaUrl, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_payment_events/i);
  assert.match(sql, /provider_event_id varchar\(160\) NOT NULL/i);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS rumbo_payment_events_provider_event_idx/i);
  assert.match(sql, /payload_digest char\(64\) NOT NULL/i);
  assert.match(sql, /processing_status IN \('received', 'applied', 'rejected'\)/i);
  assert.doesNotMatch(sql, /card_number|cvv|pan|expiration_month|expiration_year/i);
});

test("Spree extension exposes booking, checkout, and webhook routes", async () => {
  const [routes, controller, webhook, checkout, paymentModel, paymentProxy, dockerfile] =
    await Promise.all([
      readFile(routesUrl, "utf8"),
      readFile(storeControllerUrl, "utf8"),
      readFile(webhookControllerUrl, "utf8"),
      readFile(checkoutServiceUrl, "utf8"),
      readFile(paymentModelUrl, "utf8"),
      readFile(paymentProxyUrl, "utf8"),
      readFile(dockerfileUrl, "utf8"),
    ]);

  assert.match(routes, /resources :booking_requests, only: %i\[create show\]/);
  assert.match(routes, /get :availability, on: :collection/);
  assert.match(routes, /post :payment_session, on: :member/);
  assert.match(routes, /payment_webhooks\/:provider/);
  assert.match(
    controller,
    /class BookingRequestsController < ResourceController/,
  );
  assert.match(controller, /prepend_before_action :authenticate_api_key!/);
  assert.match(controller, /CheckoutSession\.prepare!/);
  assert.match(controller, /@resource\.status = "payment_pending"/);
  assert.doesNotMatch(controller, /contact_email.*render json/im);

  assert.match(checkout, /OpenSSL::HMAC\.hexdigest/);
  assert.match(checkout, /RUMBO_PAYMENT_CHECKOUT_SECRET/);
  assert.match(checkout, /uri\.scheme == "https"/);
  assert.match(checkout, /payment\.apply_provider_status!\("pending"\)/);
  assert.doesNotMatch(checkout, /contact_email|contact_phone|card_number|cvv/i);

  assert.match(webhook, /X-Rumbo-Timestamp/);
  assert.match(webhook, /X-Rumbo-Signature/);
  assert.match(webhook, /secure_compare/);
  assert.match(webhook, /MAX_TIMESTAMP_DRIFT = 5\.minutes/);
  assert.match(webhook, /event_id_conflict/);
  assert.match(webhook, /amount_mismatch/);
  assert.match(webhook, /currency_mismatch/);
  assert.match(webhook, /hold_expired/);
  assert.doesNotMatch(webhook, /params\.permit.*card|card_number|cvv/i);

  assert.match(paymentModel, /TRANSITIONS =/);
  assert.match(paymentModel, /apply_provider_status!/);
  assert.match(paymentProxy, /api\/v3\/store\/booking_requests/);
  assert.match(paymentProxy, /payment_session/);
  assert.match(dockerfile, /rumbo_booking_routes\.rb >> \.\/config\/routes\.rb/);
});
