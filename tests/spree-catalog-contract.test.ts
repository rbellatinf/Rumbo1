import assert from "node:assert/strict";
import test from "node:test";

import {
  mapSpreeProduct,
  parseSpreeProductResponse,
  RUMBO_PRODUCT_FIELD_KEYS,
} from "../lib/spree-catalog.ts";

const spreeProductPayload = {
  data: [
    {
      id: "prod_panama",
      name: "Panamá – 5 días / 4 noches",
      slug: "panama-5-dias-4-noches",
      description: "Paquete de prueba del catálogo real de Rumbo.",
      thumbnail_url: "https://images.example.com/panama.jpg",
      tags: ["Caribe"],
      price: {
        display_amount: "US$ 699",
        display_compare_at_amount: "US$ 799",
      },
      original_price: null,
      default_variant_id: "variant_panama",
      custom_fields: [
        {
          id: "cf_country",
          key: "rumbo.country",
          label: "País",
          type: "Spree::Metafields::ShortText",
          value: "Panamá",
        },
        {
          id: "cf_duration",
          key: "rumbo.duration",
          label: "Duración",
          type: "Spree::Metafields::ShortText",
          value: "5 días / 4 noches",
        },
        {
          id: "cf_included",
          key: "rumbo.included",
          label: "Incluye",
          type: "Spree::Metafields::LongText",
          value: "Hotel con desayuno|Traslados|City tour",
        },
        {
          id: "cf_rating",
          key: "rumbo.rating",
          label: "Calificación",
          type: "Spree::Metafields::Number",
          value: 4.8,
        },
        {
          id: "cf_reviews",
          key: "rumbo.reviews",
          label: "Número de reseñas",
          type: "Spree::Metafields::Number",
          value: 125,
        },
      ],
    },
  ],
};

test("maps the Spree 5.4 product contract into a Rumbo package", () => {
  const payload = parseSpreeProductResponse(spreeProductPayload);
  const travelPackage = mapSpreeProduct(payload.data[0], 0);

  assert.deepEqual(travelPackage, {
    id: "panama-5-dias-4-noches",
    destination: "Panamá – 5 días / 4 noches",
    country: "Panamá",
    image: "https://images.example.com/panama.jpg",
    imagePosition: "center",
    duration: "5 días / 4 noches",
    rating: "4.8",
    reviews: "125",
    price: "US$ 699",
    previousPrice: "US$ 799",
    tag: "Caribe",
    included: ["Hotel con desayuno", "Traslados", "City tour"],
    variantId: "variant_panama",
    provider: "Spree",
    providerReference: "prod_panama",
  });
});

test("accepts namespaced custom fields from an existing Spree catalog", () => {
  const payload = structuredClone(spreeProductPayload);
  payload.data[0].custom_fields[0].key = "custom.country";

  const parsed = parseSpreeProductResponse(payload);
  assert.equal(mapSpreeProduct(parsed.data[0], 0).country, "Panamá");
});

test("accepts tag objects returned by the live Spree Store API", () => {
  const payload = structuredClone(spreeProductPayload);
  payload.data[0].tags = [{ id: 1, name: "Oferta" }] as unknown as string[];

  const parsed = parseSpreeProductResponse(payload);
  assert.equal(mapSpreeProduct(parsed.data[0], 0).tag, "Oferta");
});

test("uses expanded Spree media and repairs localhost asset URLs", () => {
  const payload = structuredClone(spreeProductPayload);
  payload.data[0].thumbnail_url =
    "https://localhost:3000/rails/active_storage/thumbnail.jpg";
  Object.assign(payload.data[0], {
    media: [
      {
        media_type: "image",
        position: 1,
        original_url:
          "https://localhost:3000/rails/active_storage/blobs/panama.jpg",
      },
    ],
  });

  const parsed = parseSpreeProductResponse(payload);
  const travelPackage = mapSpreeProduct(
    parsed.data[0],
    0,
    "https://rumbo1-spree.onrender.com",
  );

  assert.equal(
    travelPackage.image,
    "https://rumbo1-spree.onrender.com/rails/active_storage/blobs/panama.jpg",
  );
});

test("rejects a changed Spree response instead of rendering inconsistent data", () => {
  assert.throws(
    () => parseSpreeProductResponse({ data: [{ id: "missing-fields" }] }),
    /name debe ser un texto no vacío/,
  );
  assert.throws(
    () => parseSpreeProductResponse({ products: [] }),
    /debe incluir una lista data/,
  );
});

test("keeps the canonical Rumbo metafield keys explicit", () => {
  assert.deepEqual(RUMBO_PRODUCT_FIELD_KEYS, {
    country: "rumbo.country",
    duration: "rumbo.duration",
    included: "rumbo.included",
    rating: "rumbo.rating",
    reviews: "rumbo.reviews",
  });
});
