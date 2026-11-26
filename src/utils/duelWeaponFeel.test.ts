/**
 * ===========================================================================
 * PHASE1-WEAPONFEEL — Per-weapon clip/timing maps. The slice's pins for the
 * pure table: the full §3 table clip for clip and millisecond for
 * millisecond; every named clip exists in the shipped 178-clip set; every
 * clip fits its window (windup + resolution) except the three truncations
 * pinned here as explicit exceptions; unknown/absent weapons fail closed to
 * the sword & shield baseline; and the map is a pure function of the weapon
 * type passed in, so a mid-duel weapon swap changes the entry.
 *
 * The clip inventory and durations are READ from `arena_roman.glb` (the
 * Roman rig every playable body shares — all 7 bodies carry the identical
 * 178 clip names), not restated from the brief: a typo'd clip name or a
 * wrong duration fails here, not in-game. A clip's duration is the max over
 * its sampler inputs' accessor max, in whole milliseconds.
 *
 * Run with: bun test src/utils/duelWeaponFeel.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DUEL_WEAPON_FEEL,
  getWeaponFeel,
  getWeaponHitStopMs,
  getWeaponResolutionMs,
  getWeaponWindupMs,
  type DuelWeaponFeel,
} from './duelWeaponFeel';
import { ATTACK_WINDUP_MS } from './attackWindup';
import type { WeaponType } from '../types/game';

// ── The shipped clip inventory, read from the Roman rig ─────────────────────

const REPO_DIR = fileURLToPath(new URL('../../', import.meta.url));

/** Clip name → duration in whole ms, from the GLB's own animation data. */
function readClipDurations(): Map<string, number> {
  const buf = readFileSync(join(REPO_DIR, 'public/models/arena_roman.glb'));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as {
    animations: Array<{ name: string; samplers: Array<{ input: number }> }>;
    accessors: Array<{ max?: number[] }>;
  };
  const durations = new Map<string, number>();
  for (const anim of json.animations) {
    let seconds = 0;
    for (const sampler of anim.samplers) {
      const max = json.accessors[sampler.input]?.max?.[0];
      if (typeof max === 'number' && max > seconds) seconds = max;
    }
    durations.set(anim.name, Math.round(seconds * 1000));
  }
  return durations;
}

const CLIP_DURATIONS_MS = readClipDurations();

const WEAPONS: WeaponType[] = ['sword_shield', 'spear', 'dual_blades', 'mace'];

// ── §1 — the table, exactly as briefed ──────────────────────────────────────

describe('PHASE1-WEAPONFEEL §1 — the table', () => {
  test('the sword & shield baseline is the shipped pacing, unchanged', () => {
    expect(DUEL_WEAPON_FEEL.sword_shield).toEqual({
      lightClip: 'Sword_Attack',
      heavyClip: 'Sword_Regular_C',
      windupMs: ATTACK_WINDUP_MS,
      quickResolutionMs: 880,
      powerResolutionMs: 1300,
      hitStopQuickMs: 60,
      hitStopPowerMs: 110,
    });
    expect(ATTACK_WINDUP_MS).toBe(650);
  });

  test('the spear thrusts: a jab for its light, a long drive for its heavy', () => {
    expect(DUEL_WEAPON_FEEL.spear).toEqual({
      lightClip: 'Fighting_Right_Jab',
      heavyClip: 'Sword_Attack',
      windupMs: 600,
      quickResolutionMs: 850,
      powerResolutionMs: 1250,
      hitStopQuickMs: 60,
      hitStopPowerMs: 110,
    });
  });

  test('dual blades are the quickest everywhere', () => {
    expect(DUEL_WEAPON_FEEL.dual_blades).toEqual({
      lightClip: 'Sword_Regular_A',
      heavyClip: 'Sword_Regular_B',
      windupMs: 500,
      quickResolutionMs: 750,
      powerResolutionMs: 1100,
      hitStopQuickMs: 50,
      hitStopPowerMs: 90,
    });
  });

  test('the mace is the slowest everywhere, and its power hold sits at the 1450 bound', () => {
    expect(DUEL_WEAPON_FEEL.mace).toEqual({
      lightClip: 'Sword_Regular_C',
      heavyClip: 'Attack_Ground_Pound',
      windupMs: 800,
      quickResolutionMs: 1000,
      powerResolutionMs: 1450,
      hitStopQuickMs: 80,
      hitStopPowerMs: 140,
    });
  });

  test('the table covers exactly the four weapon types', () => {
    expect(Object.keys(DUEL_WEAPON_FEEL).sort()).toEqual([...WEAPONS].sort());
  });

  test('no resolution hold exceeds the pinned 1450 ms bound', () => {
    for (const weapon of WEAPONS) {
      const feel = DUEL_WEAPON_FEEL[weapon];
      expect(feel.quickResolutionMs).toBeLessThanOrEqual(1450);
      expect(feel.powerResolutionMs).toBeLessThanOrEqual(1450);
    }
  });

  test('the feel order reads fast to slow: dual, spear, sword, mace', () => {
    const windups = WEAPONS.map((w) => DUEL_WEAPON_FEEL[w].windupMs);
    expect(windups).toEqual([650, 600, 500, 800]);
    expect(DUEL_WEAPON_FEEL.dual_blades.windupMs).toBeLessThan(
      DUEL_WEAPON_FEEL.spear.windupMs,
    );
    expect(DUEL_WEAPON_FEEL.spear.windupMs).toBeLessThan(
      DUEL_WEAPON_FEEL.sword_shield.windupMs,
    );
    expect(DUEL_WEAPON_FEEL.sword_shield.windupMs).toBeLessThan(
      DUEL_WEAPON_FEEL.mace.windupMs,
    );
  });
});

// ── §2 — the clips exist, and fit their windows ─────────────────────────────

describe('PHASE1-WEAPONFEEL §2 — clips exist and fit their windows', () => {
  test('the Roman rig carries the 178-clip set the table was drawn from', () => {
    expect(CLIP_DURATIONS_MS.size).toBe(178);
  });

  test('every clip the table names exists in the shipped set', () => {
    for (const weapon of WEAPONS) {
      const feel = DUEL_WEAPON_FEEL[weapon];
      expect(CLIP_DURATIONS_MS.has(feel.lightClip)).toBe(true);
      expect(CLIP_DURATIONS_MS.has(feel.heavyClip)).toBe(true);
    }
  });

  test('the measured durations are the ones the table was designed against', () => {
    expect(CLIP_DURATIONS_MS.get('Sword_Attack')).toBe(1917);
    expect(CLIP_DURATIONS_MS.get('Sword_Regular_A')).toBe(458);
    expect(CLIP_DURATIONS_MS.get('Sword_Regular_B')).toBe(542);
    expect(CLIP_DURATIONS_MS.get('Sword_Regular_C')).toBe(1667);
    expect(CLIP_DURATIONS_MS.get('Fighting_Right_Jab')).toBe(917);
    expect(CLIP_DURATIONS_MS.get('Attack_Ground_Pound')).toBe(2708);
  });

  /**
   * The window is windup + resolution: the clip starts at the windup gate
   * and the fighter resets to idle when the resolution timer fires. A clip
   * longer than its window is cut off — so every slot must fit, except the
   * three truncations listed here, each with its exact cut in whole ms.
   *
   * NOTE — the brief §3 says "every other clip plays whole" besides the
   * Ground_Pound tail. That is not true of Sword_Attack: it is truncated in
   * its two slots as well, and the table is pinned here with the truth
   * instead of the brief's sentence. The sword light's truncation is the
   * pre-existing shipped behavior (the sword numbers are unchanged — today's
   * light clip is already cut at ~880 ms of its 1.917 s), and the spear
   * heavy's is 67 ms off the recovery tail, the same class as the
   * Ground_Pound cut. No timing in the table was changed to hide this.
   */
  const KNOWN_TRUNCATIONS: Array<{
    weapon: WeaponType;
    isQuick: boolean;
    clip: string;
    truncationMs: number;
  }> = [
    // The sword baseline is unchanged, so its light clip keeps today's cut.
    { weapon: 'sword_shield', isQuick: true, clip: 'Sword_Attack', truncationMs: 387 },
    // 67 ms off the recovery tail of a long two-handed drive.
    { weapon: 'spear', isQuick: false, clip: 'Sword_Attack', truncationMs: 67 },
    // Brief §3, disclosed: the slam's tail is follow-through; the cut lands
    // on the recovery, not the impact.
    { weapon: 'mace', isQuick: false, clip: 'Attack_Ground_Pound', truncationMs: 458 },
  ];

  test('every clip fits its window, except the three pinned truncations', () => {
    expect(KNOWN_TRUNCATIONS).toHaveLength(3);
    for (const weapon of WEAPONS) {
      const feel: DuelWeaponFeel = DUEL_WEAPON_FEEL[weapon];
      for (const isQuick of [true, false] as const) {
        const clip = isQuick ? feel.lightClip : feel.heavyClip;
        const windowMs =
          feel.windupMs + (isQuick ? feel.quickResolutionMs : feel.powerResolutionMs);
        const clipMs = CLIP_DURATIONS_MS.get(clip);
        expect(clipMs).toBeDefined();
        const truncation = KNOWN_TRUNCATIONS.find(
          (t) => t.weapon === weapon && t.isQuick === isQuick,
        );
        if (truncation) {
          expect(truncation.clip).toBe(clip);
          expect(clipMs! - windowMs).toBe(truncation.truncationMs);
        } else {
          expect(clipMs!).toBeLessThanOrEqual(windowMs);
        }
      }
    }
  });
});

// ── §3 — fail-closed, and the live-weapon read ──────────────────────────────

describe('PHASE1-WEAPONFEEL §3 — fail-closed and live-weapon read', () => {
  test('an unknown or absent weapon falls back to the sword & shield baseline', () => {
    const baseline = DUEL_WEAPON_FEEL.sword_shield;
    expect(getWeaponFeel(undefined)).toBe(baseline);
    expect(getWeaponFeel(null)).toBe(baseline);
    expect(getWeaponFeel('')).toBe(baseline);
    expect(getWeaponFeel('not_a_weapon')).toBe(baseline);
    // Inherited Object names are not entries: `in` would match them, so the
    // guard must be hasOwnProperty — a 'toString' weapon must not resolve
    // to Object.prototype.toString.
    expect(getWeaponFeel('toString')).toBe(baseline);
    expect(getWeaponFeel('constructor')).toBe(baseline);
  });

  test('the map is a pure function of the weapon passed in — a swap changes the entry', () => {
    // An Ignis-style mid-duel swap: dual blades, then a mace, then back.
    // Nothing sticks: each read follows the type it is given, so the call
    // sites only have to read loadout.weapon.type at action time.
    expect(getWeaponFeel('dual_blades')).toBe(DUEL_WEAPON_FEEL.dual_blades);
    expect(getWeaponFeel('mace')).toBe(DUEL_WEAPON_FEEL.mace);
    expect(getWeaponFeel('dual_blades')).toBe(DUEL_WEAPON_FEEL.dual_blades);
    expect(getWeaponWindupMs('dual_blades')).toBe(500);
    expect(getWeaponWindupMs('mace')).toBe(800);
    expect(getWeaponResolutionMs('spear', true)).toBe(850);
    expect(getWeaponResolutionMs('spear', false)).toBe(1250);
    expect(getWeaponHitStopMs('mace', true)).toBe(80);
    expect(getWeaponHitStopMs('mace', false)).toBe(140);
  });

  test('the accessors agree with the table for every weapon', () => {
    for (const weapon of WEAPONS) {
      const feel = DUEL_WEAPON_FEEL[weapon];
      expect(getWeaponWindupMs(weapon)).toBe(feel.windupMs);
      expect(getWeaponResolutionMs(weapon, true)).toBe(feel.quickResolutionMs);
      expect(getWeaponResolutionMs(weapon, false)).toBe(feel.powerResolutionMs);
      expect(getWeaponHitStopMs(weapon, true)).toBe(feel.hitStopQuickMs);
      expect(getWeaponHitStopMs(weapon, false)).toBe(feel.hitStopPowerMs);
    }
  });
});
