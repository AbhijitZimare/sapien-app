-- content_cache: manifesto token economy (Tier B/C/D cache layer)
-- Apply in Supabase SQL Editor or via supabase db push

CREATE TABLE IF NOT EXISTS content_cache (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  prompt_key text UNIQUE NOT NULL,
  response_jsonb jsonb NOT NULL,
  tier text NOT NULL CHECK (tier IN ('B', 'C', 'D')),
  model text NOT NULL,
  tokens_input integer,
  tokens_output integer,
  thumbs_up integer DEFAULT 0,
  thumbs_down integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_served_at timestamptz,
  invalidated_at timestamptz
);

ALTER TABLE content_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read content_cache"
  ON content_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_content_cache_prompt_key
  ON content_cache(prompt_key);
CREATE INDEX IF NOT EXISTS idx_content_cache_tier
  ON content_cache(tier);
