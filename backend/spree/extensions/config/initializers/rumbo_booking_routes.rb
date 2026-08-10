# frozen_string_literal: true

Spree::Core::Engine.add_routes do
  namespace :api, defaults: { format: "json" } do
    namespace :v3 do
      namespace :store do
        resources :booking_requests, only: %i[create show] do
          get :availability, on: :collection
          post :payment_session, on: :member
        end

        post "access/register", to: "access#register"
        post "access/login", to: "access#login"
        get "access/me", to: "access#me"
        post "access/logout", to: "access#logout"
        get "partner_dashboard", to: "partner_dashboard#show"
        get "commission_settings", to: "commission_settings#show"
        patch "commission_settings", to: "commission_settings#update"
        post "payment_webhooks/:provider", to: "payment_webhooks#create"
      end

      namespace :admin do
        resources :booking_requests, only: %i[index show update]
      end
    end
  end
end
