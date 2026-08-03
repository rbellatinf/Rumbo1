import { NextRequest, NextResponse } from "next/server";
import {
  BookingValidationError,
  parseBookingInput,
  parseBookingRecord,
  toBookingApiPayload,
} from "../../../lib/booking-requests";

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
  if (typeof error?.message === "string") return error.message;
  if (typeof source.message === "string") return source.message;
  return "";
}

export async function POST(request: NextRequest) {
  const provider = configuration();
  if (!provider) {
    return noStoreJson(
      { message: "El servicio de reservas todavía no está configurado." },
      503,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return noStoreJson({ message: "El formulario no contiene datos válidos." }, 400);
  }

  try {
    const booking = parseBookingInput(raw);
    const upstream = await fetch(
      `${provider.apiUrl}/api/v3/store/booking_requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": booking.idempotencyKey,
          "X-Spree-API-Key": provider.apiKey,
        },
        body: JSON.stringify(toBookingApiPayload(booking)),
      },
    );
    const payload = await responsePayload(upstream);

    if (!upstream.ok) {
      return noStoreJson(
        {
          message:
            upstreamMessage(payload) ||
            "No pudimos registrar la solicitud. Inténtalo nuevamente.",
        },
        upstream.status >= 400 && upstream.status < 500 ? 422 : 502,
      );
    }

    return noStoreJson({ booking: parseBookingRecord(payload) }, upstream.status);
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return noStoreJson(
        { message: error.message, fields: error.fields },
        422,
      );
    }

    return noStoreJson(
      { message: "El servicio de reservas no respondió. Inténtalo nuevamente." },
      502,
    );
  }
}

export async function GET(request: NextRequest) {
  const provider = configuration();
  if (!provider) {
    return noStoreJson(
      { message: "El servicio de reservas todavía no está configurado." },
      503,
    );
  }

  const reference = request.nextUrl.searchParams.get("reference")?.trim().toUpperCase();
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!reference || !/^RUM-\d{8}-[A-F0-9]{6}$/.test(reference) || !email) {
    return noStoreJson(
      { message: "Ingresa una referencia y un correo válidos." },
      422,
    );
  }

  try {
    const upstream = await fetch(
      `${provider.apiUrl}/api/v3/store/booking_requests/${encodeURIComponent(reference)}?email=${encodeURIComponent(email)}`,
      {
        headers: { "X-Spree-API-Key": provider.apiKey },
      },
    );
    const payload = await responsePayload(upstream);

    if (!upstream.ok) {
      return noStoreJson(
        {
          message:
            upstream.status === 404
              ? "No encontramos una solicitud con esos datos."
              : upstreamMessage(payload) || "No pudimos consultar la solicitud.",
        },
        upstream.status === 404 ? 404 : 502,
      );
    }

    return noStoreJson({ booking: parseBookingRecord(payload) });
  } catch {
    return noStoreJson(
      { message: "El servicio de reservas no respondió. Inténtalo nuevamente." },
      502,
    );
  }
}
