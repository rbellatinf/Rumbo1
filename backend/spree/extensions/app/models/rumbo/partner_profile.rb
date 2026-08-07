# frozen_string_literal: true

module Rumbo
  class PartnerProfile < ApplicationRecord
    self.table_name = "rumbo_partner_profiles"
    self.primary_key = "account_id"

    belongs_to :account,
               class_name: "Rumbo::Account",
               foreign_key: :account_id,
               inverse_of: :partner_profile
    belongs_to :associate,
               class_name: "Rumbo::Associate",
               foreign_key: :associate_id,
               optional: true
    belongs_to :sponsor,
               class_name: "Rumbo::PartnerProfile",
               foreign_key: :sponsor_partner_id,
               optional: true

    validates :first_name, :last_name, :document_number, :referral_code, presence: true
    validates :document_type, inclusion: { in: %w[DNI CE PASSPORT RUC] }
  end
end
