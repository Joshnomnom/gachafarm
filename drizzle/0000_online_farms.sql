CREATE TABLE IF NOT EXISTS player_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  visit_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS game_saves (
  user_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  active_border TEXT NOT NULL,
  coins INTEGER NOT NULL,
  income_rate INTEGER NOT NULL,
  animal_count INTEGER NOT NULL,
  species_count INTEGER NOT NULL,
  active_animals_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES player_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_display_name
ON player_profiles(display_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_game_saves_updated_at
ON game_saves(updated_at DESC);

PRAGMA optimize;
