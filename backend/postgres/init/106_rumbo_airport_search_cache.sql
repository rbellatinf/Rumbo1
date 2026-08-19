CREATE TABLE IF NOT EXISTS rumbo_airport_search_cache (
  query_key text PRIMARY KEY,
  query_text text NOT NULL,
  source text NOT NULL DEFAULT 'airlabs',
  airports jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_status integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rumbo_airport_search_cache_airports_array CHECK (jsonb_typeof(airports)='array')
);

CREATE INDEX IF NOT EXISTS idx_rumbo_airport_search_cache_expires_at
  ON rumbo_airport_search_cache(expires_at);

COMMENT ON TABLE rumbo_airport_search_cache IS
  'Cache persistente de búsquedas de aeropuertos. Reduce consumo de AirLabs y permite servir resultados reales previamente obtenidos durante rate limits o fallos temporales.';
