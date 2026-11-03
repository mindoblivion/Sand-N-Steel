// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { getBodyDamageProfile } from './injuryAppearance';

describe('body-visible injury and damage profile', () => {
  test('a healthy fighter has no visible damage', () => {
    expect(getBodyDamageProfile(100, 100)).toEqual({
      bruiseIntensity: 0,
      swellingIntensity: 0,
      stage: 'clear',
    });
  });

  test('falling health gradually adds bruising and then swelling', () => {
    const bruised = getBodyDamageProfile(60, 100);
    expect(bruised.stage).toBe('bruised');
    expect(bruised.bruiseIntensity).toBeGreaterThan(0);
    expect(bruised.swellingIntensity).toBe(0);

    const swollen = getBodyDamageProfile(30, 100);
    expect(swollen.stage).toBe('swollen');
    expect(swollen.bruiseIntensity).toBeGreaterThan(bruised.bruiseIntensity);
    expect(swollen.swellingIntensity).toBeGreaterThan(0);

    const critical = getBodyDamageProfile(5, 100);
    expect(critical.bruiseIntensity).toBe(0.85);
    expect(critical.swellingIntensity).toBe(0.65);
  });

  test('the existing persistent two-fight injury keeps visible marks between bouts', () => {
    const injured = getBodyDamageProfile(100, 100, {
      fightsRemaining: 2,
      penaltyStrength: 2,
      penaltyAgility: 2,
    });
    expect(injured).toEqual({
      bruiseIntensity: 0.55,
      swellingIntensity: 0.25,
      stage: 'bruised',
    });
    expect(getBodyDamageProfile(100, 100, null).stage).toBe('clear');
  });

  test('malformed health and exhausted injuries fail closed to an unmarked body', () => {
    expect(getBodyDamageProfile(Number.NaN, 100).stage).toBe('clear');
    expect(getBodyDamageProfile(10, 0).stage).toBe('clear');
    expect(getBodyDamageProfile(100, 100, {
      fightsRemaining: 0,
      penaltyStrength: 2,
      penaltyAgility: 2,
    }).stage).toBe('clear');
  });
});
