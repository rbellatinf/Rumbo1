#!/bin/bash
set -euo pipefail

# Render terminates TLS before forwarding requests to Rails. Use the public
# service hostname so Active Storage never emits unusable localhost URLs.
if [[ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]]; then
  export RAILS_HOST="${RENDER_EXTERNAL_HOSTNAME}"
  export RAILS_FORCE_SSL="true"
  export RAILS_ASSUME_SSL="true"
fi

./bin/rails db:prepare
./bin/rails runner /opt/rumbo/apply_rumbo_schema.rb
./bin/rails runner /opt/rumbo/ensure_rumbo_metafields.rb

# Create a one-time recovery administrator without storing its password in
# GitHub. The fixed email makes this idempotent: later restarts keep the same
# account and do not reset its password.
RECOVERY_EMAIL="${SPREE_RECOVERY_ADMIN_EMAIL:-admin-recuperacion@rumbo.pe}"
RECOVERY_PASSWORD="$(ruby -rsecurerandom -e 'print SecureRandom.alphanumeric(24)')"

if EMAIL="${RECOVERY_EMAIL}" ./bin/rails runner 'exit(Spree.admin_user_class.exists?(email: ENV.fetch("EMAIL")) ? 0 : 1)'; then
  echo "[Rumbo] El administrador de recuperacion ya existe: ${RECOVERY_EMAIL}"
else
  EMAIL="${RECOVERY_EMAIL}" PASSWORD="${RECOVERY_PASSWORD}" ./bin/rails spree:cli:create_admin

  cat <<EOF

============================================================
RUMBO — ADMINISTRADOR DE RECUPERACION CREADO
URL: https://${RENDER_EXTERNAL_HOSTNAME:-rumbo1-spree.onrender.com}/admin
CORREO: ${RECOVERY_EMAIL}
CONTRASENA: ${RECOVERY_PASSWORD}
Guarda esta contrasena ahora: no volvera a mostrarse.
============================================================

EOF
fi

exec ./bin/rails server -b 0.0.0.0
