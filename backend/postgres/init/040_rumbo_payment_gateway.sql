ALTER TABLE rumbo_booking_payments
  ADD COLUMN IF NOT EXISTS checkout_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_signature_digest char(64);

CREATE INDEX IF NOT EXISTS rumbo_booking_payments_checkout_expiry_idx
  ON rumbo_booking_payments (checkout_expires_at)
  WHERE status IN ('pending', 'authorized');

CREATE TABLE IF NOT EXISTS rumbo_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_payment_id uuid NOT NULL
    REFERENCES rumbo_booking_payments(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL,
  provider_event_id varchar(160) NOT NULL,
  provider_payment_id varchar(160),
  event_type varchar(80) NOT NULL,
  payment_status varchar(20) NOT NULL
    CHECK (
      payment_status IN (
        'pending',
        'authorized',
        'paid',
        'failed',
        'cancelled',
        'refunded'
      )
    ),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payload_digest char(64) NOT NULL,
  processing_status varchar(20) NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'applied', 'rejected')),
  rejection_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS rumbo_payment_events_provider_event_idx
  ON rumbo_payment_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS rumbo_payment_events_payment_idx
  ON rumbo_payment_events (booking_payment_id, received_at DESC);

CREATE INDEX IF NOT EXISTS rumbo_payment_events_processing_idx
  ON rumbo_payment_events (processing_status, received_at DESC);
