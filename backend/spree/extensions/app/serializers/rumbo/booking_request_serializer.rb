# frozen_string_literal: true

module Rumbo
  class BookingRequestSerializer < Spree::Api::V3::BaseSerializer
    typelize(
      reference: :string,
      status: :string,
      payment_status: :string,
      product_name: :string,
      country: [:string, nullable: true],
      departure_date: [:string, nullable: true],
      return_date: [:string, nullable: true],
      adults: :number,
      children: :number,
      contact_channel: :string,
      price_per_person: [:string, nullable: true],
      price_total: [:string, nullable: true],
      currency: [:string, nullable: true],
      hold_expires_at: [:string, nullable: true],
      hold_active: :boolean,
      created_at: :string,
      updated_at: :string
    )

    attributes(
      :reference,
      :status,
      :payment_status,
      :product_name,
      :country,
      :adults,
      :children,
      :contact_channel,
      :currency
    )

    attribute(:departure_date) { |booking| booking.departure_date&.iso8601 }
    attribute(:return_date) { |booking| booking.return_date&.iso8601 }
    attribute(:price_per_person) { |booking| booking.price_per_person&.to_s("F") }
    attribute(:price_total) { |booking| booking.price_total&.to_s("F") }
    attribute(:hold_expires_at) { |booking| booking.hold_expires_at&.iso8601 }
    attribute(:hold_active) { |booking| booking.hold_active? }
    attribute(:created_at) { |booking| booking.created_at.iso8601 }
    attribute(:updated_at) { |booking| booking.updated_at.iso8601 }
  end
end
