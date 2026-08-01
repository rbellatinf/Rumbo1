FROM ghcr.io/spree/spree:5.4.0

# Keep Rumbo's application tables in the same managed PostgreSQL database as
# Spree. The SQL is idempotent and is applied by the Render start command.
COPY backend/postgres/init/010_rumbo_core.sql /opt/rumbo/db/010_rumbo_core.sql
COPY backend/spree/apply_rumbo_schema.rb /opt/rumbo/apply_rumbo_schema.rb
COPY backend/spree/ensure_rumbo_metafields.rb /opt/rumbo/ensure_rumbo_metafields.rb
COPY --chmod=755 backend/spree/start-rumbo.sh /usr/local/bin/start-rumbo

CMD ["/usr/local/bin/start-rumbo"]
