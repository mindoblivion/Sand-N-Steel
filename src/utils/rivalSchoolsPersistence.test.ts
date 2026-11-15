// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  PROFILE_STORAGE_KEY,
  createNewProfile,
  loadSavedProfile,
  saveProfile,
} from '../services/storage';
import { RIVAL_SCHOOL_OPPONENT } from '../data/rivalSchools';
import {
  resolveRivalryProgress,
  settleRivalSchoolBout,
} from './rivalSchools';
import type { DuelStatistics } from '../types/game';

const store = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageShim,
});

const stats = (): DuelStatistics => ({
  damageDealt: 60,
  damageTaken: 45,
  hitsLanded: 6,
  perfectBlocks: 1,
  dodgesPerformed: 2,
  maxCombo: 3,
  lowestStaminaFraction: 0.35,
  crowdHypePeak: 28,
  durationSeconds: 75,
  goldEarned: 70,
  fameEarned: 20,
  xpEarned: 90,
});

describe('Rival Schools — save/reload persistence', () => {
  test('losses and the completed rival record survive the real profile save/load pair', () => {
    store.clear();
    const fresh = createNewProfile('Rival Persistence');
    const loss = settleRivalSchoolBout(
      fresh,
      RIVAL_SCHOOL_OPPONENT,
      false,
      true,
      stats(),
    );
    expect(saveProfile(loss)).toBe(true);

    const afterLossReload = loadSavedProfile();
    expect(afterLossReload).not.toBeNull();
    expect(resolveRivalryProgress(afterLossReload)).toMatchObject({
      attempts: 1,
      wins: 0,
      losses: 1,
      completed: false,
      lastOutcome: 'loss',
    });

    const win = settleRivalSchoolBout(
      afterLossReload!,
      RIVAL_SCHOOL_OPPONENT,
      true,
      true,
      stats(),
    );
    expect(saveProfile(win)).toBe(true);

    const afterWinReload = loadSavedProfile();
    expect(afterWinReload).not.toBeNull();
    expect(resolveRivalryProgress(afterWinReload)).toMatchObject({
      attempts: 2,
      wins: 1,
      losses: 1,
      completed: true,
      lastOutcome: 'win',
    });
    expect(JSON.parse(store.get(PROFILE_STORAGE_KEY)!).story.rivalry.completed).toBe(true);
  });
});
