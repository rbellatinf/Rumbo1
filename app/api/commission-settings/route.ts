import { NextRequest } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  noStoreJson,
  parseJson,
} from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = accessConfiguration();
  if (!provider) {
    return noStoreJson({ message: "La configuración de comisiones todavía no está disponible." }, 503);
  }

  const upstream = await fetch(`${provider.apiUrl}/api/v3/store/commission_settings`, {
    headers: { "X-Spree-API-Key": provider.apiKey },
    cache: "no-store",
  });
  const payload = await parseJson(upstream);

  if (!upstream.ok) {
    return noStoreJson(
      { message: backendMessage(payload, "No pudimos leer las comisiones.") },
      upstream.status || 502,
    );
  }

  return noStoreJson(payload);
}

export async function PATCH(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider) {
    return noStoreJson({ message: "La configuración de comisiones todavía no está disponible." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ message: "Los porcentajes enviados no son válidos." }, 400);
  }

  const upstream = await fetch(`${provider.apiUrl}/api/v3/store/commission_settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Spree-API-Key": provider.apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await parseJson(upstream);

  if (!upstream.ok) {
    return noStoreJson(
      { message: backendMessage(payload, "No pudimos guardar las comisiones.") },
      upstream.status || 502,
    );
  }

  return noStoreJson(payload);
}
