# frozen_string_literal: true

definitions = [
  { key: "country", name: "País", type: "Spree::Metafields::ShortText" },
  { key: "duration", name: "Duración", type: "Spree::Metafields::ShortText" },
  { key: "included", name: "Incluye", type: "Spree::Metafields::LongText" },
  { key: "rating", name: "Calificación", type: "Spree::Metafields::Number" },
  { key: "reviews", name: "Número de reseñas", type: "Spree::Metafields::Number" },
  { key: "departure_date", name: "Fecha de salida", type: "Spree::Metafields::ShortText" },
  { key: "return_date", name: "Fecha de retorno", type: "Spree::Metafields::ShortText" },
  { key: "conditions", name: "Condiciones", type: "Spree::Metafields::LongText" },
  { key: "capacity", name: "Cupos", type: "Spree::Metafields::Number" },
  { key: "cancellation_policy", name: "Política de cancelación", type: "Spree::Metafields::LongText" }
].freeze

definitions.each do |attributes|
  definition = Spree::MetafieldDefinition.find_or_initialize_by(
    namespace: "rumbo",
    key: attributes.fetch(:key),
    resource_type: "Spree::Product"
  )

  expected_type = attributes.fetch(:type)
  if definition.persisted? && definition.metafield_type != expected_type
    abort(
      "Rumbo metafield #{definition.full_key} uses #{definition.metafield_type}; " \
      "expected #{expected_type}. Resolve the definition before deploying."
    )
  end

  definition.assign_attributes(
    name: attributes.fetch(:name),
    metafield_type: expected_type,
    display_on: "both"
  )
  definition.save!
end

puts "Rumbo product metafield definitions are up to date."
