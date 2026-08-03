import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  normalizeIzipayAnswer,
  toMinorUnits,
  verifyIzipayAnswerHash,
  verifySignedCheckout,
} from "../lib/izipay.ts";

const checkoutSecret = "checkout-secret-used-only-for-tests";

function signedCheckoutParams() {
  const values: Record<string, string> = {
    amount: "1250.00",
    currency: "PEN",
    expires_at: "2026-08-03T23:30:00.000Z",
    payment_id: "8f42c472-3e63-4f19-8dc4-b27b9acddc26",
    reference: "RUM-20260803-A1B2C3",
    return_url: "http://localhost:3001/reservas",
    webhook_url: "http://localhost:3000/api/v3/store/payment_webhooks/izipay",
  };
  const canonical = new URLSearchParams(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  ).toString();
  const signature = createHmac("sha256", checkoutSecret)
    .update(canonical, "utf8")
    .digest("hex");
  return new URLSearchParams({ ...values, signature });
}

test("validates the signed Rumbo checkout before opening Izipay", () => {
  const checkout = verifySignedCheckout(
    signedCheckoutParams(),
    checkoutSecret,
    new Date("2026-08-03T23:00:00.000Z"),
  );

  assert.equal(checkout.reference, "RUM-20260803-A1B2C3");
  assert.equal(checkout.amount, "1250.00");
  assert.equal(toMinorUnits(checkout.amount), 125000);
});

test("rejects checkout price tampering", () => {
  const params = signedCheckoutParams();
  params.set("amount", "1.00");

  assert.throws(
    () =>
      verifySignedCheckout(
        params,
        checkoutSecret,
        new Date("2026-08-03T23:00:00.000Z"),
      ),
    /validación de seguridad/i,
  );
});

test("maps a signed Izipay PAID answer to the neutral Rumbo webhook", () => {
  const answerRaw = JSON.stringify({
    orderStatus: "PAID",
    orderDetails: {
      orderId: "RUM-20260803-A1B2C3",
      orderTotalAmount: 125000,
      orderCurrency: "PEN",
    },
    transactions: [
      {
        uuid: "f6c2d96c-7cb0-450b-a843-5dbd56ae35a2",
        amount: 125000,
        currency: "PEN",
      },
    ],
  });
  const event = normalizeIzipayAnswer(answerRaw);

  assert.deepEqual(event, {
    event_id: "f6c2d96c-7cb0-450b-a843-5dbd56ae35a2:PAID",
    event_type: "payment.paid",
    booking_reference: "RUM-20260803-A1B2C3",
    provider_payment_id: "f6c2d96c-7cb0-450b-a843-5dbd56ae35a2",
    status: "paid",
    amount: "1250.00",
    currency: "PEN",
  });
});

test("validates kr-answer with the Izipay HMAC SHA-256 key", () => {
  const answerRaw = JSON.stringify({ orderStatus: "UNPAID" });
  const secret = "izipay-hmac-test-key";
  const hash = createHmac("sha256", secret).update(answerRaw, "utf8").digest("hex");

  assert.equal(verifyIzipayAnswerHash(answerRaw, hash, secret), true);
  assert.equal(verifyIzipayAnswerHash(answerRaw, "0".repeat(64), secret), false);
});
