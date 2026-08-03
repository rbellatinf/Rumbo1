FROM ghcr.io/spree/spree:5.4.0

# Keep Rumbo's application tables in the same managed PostgreSQL database as
# Spree. The SQL is idempotent and is applied by the Render start command.
COPY backend/postgres/init /opt/rumbo/db
COPY backend/spree/apply_rumbo_schema.rb /opt/rumbo/apply_rumbo_schema.rb
COPY backend/spree/ensure_rumbo_metafields.rb /opt/rumbo/ensure_rumbo_metafields.rb
COPY backend/spree/extensions/app ./app
COPY backend/spree/extensions/config/initializers/rumbo_booking_routes.rb ./config/initializers/rumbo_booking_routes.rb
COPY --chmod=755 backend/spree/start-rumbo.sh /usr/local/bin/start-rumbo

CMD ["/usr/local/bin/start-rumbo"]
