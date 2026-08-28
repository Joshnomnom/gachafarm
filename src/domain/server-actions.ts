import {
  BORDERS,
  BORDER_SUMMON_COST,
  STAR_GACHA_COST,
  SUMMON_COST,
  TEN_PULL_COST,
  UPGRADES,
  animalLevelCost,
  claimableIncome,
  createInitialGameState,
  mergeAnimals,
  summonAnimal,
  summonBorder,
  upgradeCost,
  type AnimalInstance,
  type BorderId,
  type GameState,
  type SpeciesId,
  type UpgradeId,
} from "./game";

export type SummonMachine = "meadow" | "starfall" | "border";

export type GameAction =
  | { type: "claim-income" }
  | { type: "grant-test-currency" }
  | { type: "summon"; machine: SummonMachine; quantity: 1 | 10 }
  | { type: "level-animal"; animalId: string }
  | { type: "purchase-upgrade"; upgradeId: UpgradeId }
  | { type: "merge"; animalIds: string[] }
  | { type: "reset-prototype" };

export type GameActionEvent =
  | { type: "income-claimed"; amount: number }
  | { type: "test-currency-granted"; amount: number }
  | {
      type: "creatures-summoned";
      machine: Exclude<SummonMachine, "border">;
      animals: AnimalInstance[];
      newSpecies: SpeciesId[];
      cost: number;
    }
  | {
      type: "border-summoned";
      borderId: BorderId;
      duplicate: boolean;
      cost: number;
    }
  | { type: "animal-leveled"; animal: AnimalInstance; cost: number }
  | { type: "upgrade-purchased"; upgradeId: UpgradeId; level: number; cost: number }
  | {
      type: "animals-merged";
      parents: AnimalInstance[];
      offspring: AnimalInstance;
      fusionDustAwarded: number;
    }
  | { type: "prototype-reset" };

export class GameActionError extends Error {
  constructor(message: string, readonly code = "invalid_action") {
    super(message);
    this.name = "GameActionError";
  }
}

type ApplyOptions = {
  now: number;
  rng?: () => number;
  createId?: (prefix: string) => string;
};

function defaultCreateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function applyGameAction(
  state: GameState,
  action: GameAction,
  { now, rng = Math.random, createId = defaultCreateId }: ApplyOptions,
): { state: GameState; event: GameActionEvent } {
  if (action.type === "claim-income") {
    const amount = claimableIncome(state, now);
    if (amount <= 0) throw new GameActionError("Your animals are still gathering coins.", "nothing_to_claim");
    return {
      state: { ...state, coins: state.coins + amount, lastClaimedAt: now },
      event: { type: "income-claimed", amount },
    };
  }

  if (action.type === "grant-test-currency") {
    const amount = 100_000;
    return {
      state: { ...state, coins: state.coins + amount },
      event: { type: "test-currency-granted", amount },
    };
  }

  if (action.type === "summon") {
    const pullCount = action.machine === "meadow" ? action.quantity : 1;
    const cost =
      action.machine === "meadow"
        ? pullCount === 10
          ? TEN_PULL_COST
          : SUMMON_COST
        : action.machine === "starfall"
          ? STAR_GACHA_COST
          : BORDER_SUMMON_COST;
    const balance =
      action.machine === "meadow"
        ? state.coins
        : action.machine === "starfall"
          ? state.discoveryStars
          : state.fusionDust;
    if (balance < cost) {
      const currency = action.machine === "meadow" ? "coins" : action.machine === "starfall" ? "Discovery Stars" : "Fusion Dust";
      throw new GameActionError(`You need ${cost.toLocaleString()} ${currency} for this machine.`, "insufficient_currency");
    }

    if (action.machine === "border") {
      const pulled = summonBorder(rng, state.borderPity);
      const duplicate = state.ownedBorders.includes(pulled.borderId);
      return {
        state: {
          ...state,
          fusionDust: state.fusionDust - cost + (duplicate ? 15 : 0),
          borderPity: pulled.nextPity,
          ownedBorders: duplicate ? state.ownedBorders : [...state.ownedBorders, pulled.borderId],
        },
        event: { type: "border-summoned", borderId: pulled.borderId, duplicate, cost },
      };
    }

    const border = BORDERS[state.activeBorder];
    const animals: AnimalInstance[] = [];
    let nextPity = state.pity;
    for (let index = 0; index < pullCount; index += 1) {
      const pulled = summonAnimal(rng, createId("summon"), now + index, nextPity, {
        dragonBonus: border.dragonBonus + (action.machine === "starfall" ? 0.03 : 0),
        goldenBonus:
          border.goldenBonus +
          (state.upgrades.luck - 1) * 0.01 +
          (action.machine === "starfall" ? 0.12 : 0),
        minimumRank: action.machine === "starfall" || (pullCount === 10 && index === 9) ? "Rare" : undefined,
      });
      animals.push(pulled.animal);
      nextPity = pulled.nextPity;
    }
    const newSpecies = [
      ...new Set(animals.map((animal) => animal.speciesId).filter((id) => !state.discoveredSpecies.includes(id))),
    ];
    return {
      state: {
        ...state,
        coins: state.coins - (action.machine === "meadow" ? cost : 0),
        discoveryStars:
          state.discoveryStars - (action.machine === "starfall" ? cost : 0) + newSpecies.length,
        pity: nextPity,
        discoveredSpecies: [...state.discoveredSpecies, ...newSpecies],
        summonHistory: [
          ...animals.map((animal) => ({
            speciesId: animal.speciesId,
            variant: animal.variant,
            createdAt: animal.createdAt,
          })),
          ...state.summonHistory,
        ].slice(0, 30),
        animals: [...state.animals, ...animals],
      },
      event: { type: "creatures-summoned", machine: action.machine, animals, newSpecies, cost },
    };
  }

  if (action.type === "level-animal") {
    const animal = state.animals.find((candidate) => candidate.id === action.animalId);
    if (!animal) throw new GameActionError("That animal is no longer available.", "animal_not_found");
    const cost = animalLevelCost(animal);
    if (state.coins < cost) {
      throw new GameActionError(`You need ${cost.toLocaleString()} coins for the next level.`, "insufficient_currency");
    }
    const leveled = { ...animal, level: animal.level + 1 };
    return {
      state: {
        ...state,
        coins: state.coins - cost,
        animals: state.animals.map((candidate) => (candidate.id === animal.id ? leveled : candidate)),
      },
      event: { type: "animal-leveled", animal: leveled, cost },
    };
  }

  if (action.type === "purchase-upgrade") {
    const definition = UPGRADES[action.upgradeId];
    if (!definition) throw new GameActionError("That upgrade does not exist.");
    const level = state.upgrades[action.upgradeId];
    if (level >= definition.maxLevel) {
      throw new GameActionError(`${definition.name} is already at maximum level.`, "upgrade_maxed");
    }
    const cost = upgradeCost(action.upgradeId, level);
    if (state.coins < cost) {
      throw new GameActionError(`You need ${cost.toLocaleString()} coins for ${definition.name}.`, "insufficient_currency");
    }
    return {
      state: {
        ...state,
        coins: state.coins - cost,
        upgrades: { ...state.upgrades, [action.upgradeId]: level + 1 },
      },
      event: { type: "upgrade-purchased", upgradeId: action.upgradeId, level: level + 1, cost },
    };
  }

  if (action.type === "merge") {
    if (action.animalIds.length !== 3 || new Set(action.animalIds).size !== 3) {
      throw new GameActionError("Species Merge requires three different animals.", "invalid_merge");
    }
    const parents = action.animalIds.map((id) => state.animals.find((animal) => animal.id === id));
    if (parents.some((animal) => !animal)) {
      throw new GameActionError("One of those merge animals is no longer available.", "animal_not_found");
    }
    let offspring: AnimalInstance;
    try {
      offspring = mergeAnimals(parents as AnimalInstance[], rng, createId("merge"), now);
    } catch (error) {
      throw new GameActionError(error instanceof Error ? error.message : "Those animals cannot be merged.", "invalid_merge");
    }
    const consumedIds = new Set(action.animalIds);
    const fusionDustAwarded = 5;
    return {
      state: {
        ...state,
        animals: [...state.animals.filter((animal) => !consumedIds.has(animal.id)), offspring],
        fusionDust: state.fusionDust + fusionDustAwarded,
      },
      event: { type: "animals-merged", parents: parents as AnimalInstance[], offspring, fusionDustAwarded },
    };
  }

  if (action.type === "reset-prototype") {
    return { state: createInitialGameState(now), event: { type: "prototype-reset" } };
  }

  throw new GameActionError("Unknown game action.");
}

export function isGameAction(value: unknown): value is GameAction {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const action = value as Record<string, unknown>;
  if (action.type === "claim-income" || action.type === "grant-test-currency" || action.type === "reset-prototype") return true;
  if (action.type === "summon") {
    return ["meadow", "starfall", "border"].includes(String(action.machine)) && [1, 10].includes(Number(action.quantity));
  }
  if (action.type === "level-animal") return typeof action.animalId === "string";
  if (action.type === "purchase-upgrade") return typeof action.upgradeId === "string" && action.upgradeId in UPGRADES;
  if (action.type === "merge") return Array.isArray(action.animalIds) && action.animalIds.every((id) => typeof id === "string");
  return false;
}
