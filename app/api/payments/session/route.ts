import { NextRequest, NextResponse } from "next/server";
import { parseBookingRecord } from "../../../../lib/booking-requests";
import { recordIntegrationCall } from "../../../../lib/integration-telemetry";

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
  try { return JSON.parse(text) as unknown; }
  catch { return { error: { message: text.slice(0, 300) } }; }
}

function upstreamMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const source = payload as Record<string, unknown>;
  const error = source.error && typeof source.error === "object" ? source.error as Record<string, unknown> : null;
  return typeof error?.message === "string" ? error.message : "";
}

export async function POST(request: NextRequest) {
  const started=Date.now(),provider = configuration();
  if (!provider) {
    recordIntegrationCall({integrationCode:"spree",serviceCode:"legacy-payment-session",source:"storefront",success:false,httpStatus:null,durationMs:Date.now()-started,errorCode:"SPREE_NOT_CONFIGURED",errorMessage:"Spree payment session no configurado."});
    return noStoreJson({ message: "El servicio de pagos todavía no está configurado." },503);
  }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return noStoreJson({ message: "La solicitud de pago no es válida." }, 400); }

  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const reference = typeof source.reference === "string" ? source.reference.trim().toUpperCase() : "";
  const email = typeof source.email === "string" ? source.email.trim().toLowerCase() : "";

  if (!/^RUM-\d{8}-[A-F0-9]{6}$/.test(reference) || !email) return noStoreJson({ message: "Ingresa una referencia y un correo válidos." },422);

  try {
    const upstream = await fetch(`${provider.apiUrl}/api/v3/store/booking_requests/${encodeURIComponent(reference)}/payment_session?email=${encodeURIComponent(email)}`,{method:"POST",headers:{"X-Spree-API-Key":provider.apiKey}});
    const upstreamPayload = await responsePayload(upstream);
    if (!upstream.ok) {
      const message=upstreamMessage(upstreamPayload)||"No pudimos preparar el pago de esta reserva.";
      recordIntegrationCall({integrationCode:"spree",serviceCode:"legacy-payment-session",source:"storefront",success:false,httpStatus:upstream.status,durationMs:Date.now()-started,errorCode:"SPREE_PAYMENT_SESSION_FAILED",errorMessage:message,requestSummary:{reference,email_present:true}});
      return noStoreJson({message},upstream.status===503?503:upstream.status===404?404:409);
    }
    const booking=parseBookingRecord(upstreamPayload);
    recordIntegrationCall({integrationCode:"spree",serviceCode:"legacy-payment-session",source:"storefront",success:true,httpStatus:upstream.status,durationMs:Date.now()-started,requestSummary:{reference,email_present:true},responseSummary:{booking_reference:(booking as any)?.reference||reference,payment_status:(booking as any)?.payment_status||null}});
    return noStoreJson({ booking });
  } catch (error) {
    recordIntegrationCall({integrationCode:"spree",serviceCode:"legacy-payment-session",source:"storefront",success:false,httpStatus:null,durationMs:Date.now()-started,errorCode:"SPREE_PAYMENT_SESSION_EXCEPTION",errorMessage:error instanceof Error?error.message:"Spree no respondió",requestSummary:{reference,email_present:true}});
    return noStoreJson({ message: "El servicio de pagos no respondió. Inténtalo nuevamente." },502);
  }
}
