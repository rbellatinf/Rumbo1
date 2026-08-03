# frozen_string_literal: true

require "bigdecimal"
require "digest"
require "json"
require "openssl"

module Spree
  module Api
    module V3
      module Store
        class PaymentWebhooksController < ActionController::API
          MAX_TIMESTAMP_DRIFT = 5.minutes

          def create
            provider = params[:provider].to_s.strip.downcase
            raw_body = request.raw_post
            authenticate_webhook!(provider, raw_body)
            payload = JSON.parse(raw_body)

            event_id = required_text(payload, "event_id", 160)
            existing = Rumbo::PaymentEvent.find_by(
              provider: provider,
              provider_event_id: event_id
            )
            if existing.present?
              return render json: event_response(existing, duplicate: true), status: :ok
            end

            booking = Rumbo::BookingRequest.find_by!(
              reference: required_text(payload, "booking_reference", 24).upcase
            )
            payment = booking.payment
            raise ActiveRecord::RecordNotFound if payment.blank?

            provider_payment_id = required_text(payload, "provider_payment_id", 160)
            payment_status = required_text(payload, "status", 20).downcase
            event_type = payload["event_type"].to_s.strip.presence || "payment.#{payment_status}"
            amount = BigDecimal(payload.fetch("amount").to_s)
            currency = required_text(payload, "currency", 3).upcase
            payload_digest = Digest::SHA256.hexdigest(raw_body)

            event_attributes = {
              booking_payment: payment,
              provider: provider,
              provider_event_id: event_id,
              provider_payment_id: provider_payment_id,
              event_type: event_type,
              payment_status: payment_status,
              amount: amount,
              currency: currency,
              payload_digest: payload_digest
            }

            rejection = rejection_reason(
              booking: booking,
              payment: payment,
              provider: provider,
              provider_payment_id: provider_payment_id,
              payment_status: payment_status,
              amount: amount,
              currency: currency
            )
            if rejection.present?
              event = Rumbo::PaymentEvent.create!(
                event_attributes.merge(
                  processing_status: "rejected",
                  rejection_reason: rejection
                )
              )
              return render json: event_response(event), status: :unprocessable_entity
            end

            event = nil
            Rumbo::PaymentEvent.transaction do
              payment.lock!
              event = Rumbo::PaymentEvent.create!(event_attributes)
              payment.apply_provider_status!(
                payment_status,
                provider_payment_id: provider_payment_id
              )
              event.update!(processing_status: "applied", applied_at: Time.current)
            end

            render json: event_response(event), status: :ok
          rescue JSON::ParserError, KeyError, ArgumentError
            render_error("invalid_payload", "El evento de pago no tiene un formato válido.", :unprocessable_entity)
          rescue ActiveRecord::RecordNotFound
            render_error("payment_not_found", "No encontramos el pago asociado al evento.", :not_found)
          rescue ActiveRecord::RecordNotUnique
            event = Rumbo::PaymentEvent.find_by!(
              provider: params[:provider].to_s.strip.downcase,
              provider_event_id: JSON.parse(request.raw_post).fetch("event_id").to_s
            )
            render json: event_response(event, duplicate: true), status: :ok
          rescue Rumbo::BookingPayment::InvalidTransition => error
            render_error("invalid_transition", error.message, :conflict)
          rescue ActiveRecord::StatementInvalid => error
            raise error unless error.message.include?("RUMBO_PAYMENT_CANNOT_COMPLETE")

            render_error(
              "payment_window_closed",
              "El pago llegó después de vencer el bloqueo de cupos.",
              :conflict
            )
          rescue WebhookAuthenticationError => error
            render_error("invalid_signature", error.message, :unauthorized)
          end

          private

          class WebhookAuthenticationError < StandardError; end

          def authenticate_webhook!(provider, raw_body)
            secret = provider_secret(provider)
            raise WebhookAuthenticationError, "El webhook no está configurado." if secret.blank?

            timestamp = request.headers["X-Rumbo-Timestamp"].to_s
            signature = request.headers["X-Rumbo-Signature"].to_s.downcase
            unless timestamp.match?(/\A\d{10}\z/) && signature.match?(/\A[0-9a-f]{64}\z/)
              raise WebhookAuthenticationError, "La firma del evento no es válida."
            end

            event_time = Time.at(timestamp.to_i)
            if (Time.current - event_time).abs > MAX_TIMESTAMP_DRIFT
              raise WebhookAuthenticationError, "El evento de pago está fuera de la ventana permitida."
            end

            expected = OpenSSL::HMAC.hexdigest(
              "SHA256",
              secret,
              "#{timestamp}.#{raw_body}"
            )
            unless ActiveSupport::SecurityUtils.secure_compare(expected, signature)
              raise WebhookAuthenticationError, "La firma del evento no es válida."
            end
          end

          def provider_secret(provider)
            provider_key = "RUMBO_PAYMENT_WEBHOOK_SECRET_#{provider.upcase.gsub(/[^A-Z0-9]/, '_')}"
            ENV[provider_key].presence || ENV["RUMBO_PAYMENT_WEBHOOK_SECRET"].presence
          end

          def required_text(payload, key, maximum)
            value = payload.fetch(key).to_s.strip
            raise ArgumentError if value.blank? || value.length > maximum

            value
          end

          def rejection_reason(booking:, payment:, provider:, provider_payment_id:,
                               payment_status:, amount:, currency:)
            return "provider_mismatch" unless payment.provider == provider
            return "unknown_status" unless Rumbo::BookingPayment::STATUSES.include?(payment_status)
            return "amount_mismatch" unless payment.amount == amount
            return "currency_mismatch" unless payment.currency == currency
            if payment.provider_payment_id.present? && payment.provider_payment_id != provider_payment_id
              return "provider_payment_id_mismatch"
            end
            if payment_status == "paid"
              hold = booking.hold
              return "hold_expired" unless hold&.status == "active" && hold.expires_at.future?
            end

            nil
          end

          def event_response(event, duplicate: false)
            {
              event_id: event.provider_event_id,
              payment_status: event.payment_status,
              processing_status: event.processing_status,
              duplicate: duplicate
            }
          end

          def render_error(code, message, status)
            render json: { error: { code: code, message: message } }, status: status
          end
        end
      end
    end
  end
end
