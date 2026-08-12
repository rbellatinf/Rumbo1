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

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export async function GET(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") {
    if (demoMode()) return noStoreJson(developmentAdminPayload());
    return noStoreJson({ message: "El backoffice propio de Rumbo todavía no está conectado." }, 503);
  }
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return noStoreJson({ message: "No hay una sesión administrativa activa." }, 401);

  let lastError:unknown=null;
  for(let attempt=0;attempt<3;attempt++){
    if(attempt>0)await sleep(attempt===1?650:1400);
    try {
      const upstream = await fetch(`${provider.apiUrl}/api/admin/overview`, {
        headers: providerHeaders(provider, { token, demoRole: "wholesaler_admin" }),
        cache: "no-store",
      });
      const payload = await parseJson(upstream);
      if (upstream.ok) return noStoreJson(payload);

      if (upstream.status === 401 || upstream.status === 403) {
        const response = noStoreJson({ message: backendMessage(payload, "La sesión administrativa ya no es válida.") }, upstream.status);
        if (upstream.status === 401) response.cookies.delete(RUMBO_SESSION_COOKIE);
        return response;
      }

      if (![502,503,504].includes(upstream.status) || attempt===2) {
        if (demoMode()) return noStoreJson(developmentAdminPayload());
        return noStoreJson({ message: backendMessage(payload, "No pudimos cargar el backoffice.") }, upstream.status || 502);
      }
      lastError=new Error(backendMessage(payload, `Rumbo API respondió ${upstream.status}.`));
    } catch (error) {
      lastError=error;
      if(attempt===2){
        console.error("admin overview upstream failed", error);
        if (demoMode()) return noStoreJson(developmentAdminPayload());
      }
    }
  }

  console.error("admin overview exhausted retries", lastError);
  return noStoreJson({ message: "Rumbo API no respondió al cargar el backoffice. Reintenta en unos segundos." }, 502);
}
