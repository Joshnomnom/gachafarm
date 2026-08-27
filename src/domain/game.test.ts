import { describe, expect, it } from 'vitest';
import {
  animalIncomePerMinute,
  claimableIncome,
  createInitialGameState,
  makeAnimal,
  mergeAnimals,
  summonAnimal,
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
});
