import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders, RUMBO_SESSION_COOKIE } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "El portal de agencia todavía no está conectado." }, 503);
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return noStoreJson({ message: "Formulario inválido." }, 400); }
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/agency/user-requests`, {
      method: "POST",
      headers: providerHeaders(provider, { token, json: true, demoRole: "retailer" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos registrar la solicitud.") }, upstream.status || 502);
    return noStoreJson(payload, upstream.status);
  } catch {
    return noStoreJson({ message: "Rumbo API no respondió al registrar la solicitud." }, 502);
  }
}
