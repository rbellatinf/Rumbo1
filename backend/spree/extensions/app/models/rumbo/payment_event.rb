# frozen_string_literal: true

module Rumbo
  class PaymentEvent < ApplicationRecord
    self.table_name = "rumbo_payment_events"

    PAYMENT_STATUSES = %w[pending authorized paid failed cancelled refunded].freeze
    PROCESSING_STATUSES = %w[received applied rejected].freeze

    belongs_to :booking_payment,
               class_name: "Rumbo::BookingPayment",
               inverse_of: :events

    validates :provider, :provider_event_id, :event_type, :currency,
              :payload_digest, presence: true
    validates :provider_event_id, uniqueness: { scope: :provider }
    validates :payment_status, inclusion: { in: PAYMENT_STATUSES }
    validates :processing_status, inclusion: { in: PROCESSING_STATUSES }
    validates :amount, numericality: { greater_than_or_equal_to: 0 }
  end
end
