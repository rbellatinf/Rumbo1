import {
  demoTravelPackages,
  type TravelPackage,
} from "./travel-packages.ts";

export type PackageSearchInput = {
  originIata: string;
  destinationIata: string;
  destinationName: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  currency: string;
};

export type PackageSearchResult = {
  mode: "demo" | "live";
  provider: "PriceTravel";
  packages: TravelPackage[];
  message: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function firstString(source: UnknownRecord, names: string[]) {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstNumber(source: UnknownRecord, names: string[]) {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function packageItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = record(payload);
  if (!root) return [];

  for (const key of ["Packages", "packages", "Results", "results", "Data", "data"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }

  return [];
}

function includedItems(source: UnknownRecord) {
  const raw =
    source.Included ??
    source.included ??
    source.Includes ??
    source.includes ??
    source.Services ??
    source.services;

  if (Array.isArray(raw)) {
    const values = raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const itemRecord = record(item);
        return itemRecord
          ? firstString(itemRecord, ["Name", "name", "Description", "description"])
          : undefined;
      })
      .filter((item): item is string => Boolean(item));
    if (values.length) return values.slice(0, 5);
  }

  if (typeof raw === "string") {
    const values = raw
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.length) return values.slice(0, 5);
  }

  return ["Vuelo y hotel según tarifa", "Asistencia de Rumbo"];
}

function formatPrice(amount: number | undefined, currency: string) {
  if (amount === undefined) return "Consultar";

  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function mapPackage(
  value: unknown,
  index: number,
  input: PackageSearchInput,
): TravelPackage | null {
  const source = record(value);
  if (!source) return null;

  const fallback = demoTravelPackages[index % demoTravelPackages.length];
  const id =
    firstString(source, [
      "PackageId",
      "packageId",
      "Id",
      "id",
      "Code",
      "code",
    ]) || `pricetravel-${index + 1}`;
  const destination =
    firstString(source, [
      "Name",
      "name",
      "Title",
      "title",
      "PackageName",
      "packageName",
      "DestinationName",
      "destinationName",
    ]) || `Paquete a ${input.destinationName}`;
  const country =
    firstString(source, [
      "CountryName",
      "countryName",
      "Country",
      "country",
    ]) || "Destino internacional";
  const image =
    firstString(source, [
      "ImageUrl",
      "imageUrl",
      "Image",
      "image",
      "HotelImageUri",
      "hotelImageUri",
    ]) || fallback.image;
  const currency =
    firstString(source, ["Currency", "currency", "CurrencyCode", "currencyCode"]) ||
    input.currency;
  const total = firstNumber(source, [
    "TotalAmount",
    "totalAmount",
    "TotalPrice",
    "totalPrice",
    "Price",
    "price",
  ]);
  const nights =
    firstNumber(source, ["Nights", "nights", "NumberOfNights", "numberOfNights"]) ||
    Math.max(
      1,
      Math.round(
        (Date.parse(input.returnDate) - Date.parse(input.departureDate)) /
          86_400_000,
      ),
    );

  return {
    id,
    destination,
    country,
    image,
    imagePosition: "center",
    duration: `${nights} noches`,
    rating:
      firstString(source, ["Rating", "rating", "Stars", "stars"]) || "Nuevo",
    reviews: firstString(source, ["Reviews", "reviews"]) || "0",
    price: formatPrice(total, currency),
    previousPrice: "",
    tag:
      firstString(source, ["Tag", "tag", "RateType", "rateType"]) ||
      "PriceTravel",
    included: includedItems(source),
    provider: "PriceTravel",
    providerReference: id,
  };
}

function demoPackages(destinationName: string) {
  const query = destinationName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const filtered = demoTravelPackages.filter((item) =>
    item.destination
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(query),
  );

  return filtered.length ? filtered : demoTravelPackages;
}

export async function searchPriceTravelPackages(
  input: PackageSearchInput,
): Promise<PackageSearchResult> {
  const baseUrl = process.env.PRICETRAVEL_API_URL?.replace(/\/$/, "");
  const username = process.env.PRICETRAVEL_USERNAME;
  const password = process.env.PRICETRAVEL_PASSWORD;
  const packagesPath = process.env.PRICETRAVEL_PACKAGES_PATH;

  if (!baseUrl || !username || !password || !packagesPath) {
    return {
      mode: "demo",
      provider: "PriceTravel",
      packages: demoPackages(input.destinationName),
      message:
        "PriceTravel está preparado, pero requiere el acceso B2B, el sandbox y la ruta de paquetes entregada en el contrato.",
    };
  }

  try {
    const query = new URLSearchParams({
      originAirportCode: input.originIata,
      destinationAirportCode: input.destinationIata,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      adults: String(input.adults),
      currency: input.currency,
      language: "es-PE",
    });
    const endpoint = packagesPath.startsWith("/")
      ? packagesPath
      : `/${packagesPath}`;
    const authorization = btoa(`${username}:${password}`);
    const response = await fetch(
      `${baseUrl}${endpoint}?${query.toString()}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Basic ${authorization}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`PriceTravel packages returned ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const packages = packageItems(payload)
      .map((item, index) => mapPackage(item, index, input))
      .filter((item): item is TravelPackage => item !== null)
      .slice(0, 24);

    if (!packages.length) {
      return {
        mode: "live",
        provider: "PriceTravel",
        packages: [],
        message:
          "PriceTravel respondió correctamente, pero no encontró paquetes para estas fechas.",
      };
    }

    return {
      mode: "live",
      provider: "PriceTravel",
      packages,
      message: "Paquetes y tarifas consultados directamente en PriceTravel.",
    };
  } catch {
    return {
      mode: "demo",
      provider: "PriceTravel",
      packages: demoPackages(input.destinationName),
      message:
        "PriceTravel no respondió; se mantienen datos demostrativos y no se habilitan cobros.",
    };
  }
}
