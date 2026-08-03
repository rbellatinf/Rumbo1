# frozen_string_literal: true

Spree::Core::Engine.add_routes do
  namespace :api, defaults: { format: "json" } do
    namespace :v3 do
      namespace :store do
        resources :booking_requests, only: %i[create show]
      end

      namespace :admin do
        resources :booking_requests, only: %i[index show update]
      end
    end
  end
end
