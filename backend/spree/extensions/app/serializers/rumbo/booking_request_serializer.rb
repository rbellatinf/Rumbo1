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
      :contact_channel
    )

    attribute(:departure_date) { |booking| booking.departure_date&.iso8601 }
    attribute(:return_date) { |booking| booking.return_date&.iso8601 }
    attribute(:created_at) { |booking| booking.created_at.iso8601 }
    attribute(:updated_at) { |booking| booking.updated_at.iso8601 }
  end
end
