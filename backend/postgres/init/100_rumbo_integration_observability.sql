CREATE TABLE IF NOT EXISTS rumbo_integration_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_code varchar(60) NOT NULL,
  service_code varchar(80) NOT NULL,
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source varchar(30) NOT NULL DEFAULT 'admin_test',
  success boolean NOT NULL,
  http_status integer,
  duration_ms integer,
  error_code varchar(80),
  error_message text,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rumbo_integration_calls_lookup_idx
  ON rumbo_integration_calls(integration_code,service_code,created_at DESC);
CREATE INDEX IF NOT EXISTS rumbo_integration_calls_created_idx
  ON rumbo_integration_calls(created_at DESC);

CREATE OR REPLACE VIEW rumbo_integration_service_stats_24h AS
SELECT integration_code,service_code,
       count(*)::int AS invocations,
       count(*) FILTER (WHERE success)::int AS successes,
       count(*) FILTER (WHERE NOT success)::int AS errors,
       round(100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*),0),2) AS success_rate,
       round(avg(duration_ms))::int AS avg_latency_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL)::int AS p95_latency_ms,
       max(created_at) AS last_invocation_at,
       max(created_at) FILTER (WHERE success) AS last_success_at,
       max(created_at) FILTER (WHERE NOT success) AS last_error_at
FROM rumbo_integration_calls
WHERE created_at >= now() - interval '24 hours'
GROUP BY integration_code,service_code;
