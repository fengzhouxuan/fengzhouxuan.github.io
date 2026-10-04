CREATE TABLE IF NOT EXISTS account_libraries (
  github_id TEXT NOT NULL REFERENCES video_users(github_id) ON DELETE CASCADE,
  namespace TEXT NOT NULL CHECK (namespace = 'music'),
  data TEXT NOT NULL DEFAULT '{"favorites":[],"playlists":[]}',
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (github_id, namespace)
);
