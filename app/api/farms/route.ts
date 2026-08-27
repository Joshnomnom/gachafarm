import { ensureSchema, getDatabase, type GameSaveRow } from "../../../db/game-store";

type FarmSearchRow = GameSaveRow & {
  display_name: string;
  visit_code: string;
  profile_updated_at: number;
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 40) ?? "";
    if (!query) return json({ farms: [] });
    const normalizedCode = query.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const result = await getDatabase()
      .prepare(`
        SELECT
          p.display_name, p.visit_code, p.updated_at AS profile_updated_at,
          s.user_id, s.state_json, s.active_border, s.coins, s.income_rate,
          s.animal_count, s.species_count, s.active_animals_json, s.updated_at
        FROM player_profiles p
        INNER JOIN game_saves s ON s.user_id = p.user_id
        WHERE p.visit_code = ? OR p.display_name LIKE ? COLLATE NOCASE
        ORDER BY CASE WHEN p.visit_code = ? THEN 0 ELSE 1 END, s.updated_at DESC
        LIMIT 12
      `)
      .bind(normalizedCode, `%${query}%`, normalizedCode)
      .all<FarmSearchRow>();
    return json({
      farms: result.results.map((row) => ({
        displayName: row.display_name,
        visitCode: row.visit_code,
        activeBorder: row.active_border,
        coins: row.coins,
        incomeRate: row.income_rate,
        animalCount: row.animal_count,
        speciesCount: row.species_count,
        activeAnimals: JSON.parse(row.active_animals_json),
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("farm search failed", error);
    return json({ error: "Farm search is temporarily unavailable." }, 503);
  }
}
