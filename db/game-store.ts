import { env } from "cloudflare:workers";
import {
  CREATE_ACTION_LEDGER_INDEX,
  CREATE_GAME_ACTION_LEDGER,
  CREATE_GAME_AUTHORITY,
  CREATE_GAME_SAVES,
  CREATE_PLAYER_PROFILES,
  CREATE_PROFILE_NAME_INDEX,
  CREATE_SAVE_UPDATED_INDEX,
} from "./schema";

export type RequestUser = { id: string; email: string; name: string | null };
export type PlayerProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  visit_code: string;
  created_at: number;
  updated_at: number;
};
export type GameSaveRow = {
  user_id: string;
  state_json: string;
  active_border: string;
  coins: number;
  income_rate: number;
  animal_count: number;
  species_count: number;
  active_animals_json: string;
  updated_at: number;
};

let schemaReady: Promise<void> | null = null;

export function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Cloud database binding is unavailable.");
  return database;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const database = getDatabase();
      await database.batch([
        database.prepare(CREATE_PLAYER_PROFILES),
        database.prepare(CREATE_GAME_SAVES),
        database.prepare(CREATE_GAME_AUTHORITY),
        database.prepare(CREATE_GAME_ACTION_LEDGER),
        database.prepare(CREATE_PROFILE_NAME_INDEX),
        database.prepare(CREATE_SAVE_UPDATED_INDEX),
        database.prepare(CREATE_ACTION_LEDGER_INDEX),
      ]);
      await database.prepare("PRAGMA optimize").run();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function decodeFullName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (!encoded || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

export function getRequestUser(request: Request): RequestUser | null {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) {
    if (process.env.NODE_ENV !== "production") {
      return { id: "local-sites-farmer", email: "seedy@sites.test", name: "Local Farmer" };
    }
    return null;
  }
  return { id, email, name: decodeFullName(request) };
}

async function visitCodeFor(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest).slice(0, 5), (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
}

function defaultDisplayName(user: RequestUser) {
  return (user.name?.trim() || user.email.split("@")[0] || "Farmer").slice(0, 24);
}

export async function ensurePlayer(user: RequestUser) {
  await ensureSchema();
  const database = getDatabase();
  const existing = await database
    .prepare("SELECT * FROM player_profiles WHERE user_id = ?")
    .bind(user.id)
    .first<PlayerProfileRow>();
  if (existing) return existing;
  const now = Date.now();
  const visitCode = await visitCodeFor(user.id);
  await database
    .prepare(`INSERT INTO player_profiles (user_id, email, display_name, visit_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(user.id, user.email, defaultDisplayName(user), visitCode, now, now)
    .run();
  return (await database
    .prepare("SELECT * FROM player_profiles WHERE user_id = ?")
    .bind(user.id)
    .first<PlayerProfileRow>())!;
}

export function publicProfile(profile: PlayerProfileRow) {
  return {
    displayName: profile.display_name,
    visitCode: profile.visit_code,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}
