# frozen_string_literal: true

module Rumbo
  class SaleAttribution < ApplicationRecord
    self.table_name = "rumbo_sale_attributions"

    belongs_to :associate,
               class_name: "Rumbo::Associate",
               foreign_key: :associate_id,
               optional: true
    belongs_to :booking_request,
               class_name: "Rumbo::BookingRequest",
               foreign_key: :booking_request_id,
               optional: true
    has_many :commissions,
             class_name: "Rumbo::Commission",
             foreign_key: :sale_attribution_id,
             dependent: :restrict_with_exception
  end
end
