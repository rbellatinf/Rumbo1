# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Store
        class CommissionSettingsController < ResourceController
          prepend_before_action :authenticate_api_key!
          skip_before_action :set_resource, raise: false

          def show
            render json: serialize_settings(Rumbo::GlobalCommissionSetting.current), status: :ok
          end

          def update
            settings = Rumbo::GlobalCommissionSetting.current
            settings.update!(
              partner_rate: decimal_rate(:partner_rate),
              sponsor_rate: decimal_rate(:sponsor_rate),
              retailer_rate: decimal_rate(:retailer_rate)
            )

            render json: serialize_settings(settings), status: :ok
          rescue ArgumentError
            render json: {
              error: {
                code: "invalid_commission_rate",
                message: "Los porcentajes deben estar entre 0% y 100%."
              }
            }, status: :unprocessable_entity
          rescue ActiveRecord::RecordInvalid => error
            render json: {
              error: {
                code: "invalid_commission_settings",
                message: error.record.errors.full_messages.first || "No pudimos guardar las comisiones."
              }
            }, status: :unprocessable_entity
          end

          protected

          def authorize_resource!(_resource = nil, _action = nil)
            true
          end

          private

          def decimal_rate(key)
            value = BigDecimal(params.require(key).to_s)
            raise ArgumentError if value.negative? || value > 1

            value
          rescue KeyError, TypeError
            raise ArgumentError
          end

          def serialize_settings(settings)
            {
              partner_rate: settings.partner_rate.to_f,
              sponsor_rate: settings.sponsor_rate.to_f,
              retailer_rate: settings.retailer_rate.to_f,
              updated_at: settings.updated_at
            }
          end
        end
      end
    end
  end
end
