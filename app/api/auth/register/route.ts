import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
  providerHeaders,
  providerUrl,
  RUMBO_SESSION_COOKIE,
  sessionCookieOptions,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) return noStoreJson({ message: "El registro todavía no está configurado." }, 503);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return noStoreJson({ message: "Formulario inválido." }, 400); }

  const upstream = await fetch(
    providerUrl(provider, "/api/access/register", "/api/v3/store/access/register"),
    {
      method: "POST",
      headers: providerHeaders(provider, { json: true }),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const payload = await parseJson(upstream);

  if (!upstream.ok || typeof payload.token !== "string") {
    return noStoreJson({ message: backendMessage(payload, "No pudimos crear la cuenta.") }, upstream.status || 502);
  }

  const response = noStoreJson({ account: payload.account, profile: payload.profile, redirectTo: payload.redirect_to }, 201);
  response.cookies.set(RUMBO_SESSION_COOKIE, payload.token, sessionCookieOptions(true));
  return response;
}
