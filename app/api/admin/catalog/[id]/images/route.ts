import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  demoMode,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "@/lib/rumbo-access";

export const dynamic = "force-dynamic";

function enrichCloudflareAsset(body: Record<string, unknown>) {
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || body.storage_key) return body;
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path.startsWith("catalog/")) return body;
    return {
      ...body,
      storage_provider: "cloudflare-r2",
      storage_key: path,
      bucket_name: "rumbo-images",
      metadata: {
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {}),
        public_host: parsed.host,
      },
    };
  } catch {
    return body;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") {
    return noStoreJson({ message: "Rumbo API no está conectada." }, 503);
  }

  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) {
    return noStoreJson({ message: "No hay sesión administrativa." }, 401);
  }

  const { id } = await context.params;
  const incoming = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = enrichCloudflareAsset(incoming);
  const upstream = await fetch(
    `${provider.apiUrl}/api/admin/catalog/${encodeURIComponent(id)}/images`,
    {
      method: "POST",
      headers: providerHeaders(provider, {
        token,
        json: true,
        demoRole: "wholesaler_admin",
      }),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const payload = await parseJson(upstream);
  if (!upstream.ok) {
    return noStoreJson(
      { message: backendMessage(payload, "No pudimos asociar la imagen al producto.") },
      upstream.status || 502,
    );
  }
  return noStoreJson(payload, upstream.status);
}
