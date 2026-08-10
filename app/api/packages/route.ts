import { NextRequest, NextResponse } from "next/server";
import { accessConfiguration, parseJson, providerHeaders } from "../../../lib/rumbo-access";
import { searchPriceTravelPackages } from "../../../lib/pricetravel-packages";
import type { TravelPackage } from "../../../lib/travel-packages";

export const dynamic = "force-dynamic";

const IATA_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type NativeProduct = {
  id: string;
  slug: string;
  name: string;
  country?: string;
  city?: string;
  destination_iata?: string;
  provider?: string;
  provider_reference?: string;
  duration_label?: string;
  tag?: string;
  included?: string[];
  departure_id?: string;
  departure_date?: string;
  return_date?: string;
  currency?: string;
  price_amount?: number;
  capacity?: number | null;
  available_capacity?: number | null;
  image_url?: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function nativePackage(product: NativeProduct): TravelPackage {
  const amount = Number(product.price_amount || 0);
  const currency = product.currency || "USD";
  return {
    id: product.slug,
    destination: product.name,
    country: product.country || product.city || "",
    image: product.image_url || "/images/rumbo-hero.jpg",
    imagePosition: "center",
    duration: product.duration_label || "Consultar duración",
    rating: "Nuevo",
    reviews: "Rumbo",
    price: amount > 0 ? money(amount, currency) : "Consultar",
    previousPrice: "",
    tag: product.tag || "Rumbo",
    included: Array.isArray(product.included) ? product.included : [],
    capacity: product.available_capacity ?? product.capacity ?? undefined,
    departureDate: product.departure_date,
    returnDate: product.return_date,
    priceAmount: amount || undefined,
    currency,
    bookable: Boolean(
      product.departure_id &&
        amount > 0 &&
        (product.available_capacity == null || product.available_capacity > 0),
    ),
    variantId: product.departure_id,
    provider: "Rumbo",
    providerReference: product.id,
  };
}

async function searchNativeCatalog(input: {
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  adults: number;
}) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return null;

  try {
    const query = new URLSearchParams({ destination: input.destinationIata });
    const response = await fetch(`${provider.apiUrl}/api/catalog?${query.toString()}`, {
      headers: providerHeaders(provider),
      cache: "no-store",
    });
    const payload = (await parseJson(response)) as { products?: NativeProduct[] };
    if (!response.ok || !Array.isArray(payload.products)) return null;

    const products = payload.products.filter((product) => {
      if (product.destination_iata !== input.destinationIata) return false;
      if (!product.departure_id || !product.departure_date || !product.return_date) return false;
      if (product.departure_date !== input.departureDate || product.return_date !== input.returnDate) return false;
      return product.available_capacity == null || product.available_capacity >= input.adults;
    });

    return products.map(nativePackage);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const originIata = (params.get("origin") || "").toUpperCase();
  const destinationIata = (params.get("destination") || "").toUpperCase();
  const destinationName = (params.get("destinationName") || destinationIata)
    .trim()
    .slice(0, 100);
  const departureDate = params.get("departureDate") || "";
  const returnDate = params.get("returnDate") || "";
  const adults = Number(params.get("adults") || "2");

  if (
    !IATA_CODE.test(originIata) ||
    !IATA_CODE.test(destinationIata) ||
    !ISO_DATE.test(departureDate) ||
    !ISO_DATE.test(returnDate) ||
    !Number.isInteger(adults) ||
    adults < 1 ||
    adults > 9 ||
    Date.parse(returnDate) <= Date.parse(departureDate)
  ) {
    return NextResponse.json(
      {
        mode: "demo",
        provider: "Rumbo",
        packages: [],
        message:
          "Selecciona aeropuertos válidos, fechas consecutivas y entre 1 y 9 viajeros.",
      },
      { status: 400 },
    );
  }

  const nativePackages = await searchNativeCatalog({
    destinationIata,
    departureDate,
    returnDate,
    adults,
  });

  if (nativePackages && nativePackages.length > 0) {
    return NextResponse.json(
      {
        mode: "live",
        provider: "Rumbo",
        packages: nativePackages,
        message: `Encontramos ${nativePackages.length} opción${nativePackages.length === 1 ? "" : "es"} propia${nativePackages.length === 1 ? "" : "s"} de Rumbo para ${destinationName}.`,
      },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  }

  const result = await searchPriceTravelPackages({
    originIata,
    destinationIata,
    destinationName,
    departureDate,
    returnDate,
    adults,
    currency: "USD",
  });

  return NextResponse.json(
    {
      ...result,
      message:
        nativePackages !== null
          ? `No encontramos una salida propia de Rumbo para esas fechas. ${result.message}`
          : result.message,
    },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
