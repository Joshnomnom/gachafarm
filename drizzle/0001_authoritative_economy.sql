CREATE TABLE IF NOT EXISTS game_authority (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  authoritative_since INTEGER NOT NULL,
  last_action_at INTEGER NOT NULL,
  last_action_id TEXT,
  FOREIGN KEY (user_id) REFERENCES player_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_action_ledger (
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, action_id),
  FOREIGN KEY (user_id) REFERENCES player_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_action_ledger_user_created
ON game_action_ledger(user_id, created_at DESC);

PRAGMA optimize;
