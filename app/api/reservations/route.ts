import { NextRequest, NextResponse } from "next/server";
import {
  BookingValidationError,
  parseBookingInput,
  parseBookingRecord,
  toBookingApiPayload,
} from "../../../lib/booking-requests";
import { accessConfiguration, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";
const REFERRAL_COOKIE = "rumbo_referral";

function spreeConfiguration() {
  const apiUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.SPREE_PUBLISHABLE_API_KEY;
  return apiUrl && apiKey ? { apiUrl, apiKey } : null;
}

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return { error: { message: text.slice(0, 300) } }; }
}

function upstreamMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const source = payload as Record<string, unknown>;
  const error = source.error && typeof source.error === "object" ? (source.error as Record<string, unknown>) : null;
  if (typeof error?.message === "string") return error.message;
  if (typeof source.message === "string") return source.message;
  return "";
}

async function validAutomaticReferral(code: string | undefined) {
  if (!code) return undefined;
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return code;
  try {
    const response = await fetch(`${provider.apiUrl}/api/referrals/${encodeURIComponent(code)}`, {
      headers: providerHeaders(provider), cache: "no-store",
    });
    return response.ok ? code : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return noStoreJson({ message: "El formulario no contiene datos válidos." }, 400); }

  try {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    const capturedReferral = request.cookies.get(REFERRAL_COOKIE)?.value?.trim().toUpperCase();
    if (capturedReferral) source.referralCode = await validAutomaticReferral(capturedReferral);

    const booking = parseBookingInput(source);
    const apiPayload = toBookingApiPayload(booking);
    const rumbo = accessConfiguration();
    const nativeReference = booking.product.id.startsWith("rumbo:") ? booking.product.id.slice(6) : null;
    const sessionToken = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;

    if (rumbo?.kind === "rumbo" && nativeReference) {
      apiPayload.spree_product_id = nativeReference;
      const upstream = await fetch(`${rumbo.apiUrl}/api/bookings`, {
        method: "POST",
        headers: providerHeaders(rumbo, { json: true, token: sessionToken }),
        body: JSON.stringify(apiPayload),
        cache: "no-store",
      });
      const payload = await responsePayload(upstream);
      if (!upstream.ok) {
        return noStoreJson({ message: upstreamMessage(payload) || "No pudimos crear la reserva en Rumbo." }, upstream.status === 409 ? 409 : upstream.status >= 400 && upstream.status < 500 ? 422 : 502);
      }
      return noStoreJson({ booking: parseBookingRecord(payload) }, upstream.status);
    }

    const spree = spreeConfiguration();
    if (!spree) return noStoreJson({ message: "El servicio de reservas todavía no está configurado." }, 503);
    const upstream = await fetch(`${spree.apiUrl}/api/v3/store/booking_requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": booking.idempotencyKey, "X-Spree-API-Key": spree.apiKey },
      body: JSON.stringify(apiPayload),
    });
    const payload = await responsePayload(upstream);
    if (!upstream.ok) {
      return noStoreJson({ message: upstreamMessage(payload) || "No pudimos crear la reserva. Inténtalo nuevamente." }, upstream.status === 409 ? 409 : upstream.status >= 400 && upstream.status < 500 ? 422 : 502);
    }
    return noStoreJson({ booking: parseBookingRecord(payload) }, upstream.status);
  } catch (error) {
    if (error instanceof BookingValidationError) return noStoreJson({ message: error.message, fields: error.fields }, 422);
    return noStoreJson({ message: "El servicio de reservas no respondió. Inténtalo nuevamente." }, 502);
  }
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim().toUpperCase();
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!reference || !/^RUM-\d{8}-[A-F0-9]{6}$/.test(reference) || !email) return noStoreJson({ message: "Ingresa una referencia y un correo válidos." }, 422);

  const rumbo = accessConfiguration();
  if (rumbo?.kind === "rumbo") {
    try {
      const upstream = await fetch(`${rumbo.apiUrl}/api/bookings/${encodeURIComponent(reference)}?email=${encodeURIComponent(email)}`, {
        headers: providerHeaders(rumbo), cache: "no-store",
      });
      const payload = await responsePayload(upstream);
      if (upstream.ok) return noStoreJson({ booking: parseBookingRecord(payload) });
      if (upstream.status !== 404) return noStoreJson({ message: upstreamMessage(payload) || "No pudimos consultar la reserva." }, 502);
    } catch {
      // Durante la transición, las reservas históricas pueden seguir en Spree.
    }
  }

  const spree = spreeConfiguration();
  if (!spree) return noStoreJson({ message: "No encontramos una reserva con esos datos." }, 404);
  try {
    const upstream = await fetch(`${spree.apiUrl}/api/v3/store/booking_requests/${encodeURIComponent(reference)}?email=${encodeURIComponent(email)}`, { headers: { "X-Spree-API-Key": spree.apiKey } });
    const payload = await responsePayload(upstream);
    if (!upstream.ok) return noStoreJson({ message: upstream.status === 404 ? "No encontramos una reserva con esos datos." : upstreamMessage(payload) || "No pudimos consultar la reserva." }, upstream.status === 404 ? 404 : 502);
    return noStoreJson({ booking: parseBookingRecord(payload) });
  } catch {
    return noStoreJson({ message: "El servicio de reservas no respondió. Inténtalo nuevamente." }, 502);
  }
}
