import {
  demoTravelPackages,
  type TravelPackage,
} from "./travel-packages";

type SpreePrice = {
  display_amount?: string | null;
  display_compare_at_amount?: string | null;
};

type SpreeCustomField = {
  name?: string;
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
  data?: SpreeProduct[];
};

export type CatalogResult = {
  mode: "demo" | "live";
  packages: TravelPackage[];
  message: string;
};

const FALLBACK_MESSAGE =
  "Catálogo demostrativo: las tarifas deben confirmarse antes de cobrar.";

function field(product: SpreeProduct, name: string): string | undefined {
  const value = product.custom_fields?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value;

  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function listField(product: SpreeProduct, name: string): string[] | undefined {
  const value = product.custom_fields?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value;

  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
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

function mapProduct(
  product: SpreeProduct,
  index: number,
): TravelPackage {
  const fallback = demoTravelPackages[index % demoTravelPackages.length];

  return {
    id: product.slug || product.id,
    destination: product.name,
    country: field(product, "country") ?? "Destino internacional",
    image: product.thumbnail_url ?? fallback.image,
    imagePosition: "center",
    duration: field(product, "duration") ?? "Duración por confirmar",
    rating: field(product, "rating") ?? "Nuevo",
    reviews: field(product, "reviews") ?? "0",
    price: product.price?.display_amount ?? "Consultar",
    previousPrice:
      product.original_price?.display_amount ??
      product.price?.display_compare_at_amount ??
      "",
    tag: product.tags?.[0] ?? "Paquete Rumbo",
    included:
      listField(product, "included") ?? [
        "Itinerario por confirmar",
        "Asesoría de viaje",
      ],
    variantId: product.default_variant_id,
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

    const payload = (await response.json()) as SpreeProductResponse;
    const packages = (payload.data ?? []).map(mapProduct);

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

