import { executeAuthoritativeAction } from "../../../db/authoritative-store";
import { ensurePlayer, getRequestUser } from "../../../db/game-store";
import { GameActionError, isGameAction } from "../../../src/domain/server-actions";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Sign in is required for protected game actions." }, 401);
  try {
    const body = (await request.json()) as { actionId?: unknown; action?: unknown };
    const actionId = typeof body.actionId === "string" ? body.actionId.trim() : "";
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(actionId)) {
      return json({ error: "This game action is missing a valid request ID." }, 400);
    }
    if (!isGameAction(body.action)) return json({ error: "This game action is invalid." }, 400);
    await ensurePlayer(user);
    const result = await executeAuthoritativeAction(user.id, actionId, body.action, Date.now());
    return json(result);
  } catch (error) {
    if (error instanceof GameActionError) {
      return json({ error: error.message, code: error.code }, 409);
    }
    console.error("authoritative game action failed", error);
    return json({ error: "The farm could not finish that action. Please try again." }, 503);
  }
}
