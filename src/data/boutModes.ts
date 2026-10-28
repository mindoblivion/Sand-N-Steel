/**
 * ===========================================================================
 * C-8.70C — SAND / STEEL / INVICTUS: the three bout modes, as data
 * ===========================================================================
 * A mode is chosen on the pre-fight card and is read by the duel as DATA. It
 * never rewrites an opponent row: every mode resolves the SAME
 * `data/opponents.ts` row's stats, gear and rewards, and only the two profile
 * values the AI chooses with (`aggression`, `blockChance`), the crowd's opening
 * hype / cooling rate, the telegraph floor and the purse multipliers differ.
 *
 * ── WHAT IS DESIGN AND WHAT IS AUTHORED ────────────────────────────────────
 * DESIGN (published):
 *   • the Steel delta itself — **+0.05 aggression / +0.05 blockChance**, applied
 *     to every row, clamped with the profile into [0.05, 0.95];
 *   • the reward multipliers — Sand ×1.0/×1.0, Steel ×1.5 fame / ×1.25 gold,
 *     Invictus ×2.0 fame / ×1.5 gold;
 *   • Invictus opening hype **40**, and its decay at the NEXT venue tier's rate
 *     (T4 uses its own rate × 1.25).
 * The default delta is the ONLY value every row carries; a row with a different
 * `steelDelta` is an AUTHORED variation and is flagged in that row.
 *
 * ── THE TRAIT GRANT IS OMITTED (Director addendum A) ───────────────────────
 * Steel says a regular opponent "carries the trait it would hold one tier
 * higher". The characters-and-systems trait pool has NOT landed in this tree —
 * the palmae are the CH doctrinae/palmae ladder, a DIFFERENT system — so the
 * grant is omitted and the card says "profile only". No palma is bound to it.
 *
 * ── THE TELEGRAPH FLOOR IS STEEL-ONLY, AND NEVER BELOW 0.8 s ───────────────
 * `telegraphFloorSeconds` is the charter floor. A boss telegraph window longer
 * than it may be shortened DOWN TO it on Steel/Invictus and no further; a window
 * already at or below it stays, and Sand keeps every shipped duration exactly.
 * The feint-vs-true distinction is NOT re-based: only the announce's hold is
 * clamped, never the quick/heavy resolution pacing it is answered with.
 *
 * ── REWARD COMPOSITION ORDER (tested) ──────────────────────────────────────
 *   1. the MODE multiplies the row's base bounty and base fame;
 *   2. the crowd's peak bonus is computed ON those mode-adjusted bases;
 *   3. the crowd's turned factor multiplies fame last (gold is never reduced).
 * So the mode composes multiplicatively with Slice C-B's peak and turned
 * factors, in that documented order.
 */
import { CROWD_CONFIG, crowdTierTuning, type CrowdConfig, type CrowdVenueTier } from './crowdConfig';
import type { BoutMode, OpponentConfig, SteelDelta } from '../types/game';

/** The mode a fresh pre-fight card starts on. Session-only, never saved. */
export const DEFAULT_BOUT_MODE: BoutMode = 'sand';

/** The published Steel delta — the default applied to EVERY roster row. */
export const DEFAULT_STEEL_DELTA: SteelDelta = Object.freeze({
  aggression: 0.05,
  blockChance: 0.05,
});

const ZERO_DELTA: SteelDelta = Object.freeze({ aggression: 0, blockChance: 0 });

/** The published profile clamp a mode can never move a value outside of. */
export const BOUT_PROFILE_CLAMP = { min: 0.05, max: 0.95 } as const;

/**
 * The most a grudge's studied shift and the mode's Steel delta may move a value
 * from the base row, in total. Published with the Grudge Bouts spec.
 */
export const MAX_PROFILE_SHIFT = 0.2;

/** The charter floor for a boss telegraph window, in seconds. Steel/Invictus only. */
export const TELEGRAPH_FLOOR_SECONDS = 0.8;

/** Invictus opens with a hot crowd. */
export const INVICTUS_CROWD_START_HYPE = 40;

/** The venue's own shipped opening hype (the duel's seed since CF-3). */
export const VENUE_DEFAULT_CROWD_START_HYPE = 25;

/**
 * Invictus at the TOP tier decays at its own rate × this. The four C-B rates are
 * 1.0 / 1.2 / 1.4 / 1.6, so T4 lands at 1.6 × 1.25 = 2.0 — the Director's
 * published Invictus rule, read from the config rather than re-authored.
 */
export const INVICTUS_TOP_TIER_DECAY_FACTOR = 1.25;

export interface BoutModeDefinition {
  id: BoutMode;
  name: string;
  tagline: string;
  /** Steel and Invictus sharpen the opponent's profile by `steelDelta`. */
  sharpenedProfile: boolean;
  /** opening crowd hype; `null` = the venue's own default (25). */
  crowdStartHype: number | null;
  /** `venue` = this tier's rate; `next` = the next tier's (T4: own × 1.25). */
  crowdDecay: 'venue' | 'next';
  fameMultiplier: number;
  goldMultiplier: number;
  /**
   * Director addendum A — always `null`: the characters-and-systems trait pool
   * has not landed, and the palmae ladder is a different system. Profile only.
   */
  traitGrant: null;
}

export const BOUT_MODES: Record<BoutMode, BoutModeDefinition> = {
  sand: {
    id: 'sand',
    name: 'Sand',
    tagline: 'The old terms — no shift, no premium.',
    sharpenedProfile: false,
    crowdStartHype: null,
    crowdDecay: 'venue',
    fameMultiplier: 1,
    goldMultiplier: 1,
    traitGrant: null,
  },
  steel: {
    id: 'steel',
    name: 'Steel',
    tagline: 'A sharper opponent, a richer purse.',
    sharpenedProfile: true,
    crowdStartHype: null,
    crowdDecay: 'venue',
    fameMultiplier: 1.5,
    goldMultiplier: 1.25,
    traitGrant: null,
  },
  invictus: {
    id: 'invictus',
    name: 'Invictus',
    tagline: 'Everything in Steel, and a crowd that starts hot.',
    sharpenedProfile: true,
    crowdStartHype: INVICTUS_CROWD_START_HYPE,
    crowdDecay: 'next',
    fameMultiplier: 2,
    goldMultiplier: 1.5,
    traitGrant: null,
  },
};

/** The selector's order — Sand first, because it is the default. */
export const BOUT_MODE_ORDER: readonly BoutMode[] = ['sand', 'steel', 'invictus'];

/* ── profile composition ─────────────────────────────────────────────────── */

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Clamp any profile value into the published [0.05, 0.95] band. */
export function clampBoutProfileValue(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BOUT_PROFILE_CLAMP.min;
  return round6(Math.max(BOUT_PROFILE_CLAMP.min, Math.min(BOUT_PROFILE_CLAMP.max, value)));
}

/** The Steel delta a mode applies to the opponent's profile. */
export function steelDeltaFor(mode: BoutMode): SteelDelta {
  return BOUT_MODES[mode]?.sharpenedProfile ? DEFAULT_STEEL_DELTA : ZERO_DELTA;
}

/** The base profile a row's shifts are measured from (a grudge's is its base row). */
function baseProfileOf(opponent: OpponentConfig): SteelDelta {
  if (opponent.grudge) {
    return {
      aggression: opponent.grudge.baseProfile.aggression,
      blockChance: opponent.grudge.baseProfile.blockChance,
    };
  }
  return { aggression: opponent.aggression, blockChance: opponent.blockChance };
}

/** A grudge's studied shift — zero on every ordinary row. */
function studiedShiftOf(opponent: OpponentConfig): SteelDelta {
  if (!opponent.grudge) return ZERO_DELTA;
  return {
    aggression: opponent.grudge.adjustedProfile.aggression - opponent.grudge.baseProfile.aggression,
    blockChance:
      opponent.grudge.adjustedProfile.blockChance - opponent.grudge.baseProfile.blockChance,
  };
}

function composedValue(base: number, ...shifts: number[]): number {
  const total = shifts.reduce((sum, shift) => sum + (Number.isFinite(shift) ? shift : 0), 0);
  const capped = Math.max(-MAX_PROFILE_SHIFT, Math.min(MAX_PROFILE_SHIFT, total));
  return clampBoutProfileValue(base + capped);
}

/**
 * The profile the duel's AI actually chooses with, for one mode.
 *
 * Ordinary row: base + the mode's `steelDelta` (Sand: exactly the row).
 * Grudge row: the rival's OWN studied shift composes ADDITIVELY with the mode's
 * delta, the total shift from the base row is capped at ±0.20 and the result is
 * clamped into [0.05, 0.95] — the published Grudge × mode rule.
 *
 * Stats are never touched here; `resolveBoutOpponent` copies them unchanged so a
 * mode can never alter STR/AGI/STA/DEF/HP/stamina/gear.
 */
export function resolveBoutProfile(
  mode: BoutMode,
  opponent: OpponentConfig,
): SteelDelta {
  const base = baseProfileOf(opponent);
  const studied = studiedShiftOf(opponent);
  const steel = steelDeltaFor(mode);
  return {
    aggression: composedValue(base.aggression, studied.aggression, steel.aggression),
    blockChance: composedValue(base.blockChance, studied.blockChance, steel.blockChance),
  };
}

/**
 * The row as the duel reads it in one mode: the composed profile, with every
 * other field — `stats` included — copied unchanged. PURE: the row is never
 * mutated, so Sand/Steel/Invictus resolve identical stats on every call.
 */
export function resolveBoutOpponent(
  mode: BoutMode,
  opponent: OpponentConfig,
): OpponentConfig {
  const profile = resolveBoutProfile(mode, opponent);
  return {
    ...opponent,
    aggression: profile.aggression,
    blockChance: profile.blockChance,
    stats: { ...opponent.stats },
  };
}

/* ── crowd ───────────────────────────────────────────────────────────────── */

/** The hype the crowd opens at: Invictus 40, Sand/Steel the venue's own 25. */
export function modeCrowdStartHype(mode: BoutMode): number {
  const opening = BOUT_MODES[mode]?.crowdStartHype;
  return typeof opening === 'number' ? opening : VENUE_DEFAULT_CROWD_START_HYPE;
}

function clampVenueTier(tier: number | undefined): CrowdVenueTier {
  const rounded = typeof tier === 'number' && Number.isFinite(tier) ? Math.round(tier) : 1;
  return Math.min(4, Math.max(1, rounded)) as CrowdVenueTier;
}

/**
 * The tier whose cooling curve the mode uses. Sand/Steel: the venue's own tier.
 * Invictus: the NEXT tier's (T4 stays T4 — its extra 1.25 is the multiplier
 * below, so the tier index never leaves 1…4).
 */
export function modeCrowdDecayTier(mode: BoutMode, venueTier: number | undefined): CrowdVenueTier {
  const tier = clampVenueTier(venueTier);
  if (BOUT_MODES[mode]?.crowdDecay !== 'next') return tier;
  return Math.min(4, tier + 1) as CrowdVenueTier;
}

/** Invictus at T4 decays at 1.25 × its own rate; every other case is ×1. */
export function modeCrowdDecayMultiplier(mode: BoutMode, venueTier: number | undefined): number {
  return BOUT_MODES[mode]?.crowdDecay === 'next' && clampVenueTier(venueTier) === 4
    ? INVICTUS_TOP_TIER_DECAY_FACTOR
    : 1;
}

/** The final cooling rate for a mode at a venue tier — read from the C-B config. */
export function modeCrowdDecayRate(
  mode: BoutMode,
  venueTier: number | undefined,
  config: CrowdConfig = CROWD_CONFIG,
): number {
  const tier = modeCrowdDecayTier(mode, venueTier);
  return crowdTierTuning(tier, config).decayRatePerSecond * modeCrowdDecayMultiplier(mode, venueTier);
}

/* ── rewards ─────────────────────────────────────────────────────────────── */

export interface BoutModeRewardBases {
  /**
   * The mode-adjusted base bounty. The existing purse (`calculateDuelGold`) and
   * the crowd's peak gold are both computed from THIS value, so the mode is
   * applied first, multiplicatively, and the crowd's adjustments second.
   */
  goldBase: number;
  /** The mode-adjusted base fame; the crowd's peak/turned factors read this. */
  fameBase: number;
}

export function modeRewardBases(
  mode: BoutMode,
  opponent: OpponentConfig,
): BoutModeRewardBases {
  const def = BOUT_MODES[mode] ?? BOUT_MODES.sand;
  const gold = Number.isFinite(opponent.rewardGold) ? opponent.rewardGold : 0;
  const fame = Number.isFinite(opponent.rewardFame) ? opponent.rewardFame : 0;
  return {
    goldBase: Math.round(gold * def.goldMultiplier),
    fameBase: Math.round(fame * def.fameMultiplier),
  };
}

/* ── telegraph floor ─────────────────────────────────────────────────────── */

/**
 * One boss telegraph window under one mode, in seconds.
 *
 * Sand: the shipped value, exactly. Steel/Invictus: a window ABOVE the floor is
 * shortened TO it and no further; a window at or below the floor is untouched.
 * The duel applies this to the announce's own hold only — the quick/heavy
 * resolution pacing a feint or true heavy is answered with is never re-based.
 */
export function modeTelegraphWindowSeconds(mode: BoutMode, shippedSeconds: number): number {
  if (!Number.isFinite(shippedSeconds) || BOUT_MODES[mode]?.sharpenedProfile !== true) {
    return shippedSeconds;
  }
  return shippedSeconds > TELEGRAPH_FLOOR_SECONDS ? TELEGRAPH_FLOOR_SECONDS : shippedSeconds;
}

/** The same rule in milliseconds, for the duel's pacing table. */
export function modeTelegraphWindowMs(mode: BoutMode, shippedMs: number): number {
  if (!Number.isFinite(shippedMs)) return shippedMs;
  return modeTelegraphWindowSeconds(mode, shippedMs / 1000) * 1000;
}

/* ── the card's words ────────────────────────────────────────────────────── */

const two = (value: number): string => value.toFixed(2);

/** The profile line the card prints — base row → this bout's composed values. */
export function boutModeProfileLine(mode: BoutMode, opponent: OpponentConfig): string {
  const base = baseProfileOf(opponent);
  const composed = resolveBoutProfile(mode, opponent);
  const def = BOUT_MODES[mode] ?? BOUT_MODES.sand;
  if (!def.sharpenedProfile) {
    return `His published profile stands: aggression ${two(base.aggression)}, guard ${two(base.blockChance)}.`;
  }
  const studied = opponent.grudge ? 'grudge shift + Steel' : 'Steel';
  return (
    `Aggression ${two(base.aggression)} → ${two(composed.aggression)} · ` +
    `Guard ${two(base.blockChance)} → ${two(composed.blockChance)} ` +
    `(${studied}, clamped 0.05–0.95${opponent.grudge ? ', total shift ≤ ±0.20' : ''}).`
  );
}

/**
 * EVERY effect of the chosen mode, in plain language. The card renders these so
 * the player commits with full information: the profile numbers, the trait slot
 * (omitted, and said so), the crowd's start/decay, the telegraph floor and the
 * reward multipliers.
 */
export function boutModeEffectLines(mode: BoutMode, opponent: OpponentConfig): string[] {
  const def = BOUT_MODES[mode] ?? BOUT_MODES.sand;
  const lines: string[] = [];
  lines.push(boutModeProfileLine(mode, opponent));

  if (def.sharpenedProfile) {
    lines.push(
      'Profile only — no trait grant: the characters-and-systems trait pool has not landed ' +
        '(the palmae ladder is a different system).',
    );
    lines.push(
      `Boss telegraphs shorten to no less than the ${TELEGRAPH_FLOOR_SECONDS.toFixed(1)}s floor; ` +
        'quick and heavy strikes keep their shipped pacing.',
    );
  } else {
    lines.push('No profile shift, no trait grant. Boss telegraphs keep their shipped length.');
  }

  if (mode === 'invictus') {
    const tier1 = modeCrowdDecayRate('invictus', 1).toFixed(1);
    const tier4 = modeCrowdDecayRate('invictus', 4).toFixed(1);
    lines.push(
      `The crowd starts hot at ${INVICTUS_CROWD_START_HYPE} and cools at the next venue tier's ` +
        `rate (${tier1}/s at Tier 1 … ${tier4}/s at Tier 4).`,
    );
  } else {
    lines.push(
      `The crowd starts at the venue's ${VENUE_DEFAULT_CROWD_START_HYPE} and cools at this venue tier's own rate.`,
    );
  }

  lines.push(
    `Purse: ×${def.goldMultiplier.toFixed(2)} gold · ×${def.fameMultiplier.toFixed(2)} fame — ` +
      'applied first, before the crowd’s peak and turning adjustments.',
  );
  return lines;
}
