export const FARM_SLOTS = 6;
export const SUMMON_COST = 500;
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;

export type SpeciesId = 'chicken' | 'cow' | 'dragon';
export type VariantId = 'natural' | 'golden';
export type Rank = 'Common' | 'Mythic';

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

export type GameState = {
  version: 1;
  coins: number;
  discoveryStars: number;
  fusionDust: number;
  pity: number;
  lastClaimedAt: number;
  animals: AnimalInstance[];
};

export type SpeciesDefinition = {
  id: SpeciesId;
  name: string;
  emoji: string;
  rank: Rank;
  baseIncome: number;
  summonWeight: number;
};

export const SPECIES: Record<SpeciesId, SpeciesDefinition> = {
  chicken: { id: 'chicken', name: 'Chicken', emoji: '🐔', rank: 'Common', baseIncome: 7, summonWeight: 55 },
  cow: { id: 'cow', name: 'Cow', emoji: '🐮', rank: 'Common', baseIncome: 13, summonWeight: 40 },
  dragon: { id: 'dragon', name: 'Celestial Dragon', emoji: '🐉', rank: 'Mythic', baseIncome: 95, summonWeight: 5 },
};

export const VARIANTS: Record<VariantId, { name: string; multiplier: number }> = {
  natural: { name: 'Natural', multiplier: 1 },
  golden: { name: 'Golden', multiplier: 1.5 },
};

function rollInteger(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function calculatePotential(yieldStat: number, tempoStat: number, fortune: number, heritage: number) {
  const yieldScore = ((yieldStat - 90) / 20) * 25;
  const tempoScore = ((tempoStat - 90) / 20) * 25;
  const fortuneScore = (fortune / 8) * 25;
  const heritageScore = (heritage / 8) * 25;
  return Math.max(1, Math.min(100, Math.round(yieldScore + tempoScore + fortuneScore + heritageScore)));
}

export function makeAnimal(
  id: string,
  speciesId: SpeciesId,
  variant: VariantId,
  createdAt: number,
  stats: Partial<Pick<AnimalInstance, 'yieldStat' | 'tempoStat' | 'fortune' | 'heritage' | 'activeSlot'>> = {},
): AnimalInstance {
  const yieldStat = stats.yieldStat ?? 100;
  const tempoStat = stats.tempoStat ?? 100;
  const fortune = stats.fortune ?? 3;
  const heritage = stats.heritage ?? 3;

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
    version: 1,
    coins: 1840,
    discoveryStars: 3,
    fusionDust: 20,
    pity: 0,
    lastClaimedAt: now - 10 * 60 * 1000,
    animals: [
      makeAnimal('starter-cow', 'cow', 'golden', now - 600_000, { yieldStat: 108, tempoStat: 104, fortune: 5, heritage: 4, activeSlot: 0 }),
      makeAnimal('starter-chicken-active', 'chicken', 'natural', now - 590_000, { yieldStat: 98, tempoStat: 103, fortune: 2, heritage: 3, activeSlot: 1 }),
      makeAnimal('starter-chicken-a', 'chicken', 'natural', now - 580_000, { yieldStat: 94, tempoStat: 99, fortune: 2, heritage: 5 }),
      makeAnimal('starter-chicken-b', 'chicken', 'natural', now - 570_000, { yieldStat: 103, tempoStat: 96, fortune: 3, heritage: 4 }),
      makeAnimal('starter-chicken-c', 'chicken', 'natural', now - 560_000, { yieldStat: 101, tempoStat: 106, fortune: 4, heritage: 6 }),
    ],
  };
}

export function animalIncomePerMinute(animal: AnimalInstance) {
  const species = SPECIES[animal.speciesId];
  const variant = VARIANTS[animal.variant];
  const levelMultiplier = 1 + (animal.level - 1) * 0.08;
  return Math.max(1, Math.round(species.baseIncome * variant.multiplier * levelMultiplier * (animal.yieldStat / 100) * (animal.tempoStat / 100)));
}

export function farmIncomePerMinute(animals: AnimalInstance[]) {
  return animals.filter((animal) => animal.activeSlot !== null).reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0);
}

export function claimableIncome(state: GameState, now: number) {
  const elapsed = Math.max(0, Math.min(now - state.lastClaimedAt, OFFLINE_CAP_MS));
  return Math.floor((elapsed / 60_000) * farmIncomePerMinute(state.animals));
}

function pickSpecies(rng: () => number): SpeciesId {
  const roll = rng() * 100;
  if (roll < SPECIES.chicken.summonWeight) return 'chicken';
  if (roll < SPECIES.chicken.summonWeight + SPECIES.cow.summonWeight) return 'cow';
  return 'dragon';
}

export function summonAnimal(rng: () => number, id: string, createdAt: number, pity: number) {
  const speciesId: SpeciesId = pity >= 19 ? 'dragon' : pickSpecies(rng);
  const variant: VariantId = rng() < 0.12 ? 'golden' : 'natural';
  const yieldStat = rollInteger(rng, 90, 110);
  const tempoStat = rollInteger(rng, 90, 110);
  const fortune = rollInteger(rng, 0, 8);
  const heritage = rollInteger(rng, 0, 8);
  const animal = makeAnimal(id, speciesId, variant, createdAt, { yieldStat, tempoStat, fortune, heritage });

  return {
    animal,
    nextPity: speciesId === 'dragon' ? 0 : pity + 1,
  };
}

export function mergeAnimals(parents: AnimalInstance[], rng: () => number, id: string, createdAt: number) {
  if (parents.length !== 3) throw new Error('Species Merge requires exactly three animals.');
  const [first] = parents;
  if (parents.some((animal) => animal.speciesId !== first.speciesId || animal.variant !== first.variant)) {
    throw new Error('All merge animals must have the same species and variant.');
  }
  if (parents.some((animal) => animal.locked || animal.activeSlot !== null)) {
    throw new Error('Active or locked animals cannot be merged.');
  }

  const upgradedVariant: VariantId = first.variant === 'natural' && rng() < 0.35 ? 'golden' : first.variant;
  const yieldStat = Math.min(120, Math.max(...parents.map((animal) => animal.yieldStat), rollInteger(rng, 96, 114)));
  const tempoStat = Math.min(120, Math.max(...parents.map((animal) => animal.tempoStat), rollInteger(rng, 96, 114)));
  const fortune = Math.min(10, Math.max(...parents.map((animal) => animal.fortune), rollInteger(rng, 3, 9)));
  const heritage = Math.min(10, Math.max(...parents.map((animal) => animal.heritage), rollInteger(rng, 3, 9)));

  return makeAnimal(id, first.speciesId, upgradedVariant, createdAt, { yieldStat, tempoStat, fortune, heritage });
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return state.version === 1 && typeof state.coins === 'number' && typeof state.lastClaimedAt === 'number' && Array.isArray(state.animals);
}
