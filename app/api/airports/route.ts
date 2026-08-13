import { NextRequest, NextResponse } from "next/server";
import { searchAirports } from "../../../lib/airlabs-airports";
import { accessConfiguration, providerHeaders } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

type CatalogProduct = {
  name?: string;
  country?: string;
  city?: string;
  destination_iata?: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function catalogFallback(keyword: string) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return [];

  try {
    const response = await fetch(`${provider.apiUrl}/api/catalog`, {
      headers: providerHeaders(provider),
      cache: "no-store",
    });
    if (!response.ok) return [];

    const payload = (await response.json().catch(() => null)) as {
      products?: CatalogProduct[];
    } | null;
    const products = Array.isArray(payload?.products) ? payload.products : [];
    const query = normalize(keyword);
    const seen = new Set<string>();

    return products
      .filter((product) => {
        const iata = String(product.destination_iata || "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(iata)) return false;
        return [iata, product.city, product.country, product.name]
          .filter(Boolean)
          .map((value) => normalize(String(value)))
          .some((value) => value.includes(query) || query.includes(value));
      })
      .filter((product) => {
        const iata = String(product.destination_iata || "").toUpperCase();
        if (seen.has(iata)) return false;
        seen.add(iata);
        return true;
      })
      .slice(0, 20)
      .map((product) => {
        const iataCode = String(product.destination_iata || "").toUpperCase();
        const cityName = product.city?.trim() || product.name?.trim() || iataCode;
        const countryName = product.country?.trim() || "";
        return {
          id: `RUMBO-${iataCode}`,
          iataCode,
          name: `${cityName} · destino disponible en Rumbo`,
          cityName,
          countryName,
          subType: "CITY" as const,
          label: `${cityName} (${iataCode})${countryName ? ` · ${countryName}` : ""}`,
        };
      });
  } catch {
    return [];
  }
}

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
      if (
        response.ok &&
        Array.isArray(payload?.airports) &&
        payload.airports.length > 0
      ) {
        return NextResponse.json(payload, {
          headers: { "Cache-Control": "no-store" },
        });
      }
    } catch {
      // Continuamos con el catálogo propio y el respaldo local.
    }
  }

  const [catalogAirports, localResult] = await Promise.all([
    catalogFallback(keyword),
    searchAirports(keyword),
  ]);

  const seen = new Set<string>();
  const airports = [...catalogAirports, ...localResult.airports].filter((airport) => {
    if (seen.has(airport.iataCode)) return false;
    seen.add(airport.iataCode);
    return true;
  });

  return NextResponse.json(
    {
      ...localResult,
      airports,
      message:
        catalogAirports.length > 0
          ? "AirLabs no respondió; se muestran destinos del catálogo Rumbo y el respaldo local."
          : localResult.message,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
