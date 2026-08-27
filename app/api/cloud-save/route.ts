import { ensurePlayer, getDatabase, getRequestUser } from "../../../db/game-store";
import {
  farmIncomePerMinute,
  migrateGameState,
  totalFarmMultiplier,
} from "../../../src/domain/game";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Sign in is required for cloud saves." }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 750_000) return json({ error: "Save data is too large." }, 413);
  try {
    const body = (await request.json()) as { state?: unknown };
    const state = migrateGameState(body.state, Date.now());
    if (!state) return json({ error: "The supplied farm save is invalid." }, 400);
    const stateJson = JSON.stringify(state);
    if (stateJson.length > 750_000) return json({ error: "Save data is too large." }, 413);
    await ensurePlayer(user);
    const now = Date.now();
    const activeAnimals = state.animals
      .filter((animal) => animal.activeSlot !== null)
      .sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0))
      .map((animal) => ({
        speciesId: animal.speciesId,
        variant: animal.variant,
        level: animal.level,
        potential: animal.potential,
        activeSlot: animal.activeSlot,
      }));
    const incomeRate = farmIncomePerMinute(state.animals, totalFarmMultiplier(state));
    await getDatabase()
      .prepare(`
        INSERT INTO game_saves (
          user_id, state_json, active_border, coins, income_rate,
          animal_count, species_count, active_animals_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          state_json = excluded.state_json,
          active_border = excluded.active_border,
          coins = excluded.coins,
          income_rate = excluded.income_rate,
          animal_count = excluded.animal_count,
          species_count = excluded.species_count,
          active_animals_json = excluded.active_animals_json,
          updated_at = excluded.updated_at
      `)
      .bind(
        user.id,
        stateJson,
        state.activeBorder,
        Math.floor(state.coins),
        incomeRate,
        state.animals.length,
        state.discoveredSpecies.length,
        JSON.stringify(activeAnimals),
        now,
      )
      .run();
    return json({ savedAt: now });
  } catch (error) {
    console.error("cloud save PUT failed", error);
    return json({ error: "Cloud save failed. Your local save is still safe." }, 503);
  }
}
