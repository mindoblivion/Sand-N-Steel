// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import type { DuelStatistics, PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { TRIAL_OF_ENDURANCE_OPPONENTS } from '../data/trialOfEndurance';
import {
  resolveTrialOfEndurance,
  settleTrialOfEnduranceRound,
  trialOfEnduranceOpponentFor,
} from './trialOfEndurance';

const fresh = (): PlayerProfile => createNewProfile('Trial Test');
const stats = (): DuelStatistics => ({
  damageDealt: 70,
  damageTaken: 45,
  hitsLanded: 7,
  perfectBlocks: 1,
  dodgesPerformed: 2,
  maxCombo: 3,
  lowestStaminaFraction: 0.3,
  crowdHypePeak: 30,
  durationSeconds: 80,
  goldEarned: 70,
  fameEarned: 20,
  xpEarned: 90,
});

describe('Trial of Endurance progression', () => {
  test('legacy and fresh saves remain valid without eager story writes', () => {
    const profile = fresh();
    expect(resolveTrialOfEndurance(profile)).toMatchObject({
      attempts: 0, currentRound: 1, wins: 0, losses: 0, completed: false,
    });
    expect(profile.story).toBeUndefined();
  });

  test('three authored opponents are isolated from the standard roster', () => {
    expect(TRIAL_OF_ENDURANCE_OPPONENTS).toHaveLength(3);
    expect(new Set(TRIAL_OF_ENDURANCE_OPPONENTS.map((row) => row.id)).size).toBe(3);
    expect(TRIAL_OF_ENDURANCE_OPPONENTS.every((row) => row.isBoss !== true)).toBe(true);
  });

  test('only the expected round advances, and the first two wins do not set trialDone', () => {
    const first = TRIAL_OF_ENDURANCE_OPPONENTS[0];
    const second = TRIAL_OF_ENDURANCE_OPPONENTS[1];
    const third = TRIAL_OF_ENDURANCE_OPPONENTS[2];
    const afterOne = settleTrialOfEnduranceRound(fresh(), first, true, true, stats());
    expect(resolveTrialOfEndurance(afterOne)).toMatchObject({ attempts: 1, currentRound: 2, wins: 1 });
    expect(afterOne.story?.trialDone).not.toBe(true);
    expect(settleTrialOfEnduranceRound(afterOne, third, true, true, stats())).toBe(afterOne);
    const afterTwo = settleTrialOfEnduranceRound(afterOne, second, true, true, stats());
    expect(resolveTrialOfEndurance(afterTwo)).toMatchObject({ currentRound: 3, wins: 2 });
    expect(afterTwo.story?.trialDone).not.toBe(true);
    const complete = settleTrialOfEnduranceRound(afterTwo, third, true, true, stats());
    expect(resolveTrialOfEndurance(complete).completed).toBe(true);
    expect(complete.story?.trialDone).toBe(true);
  });

  test('loss resets to round one and a new attempt can begin', () => {
    const afterWin = settleTrialOfEnduranceRound(fresh(), TRIAL_OF_ENDURANCE_OPPONENTS[0], true, true, stats());
    const loss = settleTrialOfEnduranceRound(afterWin, TRIAL_OF_ENDURANCE_OPPONENTS[1], false, true, stats());
    expect(resolveTrialOfEndurance(loss)).toMatchObject({
      attempts: 1, currentRound: 1, wins: 1, losses: 1, completed: false,
    });
    const retry = settleTrialOfEnduranceRound(loss, TRIAL_OF_ENDURANCE_OPPONENTS[0], true, true, stats());
    expect(resolveTrialOfEndurance(retry).attempts).toBe(2);
  });

  test('rejected rewards, technical markers, exhibition and grudge results cannot progress', () => {
    const profile = fresh();
    const opponent = TRIAL_OF_ENDURANCE_OPPONENTS[0];
    expect(settleTrialOfEnduranceRound(profile, opponent, true, false, stats())).toBe(profile);
    expect(settleTrialOfEnduranceRound(profile, opponent, true, true, { ...stats(), outcome: 'technical' } as DuelStatistics)).toBe(profile);
    expect(settleTrialOfEnduranceRound(profile, opponent, true, true, stats(), { exhibition: true })).toBe(profile);
    expect(settleTrialOfEnduranceRound(profile, opponent, true, true, stats(), { grudge: true })).toBe(profile);
  });

  test('malformed or completed records cannot manufacture progression', () => {
    const malformed = { ...fresh(), story: { trialOfEndurance: { completed: true, wins: 3 } } } as PlayerProfile;
    expect(resolveTrialOfEndurance(malformed).completed).toBe(false);
    expect(trialOfEnduranceOpponentFor(malformed)?.id).toBe(TRIAL_OF_ENDURANCE_OPPONENTS[0].id);
    const complete = {
      ...fresh(),
      story: { trialDone: true, trialOfEndurance: { attempts: 1, currentRound: 3, wins: 3, completed: true, lastOutcome: 'win' } },
    } as PlayerProfile;
    expect(trialOfEnduranceOpponentFor(complete)).toBeNull();
  });
});
