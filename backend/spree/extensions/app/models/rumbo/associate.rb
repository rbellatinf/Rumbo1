# frozen_string_literal: true

module Rumbo
  class Associate < ApplicationRecord
    self.table_name = "rumbo_associates"

    validates :spree_customer_id, :referral_code, presence: true, uniqueness: true
  end
end
