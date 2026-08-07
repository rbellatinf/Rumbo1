# frozen_string_literal: true

module Rumbo
  class ReferralRelationship < ApplicationRecord
    self.table_name = "rumbo_referral_relationships"

    validates :sponsor_partner_id, :referred_partner_id, :referral_code, presence: true
    validates :level, inclusion: { in: [1] }
  end
end
