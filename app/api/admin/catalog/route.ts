import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

function providerOrError() {
  const provider = accessConfiguration();
  return provider?.kind === "rumbo" ? provider : null;
}

export async function GET(request: NextRequest) {
  const provider = providerOrError();
  if (!provider) return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay sesión administrativa." }, 401);
  const upstream = await fetch(`${provider.apiUrl}/api/admin/catalog`, { headers: providerHeaders(provider, { token, demoRole: "wholesaler_admin" }), cache: "no-store" });
  const payload = await parseJson(upstream);
  if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos cargar el catálogo.") }, upstream.status || 502);
  return noStoreJson(payload);
}

export async function POST(request: NextRequest) {
  const provider = providerOrError();
  if (!provider) return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay sesión administrativa." }, 401);
  const body = await request.json().catch(() => ({}));
  const upstream = await fetch(`${provider.apiUrl}/api/admin/catalog`, { method: "POST", headers: providerHeaders(provider, { token, json: true, demoRole: "wholesaler_admin" }), body: JSON.stringify(body), cache: "no-store" });
  const payload = await parseJson(upstream);
  if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos crear el producto.") }, upstream.status || 502);
  return noStoreJson(payload, upstream.status);
}
