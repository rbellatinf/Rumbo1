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
              return render json: {
                error: {
                  code: "invalid_idempotency_key",
                  message: "La referencia técnica de la solicitud no es válida."
                }
              }, status: :unprocessable_entity
            end

            existing = scope.find_by(idempotency_key: idempotency_key)

            if existing.present?
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
            attributes["product_name"] = product.name
            attributes["product_slug"] = product.slug
            attributes["provider"] = "Spree"
            attributes["provider_reference"] = product.prefixed_id

            @resource = model_class.new(attributes)
            @resource.spree_store_id = current_store.id
            @resource.consent_accepted_at = Time.current
            @resource.status = "new"

            if @resource.save
              render json: serialize_resource(@resource), status: :created
            else
              render_errors(@resource.errors)
            end
          rescue ActiveRecord::RecordNotUnique
            existing = scope.find_by!(idempotency_key: idempotency_key)
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
        end
      end
    end
  end
end
