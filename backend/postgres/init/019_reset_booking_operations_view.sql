-- Rumbo schema files run on every Spree startup. The automatic-reservations
-- migration expands rumbo_booking_operations after 020_rumbo_bookings.sql runs.
-- Drop the expanded view first so the base schema can recreate its original
-- shape safely before the later migration replaces it again.
DROP VIEW IF EXISTS rumbo_booking_operations;
