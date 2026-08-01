import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { searchAirports } from "../lib/airlabs-airports.ts";
import {
  searchPriceTravelPackages,
  type PackageSearchInput,
} from "../lib/pricetravel-packages.ts";
import { getTravelCatalog } from "../lib/spree-catalog.ts";

const MANAGED_ENV = [
  "AIRLABS_API_KEY",
  "AIRLABS_API_BASE_URL",
  "PRICETRAVEL_API_URL",
  "PRICETRAVEL_USERNAME",
  "PRICETRAVEL_PASSWORD",
  "PRICETRAVEL_PACKAGES_PATH",
  "SPREE_API_URL",
  "SPREE_PUBLISHABLE_API_KEY",
] as const;

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(
  MANAGED_ENV.map((name) => [name, process.env[name]]),
);

const packageSearchInput: PackageSearchInput = {
  originIata: "LIM",
  destinationIata: "PTY",
  destinationName: "Ciudad de Panamá",
  departureDate: "2026-09-14",
  returnDate: "2026-09-18",
  adults: 2,
  currency: "USD",
};

function clearProviderEnvironment() {
  for (const name of MANAGED_ENV) delete process.env[name];
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const name of MANAGED_ENV) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("AirLabs finds Panamá in the local fallback without an API key", async () => {
  clearProviderEnvironment();
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  }) as typeof fetch;

  const result = await searchAirports("  Paná  ");

  assert.equal(result.mode, "demo");
  assert.equal(fetchCalled, false);
  assert.equal(result.airports[0]?.iataCode, "PTY");
  assert.equal(result.airports[0]?.countryName, "Panamá");
});

test("AirLabs maps, normalizes, and deduplicates live suggestions", async () => {
  clearProviderEnvironment();
  process.env.AIRLABS_API_KEY = "test-airlabs-key";
  process.env.AIRLABS_API_BASE_URL = "https://airlabs.example.test/api/v9/";
  let requestedUrl = "";

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return jsonResponse({
      response: {
        countries: [{ code: "PA", name: "Panamá" }],
        cities: [
          { city_code: "pty", name: "Ciudad de Panamá", country_code: "pa" },
        ],
        airports: [
          {
            iata_code: "pty",
            icao_code: "MPTO",
            name: "Aeropuerto Internacional de Tocumen",
            city: "Ciudad de Panamá",
            country_code: "pa",
          },
          {
            iata_code: "PTY",
            icao_code: "MPTO",
            name: "Tocumen duplicado",
            city: "Ciudad de Panamá",
            country_code: "PA",
          },
          { iata_code: "XX", name: "Código inválido" },
        ],
      },
    });
  }) as typeof fetch;

  const result = await searchAirports("Panamá");
  const url = new URL(requestedUrl);

  assert.equal(result.mode, "live");
  assert.equal(url.origin + url.pathname, "https://airlabs.example.test/api/v9/suggest");
  assert.equal(url.searchParams.get("q"), "Panamá");
  assert.equal(url.searchParams.get("api_key"), "test-airlabs-key");
  assert.deepEqual(
    result.airports.map(({ iataCode, subType, countryName }) => ({
      iataCode,
      subType,
      countryName,
    })),
    [
      { iataCode: "PTY", subType: "CITY", countryName: "Panamá" },
      { iataCode: "PTY", subType: "AIRPORT", countryName: "Panamá" },
    ],
  );
});

test("AirLabs falls back safely when the provider fails", async () => {
  clearProviderEnvironment();
  process.env.AIRLABS_API_KEY = "test-airlabs-key";
  globalThis.fetch = (async () => jsonResponse({}, 503)) as typeof fetch;

  const result = await searchAirports("Panamá");

  assert.equal(result.mode, "demo");
  assert.equal(result.airports[0]?.iataCode, "PTY");
  assert.match(result.message, /no respondió/i);
});

test("PriceTravel returns destination demos without B2B credentials", async () => {
  clearProviderEnvironment();
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  }) as typeof fetch;

  const result = await searchPriceTravelPackages({
    ...packageSearchInput,
    destinationName: "Cusco",
    destinationIata: "CUZ",
  });

  assert.equal(result.mode, "demo");
  assert.equal(fetchCalled, false);
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0]?.id, "cusco");
});

test("PriceTravel sends the search contract and maps a live package", async () => {
  clearProviderEnvironment();
  process.env.PRICETRAVEL_API_URL = "https://price.example.test/";
  process.env.PRICETRAVEL_USERNAME = "rumbo-user";
  process.env.PRICETRAVEL_PASSWORD = "rumbo-pass";
  process.env.PRICETRAVEL_PACKAGES_PATH = "v1/packages";
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    return jsonResponse({
      Results: [
        {
          PackageId: "PT-PTY-001",
          PackageName: "Panamá urbano",
          CountryName: "Panamá",
          ImageUrl: "https://images.example.test/panama.jpg",
          TotalAmount: "1540.5",
          Currency: "USD",
          Nights: 4,
          Stars: "4.7",
          Reviews: "82",
          Services: [
            { Name: "Hotel con desayuno" },
            { Description: "Traslados" },
          ],
        },
      ],
    });
  }) as typeof fetch;

  const result = await searchPriceTravelPackages(packageSearchInput);
  const url = new URL(requestedUrl);
  const headers = new Headers(requestedHeaders);

  assert.equal(result.mode, "live");
  assert.equal(url.origin + url.pathname, "https://price.example.test/v1/packages");
  assert.equal(url.searchParams.get("originAirportCode"), "LIM");
  assert.equal(url.searchParams.get("destinationAirportCode"), "PTY");
  assert.equal(url.searchParams.get("departureDate"), "2026-09-14");
  assert.equal(url.searchParams.get("returnDate"), "2026-09-18");
  assert.equal(url.searchParams.get("adults"), "2");
  assert.equal(headers.get("authorization"), "Basic cnVtYm8tdXNlcjpydW1iby1wYXNz");
  assert.deepEqual(result.packages[0], {
    id: "PT-PTY-001",
    destination: "Panamá urbano",
    country: "Panamá",
    image: "https://images.example.test/panama.jpg",
    imagePosition: "center",
    duration: "4 noches",
    rating: "4.7",
    reviews: "82",
    price: new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(1540.5),
    previousPrice: "",
    tag: "PriceTravel",
    included: ["Hotel con desayuno", "Traslados"],
    provider: "PriceTravel",
    providerReference: "PT-PTY-001",
  });
});

test("PriceTravel distinguishes an empty live search from a provider failure", async () => {
  clearProviderEnvironment();
  process.env.PRICETRAVEL_API_URL = "https://price.example.test";
  process.env.PRICETRAVEL_USERNAME = "rumbo-user";
  process.env.PRICETRAVEL_PASSWORD = "rumbo-pass";
  process.env.PRICETRAVEL_PACKAGES_PATH = "/v1/packages";
  globalThis.fetch = (async () => jsonResponse({ Results: [] })) as typeof fetch;

  const emptyResult = await searchPriceTravelPackages(packageSearchInput);

  assert.equal(emptyResult.mode, "live");
  assert.deepEqual(emptyResult.packages, []);
  assert.match(emptyResult.message, /no encontró paquetes/i);

  globalThis.fetch = (async () => {
    throw new Error("provider offline");
  }) as typeof fetch;

  const failedResult = await searchPriceTravelPackages(packageSearchInput);

  assert.equal(failedResult.mode, "demo");
  assert.ok(failedResult.packages.length > 0);
  assert.match(failedResult.message, /no respondió/i);
});

test("Spree returns the demo catalog when configuration is missing", async () => {
  clearProviderEnvironment();
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  }) as typeof fetch;

  const result = await getTravelCatalog();

  assert.equal(result.mode, "demo");
  assert.equal(fetchCalled, false);
  assert.ok(result.packages.length > 0);
});

test("Spree sends its API key and maps a live catalog response", async () => {
  clearProviderEnvironment();
  process.env.SPREE_API_URL = "https://spree.example.test/";
  process.env.SPREE_PUBLISHABLE_API_KEY = "pk_test_rumbo";
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    return jsonResponse({
      data: [
        {
          id: "product-panama",
          name: "Paquete Panamá",
          slug: "paquete-panama",
          thumbnail_url: "https://images.example.test/package.jpg",
          tags: ["Oferta"],
          price: { display_amount: "US$ 899" },
          default_variant_id: "variant-panama",
          custom_fields: [
            { key: "rumbo.country", label: "País", value: "Panamá" },
            { key: "rumbo.duration", label: "Duración", value: "5 días" },
            { key: "rumbo.rating", label: "Calificación", value: 4.8 },
            { key: "rumbo.reviews", label: "Reseñas", value: 126 },
            {
              key: "rumbo.included",
              label: "Incluye",
              value: "Hotel|Traslados",
            },
          ],
        },
      ],
    });
  }) as typeof fetch;

  const result = await getTravelCatalog();
  const headers = new Headers(requestedHeaders);

  assert.equal(
    requestedUrl,
    "https://spree.example.test/api/v3/store/products?limit=24&expand=media,custom_fields",
  );
  assert.equal(headers.get("x-spree-api-key"), "pk_test_rumbo");
  assert.equal(result.mode, "live");
  assert.equal(result.packages[0]?.id, "paquete-panama");
  assert.equal(result.packages[0]?.country, "Panamá");
  assert.deepEqual(result.packages[0]?.included, ["Hotel", "Traslados"]);
});

test("Spree falls back safely when its response breaks the contract", async () => {
  clearProviderEnvironment();
  process.env.SPREE_API_URL = "https://spree.example.test";
  process.env.SPREE_PUBLISHABLE_API_KEY = "pk_test_rumbo";
  globalThis.fetch = (async () => jsonResponse({ products: [] })) as typeof fetch;

  const result = await getTravelCatalog();

  assert.equal(result.mode, "demo");
  assert.ok(result.packages.length > 0);
  assert.match(result.message, /backoffice no está disponible/i);
});
