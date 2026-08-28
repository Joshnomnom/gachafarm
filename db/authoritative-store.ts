import {
  createInitialGameState,
  farmIncomePerMinute,
  farmSlotCount,
  migrateGameState,
  totalFarmMultiplier,
  type AnimalInstance,
  type GameState,
} from "../src/domain/game";
import {
  applyGameAction,
  type GameAction,
  type GameActionEvent,
} from "../src/domain/server-actions";
import { ensureSchema, getDatabase, type GameSaveRow } from "./game-store";

type AuthorityRow = {
  user_id: string;
  revision: number;
  authoritative_since: number;
  last_action_at: number;
  last_action_id: string | null;
};

export type AuthoritativeResponse = {
  state: GameState;
  event: GameActionEvent;
  revision: number;
  savedAt: number;
};

function activeAnimalSnapshot(state: GameState) {
  return state.animals
    .filter((animal) => animal.activeSlot !== null)
    .sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0))
    .map((animal) => ({
      speciesId: animal.speciesId,
      variant: animal.variant,
      level: animal.level,
      potential: animal.potential,
      activeSlot: animal.activeSlot,
    }));
}

function saveBindings(userId: string, state: GameState, now: number) {
  return [
    userId,
    JSON.stringify(state),
    state.activeBorder,
    Math.floor(state.coins),
    farmIncomePerMinute(state.animals, totalFarmMultiplier(state)),
    state.animals.length,
    state.discoveredSpecies.length,
    JSON.stringify(activeAnimalSnapshot(state)),
    now,
  ] as const;
}

function parseState(row: GameSaveRow | null, now: number) {
  if (!row) return null;
  try {
    return migrateGameState(JSON.parse(row.state_json) as unknown, now);
  } catch {
    return null;
  }
}

function changes(result: D1Result<unknown> | null | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

async function readSave(userId: string) {
  return getDatabase()
    .prepare("SELECT * FROM game_saves WHERE user_id = ?")
    .bind(userId)
    .first<GameSaveRow>();
}

async function readAuthority(userId: string) {
  return getDatabase()
    .prepare("SELECT * FROM game_authority WHERE user_id = ?")
    .bind(userId)
    .first<AuthorityRow>();
}

export async function getOrCreateAuthoritativeState(userId: string, now: number) {
  await ensureSchema();
  const database = getDatabase();
  let row = await readSave(userId);
  let state = parseState(row, now);
  if (!state) {
    state = createInitialGameState(now);
    await database
      .prepare(`
        INSERT INTO game_saves (
          user_id, state_json, active_border, coins, income_rate,
          animal_count, species_count, active_animals_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `)
      .bind(...saveBindings(userId, state, now))
      .run();
    row = await readSave(userId);
    state = parseState(row, now) ?? state;
  }
  await database
    .prepare(`
      INSERT INTO game_authority (user_id, revision, authoritative_since, last_action_at, last_action_id)
      VALUES (?, 0, ?, ?, NULL)
      ON CONFLICT(user_id) DO NOTHING
    `)
    .bind(userId, now, now)
    .run();
  const authority = await readAuthority(userId);
  return {
    state,
    revision: authority?.revision ?? 0,
    savedAt: row?.updated_at ?? now,
  };
}

async function priorAction(userId: string, actionId: string) {
  const row = await getDatabase()
    .prepare("SELECT response_json FROM game_action_ledger WHERE user_id = ? AND action_id = ?")
    .bind(userId, actionId)
    .first<{ response_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.response_json) as AuthoritativeResponse;
  } catch {
    return null;
  }
}

export async function executeAuthoritativeAction(
  userId: string,
  actionId: string,
  action: GameAction,
  now: number,
) {
  await getOrCreateAuthoritativeState(userId, now);
  const replay = await priorAction(userId, actionId);
  if (replay) return replay;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [row, authority] = await Promise.all([readSave(userId), readAuthority(userId)]);
    const state = parseState(row, now);
    if (!state || !authority) throw new Error("Authoritative game state is unavailable.");
    const applied = applyGameAction(state, action, { now });
    const nextRevision = authority.revision + 1;
    const response: AuthoritativeResponse = {
      state: applied.state,
      event: applied.event,
      revision: nextRevision,
      savedAt: now,
    };
    const database = getDatabase();
    const results = await database.batch([
      database
        .prepare(`
          UPDATE game_saves SET
            state_json = ?, active_border = ?, coins = ?, income_rate = ?,
            animal_count = ?, species_count = ?, active_animals_json = ?, updated_at = ?
          WHERE user_id = ?
            AND EXISTS (
              SELECT 1 FROM game_authority
              WHERE user_id = ? AND revision = ?
            )
        `)
        .bind(
          JSON.stringify(applied.state),
          applied.state.activeBorder,
          Math.floor(applied.state.coins),
          farmIncomePerMinute(applied.state.animals, totalFarmMultiplier(applied.state)),
          applied.state.animals.length,
          applied.state.discoveredSpecies.length,
          JSON.stringify(activeAnimalSnapshot(applied.state)),
          now,
          userId,
          userId,
          authority.revision,
        ),
      database
        .prepare(`
          UPDATE game_authority
          SET revision = revision + 1, last_action_at = ?, last_action_id = ?
          WHERE user_id = ? AND revision = ?
        `)
        .bind(now, actionId, userId, authority.revision),
      database
        .prepare(`
          INSERT OR IGNORE INTO game_action_ledger
            (user_id, action_id, action_type, response_json, created_at)
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM game_authority
            WHERE user_id = ? AND revision = ? AND last_action_id = ?
          )
        `)
        .bind(
          userId,
          actionId,
          action.type,
          JSON.stringify(response),
          now,
          userId,
          nextRevision,
          actionId,
        ),
    ]);
    if (changes(results[0]) === 1 && changes(results[1]) === 1) return response;
    const concurrentReplay = await priorAction(userId, actionId);
    if (concurrentReplay) return concurrentReplay;
  }
  throw new Error("The farm changed during this action. Please try again.");
}

function mergeLayout(server: GameState, client: GameState) {
  const clientById = new Map(client.animals.map((animal) => [animal.id, animal]));
  const usedSlots = new Set<number>();
  const maxSlots = farmSlotCount(server);
  const animals: AnimalInstance[] = server.animals.map((animal) => {
    const clientAnimal = clientById.get(animal.id);
    const requestedSlot = clientAnimal?.activeSlot;
    const validSlot =
      typeof requestedSlot === "number" &&
      Number.isInteger(requestedSlot) &&
      requestedSlot >= 0 &&
      requestedSlot < maxSlots &&
      !usedSlots.has(requestedSlot)
        ? requestedSlot
        : null;
    if (validSlot !== null) usedSlots.add(validSlot);
    return {
      ...animal,
      activeSlot: validSlot,
      locked: Boolean(clientAnimal?.locked),
    };
  });
  const activeBorder = server.ownedBorders.includes(client.activeBorder)
    ? client.activeBorder
    : server.activeBorder;
  return { ...server, animals, activeBorder };
}

export async function syncAuthoritativeLayout(userId: string, clientState: GameState, now: number) {
  await getOrCreateAuthoritativeState(userId, now);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [row, authority] = await Promise.all([readSave(userId), readAuthority(userId)]);
    const serverState = parseState(row, now);
    if (!serverState || !authority) throw new Error("Authoritative game state is unavailable.");
    const next = mergeLayout(serverState, clientState);
    const syncId = `layout-${crypto.randomUUID()}`;
    const database = getDatabase();
    const results = await database.batch([
      database
        .prepare(`
          UPDATE game_saves SET
            state_json = ?, active_border = ?, coins = ?, income_rate = ?,
            animal_count = ?, species_count = ?, active_animals_json = ?, updated_at = ?
          WHERE user_id = ?
            AND EXISTS (
              SELECT 1 FROM game_authority
              WHERE user_id = ? AND revision = ?
            )
        `)
        .bind(
          JSON.stringify(next),
          next.activeBorder,
          Math.floor(next.coins),
          farmIncomePerMinute(next.animals, totalFarmMultiplier(next)),
          next.animals.length,
          next.discoveredSpecies.length,
          JSON.stringify(activeAnimalSnapshot(next)),
          now,
          userId,
          userId,
          authority.revision,
        ),
      database
        .prepare(`
          UPDATE game_authority
          SET revision = revision + 1, last_action_at = ?, last_action_id = ?
          WHERE user_id = ? AND revision = ?
        `)
        .bind(now, syncId, userId, authority.revision),
    ]);
    if (changes(results[0]) === 1 && changes(results[1]) === 1) {
      return { state: next, revision: authority.revision + 1, savedAt: now };
    }
  }
  throw new Error("The farm changed while saving. Please try again.");
}
