# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Admin
        class BookingRequestsController < ResourceController
          protected

          def model_class
            Rumbo::BookingRequest
          end

          def serializer_class
            Rumbo::AdminBookingRequestSerializer
          end

          def scope
            model_class.for_store(current_store).order(created_at: :desc)
          end

          def find_resource
            scope.find_by!(reference: params[:id].to_s.strip.upcase)
          end

          def permitted_params
            params.permit(:status, :notes)
          end
        end
      end
    end
  end
end
