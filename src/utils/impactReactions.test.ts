// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  classifyImpactReaction,
  IMPACT_REACTION_THRESHOLDS,
  type ImpactClassificationInput,
} from './impactReactions';

const impact = (overrides: Partial<ImpactClassificationInput> = {}): ImpactClassificationInput => ({
  damage: 12,
  defenderHealthMax: 120,
  isBlocked: false,
  isPowerAttack: false,
  isCrit: false,
  ...overrides,
});

describe('physical combat impact classification', () => {
  test('a light non-critical strike below the threshold causes no reaction', () => {
    expect(classifyImpactReaction(impact({ damage: 11 }))).toBe('none');
  });

  test('a sufficiently damaging light strike causes stagger', () => {
    expect(classifyImpactReaction(impact({ damage: 12 }))).toBe('stagger');
    expect(IMPACT_REACTION_THRESHOLDS.staggerHealthFraction).toBe(0.1);
  });

  test('a power strike staggers even when its damage is below the knockdown threshold', () => {
    expect(classifyImpactReaction(impact({ damage: 18, isPowerAttack: true }))).toBe('stagger');
  });

  test('a heavy strike above its normalized threshold causes knockdown', () => {
    expect(classifyImpactReaction(impact({ damage: 27, isPowerAttack: true }))).toBe('knockdown');
  });

  test('a critical hit can knock down at its lower threshold', () => {
    expect(classifyImpactReaction(impact({ damage: 22, isCrit: true }))).toBe('knockdown');
  });

  test('a critical hit below its threshold does not knock down', () => {
    expect(classifyImpactReaction(impact({ damage: 20, isCrit: true }))).toBe('stagger');
  });

  test('a blocked strike never staggers or knocks down in this first pass', () => {
    expect(classifyImpactReaction(impact({
      damage: 80,
      isBlocked: true,
      isPowerAttack: true,
      isCrit: true,
    }))).toBe('none');
  });

  test('normalizes impact against each opponent health pool', () => {
    expect(classifyImpactReaction(impact({
      damage: 24,
      defenderHealthMax: 240,
      isPowerAttack: true,
    }))).toBe('stagger');
    expect(classifyImpactReaction(impact({
      damage: 24,
      defenderHealthMax: 100,
      isPowerAttack: true,
    }))).toBe('knockdown');
  });

  test('mass impact multiplier influences thresholds but is safely clamped', () => {
    expect(classifyImpactReaction(impact({
      damage: 16,
      isCrit: true,
      impactMultiplier: 1.5,
    }))).toBe('knockdown');
    expect(classifyImpactReaction(impact({
      damage: 16,
      isCrit: true,
      impactMultiplier: 100,
    }))).toBe('knockdown');
    expect(classifyImpactReaction(impact({
      damage: 16,
      impactMultiplier: -100,
    }))).toBe('none');
  });

  test('invalid damage or health inputs fail closed', () => {
    expect(classifyImpactReaction(impact({ damage: Number.NaN }))).toBe('none');
    expect(classifyImpactReaction(impact({ damage: -1 }))).toBe('none');
    expect(classifyImpactReaction(impact({ defenderHealthMax: 0 }))).toBe('none');
    expect(classifyImpactReaction(impact({ defenderHealthMax: Number.POSITIVE_INFINITY }))).toBe('none');
  });
});
