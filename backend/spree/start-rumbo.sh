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
# GitHub. The fixed email makes the operation idempotent: the first successful
# deployment creates it and later restarts leave it unchanged.
RECOVERY_EMAIL="${SPREE_RECOVERY_ADMIN_EMAIL:-admin-recuperacion@rumbo.pe}"
RECOVERY_PASSWORD="$(ruby -rsecurerandom -e 'print SecureRandom.alphanumeric(24)')"
RECOVERY_OUTPUT=""
RECOVERY_CREATED="false"

if command -v spree >/dev/null 2>&1; then
  if RECOVERY_OUTPUT="$(spree user create --email "${RECOVERY_EMAIL}" --password "${RECOVERY_PASSWORD}" 2>&1)"; then
    RECOVERY_CREATED="true"
  fi
elif [[ -x ./bin/spree ]]; then
  if RECOVERY_OUTPUT="$(./bin/spree user create --email "${RECOVERY_EMAIL}" --password "${RECOVERY_PASSWORD}" 2>&1)"; then
    RECOVERY_CREATED="true"
  fi
elif RECOVERY_OUTPUT="$(bundle exec spree user create --email "${RECOVERY_EMAIL}" --password "${RECOVERY_PASSWORD}" 2>&1)"; then
  RECOVERY_CREATED="true"
fi

if [[ "${RECOVERY_CREATED}" == "true" ]]; then
  cat <<EOF

============================================================
RUMBO — ADMINISTRADOR DE RECUPERACION CREADO
URL: https://${RENDER_EXTERNAL_HOSTNAME:-rumbo1-spree.onrender.com}/admin
CORREO: ${RECOVERY_EMAIL}
CONTRASENA: ${RECOVERY_PASSWORD}
Guarda esta contrasena ahora: no volvera a mostrarse.
============================================================

EOF
else
  echo "[Rumbo] El administrador de recuperacion ya existe o Spree no pudo crearlo."
  if [[ -n "${RECOVERY_OUTPUT}" ]]; then
    echo "[Rumbo] Detalle: ${RECOVERY_OUTPUT}"
  fi
fi

exec ./bin/rails server -b 0.0.0.0
