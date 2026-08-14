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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT = new Set([502, 503, 504]);

async function waitForApi(apiUrl: string) {
  const deadline = Date.now() + 70_000;
  let delay = 0;

  while (Date.now() < deadline) {
    if (delay) await sleep(delay);
    try {
      const health = await fetch(`${apiUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      });
      if (health.ok) return true;
      if (!TRANSIENT.has(health.status)) return false;
    } catch {
      // A free Render instance can be unreachable briefly while it wakes up.
    }
    delay = delay ? Math.min(Math.round(delay * 1.55), 8_000) : 1_200;
  }

  return false;
}

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) return noStoreJson({ message: "El acceso todavía no está configurado." }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ message: "Formulario inválido." }, 400);
  }

  const ready = await waitForApi(provider.apiUrl);
  if (!ready) {
    return noStoreJson(
      { message: "Rumbo API está demorando más de lo esperado en iniciar. Vuelve a intentar en unos segundos." },
      503,
    );
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(attempt === 1 ? 800 : 1_600);
    try {
      const upstream = await fetch(providerUrl(provider, "/api/access/login"), {
        method: "POST",
        headers: providerHeaders(provider, { json: true }),
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await parseJson(upstream);

      if (upstream.ok && typeof payload.token === "string") {
        const response = noStoreJson({
          account: payload.account,
          profile: payload.profile,
          redirectTo: payload.redirect_to,
        });
        response.cookies.set(
          RUMBO_SESSION_COOKIE,
          payload.token,
          sessionCookieOptions(Boolean(body.remember)),
        );
        return response;
      }

      if (!TRANSIENT.has(upstream.status) || attempt === 2) {
        return noStoreJson(
          { message: backendMessage(payload, "No pudimos iniciar sesión.") },
          upstream.status || 502,
        );
      }

      lastError = new Error(backendMessage(payload, `Rumbo API respondió ${upstream.status}.`));
    } catch (error) {
      lastError = error;
      if (attempt === 2) {
        console.error("admin login upstream failed", error);
      }
    }
  }

  console.error("admin login exhausted retries", lastError);
  return noStoreJson(
    { message: "Rumbo API no respondió al iniciar sesión. Reintenta en unos segundos." },
    503,
  );
}
