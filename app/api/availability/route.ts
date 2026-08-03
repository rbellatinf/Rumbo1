import { NextRequest, NextResponse } from "next/server";
import { parseOfferAvailability } from "../../../lib/booking-requests";

export const dynamic = "force-dynamic";

function configuration() {
  const apiUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.SPREE_PUBLISHABLE_API_KEY;

  return apiUrl && apiKey ? { apiUrl, apiKey } : null;
}

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

function upstreamMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const source = payload as Record<string, unknown>;
  const error =
    source.error && typeof source.error === "object"
      ? (source.error as Record<string, unknown>)
      : null;

  return typeof error?.message === "string" ? error.message : "";
}

export async function GET(request: NextRequest) {
  const provider = configuration();
  if (!provider) {
    return noStoreJson(
      { message: "La disponibilidad en vivo todavía no está configurada." },
      503,
    );
  }

  const productId = request.nextUrl.searchParams.get("productId")?.trim();
  const departureDate = request.nextUrl.searchParams.get("departureDate")?.trim();
  const returnDate = request.nextUrl.searchParams.get("returnDate")?.trim();
  if (!productId || !departureDate || !returnDate) {
    return noStoreJson(
      { message: "Faltan datos para comprobar los cupos de la oferta." },
      422,
    );
  }

  const query = new URLSearchParams({
    product_id: productId,
    departure_date: departureDate,
    return_date: returnDate,
  });

  try {
    const upstream = await fetch(
      `${provider.apiUrl}/api/v3/store/booking_requests/availability?${query.toString()}`,
      {
        headers: { "X-Spree-API-Key": provider.apiKey },
      },
    );
    const payload = await responsePayload(upstream);

    if (!upstream.ok) {
      return noStoreJson(
        {
          message:
            upstreamMessage(payload) ||
            "No pudimos comprobar los cupos de esta oferta.",
        },
        upstream.status === 409 ? 409 : 502,
      );
    }

    return noStoreJson({ availability: parseOfferAvailability(payload) });
  } catch {
    return noStoreJson(
      { message: "El servicio de cupos no respondió. Inténtalo nuevamente." },
      502,
    );
  }
}
