# frozen_string_literal: true

module Rumbo
  class BookingRequest < ApplicationRecord
    self.table_name = "rumbo_booking_requests"

    STATUSES = %w[
      new
      validating
      quoted
      payment_pending
      payment_failed
      confirmed
      cancelled
      expired
    ].freeze
    CONTACT_CHANNELS = %w[whatsapp phone email].freeze

    belongs_to :inventory,
               class_name: "Rumbo::OfferInventory",
               inverse_of: :booking_requests,
               optional: true
    has_one :hold,
            class_name: "Rumbo::BookingHold",
            inverse_of: :booking_request,
            dependent: :destroy
    has_one :payment,
            class_name: "Rumbo::BookingPayment",
            inverse_of: :booking_request,
            dependent: :destroy

    validates :reference, presence: true, uniqueness: true
    validates :idempotency_key, presence: true, uniqueness: true
    validates :spree_product_id, :product_slug, :product_name, presence: true
    validates :contact_name, length: { in: 2..160 }
    validates :contact_email,
              length: { maximum: 254 },
              format: { with: URI::MailTo::EMAIL_REGEXP }
    validates :contact_phone, length: { in: 7..40 }
    validates :contact_channel, inclusion: { in: CONTACT_CHANNELS }
    validates :status, inclusion: { in: STATUSES }
    validates :adults, inclusion: { in: 1..9 }
    validates :children, inclusion: { in: 0..9 }
    validates :consent_accepted_at, presence: true
    validate :return_date_after_departure

    before_validation :normalize_attributes
    before_validation :assign_reference, on: :create

    scope :for_store, ->(store) { where(spree_store_id: store.id) }

    def self.expire_stale_holds!
      connection.select_value("SELECT rumbo_expire_stale_booking_holds()")
    end

    def prefixed_id
      reference
    end

    def remaining_capacity
      inventory&.remaining_capacity
    end

    def payment_status
      payment&.status || "pending"
    end

    def payment_url
      payment&.payment_url
    end

    private

    def assign_reference
      self.reference ||= "RUM-#{Time.zone.today.strftime('%Y%m%d')}-#{SecureRandom.hex(3).upcase}"
    end

    def normalize_attributes
      self.contact_email = contact_email.to_s.strip.downcase
      self.contact_name = contact_name.to_s.strip
      self.contact_phone = contact_phone.to_s.strip
      self.origin_iata = origin_iata.to_s.strip.upcase.presence
      self.destination_iata = destination_iata.to_s.strip.upcase.presence
      self.currency = currency.to_s.strip.upcase.presence
      self.referral_code = referral_code.to_s.strip.upcase.presence
      self.provider = provider.to_s.strip.presence || "Spree"
    end

    def return_date_after_departure
      return if departure_date.blank? || return_date.blank?
      return if return_date > departure_date

      errors.add(:return_date, "must be after departure date")
    end
  end
end
