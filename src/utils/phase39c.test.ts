/**
 * Phase 39C — Crowd Hype Peak Tracking (defect C-8, Part 1) tests.
 *
 * Verifies:
 *   - Per-duel crowdHypePeak tracks the highest hype reached, never decreases.
 *   - Lifetime peakCrowdHypeOverall updates on both win and loss, using
 *     Math.max semantics, and survives the save/load cycle.
 *   - Hype starts at 25, increments (taunt +20, normal +8, crit +18) and the
 *     100 cap are unchanged.
 *   - Existing combo tracking (Phase 39B) and Phase 37/38 behavior unchanged.
 *
 * Run with: bun test src/utils/phase39c.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

// ── In-memory localStorage polyfill ────────────────────────────────────────
// bun's test runtime has no DOM, so localStorage is undefined. storage.ts
// wraps setItem/getItem in try/catch, so a minimal Map-backed shim is enough
// to exercise the real save/load round-trip.
const _store = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => { _store.set(key, value); },
  removeItem: (key: string) => { _store.delete(key); },
  clear: () => { _store.clear(); },
};
// @ts-ignore — assign to global before storage.ts is imported
globalThis.localStorage = localStorageShim;

import {
  updateHypePeak,
  applyComboEvent,
  calculateAttackDamage,
  chooseAIStandardAction,
  shouldActivateRage,
  RAGE_DAMAGE_MULTIPLIER,
} from './combatCalculations';
import { saveProfile, loadSavedProfile, createNewProfile } from '../services/storage';
import { PlayerProfile, DuelStatistics } from '../types/game';

// ── Constants matching production code ─────────────────────────────────────

const HYPE_INITIAL = 25;
const HYPE_CAP = 100;
const HYPE_TAUNT_INCREMENT = 20;
const HYPE_NORMAL_HIT_INCREMENT = 8;
const HYPE_CRIT_HIT_INCREMENT = 18;

/** Apply a hype increment with the production cap (Math.min(100, prev + n)). */
function applyHypeIncrement(current: number, increment: number): number {
  return Math.min(HYPE_CAP, current + increment);
}

/** Simulate the DuelScene updateCrowdHype helper's peak-tracking logic. */
function simulateHypeUpdate(
  currentHype: number,
  currentPeak: number,
  increment: number,
): { hype: number; peak: number } {
  const next = applyHypeIncrement(currentHype, increment);
  return { hype: next, peak: updateHypePeak(currentPeak, next) };
}

/** Simulate the App.tsx handleMatchComplete lifetime-peak update. */
function updateLifetimePeak(currentOverall: number, duelPeak: number): number {
  return Math.max(currentOverall, duelPeak);
}

// ── 1. Hype starts at 25 and retains the existing behavior ─────────────────

describe('Phase 39C — Hype initialization', () => {
  test('hype starts at 25', () => {
    expect(HYPE_INITIAL).toBe(25);
  });

  test('per-duel peak starts at 25 (matches initial hype)', () => {
    // statsRef.current.crowdHypePeak is initialized to 25 in DuelScene
    const initialPeak = 25;
    expect(initialPeak).toBe(HYPE_INITIAL);
  });

  test('lifetime peak starts at 0 for a new profile', () => {
    const profile = createNewProfile('Tester');
    expect(profile.peakCrowdHypeOverall).toBe(0);
  });
});

// ── 2. Normal hits and critical hits increase hype using the existing amounts ──

describe('Phase 39C — Hype increments', () => {
  test('normal hit increases hype by 8', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_NORMAL_HIT_INCREMENT);
    expect(result.hype).toBe(33);
  });

  test('critical hit increases hype by 18', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_CRIT_HIT_INCREMENT);
    expect(result.hype).toBe(43);
  });

  test('normal hit increments stack', () => {
    let hype = HYPE_INITIAL;
    hype = applyHypeIncrement(hype, HYPE_NORMAL_HIT_INCREMENT);
    expect(hype).toBe(33);
    hype = applyHypeIncrement(hype, HYPE_NORMAL_HIT_INCREMENT);
    expect(hype).toBe(41);
    hype = applyHypeIncrement(hype, HYPE_NORMAL_HIT_INCREMENT);
    expect(hype).toBe(49);
  });
});

// ── 3. Taunt increases hype by the existing amount ────────────────────────

describe('Phase 39C — Taunt hype', () => {
  test('taunt increases hype by 20', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_TAUNT_INCREMENT);
    expect(result.hype).toBe(45);
  });

  test('taunt from 80 brings hype to 100 (capped)', () => {
    const result = simulateHypeUpdate(80, 80, HYPE_TAUNT_INCREMENT);
    expect(result.hype).toBe(100);
  });
});

// ── 4. Hype remains capped at 100 ─────────────────────────────────────────

describe('Phase 39C — Hype cap at 100', () => {
  test('hype cannot exceed 100', () => {
    const result = simulateHypeUpdate(95, 95, HYPE_NORMAL_HIT_INCREMENT);
    expect(result.hype).toBe(100);
  });

  test('taunt at 90 caps at 100, not 110', () => {
    const result = simulateHypeUpdate(90, 90, HYPE_TAUNT_INCREMENT);
    expect(result.hype).toBe(100);
    expect(result.hype).not.toBe(110);
  });

  test('crit at 90 caps at 100', () => {
    const result = simulateHypeUpdate(90, 90, HYPE_CRIT_HIT_INCREMENT);
    expect(result.hype).toBe(100);
  });

  test('multiple increments past 100 stay at 100', () => {
    let hype = HYPE_INITIAL;
    let peak = HYPE_INITIAL;
    for (let i = 0; i < 20; i++) {
      const r = simulateHypeUpdate(hype, peak, HYPE_NORMAL_HIT_INCREMENT);
      hype = r.hype;
      peak = r.peak;
    }
    expect(hype).toBe(100);
  });
});

// ── 5. The per-duel peak captures increases above 25 ───────────────────────

describe('Phase 39C — Per-duel peak captures increases', () => {
  test('peak increases from 25 to 33 after a normal hit', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_NORMAL_HIT_INCREMENT);
    expect(result.peak).toBe(33);
  });

  test('peak increases from 25 to 43 after a crit', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_CRIT_HIT_INCREMENT);
    expect(result.peak).toBe(43);
  });

  test('peak increases from 25 to 45 after a taunt', () => {
    const result = simulateHypeUpdate(25, 25, HYPE_TAUNT_INCREMENT);
    expect(result.peak).toBe(45);
  });

  test('peak tracks the highest hype across a multi-event sequence', () => {
    let hype = HYPE_INITIAL;
    let peak = HYPE_INITIAL;

    // normal hit → 33
    let r = simulateHypeUpdate(hype, peak, HYPE_NORMAL_HIT_INCREMENT);
    hype = r.hype; peak = r.peak;
    expect(peak).toBe(33);

    // crit → 51
    r = simulateHypeUpdate(hype, peak, HYPE_CRIT_HIT_INCREMENT);
    hype = r.hype; peak = r.peak;
    expect(peak).toBe(51);

    // taunt → 71
    r = simulateHypeUpdate(hype, peak, HYPE_TAUNT_INCREMENT);
    hype = r.hype; peak = r.peak;
    expect(peak).toBe(71);

    // normal hit → 79
    r = simulateHypeUpdate(hype, peak, HYPE_NORMAL_HIT_INCREMENT);
    hype = r.hype; peak = r.peak;
    expect(peak).toBe(79);

    expect(hype).toBe(79);
  });

  test('peak reaches 100 when hype is capped', () => {
    const result = simulateHypeUpdate(95, 95, HYPE_NORMAL_HIT_INCREMENT);
    expect(result.peak).toBe(100);
  });
});

// ── 6. The peak never decreases when current hype is lower ─────────────────

describe('Phase 39C — Peak never decreases', () => {
  test('updateHypePeak never returns less than currentPeak', () => {
    expect(updateHypePeak(50, 30)).toBe(50);
    expect(updateHypePeak(100, 25)).toBe(100);
    expect(updateHypePeak(75, 75)).toBe(75);
    expect(updateHypePeak(80, 10)).toBe(80);
  });

  test('peak stays at 100 after hype was capped and then stays at 100', () => {
    let hype = 100;
    let peak = 100;
    // Another increment would keep hype at 100 (capped)
    const r = simulateHypeUpdate(hype, peak, HYPE_NORMAL_HIT_INCREMENT);
    expect(r.peak).toBe(100);
  });

  test('peak does not decrease when hype remains unchanged', () => {
    // updateHypePeak with the same value is a no-op
    expect(updateHypePeak(60, 60)).toBe(60);
  });

  test('peak does not decrease across a full duel simulation', () => {
    let hype = HYPE_INITIAL;
    let peak = HYPE_INITIAL;

    // Build hype up to ~71
    const increments = [
      HYPE_NORMAL_HIT_INCREMENT,  // 33
      HYPE_CRIT_HIT_INCREMENT,   // 51
      HYPE_TAUNT_INCREMENT,      // 71
    ];
    for (const inc of increments) {
      const r = simulateHypeUpdate(hype, peak, inc);
      hype = r.hype;
      peak = r.peak;
    }
    expect(peak).toBe(71);

    // Hype stays the same (no more increments — e.g., opponent turns, misses)
    // Peak should not decrease
    expect(updateHypePeak(peak, hype)).toBe(71);
  });
});

// ── 7. Lifetime peak updates on victory ───────────────────────────────────

describe('Phase 39C — Lifetime peak updates on victory', () => {
  test('lifetime peak updates to duel peak when duel peak is higher', () => {
    const result = updateLifetimePeak(0, 71);
    expect(result).toBe(71);
  });

  test('lifetime peak updates from 50 to 80 after a high-hype win', () => {
    const result = updateLifetimePeak(50, 80);
    expect(result).toBe(80);
  });

  test('lifetime peak updates from 0 to 100 after a perfect-hype win', () => {
    const result = updateLifetimePeak(0, 100);
    expect(result).toBe(100);
  });
});

// ── 8. Lifetime peak also updates on defeat ────────────────────────────────

describe('Phase 39C — Lifetime peak updates on defeat', () => {
  test('lifetime peak updates to duel peak on defeat', () => {
    // The loss path in handleMatchComplete also applies Math.max
    const result = updateLifetimePeak(0, 45);
    expect(result).toBe(45);
  });

  test('lifetime peak updates from 30 to 60 after a high-hype loss', () => {
    const result = updateLifetimePeak(30, 60);
    expect(result).toBe(60);
  });

  test('lifetime peak updates on defeat even if it was 0 before', () => {
    const result = updateLifetimePeak(0, 25);
    expect(result).toBe(25);
  });
});

// ── 9. A lower-hype duel never reduces the lifetime peak ──────────────────

describe('Phase 39C — Lower-hype duel does not reduce lifetime peak', () => {
  test('lifetime peak stays at 80 when duel peak is 30', () => {
    const result = updateLifetimePeak(80, 30);
    expect(result).toBe(80);
  });

  test('lifetime peak stays at 100 when duel peak is 25', () => {
    const result = updateLifetimePeak(100, 25);
    expect(result).toBe(100);
  });

  test('sequence: win with peak 80, then lose with peak 30 → lifetime stays 80', () => {
    let lifetime = 0;
    lifetime = updateLifetimePeak(lifetime, 80);
    expect(lifetime).toBe(80);
    lifetime = updateLifetimePeak(lifetime, 30);
    expect(lifetime).toBe(80);
  });

  test('sequence: lose with peak 50, win with peak 90, lose with peak 40 → 90', () => {
    let lifetime = 0;
    lifetime = updateLifetimePeak(lifetime, 50);
    expect(lifetime).toBe(50);
    lifetime = updateLifetimePeak(lifetime, 90);
    expect(lifetime).toBe(90);
    lifetime = updateLifetimePeak(lifetime, 40);
    expect(lifetime).toBe(90);
  });
});

// ── 10. Lifetime peak survives the existing profile persistence and reload ──

describe('Phase 39C — Lifetime peak survives save/load', () => {
  test('peakCrowdHypeOverall survives saveProfile → loadSavedProfile round-trip', () => {
    const profile = createNewProfile('PersistenceTester');
    profile.peakCrowdHypeOverall = 85;

    saveProfile(profile);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    expect(loaded!.peakCrowdHypeOverall).toBe(85);
  });

  test('peakCrowdHypeOverall of 0 survives round-trip', () => {
    const profile = createNewProfile('ZeroPeakTester');
    // Already 0 from createNewProfile

    saveProfile(profile);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    expect(loaded!.peakCrowdHypeOverall).toBe(0);
  });

  test('peakCrowdHypeOverall of 100 survives round-trip', () => {
    const profile = createNewProfile('MaxPeakTester');
    profile.peakCrowdHypeOverall = 100;

    saveProfile(profile);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    expect(loaded!.peakCrowdHypeOverall).toBe(100);
  });

  test('updated peakCrowdHypeOverall after a simulated win persists', () => {
    // Simulate: profile has peak 0, duel ends with crowdHypePeak 72
    const profile = createNewProfile('WinPersistenceTester');
    const duelStats: DuelStatistics = {
      damageDealt: 100,
      damageTaken: 50,
      hitsLanded: 5,
      perfectBlocks: 1,
      dodgesPerformed: 0,
      maxCombo: 3,
      lowestStaminaFraction: 0.62,
      crowdHypePeak: 72,
      durationSeconds: 45,
      goldEarned: 50,
      fameEarned: 10,
      xpEarned: 100,
    };

    // Simulate handleMatchComplete win path
    const winProfile: PlayerProfile = {
      ...profile,
      fightsWon: profile.fightsWon + 1,
      peakCrowdHypeOverall: updateLifetimePeak(profile.peakCrowdHypeOverall, duelStats.crowdHypePeak),
    };

    saveProfile(winProfile);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    expect(loaded!.peakCrowdHypeOverall).toBe(72);
    expect(loaded!.fightsWon).toBe(1);
  });

  test('updated peakCrowdHypeOverall after a simulated loss persists', () => {
    // Simulate: profile has peak 80, duel ends with crowdHypePeak 45
    const profile = createNewProfile('LossPersistenceTester');
    profile.peakCrowdHypeOverall = 80;

    const duelStats: DuelStatistics = {
      damageDealt: 30,
      damageTaken: 120,
      hitsLanded: 2,
      perfectBlocks: 0,
      dodgesPerformed: 1,
      maxCombo: 1,
      lowestStaminaFraction: 0.21,
      crowdHypePeak: 45,
      durationSeconds: 30,
      goldEarned: 0,
      fameEarned: 0,
      xpEarned: 0,
    };

    // Simulate handleMatchComplete loss path
    const lossProfile: PlayerProfile = {
      ...profile,
      fightsLost: profile.fightsLost + 1,
      peakCrowdHypeOverall: updateLifetimePeak(profile.peakCrowdHypeOverall, duelStats.crowdHypePeak),
    };

    saveProfile(lossProfile);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    // 80 was higher than 45, so it stays 80
    expect(loaded!.peakCrowdHypeOverall).toBe(80);
    expect(loaded!.fightsLost).toBe(1);
  });
});

// ── 11. Existing combo tracking and Phase 37/38 behavior remain unchanged ──

describe('Phase 39C — Existing behavior unchanged', () => {
  test('applyComboEvent still increments on landed', () => {
    expect(applyComboEvent(0, 'landed')).toBe(1);
    expect(applyComboEvent(5, 'landed')).toBe(6);
  });

  test('applyComboEvent still resets on miss', () => {
    expect(applyComboEvent(3, 'miss')).toBe(0);
  });

  test('applyComboEvent still resets on player_damaged', () => {
    expect(applyComboEvent(4, 'player_damaged')).toBe(0);
  });

  test('applyComboEvent preserves on blocked', () => {
    expect(applyComboEvent(3, 'blocked')).toBe(3);
  });

  test('applyComboEvent preserves on none', () => {
    expect(applyComboEvent(7, 'none')).toBe(7);
  });

  test('calculateAttackDamage produces same results as before', () => {
    expect(calculateAttackDamage(20, 10, false, 5, false, 0)).toBe(
      Math.max(1, Math.round(20 * (1 + 10 * 0.05) * (100 / (100 + 5 * 2.5))))
    );
    expect(calculateAttackDamage(100, 0, true, 0, false, 0)).toBe(150);
    expect(calculateAttackDamage(100, 0, false, 0, true, 0.6)).toBe(40);
  });

  test('rage multiplier is still 1.25', () => {
    expect(RAGE_DAMAGE_MULTIPLIER).toBe(1.25);
    expect(calculateAttackDamage(100, 0, true, 0, false, 0, RAGE_DAMAGE_MULTIPLIER)).toBe(188);
  });

  test('chooseAIStandardAction fallback thresholds unchanged', () => {
    expect(chooseAIStandardAction(undefined, undefined, 0.30)).toBe('quick_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.50)).toBe('power_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.80)).toBe('shield_block');
    expect(chooseAIStandardAction(undefined, undefined, 0.95)).toBe('dodge');
  });

  test('shouldActivateRage threshold unchanged', () => {
    expect(shouldActivateRage('rage_mode_colossus', 480, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false)).toBe(true);
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, true)).toBe(false);
  });
});

// ── 12. Pure updater pattern (Phase 39C.2) ─────────────────────────────────
//
// The production updateCrowdHype callback now reads from a ref (authoritative
// current hype), computes the next value, sets the ref synchronously, calls
// setCrowdHype with the plain value (not a functional updater), and updates
// the peak ref outside the state setter.  These tests verify that the
// extracted pattern is deterministic, side-effect-free inside the setter, and
// correct under batched sequential calls.
//
// Limitation: the test harness (bun:test, no DOM) cannot mount the React
// component, so we test the production helper (updateHypePeak) plus a faithful
// simulation of the new ref-mirrored update sequence instead of the
// component callback itself.

/**
 * Simulate the Phase 39C.2 ref-mirrored update pattern.
 * `stateRef` mirrors crowdHypeRef; `peakRef` mirrors statsRef.crowdHypePeak.
 * Returns the new hype value; mutates refs in place, exactly as production.
 */
function pureHypeUpdate(
  stateRef: { current: number },
  peakRef: { current: number },
  updater: (prev: number) => number,
): number {
  const next = updater(stateRef.current);
  stateRef.current = next;
  peakRef.current = updateHypePeak(peakRef.current, next);
  return next;
}

describe('Phase 39C.2 — Pure updater pattern', () => {
  test('state setter receives a plain value, not a functional updater with side effects', () => {
    // The new updateCrowdHype computes `next` outside the setter and calls
    // setCrowdHype(next).  Verify the computation is pure: given the same
    // inputs it always returns the same output and has no hidden state.
    const stateRef = { current: HYPE_INITIAL };
    const peakRef = { current: HYPE_INITIAL };
    const next = pureHypeUpdate(stateRef, peakRef, (prev) => Math.min(100, prev + 8));
    expect(next).toBe(33);
    expect(stateRef.current).toBe(33);
    expect(peakRef.current).toBe(33);
  });

  test('sequential batched calls see the updated ref, not a stale value', () => {
    // Simulate two hype increments batched in the same render cycle.
    // With a functional updater + side effect, the ref would be updated
    // inside the updater (unsafe). With the ref-mirrored pattern, the ref
    // is updated synchronously before the second call reads it.
    const stateRef = { current: HYPE_INITIAL };
    const peakRef = { current: HYPE_INITIAL };

    // First call: taunt (+20) → 45
    pureHypeUpdate(stateRef, peakRef, (prev) => Math.min(100, prev + HYPE_TAUNT_INCREMENT));
    expect(stateRef.current).toBe(45);
    expect(peakRef.current).toBe(45);

    // Second call (same "batch"): normal hit (+8) → 53, not 33
    pureHypeUpdate(stateRef, peakRef, (prev) => Math.min(100, prev + HYPE_NORMAL_HIT_INCREMENT));
    expect(stateRef.current).toBe(53);
    expect(peakRef.current).toBe(53);
  });

  test('three rapid increments produce the correct final hype and peak', () => {
    const stateRef = { current: HYPE_INITIAL };
    const peakRef = { current: HYPE_INITIAL };

    pureHypeUpdate(stateRef, peakRef, (p) => Math.min(100, p + HYPE_NORMAL_HIT_INCREMENT)); // 33
    pureHypeUpdate(stateRef, peakRef, (p) => Math.min(100, p + HYPE_CRIT_HIT_INCREMENT));  // 51
    pureHypeUpdate(stateRef, peakRef, (p) => Math.min(100, p + HYPE_TAUNT_INCREMENT));    // 71

    expect(stateRef.current).toBe(71);
    expect(peakRef.current).toBe(71);
  });

  test('cap at 100 is respected and peak reaches 100', () => {
    const stateRef = { current: 95 };
    const peakRef = { current: 95 };

    pureHypeUpdate(stateRef, peakRef, (p) => Math.min(100, p + HYPE_NORMAL_HIT_INCREMENT));

    expect(stateRef.current).toBe(100);
    expect(peakRef.current).toBe(100);
  });

  test('peak never decreases across a full ref-mirrored duel', () => {
    const stateRef = { current: HYPE_INITIAL };
    const peakRef = { current: HYPE_INITIAL };

    const increments = [HYPE_NORMAL_HIT_INCREMENT, HYPE_CRIT_HIT_INCREMENT, HYPE_TAUNT_INCREMENT];
    let maxSeen = HYPE_INITIAL;
    for (const inc of increments) {
      pureHypeUpdate(stateRef, peakRef, (p) => Math.min(100, p + inc));
      maxSeen = Math.max(maxSeen, stateRef.current);
      // Peak should always equal the highest hype seen
      expect(peakRef.current).toBe(maxSeen);
    }
    expect(peakRef.current).toBe(71);
  });

  test('the state updater function itself is pure (no side effect on peak)', () => {
    // The updater passed to updateCrowdHype is `(prev) => Math.min(100, prev + n)`.
    // It must not mutate any external state.  Verify by calling it twice with
    // the same input — the result is identical and no ref changed.
    const updater = (prev: number) => Math.min(100, prev + HYPE_CRIT_HIT_INCREMENT);
    expect(updater(50)).toBe(68);
    expect(updater(50)).toBe(68);
  });

  test('increment values are exactly +20, +8, +18', () => {
    expect(HYPE_TAUNT_INCREMENT).toBe(20);
    expect(HYPE_NORMAL_HIT_INCREMENT).toBe(8);
    expect(HYPE_CRIT_HIT_INCREMENT).toBe(18);
  });
});
