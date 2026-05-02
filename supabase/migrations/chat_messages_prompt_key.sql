-- Link chat messages to cache entries (run in SQL Editor or via supabase db push)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS prompt_key text,
  ADD COLUMN IF NOT EXISTS was_cache_hit boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_messages_prompt_key
  ON chat_messages(prompt_key)
  WHERE prompt_key IS NOT NULL;
