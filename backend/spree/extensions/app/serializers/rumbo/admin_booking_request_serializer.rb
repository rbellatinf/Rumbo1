# frozen_string_literal: true

module Rumbo
  class AdminBookingRequestSerializer < BookingRequestSerializer
    typelize(
      contact_name: :string,
      contact_email: :string,
      contact_phone: :string,
      referral_code: [:string, nullable: true],
      notes: [:string, nullable: true],
      price_display: [:string, nullable: true],
      provider: :string,
      provider_reference: [:string, nullable: true],
      inventory_id: [:string, nullable: true],
      version: :number
    )

    attributes(
      :contact_name,
      :contact_email,
      :contact_phone,
      :referral_code,
      :notes,
      :price_display,
      :provider,
      :provider_reference,
      :inventory_id,
      :version
    )
  end
end
