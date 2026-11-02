// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { normalizeInjury } from './injurySettlement';
import { describeInjury } from './injuryStatus';

const stats = readFileSync(new URL('../components/hub/StatsTab.tsx', import.meta.url), 'utf8');
const preFight = readFileSync(new URL('../components/hub/PreFightModal.tsx', import.meta.url), 'utf8');
const result = readFileSync(new URL('../components/hub/DuelResultModal.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const school = readFileSync(new URL('../components/hub/GladiatorSchoolHub.tsx', import.meta.url), 'utf8');

const INJURY = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };

describe('L8 — canonical injury presentation', () => {
  test('two remaining fights produce the canonical status label', () => {
    expect(describeInjury(INJURY)).toEqual({
      penaltyStrength: 2,
      penaltyAgility: 2,
      fightsRemaining: 2,
      durationLabel: 'Affects the next 2 completed duels',
    });
  });

  test('one remaining fight uses singular wording', () => {
    expect(describeInjury({ ...INJURY, fightsRemaining: 1 })?.durationLabel)
      .toBe('Affects the next completed duel');
  });

  test('legacy longer durations retain their own count', () => {
    expect(describeInjury({ ...INJURY, fightsRemaining: 5 })?.durationLabel)
      .toBe('Affects the next 5 completed duels');
  });

  test('absent, malformed and spent records produce no status', () => {
    for (const value of [null, undefined, {}, [], 'hurt', 7,
      { ...INJURY, fightsRemaining: 0 },
      { ...INJURY, fightsRemaining: Number.NaN },
      { ...INJURY, fightsRemaining: Infinity }]) {
      expect(describeInjury(value)).toBeNull();
    }
  });

  test('malformed penalties use the same finite canonical values as combat stats', () => {
    const malformed = { ...INJURY, penaltyStrength: Number.NaN, penaltyAgility: Infinity };
    const status = describeInjury(malformed);
    const normalized = normalizeInjury(malformed);
    expect(status?.penaltyStrength).toBe(normalized?.penaltyStrength);
    expect(status?.penaltyAgility).toBe(normalized?.penaltyAgility);
    expect(status?.penaltyStrength).toBe(2);
    expect(status?.penaltyAgility).toBe(2);
  });

  test('negative penalties never display as a bonus', () => {
    const status = describeInjury({ ...INJURY, penaltyStrength: -4, penaltyAgility: -1 });
    expect(status?.penaltyStrength).toBe(0);
    expect(status?.penaltyAgility).toBe(0);
  });

  test('fractional duration floors to completed duels', () => {
    expect(describeInjury({ ...INJURY, fightsRemaining: 1.5 })?.fightsRemaining).toBe(1);
  });

  test('the stats tab uses the shared presentation reader', () => {
    expect(stats).toContain("import { describeInjury } from '../../utils/injuryStatus'");
    expect(stats).toContain('describeInjury(profile.injury)');
    expect(stats).toContain('injuryStatus.durationLabel');
  });

  test('the pre-fight card receives the profile injury and renders only when active', () => {
    expect(preFight).toContain('injury?: PlayerInjury | null;');
    expect(preFight).toContain('describeInjury(injury)');
    expect(preFight).toContain('{injuryStatus && (');
    expect(school).toContain('injury={playerProfile.injury}');
  });

  test('the result card receives the settled injury, not an inference from didWin', () => {
    expect(result).toContain('injury?: PlayerInjury | null;');
    expect(result).toContain('describeInjury(injury)');
    expect(result).toContain('injuryStatus.durationLabel');
    expect(app).toContain('injury: afterInjury.injury ?? null');
    expect(app).toContain('injury={duelResult.injury}');
  });

  test('presentation stays read-only and does not own settlement or persistence', () => {
    for (const source of [stats, preFight, result]) {
      expect(source).not.toContain('settleInjury(');
      expect(source).not.toContain('saveProfile(');
      expect(source).not.toContain('localStorage');
    }
  });
});
