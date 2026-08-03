import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL(
  "../backend/postgres/init/020_rumbo_bookings.sql",
  import.meta.url,
);
const automaticSchemaUrl = new URL(
  "../backend/postgres/init/030_rumbo_automatic_reservations.sql",
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

test("Spree extension exposes publishable Store API booking routes", async () => {
  const [routes, controller, dockerfile] = await Promise.all([
    readFile(routesUrl, "utf8"),
    readFile(storeControllerUrl, "utf8"),
    readFile(dockerfileUrl, "utf8"),
  ]);

  assert.match(routes, /resources :booking_requests, only: %i\[create show\]/);
  assert.match(routes, /get :availability, on: :collection/);
  assert.match(
    controller,
    /class BookingRequestsController < ResourceController/,
  );
  assert.match(controller, /prepend_before_action :authenticate_api_key!/);
  assert.match(controller, /find_by_prefix_id!/);
  assert.match(controller, /OfferInventory\.sync_from_product!/);
  assert.match(controller, /@resource\.status = "payment_pending"/);
  assert.match(controller, /@resource\.reload/);
  assert.doesNotMatch(controller, /contact_email.*render json/im);
  assert.match(dockerfile, /rumbo_booking_routes\.rb >> \.\/config\/routes\.rb/);
});
