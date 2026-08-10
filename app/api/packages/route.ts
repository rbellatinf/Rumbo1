import { NextRequest, NextResponse } from "next/server";
import { accessConfiguration, parseJson, providerHeaders } from "../../../lib/rumbo-access";
import { searchPriceTravelPackages } from "../../../lib/pricetravel-packages";
import type { TravelPackage } from "../../../lib/travel-packages";

export const dynamic = "force-dynamic";

const IATA_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FLEX_DAYS = 3;

type NativeDeparture = {
  id: string;
  origin_iata?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  currency?: string;
  price_amount?: number;
  capacity?: number | null;
  available_capacity?: number | null;
  low_stock_threshold?: number | null;
};

type NativeProduct = {
  id: string;
  slug: string;
  name: string;
  country?: string;
  city?: string;
  destination_iata?: string;
  duration_label?: string;
  tag?: string;
  included?: string[];
  image_url?: string;
  from_price_amount?: number;
  active_departure_count?: number;
  departures?: NativeDeparture[];
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function dayDiff(a: string, b: string) {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function chooseDeparture(product: NativeProduct, input: { originIata: string; departureDate: string; returnDate: string; adults: number }) {
  const departures = Array.isArray(product.departures) ? product.departures : [];
  return departures
    .filter((departure) => {
      if (!departure.id || !departure.departure_date || !departure.return_date) return false;
      if (departure.origin_iata && departure.origin_iata !== input.originIata) return false;
      if (dayDiff(departure.departure_date, input.departureDate) > FLEX_DAYS) return false;
      if (dayDiff(departure.return_date, input.returnDate) > FLEX_DAYS) return false;
      return departure.available_capacity == null || departure.available_capacity >= input.adults;
    })
    .sort((a, b) => {
      const aDistance = dayDiff(a.departure_date!, input.departureDate) + dayDiff(a.return_date!, input.returnDate);
      const bDistance = dayDiff(b.departure_date!, input.departureDate) + dayDiff(b.return_date!, input.returnDate);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return Number(a.price_amount || 0) - Number(b.price_amount || 0);
    })[0];
}

function nativePackage(product: NativeProduct, departure: NativeDeparture): TravelPackage {
  const amount = Number(departure.price_amount || 0);
  const fromAmount = Number(product.from_price_amount || amount);
  const currency = departure.currency || "USD";
  const remaining = departure.available_capacity ?? departure.capacity ?? undefined;
  const threshold = departure.low_stock_threshold ?? 5;
  const lowStock = typeof remaining === "number" && remaining > 0 && remaining <= threshold;
  const multipleDepartures = Number(product.active_departure_count || 0) > 1;

  return {
    id: product.slug,
    destination: product.name,
    country: product.country || product.city || "",
    image: product.image_url || "/images/rumbo-hero.jpg",
    imagePosition: "center",
    duration: product.duration_label || "Consultar duración",
    rating: "Nuevo",
    reviews: multipleDepartures ? `${product.active_departure_count} salidas` : "Rumbo",
    price: multipleDepartures && fromAmount > 0 ? `Desde ${money(fromAmount, currency)}` : amount > 0 ? money(amount, currency) : "Consultar",
    previousPrice: "",
    tag: lowStock ? `Últimos ${remaining} cupos` : product.tag || "Rumbo",
    included: Array.isArray(product.included) ? product.included : [],
    capacity: remaining,
    departureDate: departure.departure_date || undefined,
    returnDate: departure.return_date || undefined,
    priceAmount: amount || undefined,
    currency,
    bookable: Boolean(departure.id && amount > 0 && (remaining == null || remaining > 0)),
    variantId: departure.id,
    provider: "Rumbo",
    providerReference: product.id,
    originIata: departure.origin_iata || undefined,
    lowStock,
    activeDepartureCount: Number(product.active_departure_count || 0),
  };
}

async function searchNativeCatalog(input: { originIata: string; destinationIata: string; departureDate: string; returnDate: string; adults: number }) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return null;

  try {
    const response = await fetch(`${provider.apiUrl}/api/catalog?destination=${encodeURIComponent(input.destinationIata)}`, {
      headers: providerHeaders(provider), cache: "no-store",
    });
    const payload = (await parseJson(response)) as { products?: NativeProduct[] };
    if (!response.ok || !Array.isArray(payload.products)) return null;

    return payload.products
      .filter((product) => product.destination_iata === input.destinationIata)
      .map((product) => ({ product, departure: chooseDeparture(product, input) }))
      .filter((entry): entry is { product: NativeProduct; departure: NativeDeparture } => Boolean(entry.departure))
      .map(({ product, departure }) => nativePackage(product, departure));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const originIata = (params.get("origin") || "").toUpperCase();
  const destinationIata = (params.get("destination") || "").toUpperCase();
  const destinationName = (params.get("destinationName") || destinationIata).trim().slice(0, 100);
  const departureDate = params.get("departureDate") || "";
  const returnDate = params.get("returnDate") || "";
  const adults = Number(params.get("adults") || "2");

  if (!IATA_CODE.test(originIata) || !IATA_CODE.test(destinationIata) || !ISO_DATE.test(departureDate) || !ISO_DATE.test(returnDate) || !Number.isInteger(adults) || adults < 1 || adults > 9 || Date.parse(returnDate) <= Date.parse(departureDate)) {
    return NextResponse.json({ mode: "demo", provider: "Rumbo", packages: [], message: "Selecciona aeropuertos válidos, fechas consecutivas y entre 1 y 9 viajeros." }, { status: 400 });
  }

  const nativePackages = await searchNativeCatalog({ originIata, destinationIata, departureDate, returnDate, adults });
  if (nativePackages && nativePackages.length > 0) {
    return NextResponse.json({
      mode: "live",
      provider: "Rumbo",
      packages: nativePackages,
      message: `Encontramos ${nativePackages.length} opción${nativePackages.length === 1 ? "" : "es"} propia${nativePackages.length === 1 ? "" : "s"} de Rumbo para ${destinationName}, considerando hasta ±${FLEX_DAYS} días.`,
    }, { headers: { "Cache-Control": "private, max-age=15" } });
  }

  const result = await searchPriceTravelPackages({ originIata, destinationIata, destinationName, departureDate, returnDate, adults, currency: "USD" });
  return NextResponse.json({ ...result, message: nativePackages !== null ? `No encontramos una salida propia de Rumbo desde ${originIata} dentro de ±${FLEX_DAYS} días. ${result.message}` : result.message }, { headers: { "Cache-Control": "private, max-age=30" } });
}
