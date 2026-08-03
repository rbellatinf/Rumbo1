# frozen_string_literal: true

module Rumbo
  class BookingRequestSerializer < Spree::Api::V3::BaseSerializer
    typelize(
      reference: :string,
      status: :string,
      product_name: :string,
      country: [:string, nullable: true],
      departure_date: [:string, nullable: true],
      return_date: [:string, nullable: true],
      adults: :number,
      children: :number,
      contact_channel: :string,
      unit_price_amount: :number,
      total_amount: :number,
      price_display: [:string, nullable: true],
      currency: [:string, nullable: true],
      remaining_capacity: [:number, nullable: true],
      payment_status: :string,
      payment_url: [:string, nullable: true],
      hold_expires_at: [:string, nullable: true],
      created_at: :string,
      updated_at: :string
    )

    attributes(
      :reference,
      :status,
      :product_name,
      :country,
      :adults,
      :children,
      :contact_channel,
      :price_display,
      :currency,
      :payment_status,
      :payment_url,
      :remaining_capacity
    )

    attribute(:unit_price_amount) { |booking| booking.unit_price_amount.to_f }
    attribute(:total_amount) { |booking| booking.total_amount.to_f }
    attribute(:hold_expires_at) { |booking| booking.hold_expires_at&.iso8601 }
    attribute(:departure_date) { |booking| booking.departure_date&.iso8601 }
    attribute(:return_date) { |booking| booking.return_date&.iso8601 }
    attribute(:created_at) { |booking| booking.created_at.iso8601 }
    attribute(:updated_at) { |booking| booking.updated_at.iso8601 }
  end
end
