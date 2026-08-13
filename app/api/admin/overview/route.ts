import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  demoMode,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

function developmentAdminPayload() {
  return {
    metrics: {
      partners: 0,
      partners_pending: 0,
      retailers: 0,
      retailers_pending: 0,
      commissions: 0,
      commissions_pending: 0,
      reservations: 0,
      reservations_open: 0,
    },
    partners: [],
    retailers: [],
    commissions: [],
    reservations: [],
    commission_settings: {
      partner_rate: 0.06,
      sponsor_rate: 0,
      retailer_rate: 0,
      updated_at: null,
    },
    audit: [],
    demo_mode: true,
    live_data_available: false,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT = new Set([502, 503, 504]);

async function waitForApi(apiUrl: string) {
  // Render Free can need close to a minute to wake. Keep one browser request alive
  // while polling /health instead of returning the platform's temporary 502 page.
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
      // Network errors are expected while the free instance is being recreated.
    }
    delay = delay ? Math.min(Math.round(delay * 1.55), 8_000) : 1_200;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") {
    if (demoMode()) return noStoreJson(developmentAdminPayload());
    return noStoreJson({ message: "El backoffice propio de Rumbo todavía no está conectado." }, 503);
  }
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);

  const ready = await waitForApi(provider.apiUrl);
  if (!ready) {
    if (demoMode()) return noStoreJson(developmentAdminPayload());
    return noStoreJson({ message: "Rumbo API está demorando más de lo esperado en iniciar. Reintenta en unos segundos." }, 503);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt === 1 ? 800 : 1_600);
    try {
      const upstream = await fetch(`${provider.apiUrl}/api/admin/overview`, {
        headers: providerHeaders(provider, { token, demoRole: "wholesaler_admin" }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await parseJson(upstream);
      if (upstream.ok) return noStoreJson(payload);

      if (upstream.status === 401 || upstream.status === 403) {
        const response = noStoreJson({ message: backendMessage(payload, "La sesión administrativa ya no es válida.") }, upstream.status);
        if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
        return response;
      }

      if (!TRANSIENT.has(upstream.status) || attempt === 2) {
        if (demoMode()) return noStoreJson(developmentAdminPayload());
        return noStoreJson({ message: backendMessage(payload, "No pudimos cargar el backoffice.") }, upstream.status || 502);
      }
      lastError = new Error(backendMessage(payload, `Rumbo API respondió ${upstream.status}.`));
    } catch (error) {
      lastError = error;
      if (attempt === 2) {
        console.error("admin overview upstream failed", error);
        if (demoMode()) return noStoreJson(developmentAdminPayload());
      }
    }
  }

  console.error("admin overview exhausted retries", lastError);
  return noStoreJson({ message: "Rumbo API no respondió al cargar el backoffice. Reintenta en unos segundos." }, 502);
}
