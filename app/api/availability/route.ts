import { NextRequest, NextResponse } from "next/server";
import { parseOfferAvailability } from "../../../lib/booking-requests";
import { accessConfiguration, parseJson, providerHeaders } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

function spreeConfiguration() {
  const apiUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.SPREE_PUBLISHABLE_API_KEY;
  return apiUrl && apiKey ? { apiUrl, apiKey } : null;
}

function noStoreJson(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } }); }
async function responsePayload(response: Response): Promise<unknown> { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text) as unknown; } catch { return { error: { message: text.slice(0, 300) } }; } }
function upstreamMessage(payload: unknown): string { if (!payload || typeof payload !== "object") return ""; const source = payload as Record<string, unknown>; const error = source.error && typeof source.error === "object" ? (source.error as Record<string, unknown>) : null; return typeof error?.message === "string" ? error.message : ""; }

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId")?.trim();
  const departureDate = request.nextUrl.searchParams.get("departureDate")?.trim();
  const returnDate = request.nextUrl.searchParams.get("returnDate")?.trim();
  if (!productId || !departureDate || !returnDate) return noStoreJson({ message: "Faltan datos para comprobar los cupos de la oferta." }, 422);

  if (productId.startsWith("rumbo:")) {
    const nativeId = productId.slice(6);
    const rumbo = accessConfiguration();
    if (!rumbo || rumbo.kind !== "rumbo") return noStoreJson({ message: "Rumbo API todavía no está configurada." }, 503);
    try {
      const response = await fetch(`${rumbo.apiUrl}/api/catalog`, { headers: providerHeaders(rumbo), cache: "no-store" });
      const payload = await parseJson(response) as { products?: Array<Record<string, unknown>> };
      const product = payload.products?.find((item) => String(item.id) === nativeId);
      if (!response.ok || !product) return noStoreJson({ message: "La oferta ya no está disponible." }, 404);
      const departures = Array.isArray(product.departures) ? product.departures as Array<Record<string, unknown>> : [];
      const departure = departures.find((item) => String(item.departure_date || "") === departureDate && String(item.return_date || "") === returnDate) || departures[0];
      if (!departure) return noStoreJson({ message: "No encontramos una salida activa para esas fechas." }, 404);
      const available = departure.available_capacity == null ? 999999 : Number(departure.available_capacity);
      const capacity = departure.capacity == null ? available : Number(departure.capacity);
      const amount = Number(departure.price_amount || 0);
      const currency = String(departure.currency || "USD");
      const parsed = parseOfferAvailability({
        product_id: productId,
        variant_id: String(departure.id || ""),
        departure_date: String(departure.departure_date || departureDate),
        return_date: String(departure.return_date || returnDate),
        total_capacity: capacity,
        remaining_capacity: available,
        price_amount: amount,
        price_display: `${currency} ${amount.toFixed(2)}`,
        currency,
        bookable: Boolean(departure.id && amount > 0 && available > 0),
        hold_minutes: 15,
      });
      return noStoreJson({ availability: parsed });
    } catch {
      return noStoreJson({ message: "No pudimos comprobar los cupos de esta oferta." }, 502);
    }
  }

  const provider = spreeConfiguration();
  if (!provider) return noStoreJson({ message: "La disponibilidad en vivo todavía no está configurada." }, 503);
  const query = new URLSearchParams({ product_id: productId, departure_date: departureDate, return_date: returnDate });
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/v3/store/booking_requests/availability?${query.toString()}`, { headers: { "X-Spree-API-Key": provider.apiKey } });
    const payload = await responsePayload(upstream);
    if (!upstream.ok) return noStoreJson({ message: upstreamMessage(payload) || "No pudimos comprobar los cupos de esta oferta." }, upstream.status === 409 ? 409 : 502);
    return noStoreJson({ availability: parseOfferAvailability(payload) });
  } catch {
    return noStoreJson({ message: "El servicio de cupos no respondió. Inténtalo nuevamente." }, 502);
  }
}
