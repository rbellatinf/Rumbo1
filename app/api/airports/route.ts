import { NextRequest, NextResponse } from "next/server";
import {
  accessConfiguration,
  backendMessage,
  fetchRumboApi,
  parseJson,
} from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim().slice(0,30) || "";

  if (keyword.length < 3) {
    return NextResponse.json(
      {
        mode: "error",
        provider: "AirLabs",
        airports: [],
        message: "Escribe al menos tres letras para buscar un aeropuerto.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") {
    return NextResponse.json(
      {
        mode: "error",
        provider: "AirLabs",
        airports: [],
        message: "Rumbo API no está configurada en el storefront.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetchRumboApi(
      provider,
      `/api/integrations/airlabs/airports?q=${encodeURIComponent(keyword)}`,
    );
    const payload = await parseJson(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          mode: "error",
          provider: "AirLabs",
          airports: [],
          message: backendMessage(
            payload,
            `AirLabs falló a través de Rumbo API (HTTP ${response.status}).`,
          ),
          upstreamStatus: response.status,
        },
        {
          status: response.status >= 400 && response.status <= 599 ? response.status : 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const airports = Array.isArray(payload.airports) ? payload.airports : [];
    return NextResponse.json(
      {
        ...payload,
        mode: "live",
        provider: typeof payload.provider === "string" ? payload.provider : "AirLabs",
        airports,
        message:
          typeof payload.message === "string"
            ? payload.message
            : `Encontramos ${airports.length} aeropuerto(s).`,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        mode: "error",
        provider: "AirLabs",
        airports: [],
        message:
          error instanceof Error
            ? `No se pudo conectar con Rumbo API/AirLabs: ${error.message}`
            : "No se pudo conectar con Rumbo API/AirLabs.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
