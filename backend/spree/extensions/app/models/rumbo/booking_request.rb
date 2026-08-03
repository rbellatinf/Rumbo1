# frozen_string_literal: true

module Rumbo
  class BookingRequest < ApplicationRecord
    self.table_name = "rumbo_booking_requests"

    HOLD_DURATION = 15.minutes
    HOLD_STATUSES = %w[held payment_pending].freeze
    STATUSES = %w[
      new
      validating
      quoted
      held
      payment_pending
      paid
      confirmed
      cancelled
      expired
    ].freeze
    PAYMENT_STATUSES = %w[not_started pending paid failed cancelled expired].freeze
    CONTACT_CHANNELS = %w[whatsapp phone email].freeze

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
    validates :payment_status, inclusion: { in: PAYMENT_STATUSES }
    validates :adults, inclusion: { in: 1..9 }
    validates :children, inclusion: { in: 0..9 }
    validates :price_per_person,
              :price_total,
              numericality: { greater_than_or_equal_to: 0 },
              allow_nil: true
    validates :consent_accepted_at, presence: true
    validate :return_date_after_departure
    validate :hold_terms_are_complete
    validate :paid_booking_has_timestamp

    before_validation :normalize_attributes
    before_validation :assign_reference, on: :create
    before_validation :assign_hold_expiration, on: :create

    scope :for_store, ->(store) { where(spree_store_id: store.id) }
    scope :active_holds, -> { where(status: HOLD_STATUSES).where("hold_expires_at > ?", Time.current) }

    def prefixed_id
      reference
    end

    def traveler_count
      adults.to_i + children.to_i
    end

    def hold_active?
      HOLD_STATUSES.include?(status) &&
        hold_expires_at.present? &&
        hold_expires_at.future? &&
        payment_status != "paid"
    end

    def expire_hold_if_needed!
      return self unless HOLD_STATUSES.include?(status)
      return self if hold_expires_at.blank? || hold_expires_at.future?
      return self if payment_status == "paid"

      update!(
        status: "expired",
        payment_status: payment_status == "not_started" ? "expired" : payment_status
      )
      self
    end

    private

    def assign_reference
      self.reference ||= "RUM-#{Time.zone.today.strftime('%Y%m%d')}-#{SecureRandom.hex(3).upcase}"
    end

    def assign_hold_expiration
      return unless HOLD_STATUSES.include?(status)

      self.hold_expires_at ||= HOLD_DURATION.from_now
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
      self.payment_status = payment_status.to_s.strip.presence || "not_started"
    end

    def return_date_after_departure
      return if departure_date.blank? || return_date.blank?
      return if return_date > departure_date

      errors.add(:return_date, "must be after departure date")
    end

    def hold_terms_are_complete
      return unless %w[held payment_pending paid].include?(status)

      errors.add(:price_per_person, "is required for a price hold") if price_per_person.blank?
      errors.add(:price_total, "is required for a price hold") if price_total.blank?
      errors.add(:currency, "is required for a price hold") if currency.blank?
      errors.add(:hold_expires_at, "is required for a price hold") if hold_expires_at.blank?
    end

    def paid_booking_has_timestamp
      return unless payment_status == "paid"
      return if paid_at.present?

      errors.add(:paid_at, "is required when payment is marked as paid")
    end
  end
end
