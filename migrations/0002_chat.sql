-- Chat feature: conversations, messages and the NPC flag.

-- Mark a user as an AI/NPC character so the chat route knows to generate
-- replies with the language model.
ALTER TABLE users ADD COLUMN is_npc INTEGER NOT NULL DEFAULT 0;

CREATE TABLE conversations (
  id             TEXT PRIMARY KEY,
  user_a_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The OpenCode session that keeps the conversation context for NPC chats.
  llm_session_id TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  -- The pair is stored with the lower id first so a pair is unique
  -- regardless of who started the conversation.
  UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX idx_conversations_a ON conversations (user_a_id, updated_at DESC);
CREATE INDEX idx_conversations_b ON conversations (user_b_id, updated_at DESC);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  read_at         INTEGER
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_unread ON messages (conversation_id, read_at);
