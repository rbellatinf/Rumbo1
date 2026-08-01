#!/bin/bash
set -euo pipefail

./bin/rails db:prepare
./bin/rails runner /opt/rumbo/apply_rumbo_schema.rb
exec ./bin/rails server -b 0.0.0.0
