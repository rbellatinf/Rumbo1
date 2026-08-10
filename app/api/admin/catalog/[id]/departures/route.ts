import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../../../lib/rumbo-access";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay sesión administrativa." }, 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const upstream = await fetch(`${provider.apiUrl}/api/admin/catalog/${encodeURIComponent(id)}/departures`, {
    method: "POST",
    headers: providerHeaders(provider, { token, json: true, demoRole: "wholesaler_admin" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await parseJson(upstream);
  if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos agregar la salida.") }, upstream.status || 502);
  return noStoreJson(payload, upstream.status);
}
