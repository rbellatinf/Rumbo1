import { NextResponse } from "next/server";
import { accessConfiguration, parseJson, providerHeaders } from "../../../lib/rumbo-access";
import { getTravelCatalog } from "../../../lib/spree-catalog";
import type { TravelPackage } from "../../../lib/travel-packages";

export const dynamic = "force-dynamic";

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
  capacity?: number;
  available_capacity?: number;
  image_url?: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function toPackage(product: NativeProduct): TravelPackage {
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
    capacity: product.available_capacity ?? product.capacity,
    departureDate: product.departure_date,
    returnDate: product.return_date,
    priceAmount: amount || undefined,
    currency,
    bookable: Boolean(product.departure_id && amount > 0 && (product.available_capacity == null || product.available_capacity > 0)),
    variantId: product.departure_id,
    provider: "Rumbo",
    providerReference: product.id,
  };
}

export async function GET() {
  const provider = accessConfiguration();
  if (provider?.kind === "rumbo") {
    try {
      const response = await fetch(`${provider.apiUrl}/api/catalog`, {
        headers: providerHeaders(provider), cache: "no-store",
      });
      const payload = await parseJson(response) as { products?: NativeProduct[] };
      if (response.ok && Array.isArray(payload.products)) {
        return NextResponse.json({
          mode: "live",
          packages: payload.products.map(toPackage),
          message: "Catálogo propio de Rumbo conectado a PostgreSQL.",
        }, { headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      // El catálogo Spree se mantiene como respaldo durante la transición.
    }
  }

  const catalog = await getTravelCatalog();
  return NextResponse.json(catalog, { headers: { "Cache-Control": "no-store" } });
}
