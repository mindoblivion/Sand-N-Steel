/**
 * ===========================================================================
 * PHASE1-WEAPONFEEL — Per-weapon clip/timing maps. Each weapon fights like
 * itself: its own clips, its own windup, its own resolution hold, its own
 * hit-stop — read from one pure table, keyed by WeaponType.
 *
 * The numbers are already per-weapon (ranges, stamina, damage, block live in
 * the frozen calculation module and in itemsDB); the animation and the timing
 * were not. One shared clip-candidate map served all four weapons, one flat
 * 650 ms windup, per-action resolution and hit-stop. A spearman held a spear
 * and swung it like a sword. This table is the fix.
 *
 * The clips are a RE-CAST, not a selection: no spear thrust, mace swing or
 * dagger flurry clip exists in any body (all 7 playable bodies carry the
 * identical 178 clip names, and the only weapon-flavored names are
 * Sword/Shield), so existing generic clips are assigned by feel — a jab reads
 * as a thrust, a ground-pound reads as a mace overhead — with sword & shield
 * keeping the shipped clips as the baseline.
 *
 * The timings are type-level constants, NOT derived from the orphan `speed`
 * field on WeaponItem: its seconds-per-swing semantics is unverified and the
 * value varies within a type (spear spans 0.34–0.44, sword 0.32–0.42), so
 * deriving fight pacing from it would make two spears fight at different
 * tempos — a balance change hiding inside a feel slice. `speed` stays
 * orphaned until a slice pins its semantics.
 *
 * Window first, no playback rate: every clip in the table fits its window
 * (windup + resolution) at rate 1.0, except the three truncations the test
 * pins as explicit exceptions — the sword light and spear heavy slots
 * truncate Sword_Attack's recovery tail (the sword light's truncation is the
 * pre-existing shipped behavior: the sword numbers are unchanged), and the
 * mace power slot truncates Attack_Ground_Pound's follow-through by design
 * (the cut lands on the recovery, not the impact).
 *
 * Pacing only, like the table this extends: windup, resolution and hit-stop
 * decide how long a strike reads on the sand, never what it does. No damage,
 * range, stamina or hit-chance value lives here or is changed by it.
 * ===========================================================================
 */
import type { WeaponType } from '../types/game';
import { ATTACK_WINDUP_MS } from './attackWindup';

/** One weapon's feel: the clips it plays and the tempo it plays them at. */
export interface DuelWeaponFeel {
  /** Clip for `attack_light` (a quick attack). */
  lightClip: string;
  /** Clip for `attack_heavy` (a power attack). */
  heavyClip: string;
  /** Delay between the visible strike animation and its combat resolution. */
  windupMs: number;
  /** Resolution hold after a quick attack resolves. */
  quickResolutionMs: number;
  /** Resolution hold after a power attack resolves. */
  powerResolutionMs: number;
  /** Hit-stop freeze after a quick attack lands. */
  hitStopQuickMs: number;
  /** Hit-stop freeze after a power attack lands. */
  hitStopPowerMs: number;
}

/**
 * PHASE1-WEAPONFEEL — the per-weapon table (brief §3). Sword & shield is the
 * shipped baseline, unchanged in every number. Spear is a touch quicker on
 * the windup with a thrust for its light — its reach already does the work at
 * range, so the timing stays near-baseline. Dual blades are the quickest
 * everywhere: the shortest windup, the shortest holds, the lightest hit-stop.
 * The mace is the slowest everywhere, and its power hold sits exactly at the
 * pinned 1450 ms bound — at it, not past it, so the fight-length guarantee
 * behind the bound does not move.
 */
export const DUEL_WEAPON_FEEL: Record<WeaponType, DuelWeaponFeel> = {
  sword_shield: {
    lightClip: 'Sword_Attack',
    heavyClip: 'Sword_Regular_C',
    windupMs: ATTACK_WINDUP_MS,
    quickResolutionMs: 880,
    powerResolutionMs: 1300,
    hitStopQuickMs: 60,
    hitStopPowerMs: 110,
  },
  spear: {
    lightClip: 'Fighting_Right_Jab',
    heavyClip: 'Sword_Attack',
    windupMs: 600,
    quickResolutionMs: 850,
    powerResolutionMs: 1250,
    hitStopQuickMs: 60,
    hitStopPowerMs: 110,
  },
  dual_blades: {
    lightClip: 'Sword_Regular_A',
    heavyClip: 'Sword_Regular_B',
    windupMs: 500,
    quickResolutionMs: 750,
    powerResolutionMs: 1100,
    hitStopQuickMs: 50,
    hitStopPowerMs: 90,
  },
  mace: {
    lightClip: 'Sword_Regular_C',
    heavyClip: 'Attack_Ground_Pound',
    windupMs: 800,
    quickResolutionMs: 1000,
    powerResolutionMs: 1450,
    hitStopQuickMs: 80,
    hitStopPowerMs: 140,
  },
};

/**
 * Resolve a weapon type to its feel entry, failing closed to the sword &
 * shield baseline for an unknown or absent weapon — the same convention as
 * `getWeaponByType`'s fallback. A `hasOwnProperty` check, not `in`: the
 * `in` operator would also match inherited names (`toString`,
 * `constructor`), which are not entries.
 */
export function getWeaponFeel(
  weaponType: WeaponType | string | undefined | null,
): DuelWeaponFeel {
  if (
    typeof weaponType === 'string' &&
    Object.prototype.hasOwnProperty.call(DUEL_WEAPON_FEEL, weaponType)
  ) {
    return DUEL_WEAPON_FEEL[weaponType as WeaponType];
  }
  return DUEL_WEAPON_FEEL.sword_shield;
}

/** The windup for one weapon — the delay before its strike resolves. */
export function getWeaponWindupMs(
  weaponType: WeaponType | string | undefined | null,
): number {
  return getWeaponFeel(weaponType).windupMs;
}

/** The resolution hold for one weapon's quick (true) or power (false) attack. */
export function getWeaponResolutionMs(
  weaponType: WeaponType | string | undefined | null,
  isQuick: boolean,
): number {
  const feel = getWeaponFeel(weaponType);
  return isQuick ? feel.quickResolutionMs : feel.powerResolutionMs;
}

/** The hit-stop freeze for one weapon's quick (true) or power (false) attack. */
export function getWeaponHitStopMs(
  weaponType: WeaponType | string | undefined | null,
  isQuick: boolean,
): number {
  const feel = getWeaponFeel(weaponType);
  return isQuick ? feel.hitStopQuickMs : feel.hitStopPowerMs;
}
