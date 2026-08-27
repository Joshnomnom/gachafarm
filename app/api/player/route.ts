import { ensurePlayer, getDatabase, getRequestUser, publicProfile, type GameSaveRow } from "../../../db/game-store";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Sign in is required for cloud saves." }, 401);
  try {
    const profile = await ensurePlayer(user);
    const save = await getDatabase()
      .prepare("SELECT * FROM game_saves WHERE user_id = ?")
      .bind(user.id)
      .first<GameSaveRow>();
    return json({
      profile: publicProfile(profile),
      save: save ? { state: JSON.parse(save.state_json), updatedAt: save.updated_at } : null,
    });
  } catch (error) {
    console.error("player GET failed", error);
    return json({ error: "Cloud profile is temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Sign in is required." }, 401);
  try {
    const body = (await request.json()) as { displayName?: unknown };
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length < 2 || displayName.length > 24) {
      return json({ error: "Farm name must be 2–24 characters." }, 400);
    }
    await ensurePlayer(user);
    const now = Date.now();
    await getDatabase()
      .prepare("UPDATE player_profiles SET display_name = ?, email = ?, updated_at = ? WHERE user_id = ?")
      .bind(displayName, user.email, now, user.id)
      .run();
    const profile = await ensurePlayer(user);
    return json({ profile: publicProfile(profile) });
  } catch (error) {
    console.error("player PATCH failed", error);
    return json({ error: "Farm profile could not be updated." }, 503);
  }
}
