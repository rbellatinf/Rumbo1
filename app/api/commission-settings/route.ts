import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
  providerHeaders,
  providerUrl,
  RUMBO_SESSION_COOKIE,
} from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) return noStoreJson({ message: "La configuración de comisiones todavía no está disponible." }, 503);

  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (provider.kind === "rumbo" && !token) return noStoreJson({ message: "No hay una sesión activa." }, 401);

  const upstream = await fetch(
    providerUrl(provider, "/api/commission-settings", "/api/v3/store/commission_settings"),
    { headers: providerHeaders(provider, { token }), cache: "no-store" },
  );
  const payload = await parseJson(upstream);
  if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos leer las comisiones.") }, upstream.status || 502);
  return noStoreJson(payload);
}

export async function PATCH(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) return noStoreJson({ message: "La configuración de comisiones todavía no está disponible." }, 503);

  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (provider.kind === "rumbo" && !token) return noStoreJson({ message: "No hay una sesión activa." }, 401);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return noStoreJson({ message: "Los porcentajes enviados no son válidos." }, 400); }

  const upstream = await fetch(
    providerUrl(provider, "/api/commission-settings", "/api/v3/store/commission_settings"),
    {
      method: "PATCH",
      headers: providerHeaders(provider, { token, json: true }),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const payload = await parseJson(upstream);
  if (!upstream.ok) return noStoreJson({ message: backendMessage(payload, "No pudimos guardar las comisiones.") }, upstream.status || 502);
  return noStoreJson(payload);
}
