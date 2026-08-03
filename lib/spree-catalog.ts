import {
  demoTravelPackages,
  type TravelPackage,
} from "./travel-packages.ts";

type SpreePrice = {
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
  "Catálogo demostrativo: las tarifas deben confirmarse antes de cobrar.";

export const RUMBO_PRODUCT_FIELD_KEYS = {
  country: "rumbo.country",
  duration: "rumbo.duration",
  included: "rumbo.included",
  rating: "rumbo.rating",
  reviews: "rumbo.reviews",
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

  return {
    display_amount: optionalString(source.display_amount),
    display_compare_at_amount: optionalString(
      source.display_compare_at_amount,
    ),
  };
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

export function mapSpreeProduct(
  product: SpreeProduct,
  index: number,
): TravelPackage {
  const fallback = demoTravelPackages[index % demoTravelPackages.length];

  return {
    id: product.slug || product.id,
    destination: product.name,
    country:
      field(product, RUMBO_PRODUCT_FIELD_KEYS.country) ??
      "Destino internacional",
    image: product.thumbnail_url ?? fallback.image,
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
    variantId: product.default_variant_id,
    provider: "Spree",
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
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      throw new Error(`Spree respondió ${response.status}`);
    }

    const payload = parseSpreeProductResponse(await response.json());
    const packages = payload.data.map(mapSpreeProduct);

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
      message: "Catálogo sincronizado con el backoffice de Rumbo.",
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
