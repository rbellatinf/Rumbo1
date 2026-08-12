import { NextRequest, NextResponse } from "next/server";
import { searchAirports } from "../../../lib/airlabs-airports";
import { accessConfiguration, providerHeaders } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (keyword.length < 2) {
    return NextResponse.json(
      {
        mode: "demo",
        provider: "AirLabs",
        airports: [],
        message: "Escribe al menos dos letras para buscar un aeropuerto.",
      },
      { status: 400 },
    );
  }

  const provider = accessConfiguration();
  if (provider?.kind === "rumbo") {
    try {
      const response = await fetch(
        `${provider.apiUrl}/api/integrations/airlabs/airports?q=${encodeURIComponent(keyword)}`,
        {
          headers: providerHeaders(provider),
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.airports) {
        return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      // Fallback temporal: permite conservar el buscador local mientras Rumbo API
      // está reiniciando o la configuración segura todavía no fue guardada.
    }
  }

  const result = await searchAirports(keyword);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
