import {
  demoTravelPackages,
  type TravelPackage,
} from "./travel-packages.ts";

type SpreePrice = {
  amount?: string | number | null;
  currency?: string | null;
  display_amount?: string | null;
  display_compare_at_amount?: string | null;
};

type SpreeCustomField = {
  key?: string;
  label?: string;
  name?: string;
  type?: string;
  value?: unknown;
};

type SpreeMedia = {
  media_type?: string;
  position?: number;
  original_url?: string;
  large_url?: string;
};

type SpreeProduct = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  thumbnail_url?: string | null;
  tags?: string[];
  price?: SpreePrice;
  original_price?: SpreePrice | null;
  default_variant_id?: string;
  custom_fields?: SpreeCustomField[];
  media?: SpreeMedia[];
};

type SpreeProductResponse = {
  data: SpreeProduct[];
};

export type CatalogResult = {
  mode: "demo" | "live";
  packages: TravelPackage[];
  message: string;
};

const FALLBACK_MESSAGE =
  "Modo demostración: estas referencias no admiten reservas ni cobros.";

export const RUMBO_PRODUCT_FIELD_KEYS = {
  country: "rumbo.country",
  duration: "rumbo.duration",
  included: "rumbo.included",
  rating: "rumbo.rating",
  reviews: "rumbo.reviews",
  departureDate: "rumbo.departure_date",
  returnDate: "rumbo.return_date",
  capacity: "rumbo.capacity",
} as const;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(
  source: UnknownRecord,
  property: string,
  context: string,
): string {
  const value = optionalString(source[property]);
  if (!value?.trim()) {
    throw new Error(`${context}.${property} debe ser un texto no vacío`);
  }
  return value;
}

function parsePrice(value: unknown, context: string): SpreePrice | undefined {
  if (value === null || value === undefined) return undefined;

  const source = record(value);
  if (!source) throw new Error(`${context} debe ser un objeto`);

  const amount = source.amount;
  if (
    amount !== undefined &&
    amount !== null &&
    typeof amount !== "string" &&
    typeof amount !== "number"
  ) {
    throw new Error(`${context}.amount debe ser un número o texto numérico`);
  }

  return {
    amount,
    currency: optionalString(source.currency),
    display_amount: optionalString(source.display_amount),
    display_compare_at_amount: optionalString(
      source.display_compare_at_amount,
    ),
  };
}

function numericField(product: SpreeProduct, name: string): number | undefined {
  const value = field(product, name);
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numericPrice(price: SpreePrice | undefined): number | undefined {
  if (typeof price?.amount === "number" && Number.isFinite(price.amount)) {
    return price.amount;
  }
  if (typeof price?.amount === "string" && price.amount.trim()) {
    const parsed = Number(price.amount);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function priceCurrency(price: SpreePrice | undefined): string | undefined {
  const explicit = price?.currency?.trim().toUpperCase();
  if (explicit && /^[A-Z]{3}$/.test(explicit)) return explicit;

  const display = price?.display_amount ?? "";
  if (/US\$|\bUSD\b/i.test(display)) return "USD";
  if (/S\/|\bPEN\b/i.test(display)) return "PEN";
  if (/€|\bEUR\b/i.test(display)) return "EUR";
  return undefined;
}

function parseCustomField(value: unknown, context: string): SpreeCustomField {
  const source = record(value);
  if (!source) throw new Error(`${context} debe ser un objeto`);

  const key = optionalString(source.key);
  const label = optionalString(source.label);
  const name = optionalString(source.name);

  if (!key && !label && !name) {
    throw new Error(`${context} debe incluir key, label o name`);
  }

  return {
    key,
    label,
    name,
    type: optionalString(source.type),
    value: source.value,
  };
}

function parseMedia(value: unknown, context: string): SpreeMedia {
  const source = record(value);
  if (!source) throw new Error(`${context} debe ser un objeto`);

  const position = source.position;
  if (
    position !== undefined &&
    (typeof position !== "number" || !Number.isFinite(position))
  ) {
    throw new Error(`${context}.position debe ser un número`);
  }

  return {
    media_type: optionalString(source.media_type),
    position: typeof position === "number" ? position : undefined,
    original_url: optionalString(source.original_url),
    large_url: optionalString(source.large_url),
  };
}

function parseTag(value: unknown, context: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();

  const source = record(value);
  const name = source ? optionalString(source.name)?.trim() : undefined;
  if (name) return name;

  throw new Error(`${context} debe ser un texto o un objeto con name`);
}

function parseProduct(value: unknown, index: number): SpreeProduct {
  const context = `Spree.data[${index}]`;
  const source = record(value);
  if (!source) throw new Error(`${context} debe ser un objeto`);

  let tags: string[] | undefined;
  if (source.tags !== undefined) {
    if (!Array.isArray(source.tags)) {
      throw new Error(`${context}.tags debe ser una lista`);
    }
    tags = source.tags.map((tag, tagIndex) =>
      parseTag(tag, `${context}.tags[${tagIndex}]`),
    );
  }

  let customFields: SpreeCustomField[] | undefined;
  if (source.custom_fields !== undefined) {
    if (!Array.isArray(source.custom_fields)) {
      throw new Error(`${context}.custom_fields debe ser una lista`);
    }
    customFields = source.custom_fields.map((customField, customFieldIndex) =>
      parseCustomField(
        customField,
        `${context}.custom_fields[${customFieldIndex}]`,
      ),
    );
  }

  let media: SpreeMedia[] | undefined;
  if (source.media !== undefined) {
    if (!Array.isArray(source.media)) {
      throw new Error(`${context}.media debe ser una lista`);
    }
    media = source.media.map((item, mediaIndex) =>
      parseMedia(item, `${context}.media[${mediaIndex}]`),
    );
  }

  return {
    id: requiredString(source, "id", context),
    name: requiredString(source, "name", context),
    slug: requiredString(source, "slug", context),
    description:
      source.description === null
        ? null
        : optionalString(source.description),
    thumbnail_url:
      source.thumbnail_url === null
        ? null
        : optionalString(source.thumbnail_url),
    tags,
    price: parsePrice(source.price, `${context}.price`),
    original_price:
      source.original_price === null
        ? null
        : parsePrice(source.original_price, `${context}.original_price`),
    default_variant_id: optionalString(source.default_variant_id),
    custom_fields: customFields,
    media,
  };
}

export function parseSpreeProductResponse(
  payload: unknown,
): SpreeProductResponse {
  const source = record(payload);
  if (!source || !Array.isArray(source.data)) {
    throw new Error("La respuesta de Spree debe incluir una lista data");
  }

  return {
    data: source.data.map(parseProduct),
  };
}

function matchesField(field: SpreeCustomField, name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const shortName = normalizedName.split(".").at(-1) ?? normalizedName;

  return [field.key, field.name, field.label]
    .filter((value): value is string => typeof value === "string")
    .some((value) => {
      const normalizedValue = value.trim().toLowerCase();
      return (
        normalizedValue === normalizedName ||
        normalizedValue === shortName ||
        normalizedValue.endsWith(`.${shortName}`)
      );
    });
}

function field(product: SpreeProduct, name: string): string | undefined {
  const value = product.custom_fields?.find(
    (item) => matchesField(item, name),
  )?.value;

  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function listField(product: SpreeProduct, name: string): string[] | undefined {
  const value = product.custom_fields?.find(
    (item) => matchesField(item, name),
  )?.value;

  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
    return items.length ? items : undefined;
  }

  if (typeof value === "string") {
    const items = value
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  }

  return undefined;
}

function normalizeSpreeAssetUrl(
  value: string | undefined,
  spreeBaseUrl?: string,
): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value, spreeBaseUrl);
    const pointsToLocalhost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(
      url.hostname,
    );

    if (pointsToLocalhost && spreeBaseUrl) {
      const publicOrigin = new URL(spreeBaseUrl);
      return new URL(
        `${url.pathname}${url.search}${url.hash}`,
        publicOrigin,
      ).toString();
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function productImage(
  product: SpreeProduct,
  spreeBaseUrl?: string,
): string | undefined {
  const imageMedia = product.media
    ?.filter((item) => item.media_type !== "video")
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))[0];

  return normalizeSpreeAssetUrl(
    imageMedia?.original_url ??
      imageMedia?.large_url ??
      product.thumbnail_url ??
      undefined,
    spreeBaseUrl,
  );
}

export function mapSpreeProduct(
  product: SpreeProduct,
  index: number,
  spreeBaseUrl?: string,
): TravelPackage {
  const fallback = demoTravelPackages[index % demoTravelPackages.length];
  const capacity = numericField(product, RUMBO_PRODUCT_FIELD_KEYS.capacity);

  return {
    id: product.slug || product.id,
    destination: product.name,
    country:
      field(product, RUMBO_PRODUCT_FIELD_KEYS.country) ??
      "Destino internacional",
    image: productImage(product, spreeBaseUrl) ?? fallback.image,
    imagePosition: "center",
    duration:
      field(product, RUMBO_PRODUCT_FIELD_KEYS.duration) ??
      "Duración por confirmar",
    rating: field(product, RUMBO_PRODUCT_FIELD_KEYS.rating) ?? "Nuevo",
    reviews: field(product, RUMBO_PRODUCT_FIELD_KEYS.reviews) ?? "0",
    price: product.price?.display_amount ?? "Consultar",
    previousPrice:
      product.original_price?.display_amount ??
      product.price?.display_compare_at_amount ??
      "",
    tag: product.tags?.[0] ?? "Paquete Rumbo",
    included:
      listField(product, RUMBO_PRODUCT_FIELD_KEYS.included) ?? [
        "Itinerario por confirmar",
        "Asesoría de viaje",
      ],
    capacity,
    departureDate: field(product, RUMBO_PRODUCT_FIELD_KEYS.departureDate),
    returnDate: field(product, RUMBO_PRODUCT_FIELD_KEYS.returnDate),
    priceAmount: numericPrice(product.price),
    currency: priceCurrency(product.price),
    bookable: typeof capacity === "number" && capacity > 0,
    variantId: product.default_variant_id,
    provider: "Spree",
    providerReference: product.id,
  };
}

export async function getTravelCatalog(): Promise<CatalogResult> {
  const baseUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.SPREE_PUBLISHABLE_API_KEY;

  if (!baseUrl || !apiKey) {
    return {
      mode: "demo",
      packages: demoTravelPackages,
      message: FALLBACK_MESSAGE,
    };
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/v3/store/products?limit=24&expand=media,custom_fields`,
      {
        headers: {
          accept: "application/json",
          "x-spree-api-key": apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Spree respondió ${response.status}`);
    }

    const payload = parseSpreeProductResponse(await response.json());
    const packages = payload.data.map((product, index) =>
      mapSpreeProduct(product, index, baseUrl),
    );

    if (!packages.length) {
      return {
        mode: "demo",
        packages: demoTravelPackages,
        message: FALLBACK_MESSAGE,
      };
    }

    return {
      mode: "live",
      packages,
      message:
        "Ofertas sincronizadas con precio y cupos controlados por el backoffice de Rumbo.",
    };
  } catch {
    return {
      mode: "demo",
      packages: demoTravelPackages,
      message:
        "El backoffice no está disponible; se muestran datos demostrativos sin habilitar cobros.",
    };
  }
}
