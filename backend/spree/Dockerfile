FROM ghcr.io/spree/spree:5.4.0

# Keep Rumbo's application tables in the same managed PostgreSQL database as
# Spree. The SQL is idempotent and is applied by the Render start command.
COPY backend/postgres/init/010_rumbo_core.sql /opt/rumbo/db/010_rumbo_core.sql
COPY backend/spree/apply_rumbo_schema.rb /opt/rumbo/apply_rumbo_schema.rb
