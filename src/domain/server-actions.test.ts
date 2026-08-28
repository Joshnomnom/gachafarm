import { describe, expect, it } from "vitest";
import { SUMMON_COST, createInitialGameState, makeAnimal } from "./game";
import { GameActionError, applyGameAction, isGameAction } from "./server-actions";

function fixedIds(prefix: string) {
  return `${prefix}-server-owned-id`;
}

describe("authoritative game actions", () => {
  it("claims income using the supplied server time", () => {
    const state = createInitialGameState(0);
    state.lastClaimedAt = 0;
    const result = applyGameAction(state, { type: "claim-income" }, { now: 60_000 });
    expect(result.event.type).toBe("income-claimed");
    expect(result.state.lastClaimedAt).toBe(60_000);
    expect(result.state.coins).toBeGreaterThan(state.coins);
  });

  it("creates summons and charges currency only inside the trusted action", () => {
    const state = createInitialGameState(0);
    const result = applyGameAction(
      state,
      { type: "summon", machine: "meadow", quantity: 1 },
      { now: 10, rng: () => 0, createId: fixedIds },
    );
    expect(result.state.coins).toBe(state.coins - SUMMON_COST);
    expect(result.state.animals).toHaveLength(state.animals.length + 1);
    expect(result.state.animals.at(-1)?.id).toBe("summon-server-owned-id");
  });

  it("rejects a summon when authoritative currency is insufficient", () => {
    const state = createInitialGameState(0);
    state.coins = 0;
    expect(() =>
      applyGameAction(state, { type: "summon", machine: "meadow", quantity: 1 }, { now: 1 }),
    ).toThrow(GameActionError);
  });

  it("consumes exactly three valid merge parents and awards the result", () => {
    const state = createInitialGameState(0);
    state.animals = [
      makeAnimal("a", "chicken", "natural", 0),
      makeAnimal("b", "chicken", "natural", 0),
      makeAnimal("c", "chicken", "natural", 0),
      makeAnimal("safe", "cow", "natural", 0),
    ];
    const result = applyGameAction(
      state,
      { type: "merge", animalIds: ["a", "b", "c"] },
      { now: 1, rng: () => 0.99, createId: fixedIds },
    );
    expect(result.state.animals.map((animal) => animal.id)).toEqual([
      "safe",
      "merge-server-owned-id",
    ]);
    expect(result.state.fusionDust).toBe(state.fusionDust + 5);
  });

  it("validates the bounded set of write actions", () => {
    expect(isGameAction({ type: "purchase-upgrade", upgradeId: "production" })).toBe(true);
    expect(isGameAction({ type: "purchase-upgrade", upgradeId: "free_money" })).toBe(false);
    expect(isGameAction({ type: "merge", animalIds: ["a", 2, "c"] })).toBe(false);
  });
});
