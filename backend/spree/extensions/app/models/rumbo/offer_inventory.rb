# frozen_string_literal: true

module Rumbo
  class OfferInventory < ApplicationRecord
    class Unavailable < StandardError; end

    self.table_name = "rumbo_offer_inventory"

    has_many :booking_requests,
             class_name: "Rumbo::BookingRequest",
             foreign_key: :inventory_id,
             inverse_of: :inventory,
             dependent: :restrict_with_error
    has_many :holds,
             class_name: "Rumbo::BookingHold",
             foreign_key: :inventory_id,
             inverse_of: :inventory,
             dependent: :restrict_with_error

    validates :spree_store_id, :spree_product_id, :price_display, :currency,
              presence: true
    validates :total_capacity, numericality: { only_integer: true, greater_than: 0 }
    validates :price_amount, numericality: { greater_than_or_equal_to: 0 }
    validate :return_date_after_departure

    def self.sync_from_product!(store:, product:, departure_date:, return_date:)
      capacity = product.get_metafield("rumbo.capacity")&.serialize_value&.to_i || 0
      raise Unavailable, "La oferta no tiene cupos configurados." unless capacity.positive?

      fixed_departure = date_metafield(product, "departure_date")
      fixed_return = date_metafield(product, "return_date")
      departure = fixed_departure || parse_date(departure_date)
      returning = fixed_return || parse_date(return_date)
      if departure.blank? || returning.blank? || returning <= departure
        raise Unavailable, "La oferta no tiene fechas válidas configuradas."
      end

      currency = store.default_currency.to_s.upcase
      variant = product.default_variant
      price = variant.price_in(currency)
      if price.amount.blank? || price.amount.negative?
        raise Unavailable, "La oferta no tiene un precio válido configurado."
      end

      attributes = {
        spree_variant_id: variant.prefixed_id,
        total_capacity: capacity,
        price_amount: price.amount,
        price_display: price.display_amount.to_s,
        currency: price.currency.to_s.upcase,
        active: true,
        valid_until: departure.in_time_zone.beginning_of_day
      }
      lookup = {
        spree_store_id: store.id,
        spree_product_id: product.prefixed_id,
        departure_date: departure,
        return_date: returning
      }

      sync_inventory!(lookup, attributes)
    end

    def remaining_capacity
      committed = holds.where(status: "converted").sum(:units)
      committed += holds.where(status: "active").where("expires_at > ?", Time.current).sum(:units)
      [total_capacity - committed, 0].max
    end

    private_class_method def self.sync_inventory!(lookup, attributes)
      inventory = find_or_initialize_by(lookup)

      if inventory.persisted?
        inventory.with_lock do
          inventory.assign_attributes(attributes)
          inventory.save!
        end
      else
        inventory.assign_attributes(attributes)
        inventory.save!
      end

      inventory
    rescue ActiveRecord::RecordNotUnique
      inventory = find_by!(lookup)
      inventory.with_lock do
        inventory.assign_attributes(attributes)
        inventory.save!
      end
      inventory
    end

    private_class_method def self.date_metafield(product, key)
      value = product.get_metafield("rumbo.#{key}")&.serialize_value
      return if value.blank?

      parse_date(value)
    rescue Date::Error
      raise Unavailable, "La oferta tiene una fecha inválida en Spree."
    end

    private_class_method def self.parse_date(value)
      return value if value.is_a?(Date)
      return if value.blank?

      Date.iso8601(value.to_s)
    rescue Date::Error
      nil
    end

    def return_date_after_departure
      return if departure_date.blank? || return_date.blank?
      return if return_date > departure_date

      errors.add(:return_date, "must be after departure date")
    end
  end
end
