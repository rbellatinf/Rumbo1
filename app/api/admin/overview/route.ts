import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  demoMode,
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
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);

  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/overview`, {
      headers: providerHeaders(provider, { token, demoRole: "wholesaler_admin" }),
      cache: "no-store",
    });
    const payload = await parseJson(upstream);
    if (!upstream.ok) {
      const response = noStoreJson({ message: backendMessage(payload, "No pudimos cargar el backoffice.") }, upstream.status || 502);
      if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
      return response;
    }
    return noStoreJson(payload);
  } catch (error) {
    console.error("admin overview upstream failed", error);
    return noStoreJson({ message: "Rumbo API no respondió al cargar el backoffice." }, 502);
  }
}
