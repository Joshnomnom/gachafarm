export const BASE_FARM_SLOTS = 6;
export const FARM_SLOTS = BASE_FARM_SLOTS;
export const SUMMON_COST = 2500;
export const TEN_PULL_COST = 22500;
export const STAR_GACHA_COST = 2;
export const BORDER_SUMMON_COST = 20;
export const BASE_OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;

export type SpeciesId =
  | "chicken"
  | "duck"
  | "cow"
  | "sheep"
  | "pig"
  | "goat"
  | "peacock"
  | "griffin"
  | "dragon";
export type VariantId = "natural" | "bronze" | "golden" | "diamond" | "mystic";
export type Rank = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";
export type BorderId = "meadow" | "clover" | "golden_gate" | "starfall";
export type UpgradeId = "habitat" | "production" | "offline" | "luck";

export type AnimalInstance = {
  id: string;
  speciesId: SpeciesId;
  variant: VariantId;
  level: number;
  yieldStat: number;
  tempoStat: number;
  fortune: number;
  heritage: number;
  potential: number;
  locked: boolean;
  activeSlot: number | null;
  createdAt: number;
};

export type SummonHistoryEntry = {
  speciesId: SpeciesId;
  variant: VariantId;
  createdAt: number;
};
export type UpgradeState = Record<UpgradeId, number>;
export type GameState = {
  version: 3;
  coins: number;
  discoveryStars: number;
  fusionDust: number;
  pity: number;
  borderPity: number;
  lastClaimedAt: number;
  animals: AnimalInstance[];
  ownedBorders: BorderId[];
  activeBorder: BorderId;
  upgrades: UpgradeState;
  discoveredSpecies: SpeciesId[];
  summonHistory: SummonHistoryEntry[];
};

export type SpeciesDefinition = {
  id: SpeciesId;
  name: string;
  emoji: string;
  rank: Rank;
  baseIncome: number;
  summonWeight: number;
  atlasIndex: number;
};
export type VariantDefinition = {
  name: string;
  multiplier: number;
  summonWeight: number;
  color: string;
};
export type BorderDefinition = {
  id: BorderId;
  name: string;
  icon: string;
  rarity: "Common" | "Rare" | "Legendary";
  description: string;
  summonWeight: number;
  incomeMultiplier: number;
  goldenBonus: number;
  dragonBonus: number;
};
export type UpgradeDefinition = {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  maxLevel: number;
  baseCost: number;
};

export const RANK_ORDER: Rank[] = [
  "Common",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
];
export const SPECIES: Record<SpeciesId, SpeciesDefinition> = {
  chicken: {
    id: "chicken",
    name: "Chicken",
    emoji: "🐔",
    rank: "Common",
    baseIncome: 7,
    summonWeight: 18,
    atlasIndex: 0,
  },
  duck: {
    id: "duck",
    name: "Duck",
    emoji: "🦆",
    rank: "Common",
    baseIncome: 9,
    summonWeight: 17,
    atlasIndex: 1,
  },
  cow: {
    id: "cow",
    name: "Cow",
    emoji: "🐮",
    rank: "Common",
    baseIncome: 13,
    summonWeight: 15,
    atlasIndex: 2,
  },
  sheep: {
    id: "sheep",
    name: "Sheep",
    emoji: "🐑",
    rank: "Rare",
    baseIncome: 19,
    summonWeight: 10,
    atlasIndex: 3,
  },
  pig: {
    id: "pig",
    name: "Pig",
    emoji: "🐷",
    rank: "Rare",
    baseIncome: 22,
    summonWeight: 9,
    atlasIndex: 4,
  },
  goat: {
    id: "goat",
    name: "Goat",
    emoji: "🐐",
    rank: "Rare",
    baseIncome: 25,
    summonWeight: 8,
    atlasIndex: 5,
  },
  peacock: {
    id: "peacock",
    name: "Royal Peacock",
    emoji: "🦚",
    rank: "Epic",
    baseIncome: 38,
    summonWeight: 11,
    atlasIndex: 6,
  },
  griffin: {
    id: "griffin",
    name: "Suncrest Griffin",
    emoji: "🦅",
    rank: "Legendary",
    baseIncome: 61,
    summonWeight: 7,
    atlasIndex: 7,
  },
  dragon: {
    id: "dragon",
    name: "Celestial Dragon",
    emoji: "🐉",
    rank: "Mythic",
    baseIncome: 95,
    summonWeight: 5,
    atlasIndex: 8,
  },
};

export const VARIANTS: Record<VariantId, VariantDefinition> = {
  natural: {
    name: "Natural",
    multiplier: 1,
    summonWeight: 65,
    color: "#7a9867",
  },
  bronze: {
    name: "Bronze",
    multiplier: 1.15,
    summonWeight: 18,
    color: "#b36d3d",
  },
  golden: {
    name: "Golden",
    multiplier: 1.5,
    summonWeight: 10,
    color: "#e7b339",
  },
  diamond: {
    name: "Diamond",
    multiplier: 2,
    summonWeight: 5,
    color: "#62cce5",
  },
  mystic: { name: "Mystic", multiplier: 3, summonWeight: 2, color: "#9b69dc" },
};

export const BORDERS: Record<BorderId, BorderDefinition> = {
  meadow: {
    id: "meadow",
    name: "Sunny Meadow",
    icon: "🌿",
    rarity: "Common",
    description: "The cozy starting border.",
    summonWeight: 50,
    incomeMultiplier: 1,
    goldenBonus: 0,
    dragonBonus: 0,
  },
  clover: {
    id: "clover",
    name: "Lucky Clover",
    icon: "🍀",
    rarity: "Rare",
    description: "+5% income from every active animal.",
    summonWeight: 27,
    incomeMultiplier: 1.05,
    goldenBonus: 0,
    dragonBonus: 0,
  },
  golden_gate: {
    id: "golden_gate",
    name: "Golden Gate",
    icon: "✨",
    rarity: "Rare",
    description: "+5% premium variant chance on Creature Bell pulls.",
    summonWeight: 18,
    incomeMultiplier: 1,
    goldenBonus: 0.05,
    dragonBonus: 0,
  },
  starfall: {
    id: "starfall",
    name: "Starfall Fence",
    icon: "🌠",
    rarity: "Legendary",
    description: "+2% Mythic chance on Creature Bell pulls.",
    summonWeight: 5,
    incomeMultiplier: 1,
    goldenBonus: 0,
    dragonBonus: 0.02,
  },
};

export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  habitat: {
    id: "habitat",
    name: "Habitat Expansion",
    icon: "🏡",
    description: "+3 active animal slots per level.",
    maxLevel: 3,
    baseCost: 7500,
  },
  production: {
    id: "production",
    name: "Feed Workshop",
    icon: "🥣",
    description: "+10% total farm income per level.",
    maxLevel: 5,
    baseCost: 5500,
  },
  offline: {
    id: "offline",
    name: "Bigger Coin Silo",
    icon: "🪙",
    description: "+2 hours offline-income capacity per level.",
    maxLevel: 5,
    baseCost: 4200,
  },
  luck: {
    id: "luck",
    name: "Lucky Bell Polish",
    icon: "🔔",
    description: "+1% premium variant chance per level.",
    maxLevel: 5,
    baseCost: 8000,
  },
};

const allSpecies = Object.values(SPECIES);
const allVariants = Object.entries(VARIANTS) as [
  VariantId,
  VariantDefinition,
][];
function rollInteger(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function calculatePotential(y: number, t: number, f: number, h: number) {
  return Math.max(
    1,
    Math.min(
      100,
      Math.round(
        ((y - 90) / 20) * 25 +
          ((t - 90) / 20) * 25 +
          (f / 8) * 25 +
          (h / 8) * 25,
      ),
    ),
  );
}

export function makeAnimal(
  id: string,
  speciesId: SpeciesId,
  variant: VariantId,
  createdAt: number,
  stats: Partial<
    Pick<
      AnimalInstance,
      "yieldStat" | "tempoStat" | "fortune" | "heritage" | "activeSlot"
    >
  > = {},
): AnimalInstance {
  const yieldStat = stats.yieldStat ?? 100,
    tempoStat = stats.tempoStat ?? 100,
    fortune = stats.fortune ?? 3,
    heritage = stats.heritage ?? 3;
  return {
    id,
    speciesId,
    variant,
    level: 1,
    yieldStat,
    tempoStat,
    fortune,
    heritage,
    potential: calculatePotential(yieldStat, tempoStat, fortune, heritage),
    locked: false,
    activeSlot: stats.activeSlot ?? null,
    createdAt,
  };
}

export function createInitialGameState(now: number): GameState {
  return {
    version: 3,
    coins: 6200,
    discoveryStars: 3,
    fusionDust: 20,
    pity: 0,
    borderPity: 0,
    lastClaimedAt: now - 10 * 60 * 1000,
    ownedBorders: ["meadow"],
    activeBorder: "meadow",
    upgrades: { habitat: 1, production: 1, offline: 1, luck: 1 },
    discoveredSpecies: ["cow", "chicken"],
    summonHistory: [],
    animals: [
      makeAnimal("starter-cow", "cow", "golden", now - 600000, {
        yieldStat: 108,
        tempoStat: 104,
        fortune: 5,
        heritage: 4,
        activeSlot: 0,
      }),
      makeAnimal("starter-chicken-active", "chicken", "natural", now - 590000, {
        yieldStat: 98,
        tempoStat: 103,
        fortune: 2,
        heritage: 3,
        activeSlot: 1,
      }),
      makeAnimal("starter-chicken-a", "chicken", "natural", now - 580000, {
        yieldStat: 94,
        tempoStat: 99,
        fortune: 2,
        heritage: 5,
      }),
      makeAnimal("starter-chicken-b", "chicken", "natural", now - 570000, {
        yieldStat: 103,
        tempoStat: 96,
        fortune: 3,
        heritage: 4,
      }),
      makeAnimal("starter-chicken-c", "chicken", "natural", now - 560000, {
        yieldStat: 101,
        tempoStat: 106,
        fortune: 4,
        heritage: 6,
      }),
    ],
  };
}

export function migrateGameState(
  value: unknown,
  now: number,
): GameState | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<Omit<GameState, "version">> & { version?: number };
  if (
    typeof s.coins !== "number" ||
    typeof s.lastClaimedAt !== "number" ||
    !Array.isArray(s.animals) ||
    ![1, 2, 3].includes(s.version ?? 0)
  )
    return null;
  const ownedBorders: BorderId[] = Array.isArray(s.ownedBorders)
    ? s.ownedBorders.filter(
        (id): id is BorderId => typeof id === "string" && id in BORDERS,
      )
    : ["meadow"];
  const activeBorder =
    s.activeBorder && s.activeBorder in BORDERS ? s.activeBorder : "meadow";
  const validAnimals = s.animals.filter(
    (animal) =>
      animal && animal.speciesId in SPECIES && animal.variant in VARIANTS,
  );
  const discoveredFromAnimals = [
    ...new Set(validAnimals.map((animal) => animal.speciesId)),
  ];
  return {
    version: 3,
    coins: s.coins + ((s.version ?? 0) < 3 ? 5000 : 0),
    discoveryStars: typeof s.discoveryStars === "number" ? s.discoveryStars : 0,
    fusionDust: typeof s.fusionDust === "number" ? s.fusionDust : 0,
    pity: typeof s.pity === "number" ? s.pity : 0,
    borderPity: typeof s.borderPity === "number" ? s.borderPity : 0,
    lastClaimedAt: s.lastClaimedAt || now,
    animals: validAnimals,
    ownedBorders: ownedBorders.length ? ownedBorders : ["meadow"],
    activeBorder: ownedBorders.includes(activeBorder) ? activeBorder : "meadow",
    upgrades: {
      habitat: s.upgrades?.habitat ?? 1,
      production: s.upgrades?.production ?? 1,
      offline: s.upgrades?.offline ?? 1,
      luck: s.upgrades?.luck ?? 1,
    },
    discoveredSpecies: Array.isArray(s.discoveredSpecies)
      ? s.discoveredSpecies.filter(
          (id): id is SpeciesId => typeof id === "string" && id in SPECIES,
        )
      : discoveredFromAnimals,
    summonHistory: Array.isArray(s.summonHistory)
      ? s.summonHistory.slice(0, 30)
      : [],
  };
}

export function farmSlotCount(state: GameState) {
  return BASE_FARM_SLOTS + (state.upgrades.habitat - 1) * 3;
}
export function offlineCapMs(state: GameState) {
  return (
    BASE_OFFLINE_CAP_MS + (state.upgrades.offline - 1) * 2 * 60 * 60 * 1000
  );
}
export function productionMultiplier(state: GameState) {
  return 1 + (state.upgrades.production - 1) * 0.1;
}
export function upgradeCost(id: UpgradeId, level: number) {
  return Math.round(UPGRADES[id].baseCost * Math.pow(2.05, level - 1));
}
export function animalLevelCost(animal: AnimalInstance) {
  const rankMultiplier =
    1 + RANK_ORDER.indexOf(SPECIES[animal.speciesId].rank) * 0.45;
  const variantMultiplier = VARIANTS[animal.variant].multiplier;
  return (
    Math.round(
      (900 *
        Math.pow(1.7, animal.level - 1) *
        rankMultiplier *
        variantMultiplier) /
        50,
    ) * 50
  );
}
export function animalIncomePerMinute(animal: AnimalInstance) {
  const species = SPECIES[animal.speciesId],
    variant = VARIANTS[animal.variant],
    levelMultiplier = 1 + (animal.level - 1) * 0.08;
  return Math.max(
    1,
    Math.round(
      species.baseIncome *
        variant.multiplier *
        levelMultiplier *
        (animal.yieldStat / 100) *
        (animal.tempoStat / 100),
    ),
  );
}
export function farmIncomePerMinute(animals: AnimalInstance[], multiplier = 1) {
  return Math.round(
    animals
      .filter((animal) => animal.activeSlot !== null)
      .reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0) *
      multiplier,
  );
}
export function autoPlaceBestAnimals(
  animals: AnimalInstance[],
  slotCount: number,
) {
  const selected = [...animals]
    .sort(
      (a, b) =>
        animalIncomePerMinute(b) - animalIncomePerMinute(a) ||
        b.potential - a.potential ||
        a.createdAt - b.createdAt,
    )
    .slice(0, slotCount);
  const slotById = new Map(selected.map((animal, index) => [animal.id, index]));
  return animals.map((animal) => ({
    ...animal,
    activeSlot: slotById.get(animal.id) ?? null,
  }));
}
export function totalFarmMultiplier(state: GameState) {
  return (
    BORDERS[state.activeBorder].incomeMultiplier * productionMultiplier(state)
  );
}
export function claimableIncome(state: GameState, now: number) {
  const elapsed = Math.max(
    0,
    Math.min(now - state.lastClaimedAt, offlineCapMs(state)),
  );
  return Math.floor(
    (elapsed / 60000) *
      farmIncomePerMinute(state.animals, totalFarmMultiplier(state)),
  );
}

function pickSpecies(
  rng: () => number,
  dragonBonus = 0,
  minimumRank?: Rank,
): SpeciesId {
  const pool = minimumRank
    ? allSpecies.filter(
        (species) =>
          RANK_ORDER.indexOf(species.rank) >= RANK_ORDER.indexOf(minimumRank),
      )
    : allSpecies;
  const weights = pool.map((species) =>
    Math.max(
      0.1,
      species.summonWeight + (species.id === "dragon" ? dragonBonus * 100 : 0),
    ),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let index = 0; index < pool.length; index++) {
    roll -= weights[index];
    if (roll < 0) return pool[index].id;
  }
  return pool[pool.length - 1].id;
}

function pickVariant(rng: () => number, premiumBonus = 0): VariantId {
  const bonusPoints = premiumBonus * 100;
  const weights = allVariants.map(([id, definition]) =>
    Math.max(
      0.1,
      definition.summonWeight +
        (id === "natural"
          ? -bonusPoints
          : id === "golden"
            ? bonusPoints * 0.6
            : id === "diamond"
              ? bonusPoints * 0.25
              : id === "mystic"
                ? bonusPoints * 0.15
                : 0),
    ),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let index = 0; index < allVariants.length; index++) {
    roll -= weights[index];
    if (roll < 0) return allVariants[index][0];
  }
  return "natural";
}

export function summonAnimal(
  rng: () => number,
  id: string,
  createdAt: number,
  pity: number,
  boosts: {
    dragonBonus?: number;
    goldenBonus?: number;
    minimumRank?: Rank;
  } = {},
) {
  const speciesId: SpeciesId =
    pity >= 19
      ? "dragon"
      : pickSpecies(rng, boosts.dragonBonus, boosts.minimumRank);
  const variant = pickVariant(rng, boosts.goldenBonus);
  const animal = makeAnimal(id, speciesId, variant, createdAt, {
    yieldStat: rollInteger(rng, 90, 110),
    tempoStat: rollInteger(rng, 90, 110),
    fortune: rollInteger(rng, 0, 8),
    heritage: rollInteger(rng, 0, 8),
  });
  return { animal, nextPity: speciesId === "dragon" ? 0 : pity + 1 };
}

export function summonBorder(rng: () => number, pity: number) {
  if (pity >= 14) return { borderId: "starfall" as const, nextPity: 0 };
  const roll = rng() * 100;
  let cursor = 0;
  for (const border of Object.values(BORDERS)) {
    cursor += border.summonWeight;
    if (roll < cursor)
      return {
        borderId: border.id,
        nextPity: border.id === "starfall" ? 0 : pity + 1,
      };
  }
  return { borderId: "starfall" as const, nextPity: 0 };
}

export function mergeAnimals(
  parents: AnimalInstance[],
  rng: () => number,
  id: string,
  createdAt: number,
) {
  if (parents.length !== 3)
    throw new Error("Species Merge requires exactly three animals.");
  const [first] = parents;
  if (
    parents.some(
      (animal) =>
        animal.speciesId !== first.speciesId ||
        animal.variant !== first.variant,
    )
  )
    throw new Error(
      "All merge animals must have the same species and variant.",
    );
  if (parents.some((animal) => animal.locked || animal.activeSlot !== null))
    throw new Error("Active or locked animals cannot be merged.");
  const variantIds = Object.keys(VARIANTS) as VariantId[];
  const currentIndex = variantIds.indexOf(first.variant);
  const upgradedVariant =
    currentIndex < variantIds.length - 1 && rng() < 0.35
      ? variantIds[currentIndex + 1]
      : first.variant;
  return makeAnimal(id, first.speciesId, upgradedVariant, createdAt, {
    yieldStat: Math.min(
      120,
      Math.max(
        ...parents.map((animal) => animal.yieldStat),
        rollInteger(rng, 96, 114),
      ),
    ),
    tempoStat: Math.min(
      120,
      Math.max(
        ...parents.map((animal) => animal.tempoStat),
        rollInteger(rng, 96, 114),
      ),
    ),
    fortune: Math.min(
      10,
      Math.max(
        ...parents.map((animal) => animal.fortune),
        rollInteger(rng, 3, 9),
      ),
    ),
    heritage: Math.min(
      10,
      Math.max(
        ...parents.map((animal) => animal.heritage),
        rollInteger(rng, 3, 9),
      ),
    ),
  });
}

export function isGameState(value: unknown): value is GameState {
  return Boolean(migrateGameState(value, Date.now()));
}
