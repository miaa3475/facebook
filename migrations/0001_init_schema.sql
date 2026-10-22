-- Facebook Social — initial schema (Cloudflare D1 / SQLite)

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  password_hash   TEXT,                       -- NULL for OAuth-only accounts
  avatar_color    TEXT NOT NULL DEFAULT '#1877f2',
  bio             TEXT NOT NULL DEFAULT '',
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users (email);

-- ------------------------------------------------- oauth account links
CREATE TABLE accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,          -- 'google'
  provider_account_id TEXT NOT NULL,
  email               TEXT,
  name                TEXT,
  picture             TEXT,
  created_at          INTEGER NOT NULL,
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_accounts_user ON accounts (user_id);

-- ------------------------------------------------------------ sessions
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                -- SHA-256 hash of the cookie token
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- --------------------------------- email verification / password reset
CREATE TABLE verification_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,                   -- 'verify_email' | 'password_reset'
  code_hash  TEXT,                            -- SHA-256 of the 6-digit code
  token_hash TEXT NOT NULL,                   -- SHA-256 of the emailed link token
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE INDEX idx_tokens_user ON verification_tokens (user_id, purpose);
CREATE INDEX idx_tokens_token ON verification_tokens (token_hash);

-- --------------------------------------------------------------- posts
CREATE TABLE posts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_posts_user ON posts (user_id, created_at DESC);
CREATE INDEX idx_posts_created ON posts (created_at DESC);

-- --------------------------------------------------------------- likes
CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_likes_post ON likes (post_id);

-- ------------------------------------------------------------ comments
CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_post ON comments (post_id, created_at);

-- --------------------------------------------------------- friendships
-- Stored in both directions once accepted so lookups stay simple.
CREATE TABLE friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status       TEXT NOT NULL,                -- 'pending' | 'accepted'
  created_at   INTEGER NOT NULL,
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id, status);

-- ------------------------------------------------------- notifications
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                  -- 'like' | 'comment' | 'friend_request'
  post_id    TEXT REFERENCES posts (id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

-- -------------------------------------------------------- rate limiting
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
