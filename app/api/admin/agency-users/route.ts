import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, demoMode, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return noStoreJson({ message: "Formulario inválido." }, 400); }
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/admin/agency-users`, { method:"POST", headers:providerHeaders(provider,{ token, json:true, demoRole:"wholesaler_admin" }), body:JSON.stringify(body), cache:"no-store" });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos crear el usuario.") }, upstream.status || 502);
    return noStoreJson(payload, upstream.status);
  } catch { return noStoreJson({ message: "Rumbo API no respondió." }, 502); }
}
