import { NextRequest } from "next/server";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders } from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return noStoreJson({ message: "La recuperación todavía no está configurada." }, 503);
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return noStoreJson({ message: "Formulario inválido." }, 400); }
  try {
    const upstream = await fetch(`${provider.apiUrl}/api/access/forgot-password`, {
      method: "POST",
      headers: providerHeaders(provider, { json: true }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await parseJson(upstream);
    if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos procesar la recuperación.") }, upstream.status || 502);
    return noStoreJson(payload);
  } catch {
    return noStoreJson({ message: "Rumbo API no respondió." }, 502);
  }
}
