/**
 * CH-2 — the legacy re-pledge.
 *
 * Run with: `bun test src/utils/armaturaPledge.test.ts`
 *
 * ── WHAT THIS PINS ────────────────────────────────────────────────────────
 * A save written before the classes existed has no `armatura` field, so its class
 * is only INFERRED from the character model.  The re-pledge is the one write this
 * slice makes to an existing profile, and the brief's constraints are absolute:
 *
 *   • it sets the `armatura` field and NOTHING else — every stat, item, gold piece
 *     and palma stays byte-identical;
 *   • it can happen once: a profile that already names a class cannot pledge again,
 *     which is what the screen reads to hide the action;
 *   • a dimachaerus-model save resolves to Dimachaerus and a roman_warrior save to
 *     Murmillo, exactly as `resolveArmatura` already answered.
 *
 * No storage is touched: the helper is pure and this suite never saves a profile.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import type { PlayerProfile } from '../types/game';
import { ARMATURAE } from '../data/armaturae';
import { createNewProfile } from '../services/storage';
import { resolveArmatura } from './traitModifiers';
import { canRepledgeArmatura, withArmaturaPledge } from './armaturaPledge';

/** A legacy save: the factory's shape with a look and no class field. */
function legacy(model: PlayerProfile['appearance']['characterModel']): PlayerProfile {
  const profile = createNewProfile('Legacy Gladiator');
  return { ...profile, appearance: { ...profile.appearance, characterModel: model } };
}

describe('CH-2 §A — what a legacy save resolves to', () => {
  test('a dimachaerus model resolves to Dimachaerus', () => {
    const profile = legacy('dimachaerus');
    expect('armatura' in profile).toBe(false);
    expect(resolveArmatura(profile)).toBe('dimachaerus');
    expect(canRepledgeArmatura(profile)).toBe(true);
  });

  test('a roman_warrior model resolves to Murmillo', () => {
    const profile = legacy('roman_warrior');
    expect(resolveArmatura(profile)).toBe('murmillo');
    expect(canRepledgeArmatura(profile)).toBe(true);
  });

  test('no profile at all can never re-pledge', () => {
    expect(canRepledgeArmatura(null)).toBe(false);
    expect(canRepledgeArmatura(undefined)).toBe(false);
    expect(withArmaturaPledge(null, 'murmillo')).toEqual({
      ok: false,
      profile: null,
      reason: 'no-profile',
    });
  });
});

describe('CH-2 §B — the pledge writes the class and nothing else', () => {
  test('any class can be chosen, and the profile keeps every number and item', () => {
    for (const row of ARMATURAE) {
      const before = legacy('dimachaerus');
      const result = withArmaturaPledge(before, row.id);
      expect(result.ok, row.id).toBe(true);
      if (!result.ok) continue;

      expect(result.profile.armatura).toBe(row.id);
      expect(result.profile.baseStats).toEqual(before.baseStats);
      expect(result.profile.equipped).toEqual(before.equipped);
      expect(result.profile.inventory).toEqual(before.inventory);
      expect(result.profile.gold).toBe(before.gold);
      expect(result.profile.fame).toBe(before.fame);
      expect(result.profile.level).toBe(before.level);
      expect(result.profile.unspentStatPoints).toBe(before.unspentStatPoints);
      expect(result.profile.appearance).toEqual(before.appearance);
      expect('palmae' in result.profile).toBe(false);

      // Byte-identical apart from the one field: strip it and compare the JSON.
      const after = JSON.parse(JSON.stringify(result.profile)) as Record<string, unknown>;
      delete after.armatura;
      expect(after).toEqual(JSON.parse(JSON.stringify(before)) as Record<string, unknown>);

      // …and the field is the only KEY added (nothing was dropped or reordered).
      expect(Object.keys(result.profile)).toEqual([...Object.keys(before), 'armatura']);

      // The nested objects are shared, not rebuilt: a pledge cannot rewrite them.
      expect(result.profile.baseStats).toBe(before.baseStats);
      expect(result.profile.equipped).toBe(before.equipped);
      expect(result.profile.inventory).toBe(before.inventory);
    }
  });

  test('a wounded, geared, palma-bearing legacy save keeps all of it', () => {
    const before = legacy('roman_warrior');
    const rich: PlayerProfile = {
      ...before,
      gold: 940,
      fame: 310,
      baseStats: { strength: 19, agility: 14, stamina: 12, defense: 9 },
      injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 },
      palmae: { unlocked: ['iron_lungs'], equipped: ['iron_lungs'] },
    };

    const result = withArmaturaPledge(rich, 'provocator');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.armatura).toBe('provocator');
    expect(result.profile.baseStats).toEqual({ strength: 19, agility: 14, stamina: 12, defense: 9 });
    expect(result.profile.injury).toEqual({ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 });
    expect(result.profile.palmae).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
    expect(result.profile.gold).toBe(940);
  });

  test('the input profile is never mutated', () => {
    const before = legacy('dimachaerus');
    const snapshot = JSON.stringify(before);
    withArmaturaPledge(before, 'hoplomachus');
    expect(JSON.stringify(before)).toBe(snapshot);
    expect('armatura' in before).toBe(false);
  });
});

describe('CH-2 §C — the pledge happens once', () => {
  test('an explicitly set class hides the action and refuses a second pledge', () => {
    const before = legacy('dimachaerus');
    const first = withArmaturaPledge(before, 'thraex');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(canRepledgeArmatura(first.profile)).toBe(false);
    const second = withArmaturaPledge(first.profile, 'secutor');
    expect(second).toEqual({ ok: false, profile: null, reason: 'already-pledged' });
  });

  test('every class id is refused once the field is set, not just the chosen one', () => {
    const pledged = { ...legacy('roman_warrior'), armatura: 'murmillo' as const };
    for (const row of ARMATURAE) {
      expect(withArmaturaPledge(pledged, row.id).ok, row.id).toBe(false);
    }
    expect(canRepledgeArmatura(pledged)).toBe(false);
  });

  test('an unknown class id is refused and writes nothing', () => {
    const before = legacy('roman_warrior');
    const result = withArmaturaPledge(before, 'gladiator' as never);
    expect(result).toEqual({ ok: false, profile: null, reason: 'unknown-armatura' });
    expect('armatura' in before).toBe(false);
  });
});
