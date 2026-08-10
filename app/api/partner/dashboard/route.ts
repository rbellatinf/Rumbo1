import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
  RUMBO_SESSION_COOKIE,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) {
    return noStoreJson({ message: "El portal de Partner todavía no está configurado." }, 503);
  }

  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "No hay una sesión activa." }, 401);

  const upstream = await fetch(`${provider.apiUrl}/api/v3/store/partner_dashboard`, {
    headers: {
      "X-Spree-API-Key": provider.apiKey,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseJson(upstream);

  if (!upstream.ok) {
    const response = noStoreJson(
      { message: backendMessage(payload, "No pudimos cargar el portal del Partner.") },
      upstream.status || 502,
    );
    if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
    return response;
  }

  return noStoreJson(payload);
}
