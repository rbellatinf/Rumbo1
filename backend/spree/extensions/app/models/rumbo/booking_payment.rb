# frozen_string_literal: true

module Rumbo
  class BookingPayment < ApplicationRecord
    self.table_name = "rumbo_booking_payments"

    STATUSES = %w[pending authorized paid failed cancelled refunded].freeze

    belongs_to :booking_request,
               class_name: "Rumbo::BookingRequest",
               inverse_of: :payment

    validates :provider, :currency, presence: true
    validates :status, inclusion: { in: STATUSES }
    validates :amount, numericality: { greater_than_or_equal_to: 0 }
  end
end
