// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  PROFILE_STORAGE_KEY,
  createNewProfile,
  loadSavedProfile,
  saveProfile,
} from '../services/storage';
import { TRIAL_OF_ENDURANCE_OPPONENTS } from '../data/trialOfEndurance';
import { resolveTrialOfEndurance, settleTrialOfEnduranceRound } from './trialOfEndurance';
import type { DuelStatistics } from '../types/game';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  },
});

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

describe('Trial of Endurance — save/reload persistence', () => {
  test('the next round and final completion survive actual profile serialization', () => {
    store.clear();
    const fresh = createNewProfile('Trial Persistence');
    const roundOne = settleTrialOfEnduranceRound(
      fresh, TRIAL_OF_ENDURANCE_OPPONENTS[0], true, true, stats(),
    );
    expect(saveProfile(roundOne)).toBe(true);

    const afterRoundOneReload = loadSavedProfile();
    expect(afterRoundOneReload).not.toBeNull();
    expect(resolveTrialOfEndurance(afterRoundOneReload)).toMatchObject({
      attempts: 1, currentRound: 2, wins: 1, completed: false,
    });

    const roundTwo = settleTrialOfEnduranceRound(
      afterRoundOneReload!, TRIAL_OF_ENDURANCE_OPPONENTS[1], true, true, stats(),
    );
    expect(saveProfile(roundTwo)).toBe(true);
    const afterRoundTwoReload = loadSavedProfile();
    expect(resolveTrialOfEndurance(afterRoundTwoReload)).toMatchObject({
      currentRound: 3, wins: 2, completed: false,
    });

    const final = settleTrialOfEnduranceRound(
      afterRoundTwoReload!, TRIAL_OF_ENDURANCE_OPPONENTS[2], true, true, stats(),
    );
    expect(final.story?.trialDone).toBe(true);
    expect(saveProfile(final)).toBe(true);
    const completed = loadSavedProfile();
    expect(resolveTrialOfEndurance(completed).completed).toBe(true);
    expect(JSON.parse(store.get(PROFILE_STORAGE_KEY)!).story.trialDone).toBe(true);
  });
});
