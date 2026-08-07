# frozen_string_literal: true

module Rumbo
  class RetailerMember < ApplicationRecord
    self.table_name = "rumbo_retailer_members"

    belongs_to :retailer,
               class_name: "Rumbo::Retailer",
               foreign_key: :retailer_id,
               inverse_of: :members
    belongs_to :account,
               class_name: "Rumbo::Account",
               foreign_key: :account_id,
               inverse_of: :retailer_member

    validates :first_name, :last_name, presence: true
    validates :member_role, inclusion: { in: %w[owner manager agent finance] }
  end
end
