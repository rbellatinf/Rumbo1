import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") {
    return noStoreJson({ message: "El backoffice propio de Rumbo todavía no está conectado." }, 503);
  }
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);

  const upstream = await fetch(`${provider.apiUrl}/api/admin/overview`, {
    headers: providerHeaders(provider, { token }),
    cache: "no-store",
  });
  const payload = await parseJson(upstream);
  if (!upstream.ok) {
    const response = noStoreJson({ message: backendMessage(payload, "No pudimos cargar el backoffice.") }, upstream.status || 502);
    if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
    return response;
  }
  return noStoreJson(payload);
}
