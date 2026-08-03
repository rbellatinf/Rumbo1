import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL(
  "../backend/postgres/init/020_rumbo_bookings.sql",
  import.meta.url,
);
const holdSchemaUrl = new URL(
  "../backend/postgres/init/030_rumbo_booking_holds.sql",
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
const bookingModelUrl = new URL(
  "../backend/spree/extensions/app/models/rumbo/booking_request.rb",
  import.meta.url,
);
const bookingSerializerUrl = new URL(
  "../backend/spree/extensions/app/serializers/rumbo/booking_request_serializer.rb",
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

test("PostgreSQL schema adds expiring price holds and payment attempts", async () => {
  const sql = await readFile(holdSchemaUrl, "utf8");

  assert.match(sql, /price_per_person numeric\(14,2\)/i);
  assert.match(sql, /price_total numeric\(14,2\)/i);
  assert.match(sql, /hold_expires_at timestamptz/i);
  assert.match(sql, /payment_status varchar\(20\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rumbo_booking_payment_attempts/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION rumbo_expire_booking_holds/i);
  assert.match(sql, /'held'.*'payment_pending'.*'paid'/is);
});

test("Spree creates authoritative 15-minute holds from its own price", async () => {
  const [routes, controller, model, serializer, dockerfile] = await Promise.all([
    readFile(routesUrl, "utf8"),
    readFile(storeControllerUrl, "utf8"),
    readFile(bookingModelUrl, "utf8"),
    readFile(bookingSerializerUrl, "utf8"),
    readFile(dockerfileUrl, "utf8"),
  ]);

  assert.match(routes, /resources :booking_requests, only: %i\[create show\]/);
  assert.match(
    controller,
    /class BookingRequestsController < ResourceController/,
  );
  assert.match(controller, /prepend_before_action :authenticate_api_key!/);
  assert.match(controller, /variant\.price_in\(currency\)/);
  assert.match(controller, /Rumbo::BookingRequest::HOLD_DURATION\.from_now/);
  assert.match(controller, /@resource\.status = "held"/);
  assert.match(controller, /attributes\["price_total"\] = total_amount/);
  assert.match(model, /HOLD_DURATION = 15\.minutes/);
  assert.match(model, /def expire_hold_if_needed!/);
  assert.match(serializer, /attribute\(:hold_expires_at\)/);
  assert.doesNotMatch(controller, /contact_email.*render json/im);
  assert.match(dockerfile, /rumbo_booking_routes\.rb >> \.\/config\/routes\.rb/);
});
