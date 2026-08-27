import { describe, expect, it } from "vitest";
import {
  BORDERS,
  SPECIES,
  VARIANTS,
  animalIncomePerMinute,
  animalLevelCost,
  autoPlaceBestAnimals,
  claimableIncome,
  createInitialGameState,
  farmIncomePerMinute,
  farmSlotCount,
  makeAnimal,
  mergeAnimals,
  migrateGameState,
  summonAnimal,
  summonBorder,
} from "./game";

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe("GachaFarm domain rules", () => {
  it("calculates more income for a Golden animal than an otherwise identical Natural animal", () => {
    const natural = makeAnimal("a", "cow", "natural", 0);
    const golden = makeAnimal("b", "cow", "golden", 0);
    expect(animalIncomePerMinute(golden)).toBeGreaterThan(
      animalIncomePerMinute(natural),
    );
  });

  it("makes animal levels a meaningful escalating coin sink", () => {
    const animal = makeAnimal("a", "cow", "golden", 0);
    const levelOneCost = animalLevelCost(animal);
    animal.level = 4;
    expect(levelOneCost).toBeGreaterThanOrEqual(1000);
    expect(animalLevelCost(animal)).toBeGreaterThan(levelOneCost * 4);
  });

  it("caps offline income at four hours", () => {
    const state = createInitialGameState(0);
    state.lastClaimedAt = 0;
    expect(claimableIncome(state, 8 * 60 * 60 * 1000)).toBe(
      claimableIncome(state, 4 * 60 * 60 * 1000),
    );
  });

  it("guarantees a dragon on the twentieth pull", () => {
    const result = summonAnimal(sequence([0, 0, 0, 0, 0, 0]), "dragon", 0, 19);
    expect(result.animal.speciesId).toBe("dragon");
    expect(result.nextPity).toBe(0);
  });

  it("never lowers the visual variant during a safe species merge", () => {
    const parents = [
      makeAnimal("a", "cow", "golden", 0),
      makeAnimal("b", "cow", "golden", 0),
      makeAnimal("c", "cow", "golden", 0),
    ];
    const result = mergeAnimals(
      parents,
      sequence([0.99, 0, 0, 0, 0]),
      "merged",
      1,
    );
    expect(result.variant).toBe("golden");
  });

  it("rejects active merge inputs", () => {
    const parents = [
      makeAnimal("a", "chicken", "natural", 0, { activeSlot: 0 }),
      makeAnimal("b", "chicken", "natural", 0),
      makeAnimal("c", "chicken", "natural", 0),
    ];
    expect(() => mergeAnimals(parents, Math.random, "merged", 1)).toThrow(
      "Active or locked",
    );
  });

  it("migrates version 1 browser saves without losing animals", () => {
    const legacy = { ...createInitialGameState(100), version: 1 };
    delete (legacy as Partial<typeof legacy>).ownedBorders;
    delete (legacy as Partial<typeof legacy>).activeBorder;
    const migrated = migrateGameState(legacy, 200);
    expect(migrated?.version).toBe(3);
    expect(migrated?.ownedBorders).toEqual(["meadow"]);
    expect(migrated?.upgrades).toEqual({
      habitat: 1,
      production: 1,
      offline: 1,
      luck: 1,
    });
    expect(migrated?.animals).toHaveLength(5);
  });

  it("applies the equipped border income boost", () => {
    const state = createInitialGameState(0);
    const normal = farmIncomePerMinute(state.animals);
    const boosted = farmIncomePerMinute(
      state.animals,
      BORDERS.clover.incomeMultiplier,
    );
    expect(boosted).toBeGreaterThan(normal);
  });

  it("allows border boosts to improve creature pull rates", () => {
    const withoutBoost = summonAnimal(
      sequence([0.94, 0, 0, 0, 0, 0, 0]),
      "normal",
      0,
      0,
    );
    const withBoost = summonAnimal(
      sequence([0.94, 0, 0, 0, 0, 0]),
      "boosted",
      0,
      0,
      { dragonBonus: 0.02 },
    );
    expect(withoutBoost.animal.speciesId).not.toBe("dragon");
    expect(withBoost.animal.speciesId).toBe("dragon");
  });

  it("guarantees Starfall Fence on the fifteenth border pull", () => {
    expect(summonBorder(() => 0, 14)).toEqual({
      borderId: "starfall",
      nextPity: 0,
    });
  });

  it("expands the farm by three habitats per habitat upgrade", () => {
    const state = createInitialGameState(0);
    state.upgrades.habitat = 3;
    expect(farmSlotCount(state)).toBe(12);
  });

  it("guarantees Rare or better for the final grand-summon slot", () => {
    const result = summonAnimal(sequence([0, 0, 0, 0, 0, 0]), "rare", 0, 0, {
      minimumRank: "Rare",
    });
    expect(["Rare", "Epic", "Legendary", "Mythic"]).toContain(
      SPECIES[result.animal.speciesId].rank,
    );
  });

  it("ships five collectible visual variants", () => {
    expect(Object.keys(VARIANTS)).toEqual([
      "natural",
      "bronze",
      "golden",
      "diamond",
      "mystic",
    ]);
  });

  it("auto-places only the highest-producing animals", () => {
    const animals = [
      makeAnimal("natural", "chicken", "natural", 1, { activeSlot: 0 }),
      makeAnimal("golden", "cow", "golden", 2),
      makeAnimal("dragon", "dragon", "natural", 3),
    ];
    const placed = autoPlaceBestAnimals(animals, 2);
    expect(placed.find((animal) => animal.id === "dragon")?.activeSlot).toBe(0);
    expect(placed.find((animal) => animal.id === "golden")?.activeSlot).toBe(1);
    expect(
      placed.find((animal) => animal.id === "natural")?.activeSlot,
    ).toBeNull();
  });
});
