import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  const { accountId } = await context.params;
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch {}
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/agency-users/${encodeURIComponent(accountId)}/reactivate`, { method:"PATCH", headers:providerHeaders(provider,{ token, json:true, demoRole:"wholesaler_admin" }), body:JSON.stringify(body), cache:"no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos reactivar el usuario.") }, upstream.status || 502);
    return noStoreJson(payload);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}
