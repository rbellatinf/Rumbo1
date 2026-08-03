import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL(
  "../backend/postgres/init/020_rumbo_bookings.sql",
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

test("Spree extension exposes publishable Store API booking routes", async () => {
  const [routes, controller] = await Promise.all([
    readFile(routesUrl, "utf8"),
    readFile(storeControllerUrl, "utf8"),
  ]);

  assert.match(routes, /resources :booking_requests, only: %i\[create show\]/);
  assert.match(
    controller,
    /class BookingRequestsController < ResourceController/,
  );
  assert.match(controller, /X-Spree-API-Key|authenticate_api_key|current_store/i);
  assert.match(controller, /find_by_prefix_id!/);
  assert.doesNotMatch(controller, /contact_email.*render json/im);
});
