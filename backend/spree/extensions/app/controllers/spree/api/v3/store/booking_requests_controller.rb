# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Store
        class BookingRequestsController < ResourceController
          prepend_before_action :authenticate_api_key!

          def create
            model_class.expire_stale_holds!
            idempotency_key = params[:idempotency_key].to_s
            unless idempotency_key.match?(
              /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
            )
              return render json: {
                error: {
                  code: "invalid_idempotency_key",
                  message: "La referencia técnica de la solicitud no es válida."
                }
              }, status: :unprocessable_entity
            end

            existing = scope.find_by(idempotency_key: idempotency_key)

            if existing.present?
              prepare_checkout(existing)
              existing.reload
              return render json: serialize_resource(existing), status: :ok
            end

            attributes = permitted_params.to_h
            consent = ActiveModel::Type::Boolean.new.cast(attributes.delete("consent"))

            unless consent
              return render json: {
                error: {
                  code: "consent_required",
                  message: "Debes aceptar el tratamiento de datos para enviar la solicitud."
                }
              }, status: :unprocessable_entity
            end

            product = Spree::Product.
                      for_store(current_store).
                      find_by_prefix_id!(attributes.fetch("spree_product_id"))
            inventory = Rumbo::OfferInventory.sync_from_product!(
              store: current_store,
              product: product,
              departure_date: attributes["departure_date"],
              return_date: attributes["return_date"]
            )
            attributes["product_name"] = product.name
            attributes["product_slug"] = product.slug
            attributes["provider"] = "Spree"
            attributes["provider_reference"] = product.prefixed_id
            attributes["spree_variant_id"] = inventory.spree_variant_id
            attributes["country"] = product_metafield(product, "country") || attributes["country"]
            attributes["departure_date"] = inventory.departure_date
            attributes["return_date"] = inventory.return_date
            attributes["price_display"] = inventory.price_display
            attributes["currency"] = inventory.currency
            attributes["product_snapshot"] = product_snapshot(
              attributes["product_snapshot"],
              inventory
            )

            @resource = model_class.new(attributes)
            @resource.spree_store_id = current_store.id
            @resource.inventory = inventory
            @resource.consent_accepted_at = Time.current
            @resource.status = "payment_pending"

            if @resource.save
              prepare_checkout(@resource)
              @resource.reload
              render json: serialize_resource(@resource), status: :created
            else
              render_errors(@resource.errors)
            end
          rescue ActiveRecord::RecordNotUnique
            existing = scope.find_by!(idempotency_key: idempotency_key)
            prepare_checkout(existing)
            existing.reload
            render json: serialize_resource(existing), status: :ok
          rescue Rumbo::OfferInventory::Unavailable => error
            render json: {
              error: {
                code: "offer_unavailable",
                message: error.message
              }
            }, status: :conflict
          rescue ActiveRecord::StatementInvalid => error
            render_capacity_error(error)
          end

          def availability
            model_class.expire_stale_holds!
            product = Spree::Product.
                      for_store(current_store).
                      find_by_prefix_id!(params[:product_id].to_s)
            inventory = Rumbo::OfferInventory.sync_from_product!(
              store: current_store,
              product: product,
              departure_date: params[:departure_date],
              return_date: params[:return_date]
            )
            remaining = inventory.remaining_capacity

            render json: {
              product_id: product.prefixed_id,
              variant_id: inventory.spree_variant_id,
              departure_date: inventory.departure_date.iso8601,
              return_date: inventory.return_date.iso8601,
              total_capacity: inventory.total_capacity,
              remaining_capacity: remaining,
              price_amount: inventory.price_amount.to_f,
              price_display: inventory.price_display,
              currency: inventory.currency,
              bookable: remaining.positive?,
              hold_minutes: 15
            }, status: :ok
          rescue Rumbo::OfferInventory::Unavailable => error
            render json: {
              error: {
                code: "offer_unavailable",
                message: error.message
              }
            }, status: :conflict
          end

          def payment_session
            booking = find_resource
            Rumbo::Payments::CheckoutSession.prepare!(booking)
            booking.reload
            render json: serialize_resource(booking), status: :ok
          rescue Rumbo::Payments::CheckoutSession::Unavailable => error
            render json: {
              error: {
                code: "payment_unavailable",
                message: error.message
              }
            }, status: payment_gateway_configured? ? :conflict : :service_unavailable
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
            model_class.expire_stale_holds!
            email = params[:email].to_s.strip.downcase
            raise ActiveRecord::RecordNotFound if email.blank?

            scope.find_by!(
              reference: params[:id].to_s.strip.upcase,
              contact_email: email
            )
          end

          def authorize_resource!(_resource = @resource, _action = action_name.to_sym)
            true
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

          def product_metafield(product, key)
            product.get_metafield("rumbo.#{key}")&.serialize_value.to_s.presence
          end

          def product_snapshot(snapshot, inventory)
            source = snapshot.respond_to?(:to_h) ? snapshot.to_h : {}
            source.merge(
              "capacity" => inventory.total_capacity,
              "unit_price_amount" => inventory.price_amount.to_s,
              "currency" => inventory.currency,
              "departure_date" => inventory.departure_date.iso8601,
              "return_date" => inventory.return_date.iso8601
            )
          end

          def prepare_checkout(booking)
            return unless payment_gateway_configured?

            Rumbo::Payments::CheckoutSession.prepare!(booking)
          rescue Rumbo::Payments::CheckoutSession::Unavailable => error
            Rails.logger.warn(
              "Rumbo checkout was not prepared for #{booking.reference}: #{error.message}"
            )
          end

          def payment_gateway_configured?
            Rumbo::Payments::CheckoutSession.configured?
          end

          def render_capacity_error(error)
            message = error.message
            if message.include?("RUMBO_INSUFFICIENT_CAPACITY")
              render json: {
                error: {
                  code: "insufficient_capacity",
                  message: "La oferta acaba de agotar sus cupos. No se realizó ningún cobro."
                }
              }, status: :conflict
            elsif message.include?("RUMBO_OFFER_UNAVAILABLE") ||
                  message.include?("RUMBO_INVENTORY_REQUIRED")
              render json: {
                error: {
                  code: "offer_unavailable",
                  message: "La oferta ya no está disponible para reserva."
                }
              }, status: :conflict
            else
              raise error
            end
          end
        end
      end
    end
  end
end
