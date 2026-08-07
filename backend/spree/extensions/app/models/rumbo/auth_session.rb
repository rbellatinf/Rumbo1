# frozen_string_literal: true

require "digest"
require "securerandom"

module Rumbo
  class AuthSession < ApplicationRecord
    self.table_name = "rumbo_auth_sessions"

    belongs_to :account,
               class_name: "Rumbo::Account",
               foreign_key: :account_id,
               inverse_of: :auth_sessions

    scope :active, -> { where(revoked_at: nil).where("expires_at > ?", Time.current) }

    def self.issue_for!(account:, ip_address: nil, user_agent: nil, remember: false)
      raw_token = SecureRandom.urlsafe_base64(48)
      create!(
        account: account,
        token_hash: digest(raw_token),
        ip_address: ip_address.presence,
        user_agent: user_agent.to_s.first(1_000),
        expires_at: (remember ? 30.days : 12.hours).from_now
      )
      raw_token
    end

    def self.from_token(raw_token)
      return nil if raw_token.blank?

      active.find_by(token_hash: digest(raw_token))
    end

    def self.digest(raw_token)
      Digest::SHA256.hexdigest(raw_token.to_s)
    end
  end
end
