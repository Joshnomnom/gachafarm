export const CREATE_PLAYER_PROFILES = `
CREATE TABLE IF NOT EXISTS player_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  visit_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export const CREATE_GAME_SAVES = `
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
)`;

export const CREATE_PROFILE_NAME_INDEX = `
CREATE INDEX IF NOT EXISTS idx_player_profiles_display_name
ON player_profiles(display_name COLLATE NOCASE)`;

export const CREATE_SAVE_UPDATED_INDEX = `
CREATE INDEX IF NOT EXISTS idx_game_saves_updated_at
ON game_saves(updated_at DESC)`;

export const CREATE_GAME_AUTHORITY = `
CREATE TABLE IF NOT EXISTS game_authority (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  authoritative_since INTEGER NOT NULL,
  last_action_at INTEGER NOT NULL,
  last_action_id TEXT,
  FOREIGN KEY (user_id) REFERENCES player_profiles(user_id) ON DELETE CASCADE
)`;

export const CREATE_GAME_ACTION_LEDGER = `
CREATE TABLE IF NOT EXISTS game_action_ledger (
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, action_id),
  FOREIGN KEY (user_id) REFERENCES player_profiles(user_id) ON DELETE CASCADE
)`;

export const CREATE_ACTION_LEDGER_INDEX = `
CREATE INDEX IF NOT EXISTS idx_game_action_ledger_user_created
ON game_action_ledger(user_id, created_at DESC)`;
