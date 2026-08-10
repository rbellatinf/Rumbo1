# frozen_string_literal: true

module Rumbo
  class GlobalCommissionSetting < ApplicationRecord
    self.table_name = "rumbo_global_commission_settings"

    validates :id, inclusion: { in: [1] }
    validates :partner_rate, :sponsor_rate, :retailer_rate,
              numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }

    def self.current
      find_or_create_by!(id: 1)
    end
  end
end
