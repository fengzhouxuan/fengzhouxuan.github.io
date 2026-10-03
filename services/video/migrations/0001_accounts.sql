CREATE TABLE IF NOT EXISTS video_users (
  github_id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  favorites TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS video_sessions (
  token_hash TEXT PRIMARY KEY,
  github_id TEXT NOT NULL REFERENCES video_users(github_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS video_sessions_expiry ON video_sessions(expires_at);
CREATE TABLE IF NOT EXISTS video_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS video_login_tickets (
  ticket_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  github_id TEXT NOT NULL REFERENCES video_users(github_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
