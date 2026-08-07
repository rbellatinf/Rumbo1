# frozen_string_literal: true

module Spree
  module Api
    module V3
      module Store
        class AccessController < ResourceController
          prepend_before_action :authenticate_api_key!
          skip_before_action :set_resource, raise: false

          def register
            access_type = params[:access_type].to_s
            email = params[:email].to_s.strip.downcase
            password = params[:password].to_s

            return validation_error("Correo inválido.") unless email.match?(/\A[^\s@]+@[^\s@]+\.[^\s@]+\z/)
            return validation_error("La contraseña debe tener al menos 8 caracteres.") if password.length < 8
            return validation_error("Tipo de cuenta inválido.") unless %w[partner retailer].include?(access_type)
            return conflict("Ya existe una cuenta con ese correo.") if Rumbo::Account.where("lower(email) = ?", email).exists?

            account = nil
            profile = nil

            ActiveRecord::Base.transaction do
              account = Rumbo::Account.new(
                email: email,
                role: access_type == "partner" ? "partner" : "retailer_owner",
                status: "pending"
              )
              account.password = password
              account.save!

              if access_type == "partner"
                profile = create_partner!(account)
              else
                profile = create_retailer!(account)
              end
            end

            token = Rumbo::AuthSession.issue_for!(
              account: account,
              ip_address: request.remote_ip,
              user_agent: request.user_agent,
              remember: true
            )

            render json: session_payload(account, token), status: :created
          rescue ActiveRecord::RecordInvalid => error
            render json: { error: { code: "invalid_registration", message: error.record.errors.full_messages.first || "No pudimos crear la cuenta." } }, status: :unprocessable_entity
          rescue ActiveRecord::RecordNotUnique
            conflict("Ya existe una cuenta con esos datos.")
          end

          def login
            email = params[:email].to_s.strip.downcase
            password = params[:password].to_s
            account = Rumbo::Account.find_by("lower(email) = ?", email)

            unless account&.login_allowed? && account.authenticate_password(password)
              account&.record_failed_login!
              return render json: {
                error: {
                  code: "invalid_credentials",
                  message: account&.locked_until&.future? ? "Cuenta temporalmente bloqueada por varios intentos fallidos." : "Correo o contraseña incorrectos."
                }
              }, status: :unauthorized
            end

            account.record_successful_login!
            token = Rumbo::AuthSession.issue_for!(
              account: account,
              ip_address: request.remote_ip,
              user_agent: request.user_agent,
              remember: ActiveModel::Type::Boolean.new.cast(params[:remember])
            )

            render json: session_payload(account, token), status: :ok
          end

          def me
            session = current_rumbo_session
            return unauthorized unless session

            render json: account_payload(session.account), status: :ok
          end

          def logout
            session = current_rumbo_session
            session&.update!(revoked_at: Time.current)
            head :no_content
          end

          protected

          def authorize_resource!(_resource = nil, _action = nil)
            true
          end

          private

          def create_partner!(account)
            first_name = params[:first_name].to_s.strip
            last_name = params[:last_name].to_s.strip
            document_number = params[:document_number].to_s.strip.upcase
            phone = params[:phone].to_s.strip
            sponsor_code = params[:sponsor_code].to_s.strip.upcase
            document_type = document_number.match?(/\A\d{8}\z/) ? "DNI" : "CE"

            raise ActiveRecord::RecordInvalid.new(account) if first_name.blank? || last_name.blank? || document_number.blank?

            sponsor = sponsor_code.present? ? Rumbo::PartnerProfile.find_by(referral_code: sponsor_code) : nil
            raise ActiveRecord::RecordInvalid.new(account) if sponsor_code.present? && sponsor.nil?

            referral_code = unique_referral_code(first_name, last_name)
            associate = Rumbo::Associate.create!(
              spree_customer_id: "rumbo-account:#{account.id}",
              referral_code: referral_code,
              membership_status: "pending",
              direct_commission_rate: 0.06
            )

            profile = Rumbo::PartnerProfile.create!(
              account: account,
              associate: associate,
              sponsor_partner_id: sponsor&.account_id,
              first_name: first_name,
              last_name: last_name,
              document_type: document_type,
              document_number: document_number,
              phone: phone,
              referral_code: referral_code,
              commission_rate: 0.06,
              network_commission_rate: 0.0,
              terms_accepted_at: Time.current
            )

            if sponsor
              Rumbo::ReferralRelationship.create!(
                sponsor_partner_id: sponsor.account_id,
                referred_partner_id: profile.account_id,
                referral_code: sponsor.referral_code,
                level: 1,
                status: "active"
              )
            end

            profile
          end

          def create_retailer!(account)
            legal_name = params[:legal_name].to_s.strip
            trade_name = params[:trade_name].to_s.strip
            tax_id = params[:tax_id].to_s.gsub(/\D/, "")
            representative = params[:representative].to_s.strip
            phone = params[:phone].to_s.strip

            raise ActiveRecord::RecordInvalid.new(account) if legal_name.blank? || trade_name.blank? || tax_id.blank? || representative.blank?

            retailer = Rumbo::Retailer.create!(
              legal_name: legal_name,
              trade_name: trade_name,
              tax_id: tax_id,
              phone: phone,
              contact_email: account.email,
              status: "pending"
            )

            parts = representative.split(/\s+/, 2)
            Rumbo::RetailerMember.create!(
              retailer: retailer,
              account: account,
              member_role: "owner",
              first_name: parts.first,
              last_name: parts.second.presence || "—",
              phone: phone,
              is_primary_contact: true
            )

            retailer
          end

          def unique_referral_code(first_name, last_name)
            stem = [first_name, last_name].join("-").parameterize.upcase.gsub(/[^A-Z0-9-]/, "").first(22)
            stem = "PARTNER" if stem.blank?

            loop do
              code = "RUMBO-#{stem}-#{SecureRandom.hex(2).upcase}"
              return code unless Rumbo::PartnerProfile.exists?(referral_code: code) || Rumbo::Associate.exists?(referral_code: code)
            end
          end

          def current_rumbo_session
            header = request.headers["Authorization"].to_s
            token = header.start_with?("Bearer ") ? header.delete_prefix("Bearer ").strip : nil
            Rumbo::AuthSession.from_token(token)
          end

          def account_payload(account)
            base = {
              account: {
                id: account.id,
                email: account.email,
                role: account.role,
                status: account.status,
                last_login_at: account.last_login_at
              }
            }

            if account.role == "partner" && account.partner_profile
              base[:profile] = {
                type: "partner",
                first_name: account.partner_profile.first_name,
                last_name: account.partner_profile.last_name,
                referral_code: account.partner_profile.referral_code,
                sponsor_partner_id: account.partner_profile.sponsor_partner_id,
                commission_rate: account.partner_profile.commission_rate.to_f
              }
              base[:redirect_to] = "/panel"
            elsif account.retailer_member
              retailer = account.retailer_member.retailer
              base[:profile] = {
                type: "retailer",
                retailer_id: retailer.id,
                trade_name: retailer.trade_name,
                legal_name: retailer.legal_name,
                tax_id: retailer.tax_id,
                retailer_status: retailer.status,
                member_role: account.retailer_member.member_role
              }
              base[:redirect_to] = "/agencia"
            else
              base[:redirect_to] = "/"
            end

            base
          end

          def session_payload(account, token)
            account_payload(account).merge(token: token)
          end

          def validation_error(message)
            render json: { error: { code: "validation_error", message: message } }, status: :unprocessable_entity
          end

          def conflict(message)
            render json: { error: { code: "conflict", message: message } }, status: :conflict
          end

          def unauthorized
            render json: { error: { code: "unauthorized", message: "La sesión venció o no es válida." } }, status: :unauthorized
          end
        end
      end
    end
  end
end
