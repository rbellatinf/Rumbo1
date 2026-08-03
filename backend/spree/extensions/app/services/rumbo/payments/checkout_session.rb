# frozen_string_literal: true

require "digest"
require "openssl"
require "uri"

module Rumbo
  module Payments
    class CheckoutSession
      class Unavailable < StandardError; end

      ALLOWED_SCHEMES = %w[http https].freeze

      def self.configured?
        ENV["RUMBO_PAYMENT_PROVIDER"].present? &&
          ENV["RUMBO_PAYMENT_CHECKOUT_URL"].present? &&
          ENV["RUMBO_PAYMENT_CHECKOUT_SECRET"].present? &&
          public_webhook_url.present? &&
          return_url.present?
      end

      def self.prepare!(booking)
        raise Unavailable, "La pasarela de pago todavía no está configurada." unless configured?

        booking.class.expire_stale_holds!
        booking.reload
        payment = booking.payment
        hold = booking.hold

        unless %w[payment_pending payment_failed].include?(booking.status)
          raise Unavailable, "La reserva no admite un nuevo intento de pago."
        end
        unless hold&.status == "active" && hold.expires_at.future?
          raise Unavailable, "El bloqueo de cupos ya venció."
        end
        unless payment.present? && %w[pending failed].include?(payment.status)
          raise Unavailable, "El pago no está disponible para esta reserva."
        end
        unless payment.amount == booking.total_amount && payment.currency == booking.currency
          raise Unavailable, "El monto del pago no coincide con la reserva."
        end

        provider = ENV.fetch("RUMBO_PAYMENT_PROVIDER").strip.downcase
        checkout_expires_at = [hold.expires_at, 15.minutes.from_now].min
        payload = {
          "amount" => format("%.2f", payment.amount),
          "currency" => payment.currency,
          "expires_at" => checkout_expires_at.iso8601,
          "payment_id" => payment.id,
          "reference" => booking.reference,
          "return_url" => return_url,
          "webhook_url" => public_webhook_url
        }
        canonical_payload = URI.encode_www_form(payload.sort)
        signature = OpenSSL::HMAC.hexdigest(
          "SHA256",
          ENV.fetch("RUMBO_PAYMENT_CHECKOUT_SECRET"),
          canonical_payload
        )
        checkout_url = build_checkout_url(payload.merge("signature" => signature))

        payment.update!(
          provider: provider,
          payment_url: checkout_url,
          checkout_created_at: Time.current,
          checkout_expires_at: checkout_expires_at,
          checkout_signature_digest: Digest::SHA256.hexdigest(signature)
        )
        payment
      end

      def self.build_checkout_url(payload)
        uri = URI.parse(ENV.fetch("RUMBO_PAYMENT_CHECKOUT_URL"))
        raise Unavailable, "La URL de checkout no es segura." unless ALLOWED_SCHEMES.include?(uri.scheme)

        existing_query = URI.decode_www_form(uri.query.to_s)
        uri.query = URI.encode_www_form(existing_query + payload.sort)
        uri.to_s
      rescue URI::InvalidURIError
        raise Unavailable, "La URL de checkout no es válida."
      end
      private_class_method :build_checkout_url

      def self.public_webhook_url
        configured = ENV["RUMBO_PAYMENT_WEBHOOK_URL"].to_s.strip
        return configured if configured.present?

        hostname = ENV["RENDER_EXTERNAL_HOSTNAME"].to_s.strip
        return if hostname.blank?

        "https://#{hostname}/api/v3/store/payment_webhooks/#{ENV['RUMBO_PAYMENT_PROVIDER'].to_s.strip.downcase}"
      end

      def self.return_url
        configured = ENV["RUMBO_PAYMENT_RETURN_URL"].to_s.strip
        return configured if configured.present?

        storefront = ENV["RUMBO_STOREFRONT_URL"].to_s.sub(%r{/$}, "")
        return if storefront.blank?

        "#{storefront}/reservas"
      end
    end
  end
end
