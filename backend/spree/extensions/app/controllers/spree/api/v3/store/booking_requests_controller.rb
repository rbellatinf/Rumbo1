# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Store
        class BookingRequestsController < ResourceController
          prepend_before_action :authenticate_api_key!

          def create
            idempotency_key = params[:idempotency_key].to_s
            unless idempotency_key.match?(
              /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
            )
              return render_booking_error(
                "invalid_idempotency_key",
                "La referencia técnica de la reserva no es válida."
              )
            end

            existing = scope.find_by(idempotency_key: idempotency_key)

            if existing.present?
              existing.expire_hold_if_needed!
              return render json: serialize_resource(existing), status: :ok
            end

            attributes = permitted_params.to_h
            consent = ActiveModel::Type::Boolean.new.cast(attributes.delete("consent"))

            unless consent
              return render_booking_error(
                "consent_required",
                "Debes aceptar el tratamiento de datos para reservar."
              )
            end

            product = Spree::Product.
                      for_store(current_store).
                      find_by_prefix_id!(attributes.fetch("spree_product_id"))
            variant = booking_variant(product, attributes["spree_variant_id"])
            currency = current_store.default_currency.to_s.upcase
            price = variant.price_in(currency)

            unless price&.amount&.positive?
              return render_booking_error(
                "price_unavailable",
                "La oferta no tiene una tarifa vigente para bloquear."
              )
            end

            adults = attributes.fetch("adults", 1).to_i
            children = attributes.fetch("children", 0).to_i
            traveler_count = adults + children
            unit_amount = BigDecimal(price.amount.to_s)
            total_amount = unit_amount * traveler_count
            hold_expires_at = Rumbo::BookingRequest::HOLD_DURATION.from_now
            client_snapshot = attributes["product_snapshot"] || {}

            attributes["spree_variant_id"] = variant.prefixed_id
            attributes["product_name"] = product.name
            attributes["product_slug"] = product.slug
            attributes["provider"] = "Spree"
            attributes["provider_reference"] = product.prefixed_id
            attributes["currency"] = currency
            attributes["price_per_person"] = unit_amount
            attributes["price_total"] = total_amount
            attributes["price_display"] = "#{currency} #{format('%.2f', unit_amount)} por persona"
            attributes["hold_expires_at"] = hold_expires_at
            attributes["payment_status"] = "not_started"
            attributes["product_snapshot"] = client_snapshot.merge(
              "variant_id" => variant.prefixed_id,
              "price_per_person" => unit_amount.to_s("F"),
              "price_total" => total_amount.to_s("F"),
              "currency" => currency,
              "traveler_count" => traveler_count,
              "hold_expires_at" => hold_expires_at.iso8601
            )

            @resource = model_class.new(attributes)
            @resource.spree_store_id = current_store.id
            @resource.consent_accepted_at = Time.current
            @resource.status = "held"

            if @resource.save
              render json: serialize_resource(@resource), status: :created
            else
              render_errors(@resource.errors)
            end
          rescue ActiveRecord::RecordNotUnique
            existing = scope.find_by!(idempotency_key: idempotency_key)
            existing.expire_hold_if_needed!
            render json: serialize_resource(existing), status: :ok
          end

          protected

          def model_class
            Rumbo::BookingRequest
          end

          def serializer_class
            Rumbo::BookingRequestSerializer
          end

          def scope
            model_class.for_store(current_store)
          end

          def find_resource
            email = params[:email].to_s.strip.downcase
            raise ActiveRecord::RecordNotFound if email.blank?

            booking = scope.find_by!(
              reference: params[:id].to_s.strip.upcase,
              contact_email: email
            )
            booking.expire_hold_if_needed!
          end

          def authorize_resource!(_resource = @resource, _action = action_name.to_sym)
            true
          end

          def booking_variant(product, variant_id)
            return product.default_variant if variant_id.blank?

            variant = Spree::Variant.find_by_prefix_id!(variant_id)
            raise ActiveRecord::RecordNotFound unless variant.product_id == product.id

            variant
          end

          def render_booking_error(code, message)
            render json: {
              error: {
                code: code,
                message: message
              }
            }, status: :unprocessable_entity
          end

          def permitted_params
            params.permit(
              :idempotency_key,
              :spree_product_id,
              :spree_variant_id,
              :product_slug,
              :product_name,
              :provider,
              :provider_reference,
              :country,
              :origin_iata,
              :destination_iata,
              :departure_date,
              :return_date,
              :adults,
              :children,
              :price_display,
              :currency,
              :contact_name,
              :contact_email,
              :contact_phone,
              :contact_channel,
              :referral_code,
              :notes,
              :consent,
              product_snapshot: [
                :image,
                :duration,
                :tag,
                { included: [] }
              ]
            )
          end
        end
      end
    end
  end
end
