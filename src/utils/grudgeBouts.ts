/**
 * ===========================================================================
 * C-8.70C — GRUDGE BOUTS: the rivals you beat come back having studied you
 * ===========================================================================
 * A regular opponent the player has beaten at least once can call them out again
 * one tier higher — as a GRUDGE BOUT. The rematch is GENERATED from the base
 * roster row (`data/opponents.ts`) by `buildGrudgeOpponent`, never stored as a
 * second row: same base stats, same kit, same purse, with `aggression` and
 * `blockChance` shifted against the class the player leaned on in the bout the
 * rival lost.
 *
 * THE RULES, one place each:
 *
 *   • ELIGIBILITY  — a REGULAR opponent only (`isGrudgeBase`: not a boss, not a
 *     Feature Bout, not already a generated grudge), and only while the base's
 *     tier + 1 is a tier the ladder actually has (`FINAL_TIER`).
 *   • THE SHIFT    — the published B4 pattern, inside the published caps:
 *       power  → blockChance +0.10, aggression −0.05  (the rival braces)
 *       quick  → blockChance −0.05, aggression +0.10  (the rival presses)
 *       even   → blockChance  0.00, aggression +0.05  (he simply comes out harder)
 *     No value moves more than ±0.15 from base and every value stays inside
 *     [0.05, 0.95]. `stats` is copied byte-identically and never touched.
 *   • THE SLOT     — the EXTRA PALMA (design C3b, Oct 19 QA amendment: the null
 *     fallback is RETIRED). `evolvedTrait` carries a `Palma.id` from the safe
 *     subset, resolved by `utils/extraPalmae.ts`'s ONE shared resolver and
 *     APPENDED to the generated row's own `palmae` array, so it lands through
 *     the existing combat-modifier merge — no second effect system. Bosses are
 *     excluded by the resolver's own fence.
 *   • AVAILABILITY — the grudge appears at the base's tier + 1, only while the
 *     player's `currentTier` reaches it, and is closed after a loss until the
 *     player wins ANY standard bout at that same tier (the anti-farm rule).
 *     Winning the grudge SETTLES it permanently.
 *   • THE WRITES   — `recordStandardVictory` / `settleGrudge` / `closeGrudge` are
 *     pure and are called from App's existing result write only. Nothing in this
 *     module reads or writes storage, and displaying or selecting a grudge writes
 *     nothing.
 *
 * ── THE OFFENSIVE MIX IS D-5's COUNTER, READ — NOT A SECOND ONE ─────────────
 * Slice D-5 built the live offensive-mix counter (`utils/longMemory.ts`'s
 * `LiveMixCounter`, counted in `DuelScene` from the player's own resolved
 * actions). This slice does NOT build a parallel counter: the duel counts in
 * that one ref for every bout, and the result read is `dominantClassOfMix` over
 * the same `{ quick, power }` shape. Only the three-way summary is persisted.
 *
 * ── THE DOMINANCE LINE IS D-5's PUBLISHED 0.60 ──────────────────────────────
 * The grudge design publishes no threshold of its own for "leaned on a class".
 * The only published dominance line in the tree is D-5's three-in-five (0.60),
 * so the summary reuses it rather than inventing a second number: a class is
 * dominant only when it EXCEEDS 60 % of the counted attacks, and everything else
 * is `even`. That keeps the grudge's reading and Hermas's reading consistent.
 */
import type {
  BoutMode,
  DominantOffensiveClass,
  GrudgeBoutConfig,
  GrudgeProfileValues,
  GrudgeRecord,
  GrudgeState,
  OpponentConfig,
  PlayerProfile,
} from '../types/game';
import { LADDER_OPPONENTS } from '../data/opponents';
import { BOUT_MODES, modeRewardBases } from '../data/boutModes';
import { FINAL_TIER } from './tierAdvancement';
import type { LiveMixCounter } from './longMemory';
import {
  SAFE_SUBSET_PALMAE_ORDER,
  extraPalmaFor,
  extraPalmaLine,
  withExtraPalma,
} from './extraPalmae';

/* ── THE CAPS AND THE SHIFTS (published) ─────────────────────────────────── */

/** The published caps: no single value moves more than this, and all stay in range. */
export const GRUDGE_CAPS = {
  maxShift: 0.15,
  min: 0.05,
  max: 0.95,
} as const;

/**
 * B4's published counter-shifts, one row per studied class. `power` and `quick`
 * are the design's own magnitudes; `even` is the +0.05 aggression the design
 * gives the unreadable class.
 */
export const GRUDGE_SHIFTS: Record<DominantOffensiveClass, GrudgeProfileValues> = {
  power: { blockChance: 0.1, aggression: -0.05 },
  quick: { blockChance: -0.05, aggression: 0.1 },
  even: { blockChance: 0, aggression: 0.05 },
};

/**
 * C-TRAIT — THE GRUDGE PURSE IS THE VENUE TIER'S FLOOR REGULAR (design C3d).
 *
 * The authored fame premium is DELETED and there is NO separate grudge price
 * table: C3d states that "a Grudge Bout pays the tier+1 reward row from
 * Progression section 1.3's published table (the premium IS the higher tier's
 * purse)". The published per-fight gold/fame figures ARE the tier's floor
 * regular — the first regular roster row of that tier (T2: Cassius 90 g / 25
 * fame, T3: Drusus 260 g / 90 fame) — so the purse is DERIVED from the roster
 * itself, never re-authored here.
 *
 * SUMMIT EXCEPTION (flagged, not hidden): a T3-base grudge is fought at venue
 * T4, and T4 has NO regular row — its only rows are bosses. Those grudges pay
 * the home floor (T3: 260 g / 90 fame); there is no gold/fame step at the summit.
 */
export interface GrudgePurse {
  /** The venue tier the grudge is actually fought at (the base's tier + 1). */
  venueTier: number;
  /** The tier whose floor regular's purse is paid (equals `venueTier` except at the summit). */
  purseTier: number;
  purseGold: number;
  purseFame: number;
  /** True when the venue has no regular row and the home floor is paid instead. */
  summit: boolean;
}

/** The first REGULAR row of a tier — that tier's published floor purse. */
function floorRegularOf(tier: number): OpponentConfig | undefined {
  return LADDER_OPPONENTS.find((row) => isGrudgeBase(row) && Math.floor(row.tier) === tier);
}

/**
 * The purse a grudge fought at `grudgeTier` pays, x the C-C mode multipliers
 * through the EXISTING `modeRewardBases` (mode first, then C-B's crowd factors —
 * the composition order C-C documents and `boutModes.ts` implements).
 */
export function grudgePurseFor(grudgeTier: number): GrudgePurse | null {
  if (!finite(grudgeTier)) return null;
  const venueTier = Math.floor(grudgeTier);
  for (let tier = venueTier; tier >= 1; tier -= 1) {
    const row = floorRegularOf(tier);
    if (!row) continue;
    return {
      venueTier,
      purseTier: tier,
      purseGold: row.rewardGold,
      purseFame: row.rewardFame,
      summit: tier !== venueTier,
    };
  }
  return null;
}

/**
 * The dominance line the three-way summary is read against — D-5's published
 * three-in-five, reused rather than re-authored (see the header).
 */
export const GRUDGE_MIX_THRESHOLD = 0.6;

const OFFENSIVE_CLASSES: readonly DominantOffensiveClass[] = ['quick', 'power', 'even'];

const isClass = (value: unknown): value is DominantOffensiveClass =>
  typeof value === 'string' && (OFFENSIVE_CLASSES as readonly string[]).includes(value);

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Six decimals: a probability never needs more, and it keeps 0.65 − 0.05 clean. */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const clamp = (value: number): number =>
  Math.max(GRUDGE_CAPS.min, Math.min(GRUDGE_CAPS.max, value));

/**
 * The ladder's regular rows — the only rivals a grudge can exist for. Derived
 * once from the roster (the same roster order the Colosseum lists), so the
 * Doctore's Test champion and every other off-ladder row are excluded by data,
 * not by a second hand-kept list.
 */
const GRUDGE_ROSTER = LADDER_OPPONENTS.filter(isGrudgeBase);
const GRUDGE_ROSTER_IDS = new Set(GRUDGE_ROSTER.map((row) => row.id));

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

/**
 * Is this roster row one a grudge may be generated from? A regular opponent:
 * never a boss, never a Feature Bout, never itself a generated grudge.
 */
export function isGrudgeBase(
  opponent: OpponentConfig | null | undefined
): opponent is OpponentConfig {
  if (!opponent) return false;
  if (typeof opponent.id !== 'string' || opponent.id === '') return false;
  if (opponent.isBoss === true) return false;
  if (opponent.featureBout === true) return false;
  // STORY-4b — and never a BOUNTY BOUT: a board rung is fought from the board, so a
  // bounty victory generates no grudge and no rematch (fence (f)).
  if (opponent.bountyBout === true) return false;
  if (opponent.grudge !== undefined) return false;
  return finite(opponent.tier) && finite(opponent.aggression) && finite(opponent.blockChance);
}

/** The generated row's id — derived from the base id, never stored in the roster. */
export function grudgeIdOf(baseId: string): string {
  return `grudge_${baseId}`;
}

/** Is this row a generated grudge rematch? */
export function isGrudgeBout(opponent: OpponentConfig | null | undefined): boolean {
  return Boolean(opponent && opponent.grudge && typeof opponent.grudge.baseId === 'string');
}

/** The tier a rival's grudge is fought at: one rung above the row he was beaten in. */
export function grudgeTierOf(base: Pick<OpponentConfig, 'tier'>): number {
  return Math.floor(base.tier) + 1;
}

/* ── THE MIX SUMMARY (D-5's counter, read) ───────────────────────────────── */

/**
 * Read D-5's live `{ quick, power }` counter as the three-way summary a grudge
 * stores. A class is dominant only when it EXCEEDS `GRUDGE_MIX_THRESHOLD`; with
 * nothing counted (or no class past the line) the answer is `even`.
 */
export function dominantClassOfMix(mix: LiveMixCounter | null | undefined): DominantOffensiveClass {
  const quick = finite(mix?.quick) && mix!.quick > 0 ? Math.floor(mix!.quick) : 0;
  const power = finite(mix?.power) && mix!.power > 0 ? Math.floor(mix!.power) : 0;
  const total = quick + power;
  if (total === 0) return 'even';
  if (power / total > GRUDGE_MIX_THRESHOLD) return 'power';
  if (quick / total > GRUDGE_MIX_THRESHOLD) return 'quick';
  return 'even';
}

/* ── THE READ (lazy, never repairing) ────────────────────────────────────── */

/**
 * The grudges a save carries. Absent, null and malformed all read as `{}`; an
 * entry whose class is not one of the three is dropped, and the flags are kept
 * only when they are exactly `true`. The returned record is always a fresh object
 * and the profile is never mutated.
 */
export function resolveGrudges(
  profile: Pick<PlayerProfile, 'grudges'> | null | undefined
): GrudgeState {
  const stored = profile?.grudges;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const resolved: GrudgeState = {};
  for (const [baseId, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    if (!isClass(record.dominant)) continue;
    resolved[baseId] = {
      dominant: record.dominant,
      ...(record.closed === true ? { closed: true } : {}),
      ...(record.settled === true ? { settled: true } : {}),
    };
  }
  return resolved;
}

/** One rival's stored grudge record, or `null`. */
export function grudgeRecordOf(
  profile: Pick<PlayerProfile, 'grudges'> | null | undefined,
  baseId: string
): GrudgeRecord | null {
  const records = resolveGrudges(profile);
  return records[baseId] ?? null;
}

/* ── THE GENERATION ──────────────────────────────────────────────────────── */

const shifted = (base: number, delta: number): number =>
  round6(clamp(round6(base + Math.max(-GRUDGE_CAPS.maxShift, Math.min(GRUDGE_CAPS.maxShift, delta)))));

/**
 * Generate a grudge's rematch row from its base roster row.
 *
 * Pure: the base row is never mutated, `stats` is copied BYTE-IDENTICALLY, and
 * the only profile values that move are `aggression` and `blockChance` — inside
 * the published caps. Every boss-only and feature-only field is dropped
 * explicitly, so a grudge can never be a boss, carry a boss mechanic or be gated
 * as a Feature Bout. Returns `null` for a row no grudge can be generated from.
 */
export function buildGrudgeOpponent(
  base: OpponentConfig | null | undefined,
  dominant: DominantOffensiveClass
): OpponentConfig | null {
  if (!isGrudgeBase(base)) return null;
  if (!isClass(dominant)) return null;

  const shift = GRUDGE_SHIFTS[dominant];
  const baseProfile: GrudgeProfileValues = {
    aggression: base.aggression,
    blockChance: base.blockChance,
  };
  const adjustedProfile: GrudgeProfileValues = {
    aggression: shifted(base.aggression, shift.aggression),
    blockChance: shifted(base.blockChance, shift.blockChance),
  };
  // C3b — the evolved-trait slot is never null: the shared resolver names the
  // extra palma, and the row's own `palmae` array carries it into the existing
  // combat-modifier merge. `?? SAFE_SUBSET_PALMAE_ORDER[0]` is defensive only:
  // `isGrudgeBase` already excludes bosses and Feature Bouts, which are the only
  // rows the resolver refuses.
  const extraPalma = extraPalmaFor(base) ?? SAFE_SUBSET_PALMAE_ORDER[0];
  const purse = grudgePurseFor(grudgeTierOf(base));
  const grudge: GrudgeBoutConfig = {
    baseId: base.id,
    studied: dominant,
    evolvedTrait: extraPalma,
    baseProfile,
    adjustedProfile,
  };

  // Everything boss-only / feature-only is removed by construction, not by
  // trusting the base row: a grudge is an ordinary regular rematch.
  const {
    isBoss: _isBoss,
    bossMechanic: _bossMechanic,
    featureBout: _featureBout,
    gate: _gate,
    cardLine: _cardLine,
    presentationState: _presentationState,
    beast: _beast,
    brothers: _brothers,
    longMemory: _longMemory,
    panoply: _panoply,
    falseTelegraph: _falseTelegraph,
    ...regular
  } = base;

  return {
    ...regular,
    id: grudgeIdOf(base.id),
    stats: { ...base.stats },
    palmae: withExtraPalma(base).palmae,
    aggression: adjustedProfile.aggression,
    blockChance: adjustedProfile.blockChance,
    // C3d — the VENUE tier's floor regular purse, not the base row's. The mode
    // multiplies these through `modeRewardBases` exactly as it does any row.
    rewardGold: purse ? purse.purseGold : base.rewardGold,
    rewardFame: purse ? purse.purseFame : base.rewardFame,
    grudge,
  };
}

/* ── THE AVAILABILITY ────────────────────────────────────────────────────── */

/** One rival's grudge, as the Colosseum card reads it. */
export interface GrudgeBoutStatus {
  /** The roster row the rival was beaten as. */
  base: OpponentConfig;
  /** The generated rematch row the fight is started with. */
  opponent: OpponentConfig;
  /** The tier the grudge is fought at (the base's tier + 1). */
  grudgeTier: number;
  /** The class the rival studied. */
  studied: DominantOffensiveClass;
  /** The plain-language line the card prints. */
  studiedLine: string;
  /** The player's tier has reached the grudge's own. */
  tierReached: boolean;
  /** The grudge was taken and lost: closed by the anti-farm rule. */
  closed: boolean;
  /** The grudge was fought and won: settled forever. */
  settled: boolean;
  /** May the player enter it right now? */
  open: boolean;
}

/**
 * Every grudge this profile has earned, in roster order.
 *
 * A rival appears only when ALL of these hold: he is a regular roster row, the
 * player has beaten him (the id is in `defeatedOpponentIds`), a grudge record
 * exists for him, and his grudge's tier is one the ladder has. `open` additionally
 * needs the player's tier to have reached that tier and the grudge not to be
 * closed or settled.
 */
export function grudgeBoutStatuses(
  profile: Pick<PlayerProfile, 'grudges' | 'defeatedOpponentIds' | 'currentTier'> | null | undefined
): GrudgeBoutStatus[] {
  const records = resolveGrudges(profile);
  const defeated = Array.isArray(profile?.defeatedOpponentIds)
    ? profile!.defeatedOpponentIds.filter((id): id is string => typeof id === 'string')
    : [];
  const currentTier = finite(profile?.currentTier) && profile!.currentTier >= 1
    ? Math.floor(profile!.currentTier)
    : 1;

  const statuses: GrudgeBoutStatus[] = [];
  for (const base of GRUDGE_ROSTER) {
    const record = records[base.id];
    if (!record) continue;
    if (!defeated.includes(base.id)) continue;
    const grudgeTier = grudgeTierOf(base);
    if (grudgeTier > FINAL_TIER) continue;
    const opponent = buildGrudgeOpponent(base, record.dominant);
    if (!opponent) continue;
    const tierReached = currentTier >= grudgeTier;
    const closed = record.closed === true;
    const settled = record.settled === true;
    statuses.push({
      base,
      opponent,
      grudgeTier,
      studied: record.dominant,
      studiedLine: grudgeStudiedLine(opponent),
      tierReached,
      closed,
      settled,
      open: tierReached && !closed && !settled,
    });
  }
  return statuses;
}

/* ── THE WRITES (pure; App's result write is the only caller) ─────────────── */

/**
 * A STANDARD victory over a regular opponent: record the mix of the FIRST
 * victory over that rival, then re-open every closed grudge at this bout's tier
 * (the anti-farm rule's other half). Returns the SAME profile when nothing
 * changed, so a rematch never reaches `saveProfile`.
 */
export function recordStandardVictory(
  profile: PlayerProfile,
  opponent: OpponentConfig | null | undefined,
  dominant: DominantOffensiveClass
): PlayerProfile {
  // Only a LADDER regular can carry a grudge: the Doctore's Test champion and any
  // other off-ladder row are regulars in the fence's sense but have no grudge to
  // come back with, so their wins record nothing.
  if (!profile || !isGrudgeBase(opponent) || !GRUDGE_ROSTER_IDS.has(opponent.id)) return profile;
  const defeatedIds = Array.isArray(profile.defeatedOpponentIds)
    ? profile.defeatedOpponentIds
    : [];
  const firstVictory = !defeatedIds.includes(opponent.id);
  const current = resolveGrudges(profile);
  let next: GrudgeState = current;
  let changed = false;

  if (firstVictory && !current[opponent.id]) {
    next = { ...next, [opponent.id]: { dominant: isClass(dominant) ? dominant : 'even' } };
    changed = true;
  }

  const boutTier = Math.floor(opponent.tier);
  for (const base of GRUDGE_ROSTER) {
    const record = next[base.id];
    if (!record || record.closed !== true) continue;
    if (grudgeTierOf(base) !== boutTier) continue;
    const { closed: _closed, ...reopened } = record;
    next = { ...next, [base.id]: reopened };
    changed = true;
  }

  return changed ? { ...profile, grudges: next } : profile;
}

/**
 * The grudge was WON: settled permanently. A settled grudge is never offered
 * again and writes nothing else — the victory's gold, fame and XP travel the
 * existing result flow.
 */
export function settleGrudge(
  profile: PlayerProfile,
  opponent: OpponentConfig | null | undefined
): PlayerProfile {
  const baseId = opponent?.grudge?.baseId;
  if (!profile || typeof baseId !== 'string') return profile;
  const records = resolveGrudges(profile);
  const record = records[baseId];
  if (!record || record.settled === true) return profile;
  return {
    ...profile,
    grudges: { ...records, [baseId]: { dominant: record.dominant, settled: true } },
  };
}

/**
 * The grudge was LOST: closed until the player wins any standard bout at that
 * grudge's tier. Nothing else is written.
 */
export function closeGrudge(
  profile: PlayerProfile,
  opponent: OpponentConfig | null | undefined
): PlayerProfile {
  const baseId = opponent?.grudge?.baseId;
  if (!profile || typeof baseId !== 'string') return profile;
  const records = resolveGrudges(profile);
  const record = records[baseId];
  if (!record || record.closed === true || record.settled === true) return profile;
  return { ...profile, grudges: { ...records, [baseId]: { ...record, closed: true } } };
}

/* ── THE WORDS ───────────────────────────────────────────────────────────── */

const two = (value: number): string => value.toFixed(2);

/** The plain-language line the fight card and the Colosseum card print. */
export function grudgeStudiedLine(opponent: OpponentConfig | null | undefined): string {
  const grudge = opponent?.grudge;
  if (!grudge) return '';
  const name = opponent?.name ?? 'Your rival';
  if (grudge.studied === 'power') {
    return `${name} has learned to fear your power attacks — his guard comes up and he stops pressing.`;
  }
  if (grudge.studied === 'quick') {
    return `${name} has learned to time your quick strikes — he presses forward now and lets his guard sit lower.`;
  }
  return `${name} could not read you — he simply comes out harder than the first time.`;
}

/** The base → adjusted profile, in the row's own numbers. */
export function grudgeProfileLine(grudge: GrudgeBoutConfig | null | undefined): string {
  if (!grudge) return '';
  const { baseProfile, adjustedProfile } = grudge;
  return (
    `Guard ${two(baseProfile.blockChance)} → ${two(adjustedProfile.blockChance)} · ` +
    `Aggression ${two(baseProfile.aggression)} → ${two(adjustedProfile.aggression)}`
  );
}

/** The result screen's line for a grudge bout. */
export function grudgeResultLine(
  opponent: OpponentConfig | null | undefined,
  didWin: boolean
): string {
  const grudge = opponent?.grudge;
  if (!grudge) return '';
  const name = opponent?.name ?? 'Your rival';
  if (didWin) {
    return `${name}'s grudge is settled — he will not call you out again.`;
  }
  const base = LADDER_OPPONENTS.find((row) => row.id === grudge.baseId);
  const tier = base ? grudgeTierOf(base) : null;
  return tier
    ? `The grudge stands: ${name} keeps it until you win any standard bout at Tier ${tier}.`
    : `The grudge stands: ${name} keeps it until you win a standard bout at his tier.`;
}

/**
 * C-TRAIT — the grudge card's TRAIT row (design C3b/C3d). The evolved-trait slot
 * is no longer omitted and no longer says "profile only": the card prints the
 * granted palma by name with its effect, read from the palma's own row.
 */
export function grudgeTraitLine(opponent: OpponentConfig | null | undefined): string {
  const line = extraPalmaLine(opponent?.grudge?.evolvedTrait);
  return line ? `Evolved trait — ${line}` : '';
}

/**
 * C-TRAIT — the grudge card's PURSE row, composed exactly as the duel pays it:
 * the venue tier's floor regular (or the home floor at the summit) multiplied by
 * the chosen mode's C-C multipliers. The crowd's peak/turning factors then apply
 * on top, in C-C's documented order — hence "before the crowd's adjustments".
 */
export function grudgeRewardLine(
  opponent: OpponentConfig | null | undefined,
  mode: BoutMode
): string {
  if (!opponent?.grudge) return '';
  const purse = grudgePurseFor(grudgeTierOf(opponent));
  if (!purse) return '';
  const def = BOUT_MODES[mode] ?? BOUT_MODES.sand;
  const bases = modeRewardBases(mode, opponent);
  const floor =
    `Tier ${purse.purseTier} floor (${purse.purseGold} gold / ${purse.purseFame} fame) ` +
    `× ${def.name} (×${def.goldMultiplier.toFixed(2)} gold, ×${def.fameMultiplier.toFixed(2)} fame)`;
  const summit = purse.summit
    ? ` The summit has no regular row — the Tier ${purse.venueTier} grudge pays its home floor.`
    : '';
  return (
    `Purse: ${bases.goldBase} gold · ${bases.fameBase} fame — ${floor}, ` +
    `before the crowd's adjustments.${summit}`
  );
}
