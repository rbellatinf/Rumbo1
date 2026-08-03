# frozen_string_literal: true

module Rumbo
  class BookingHold < ApplicationRecord
    self.table_name = "rumbo_booking_holds"

    STATUSES = %w[active converted released expired].freeze

    belongs_to :booking_request,
               class_name: "Rumbo::BookingRequest",
               inverse_of: :hold
    belongs_to :inventory,
               class_name: "Rumbo::OfferInventory",
               inverse_of: :holds

    validates :status, inclusion: { in: STATUSES }
    validates :units, inclusion: { in: 1..18 }
    validates :expires_at, presence: true
  end
end
