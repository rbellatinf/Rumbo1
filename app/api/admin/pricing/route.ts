import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

function config(request: NextRequest) {
  const provider = accessConfiguration();
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  return { provider, token };
}

export async function GET(request: NextRequest) {
  const { provider, token } = config(request);
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  if (!token) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/pricing`, { headers: providerHeaders(provider, { token }), cache: "no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos cargar Pricing." ) }, upstream.status || 502);
    return noStoreJson(payload);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}

export async function POST(request: NextRequest) {
  const { provider, token } = config(request);
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  if (!token) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return noStoreJson({ message: "Formulario inválido." }, 400);
  const action = String(body.action || "");
  const path = action === "program" ? "/api/admin/pricing/programs" : action === "rule" ? "/api/admin/pricing/rules" : action === "simulate" ? "/api/admin/pricing/simulate" : "";
  if (!path) return noStoreJson({ message: "Acción de Pricing inválida." }, 400);
  const payloadBody = { ...body }; delete payloadBody.action;
  try {
    const upstream = await fetch(`${provider.apiUrl}${path}`, { method: "POST", headers: providerHeaders(provider, { token, json: true }), body: JSON.stringify(payloadBody), cache: "no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos ejecutar la operación de Pricing.") }, upstream.status || 502);
    return noStoreJson(payload);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}

export async function PATCH(request: NextRequest) {
  const { provider, token } = config(request);
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  if (!token) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id || "");
  if (!id) return noStoreJson({ message: "Regla inválida." }, 400);
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/pricing/rules/${encodeURIComponent(id)}`, { method: "PATCH", headers: providerHeaders(provider, { token, json: true }), body: JSON.stringify({ is_active: body?.is_active }), cache: "no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos actualizar la regla." ) }, upstream.status || 502);
    return noStoreJson(payload);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}
