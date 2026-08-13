import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
  providerHeaders,
  providerUrl,
  RUMBO_SESSION_COOKIE,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) return noStoreJson({ message: "El portal de Partner todavía no está configurado." }, 503);

  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "No hay una sesión activa." }, 401);

  const headers = providerHeaders(provider, { token });
  const sessionResponse = await fetch(
    providerUrl(provider, "/api/access/me", "/api/v3/store/account"),
    { headers, cache: "no-store" },
  );
  const sessionPayload = await parseJson(sessionResponse);

  if (!sessionResponse.ok) {
    const response = noStoreJson(
      { message: backendMessage(sessionPayload, "La sesión ya no es válida.") },
      sessionResponse.status || 401,
    );
    if (sessionResponse.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
    return response;
  }

  if (sessionPayload?.account?.role !== "partner") {
    return noStoreJson(
      { message: "Esta sesión no pertenece a un Partner. Inicia sesión con tu cuenta Partner." },
      403,
    );
  }

  const upstream = await fetch(
    providerUrl(provider, "/api/partner/dashboard", "/api/v3/store/partner_dashboard"),
    { headers, cache: "no-store" },
  );
  const payload = await parseJson(upstream);

  if (!upstream.ok) {
    const response = noStoreJson({ message: backendMessage(payload, "No pudimos cargar el portal del Partner.") }, upstream.status || 502);
    if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
    return response;
  }

  return noStoreJson(payload);
}
