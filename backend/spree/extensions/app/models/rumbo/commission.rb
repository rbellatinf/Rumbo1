# frozen_string_literal: true

module Rumbo
  class Commission < ApplicationRecord
    self.table_name = "rumbo_commissions"

    belongs_to :sale_attribution,
               class_name: "Rumbo::SaleAttribution",
               foreign_key: :sale_attribution_id,
               inverse_of: :commissions

    validates :beneficiary_type, inclusion: { in: %w[partner sponsor retailer] }
    validates :status, inclusion: { in: %w[pending approved paid rejected reversed] }
  end
end
