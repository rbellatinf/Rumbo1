import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/agency-user-requests`, { headers: providerHeaders(provider, { token, demoRole:"wholesaler_admin" }), cache:"no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos cargar las solicitudes.") }, upstream.status || 502);
    return noStoreJson(payload);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}
