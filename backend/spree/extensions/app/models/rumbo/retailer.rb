# frozen_string_literal: true

module Rumbo
  class Retailer < ApplicationRecord
    self.table_name = "rumbo_retailers"

    has_many :members,
             class_name: "Rumbo::RetailerMember",
             foreign_key: :retailer_id,
             dependent: :destroy,
             inverse_of: :retailer

    validates :legal_name, :trade_name, :tax_id, presence: true
    validates :status, inclusion: { in: %w[pending active suspended rejected] }
  end
end
