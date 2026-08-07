# frozen_string_literal: true

require "bcrypt"

module Rumbo
  class Account < ApplicationRecord
    self.table_name = "rumbo_accounts"

    has_one :partner_profile,
            class_name: "Rumbo::PartnerProfile",
            foreign_key: :account_id,
            dependent: :destroy,
            inverse_of: :account
    has_one :retailer_member,
            class_name: "Rumbo::RetailerMember",
            foreign_key: :account_id,
            dependent: :destroy,
            inverse_of: :account
    has_many :auth_sessions,
             class_name: "Rumbo::AuthSession",
             foreign_key: :account_id,
             dependent: :delete_all,
             inverse_of: :account

    before_validation :normalize_email

    validates :email, presence: true, length: { maximum: 254 }
    validates :role, inclusion: { in: %w[partner retailer_owner retailer_agent wholesaler_admin] }
    validates :status, inclusion: { in: %w[pending active blocked disabled] }

    def password=(value)
      self.password_hash = BCrypt::Password.create(value.to_s, cost: BCrypt::Engine.cost)
    end

    def authenticate_password(value)
      BCrypt::Password.new(password_hash) == value.to_s
    rescue BCrypt::Errors::InvalidHash
      false
    end

    def login_allowed?
      !%w[blocked disabled].include?(status) && (locked_until.blank? || locked_until <= Time.current)
    end

    def record_failed_login!
      attempts = failed_login_attempts.to_i + 1
      attributes = { failed_login_attempts: attempts, updated_at: Time.current }
      attributes[:locked_until] = 15.minutes.from_now if attempts >= 5
      update_columns(attributes)
    end

    def record_successful_login!
      update_columns(
        failed_login_attempts: 0,
        locked_until: nil,
        last_login_at: Time.current,
        updated_at: Time.current
      )
    end

    private

    def normalize_email
      self.email = email.to_s.strip.downcase
    end
  end
end
