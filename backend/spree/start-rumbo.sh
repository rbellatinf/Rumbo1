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
exec ./bin/rails server -b 0.0.0.0
