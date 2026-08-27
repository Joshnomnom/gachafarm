import { describe, expect, it } from 'vitest';
import {
  BORDERS,
  animalIncomePerMinute,
  claimableIncome,
  createInitialGameState,
  farmIncomePerMinute,
  makeAnimal,
  mergeAnimals,
  migrateGameState,
  summonAnimal,
  summonBorder,
} from './game';

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe('GachaFarm domain rules', () => {
  it('calculates more income for a Golden animal than an otherwise identical Natural animal', () => {
    const natural = makeAnimal('a', 'cow', 'natural', 0);
    const golden = makeAnimal('b', 'cow', 'golden', 0);
    expect(animalIncomePerMinute(golden)).toBeGreaterThan(animalIncomePerMinute(natural));
  });

  it('caps offline income at four hours', () => {
    const state = createInitialGameState(0);
    state.lastClaimedAt = 0;
    expect(claimableIncome(state, 8 * 60 * 60 * 1000)).toBe(claimableIncome(state, 4 * 60 * 60 * 1000));
  });

  it('guarantees a dragon on the twentieth pull', () => {
    const result = summonAnimal(sequence([0, 0, 0, 0, 0, 0]), 'dragon', 0, 19);
    expect(result.animal.speciesId).toBe('dragon');
    expect(result.nextPity).toBe(0);
  });

  it('never lowers the visual variant during a safe species merge', () => {
    const parents = [
      makeAnimal('a', 'cow', 'golden', 0),
      makeAnimal('b', 'cow', 'golden', 0),
      makeAnimal('c', 'cow', 'golden', 0),
    ];
    const result = mergeAnimals(parents, sequence([0.99, 0, 0, 0, 0]), 'merged', 1);
    expect(result.variant).toBe('golden');
  });

  it('rejects active merge inputs', () => {
    const parents = [
      makeAnimal('a', 'chicken', 'natural', 0, { activeSlot: 0 }),
      makeAnimal('b', 'chicken', 'natural', 0),
      makeAnimal('c', 'chicken', 'natural', 0),
    ];
    expect(() => mergeAnimals(parents, Math.random, 'merged', 1)).toThrow('Active or locked');
  });

  it('migrates version 1 browser saves without losing animals', () => {
    const legacy = { ...createInitialGameState(100), version: 1 };
    delete (legacy as Partial<typeof legacy>).ownedBorders;
    delete (legacy as Partial<typeof legacy>).activeBorder;
    const migrated = migrateGameState(legacy, 200);
    expect(migrated?.version).toBe(2);
    expect(migrated?.ownedBorders).toEqual(['meadow']);
    expect(migrated?.animals).toHaveLength(5);
  });

  it('applies the equipped border income boost', () => {
    const state = createInitialGameState(0);
    const normal = farmIncomePerMinute(state.animals);
    const boosted = farmIncomePerMinute(state.animals, BORDERS.clover.incomeMultiplier);
    expect(boosted).toBeGreaterThan(normal);
  });

  it('allows border boosts to improve creature pull rates', () => {
    const withoutBoost = summonAnimal(sequence([0.06, 0, 0, 0, 0, 0, 0]), 'normal', 0, 0);
    const withBoost = summonAnimal(sequence([0.06, 0, 0, 0, 0, 0]), 'boosted', 0, 0, { dragonBonus: 0.02 });
    expect(withoutBoost.animal.speciesId).not.toBe('dragon');
    expect(withBoost.animal.speciesId).toBe('dragon');
  });

  it('guarantees Starfall Fence on the fifteenth border pull', () => {
    expect(summonBorder(() => 0, 14)).toEqual({ borderId: 'starfall', nextPity: 0 });
  });
});
