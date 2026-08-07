# frozen_string_literal: true

module Rumbo
  class BookingPayment < ApplicationRecord
    class InvalidTransition < StandardError; end

    self.table_name = "rumbo_booking_payments"

    STATUSES = %w[pending authorized paid failed cancelled refunded].freeze
    TRANSITIONS = {
      "pending" => %w[authorized paid failed cancelled],
      "authorized" => %w[paid failed cancelled],
      "failed" => %w[pending authorized paid cancelled],
      "paid" => %w[refunded],
      "cancelled" => [],
      "refunded" => []
    }.freeze

    belongs_to :booking_request,
               class_name: "Rumbo::BookingRequest",
               inverse_of: :payment
    has_many :events,
             class_name: "Rumbo::PaymentEvent",
             foreign_key: :booking_payment_id,
             inverse_of: :booking_payment,
             dependent: :delete_all

    validates :provider, :currency, presence: true
    validates :status, inclusion: { in: STATUSES }
    validates :amount, numericality: { greater_than_or_equal_to: 0 }

    def apply_provider_status!(new_status, provider_payment_id: nil)
      normalized_status = new_status.to_s.strip.downcase
      raise InvalidTransition, "Unknown payment status" unless STATUSES.include?(normalized_status)
      return self if normalized_status == status

      allowed = TRANSITIONS.fetch(status)
      unless allowed.include?(normalized_status)
        raise InvalidTransition, "Invalid payment transition: #{status} -> #{normalized_status}"
      end

      if self.provider_payment_id.present? &&
         provider_payment_id.present? &&
         self.provider_payment_id != provider_payment_id
        raise InvalidTransition, "Provider payment reference changed"
      end

      update!(
        status: normalized_status,
        provider_payment_id: self.provider_payment_id.presence || provider_payment_id
      )

      if normalized_status == "paid"
        Rumbo::CommissionAttribution.apply_paid_booking!(booking_request.reload)
      elsif normalized_status == "refunded"
        Rumbo::CommissionAttribution.reverse_booking!(booking_request.reload)
      end

      self
    end
  end
end
