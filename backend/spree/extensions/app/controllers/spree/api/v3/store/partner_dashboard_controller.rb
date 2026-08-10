# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Store
        class PartnerDashboardController < ResourceController
          prepend_before_action :authenticate_api_key!
          skip_before_action :set_resource, raise: false

          def show
            session = current_rumbo_session
            return unauthorized unless session

            account = session.account
            return forbidden unless account.role == "partner" && account.partner_profile

            profile = account.partner_profile
            settings = Rumbo::GlobalCommissionSetting.current
            reservations = Rumbo::BookingRequest.
                           where(referral_code: profile.referral_code).
                           order(created_at: :desc)
            attributions = Rumbo::SaleAttribution.
                           where(associate_id: profile.associate_id).
                           includes(:booking_request, :commissions).
                           order(attributed_at: :desc)
            partner_commissions = Rumbo::Commission.
                                  where(
                                    beneficiary_type: "partner",
                                    beneficiary_id: account.id
                                  ).
                                  where.not(status: %w[rejected reversed])
            pending_commissions = partner_commissions.where(status: %w[pending approved])
            direct_network = Rumbo::ReferralRelationship.
                             where(sponsor_partner_id: account.id, status: "active")

            render json: {
              profile: {
                first_name: profile.first_name,
                last_name: profile.last_name,
                referral_code: profile.referral_code,
                membership_status: profile.associate&.membership_status || account.status,
                commission_rate: settings.partner_rate.to_f,
                sponsor_rate: settings.sponsor_rate.to_f
              },
              metrics: {
                reservations: reservations.count,
                confirmed_sales: attributions.where(payment_status: "confirmed").count,
                direct_network: direct_network.count,
                sold_amounts: amounts_by_currency(attributions, :gross_amount),
                accumulated_commissions: amounts_by_currency(partner_commissions, :commission_amount),
                pending_commissions: amounts_by_currency(pending_commissions, :commission_amount)
              },
              reservations: reservations.limit(20).map { |booking| reservation_payload(booking) },
              sales: attributions.limit(20).map { |sale| sale_payload(sale, account.id) },
              network: direct_network.limit(50).map { |relationship| network_payload(relationship) }
            }, status: :ok
          end

          protected

          def authorize_resource!(_resource = nil, _action = nil)
            true
          end

          private

          def current_rumbo_session
            header = request.headers["Authorization"].to_s
            token = header.start_with?("Bearer ") ? header.delete_prefix("Bearer ").strip : nil
            Rumbo::AuthSession.from_token(token)
          end

          def amounts_by_currency(scope, column)
            scope.group(:currency).sum(column).each_with_object({}) do |(currency, amount), result|
              result[currency.to_s.upcase] = amount.to_d.to_f
            end
          end

          def reservation_payload(booking)
            {
              reference: booking.reference,
              product_name: booking.product_name,
              customer: booking.contact_name,
              status: booking.status,
              payment_status: booking.payment_status,
              total_amount: booking.total_amount&.to_d&.to_f,
              currency: booking.currency,
              departure_date: booking.departure_date&.iso8601,
              return_date: booking.return_date&.iso8601,
              created_at: booking.created_at&.iso8601
            }
          end

          def sale_payload(sale, account_id)
            booking = sale.booking_request
            commission = sale.commissions.find do |item|
              item.beneficiary_type == "partner" && item.beneficiary_id.to_s == account_id.to_s
            end

            {
              reference: booking&.reference || sale.spree_order_id,
              customer: booking&.contact_name,
              product_name: booking&.product_name,
              gross_amount: sale.gross_amount.to_d.to_f,
              currency: sale.currency,
              payment_status: sale.payment_status,
              commission_amount: commission&.commission_amount&.to_d&.to_f,
              commission_status: commission&.status,
              attributed_at: sale.attributed_at&.iso8601
            }
          end

          def network_payload(relationship)
            referred = Rumbo::PartnerProfile.find_by(account_id: relationship.referred_partner_id)
            {
              account_id: relationship.referred_partner_id,
              name: referred ? "#{referred.first_name} #{referred.last_name}" : "Partner",
              referral_code: referred&.referral_code,
              status: relationship.status,
              joined_at: relationship.attributed_at&.iso8601
            }
          end

          def unauthorized
            render json: { error: { code: "unauthorized", message: "La sesión venció o no es válida." } }, status: :unauthorized
          end

          def forbidden
            render json: { error: { code: "forbidden", message: "Esta cuenta no tiene acceso al portal de Partner." } }, status: :forbidden
          end
        end
      end
    end
  end
end
