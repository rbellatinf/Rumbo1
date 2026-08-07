# frozen_string_literal: true

module Rumbo
  class CommissionAttribution
    def self.apply_paid_booking!(booking)
      new(booking).apply!
    end

    def self.reverse_booking!(booking)
      attribution = Rumbo::SaleAttribution.find_by(booking_request_id: booking.id)
      return unless attribution

      attribution.update!(payment_status: "refunded")
      attribution.commissions.where.not(status: %w[rejected reversed]).update_all(
        status: "reversed",
        updated_at: Time.current
      )
      attribution
    end

    def initialize(booking)
      @booking = booking
    end

    def apply!
      return if booking.referral_code.blank?
      return unless booking.total_amount.present? && booking.currency.present?

      partner = Rumbo::PartnerProfile.find_by(referral_code: booking.referral_code)
      return unless partner&.associate_id

      attribution = Rumbo::SaleAttribution.find_or_create_by!(booking_request_id: booking.id) do |sale|
        sale.spree_order_id = booking.reference
        sale.associate_id = partner.associate_id
        sale.referral_code = partner.referral_code
        sale.currency = booking.currency
        sale.gross_amount = booking.total_amount
        sale.payment_status = "confirmed"
        sale.source_channel = "partner"
        sale.referred_partner_id = partner.account_id
        sale.confirmed_at = Time.current
      end

      attribution.update!(
        payment_status: "confirmed",
        gross_amount: booking.total_amount,
        currency: booking.currency,
        confirmed_at: attribution.confirmed_at || Time.current
      )

      create_commission!(
        attribution: attribution,
        beneficiary_type: "partner",
        beneficiary_id: partner.account_id,
        rate: partner.commission_rate
      )

      sponsor = partner.sponsor
      if sponsor && partner.network_commission_rate.to_d.positive?
        create_commission!(
          attribution: attribution,
          beneficiary_type: "sponsor",
          beneficiary_id: sponsor.account_id,
          rate: partner.network_commission_rate
        )
      end

      attribution
    end

    private

    attr_reader :booking

    def create_commission!(attribution:, beneficiary_type:, beneficiary_id:, rate:)
      rate = rate.to_d
      return unless rate.positive?

      Rumbo::Commission.find_or_create_by!(
        sale_attribution_id: attribution.id,
        beneficiary_type: beneficiary_type,
        beneficiary_id: beneficiary_id
      ) do |commission|
        commission.rate = rate
        commission.base_amount = booking.total_amount
        commission.commission_amount = (booking.total_amount.to_d * rate).round(2)
        commission.currency = booking.currency
        commission.status = "approved"
        commission.approved_by = "payment_webhook"
        commission.approved_at = Time.current
      end
    end
  end
end
