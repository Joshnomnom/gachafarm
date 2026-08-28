import { syncAuthoritativeLayout } from "../../../db/authoritative-store";
import { ensurePlayer, getRequestUser } from "../../../db/game-store";
import { migrateGameState } from "../../../src/domain/game";

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
    if (!state) return json({ error: "The supplied farm layout is invalid." }, 400);
    if (JSON.stringify(state).length > 750_000) return json({ error: "Save data is too large." }, 413);
    await ensurePlayer(user);
    const now = Date.now();
    const saved = await syncAuthoritativeLayout(user.id, state, now);
    return json(saved);
  } catch (error) {
    console.error("cloud layout PUT failed", error);
    return json({ error: "Cloud save failed. Your local layout is still safe." }, 503);
  }
}
