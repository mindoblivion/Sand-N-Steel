/**
 * ===========================================================================
 * D-5 — HERMAS'S LONG MEMORY: the old man reads the mix
 * ===========================================================================
 * Hermas "The Legend Returned" does not get stronger as he is hurt: he gets
 * READ. Twice in a bout — when his HP crosses 66 %, then 33 % — he looks at the
 * player's OWN offensive blend and sets himself against the class the player has
 * been leaning on:
 *
 *   • POWER-led mix  → blockChance rises, and his dodge share falls with it.
 *   • QUICK-led mix  → the mirror: blockChance falls, his dodge share rises.
 *   • Balanced mix   → NOTHING fires. No shift, no Old Craft, no announcement.
 *
 * Every adoption also stacks OLD CRAFT, his own palma (+0.05 blockChance per
 * adoption), and every value is capped: no single adoption moves a value by more
 * than ±0.15, and the effective value is clamped into [0.05, 0.95].
 *
 * ── WHAT IS PUBLISHED, AND WHAT IS AUTHORED ────────────────────────────────
 * The POWER pattern is the Grudge design's own published example (B4): blockChance
 * +0.10 with the dodge share falling. The QUICK mirror is NOT published anywhere,
 * so it is AUTHORED here — blockChance −0.15, which after Old Craft's +0.05 leaves
 * a net −0.10 per adoption, the same visible size a power adoption leaves after
 * its own stacking. Both magnitudes sit inside the published ±0.15 cap. The
 * AUTHORED half is flagged again in the row's own comment and in the slice's
 * report; only the power numbers are design-published.
 *
 * ── WHAT "DODGE SHARE" IS, AND WHY ONLY ONE KNOB MOVES ─────────────────────
 * The duel's AI ladder (`chooseAIStandardAction`) splits an opponent's actions as
 *   P(attack) = aggression,  P(block) = (1 − aggression) · blockChance,
 *   P(dodge)  = (1 − aggression) · (1 − blockChance),
 * so the dodge share is EXACTLY `1 − blockChance` of his defensive choices. That
 * is the quantity B4 means by "the dodge share falls", and it moves with the one
 * value the engine actually reads. Hermas's row `dodgeChance` field is untouched
 * by this module because a non-`counter_dodge` opponent never reads it — moving it
 * would be a number that changes nothing.
 *
 * ── THE TIMING TRIGGER IS NOT AN INPUT ─────────────────────────────────────
 * His HP crossing a threshold is only WHEN he looks. WHAT he reads is the player's
 * own offensive mix, counted in `mix` from the player's resolved actions only — no
 * HP, no elapsed time and no random roll is ever an input to the mix or to the
 * shift.
 *
 * ── THE FENCE ──────────────────────────────────────────────────────────────
 *   a long memory exists  ⇔  the opponent `isBoss` ∧ carries `featureBout` ∧ its
 *                            mechanic is `the_long_memory` ∧ the row carries
 *                            valid `longMemory` sub-data.
 *
 * A row with the mechanic string and no sub-data (or a copy of the sub-data on a
 * non-boss row) resolves to `null` and every call site is a no-op, so it fights as
 * a standard opponent. Everything here is pure — no React, no storage, no clock,
 * no randomness — and the whole state is duel-session only: it is never saved.
 */
import type { LongMemoryConfig, OpponentConfig } from '../types/game';
import type { CombatActionType } from '../components/ui/TurnActionPanel';

/** The two offensive classes the live counter tracks — and the only two it counts. */
export type OffensiveClass = 'quick' | 'power';

/**
 * THE LIVE OFFENSIVE-MIX COUNTER — built fresh in this slice (there was none in
 * the tree). It is a count of the player's own attacks, nothing else: a shield
 * block, a dodge, an advance, a taunt, a rest, a net or a withdraw is not an
 * offensive action, and a strike aimed at a beast is not this bout's mix.
 */
export interface LiveMixCounter {
  quick: number;
  power: number;
}

/** One reading of the counter, with the shares and the class it names. */
export interface LiveMixRead extends LiveMixCounter {
  /** Offensive actions counted (quick + power). */
  total: number;
  /** `quick / total`; 0 when nothing has been counted. */
  quickShare: number;
  /** `power / total`; 0 when nothing has been counted. */
  powerShare: number;
  /** The class the player leaned on past the threshold, or `null` if neither. */
  dominant: OffensiveClass | null;
}

/** One threshold's outcome: the mix he saw, what he did with it, and the words. */
export interface LongMemoryAdaptation {
  /** The HP fraction whose crossing triggered this read (0.66, then 0.33). */
  threshold: number;
  /** The class he set himself against, or `null` for a balanced mix. */
  adapted: OffensiveClass | null;
  /** The mix at the moment of the read. */
  quick: number;
  power: number;
  total: number;
  quickShare: number;
  powerShare: number;
  /** blockChance before and after — the pair the announcement prints. */
  blockBefore: number;
  blockAfter: number;
  /** The dodge share of his defensive choices before and after. */
  dodgeShareBefore: number;
  dodgeShareAfter: number;
  /** The Old Craft blockChance this adoption carried (0 when nothing fired). */
  oldCraft: number;
  /** The HUD line (`''` for a balanced read — nothing happened, so nothing is said). */
  words: string;
  /** The result screen's line: the same event, in numbers. */
  line: string;
}

/** Hermas's whole duel-session state: the live counter and the reads taken. */
export interface LongMemoryState {
  mix: LiveMixCounter;
  reads: LongMemoryAdaptation[];
}

/** The three row values an effective profile is built from. */
export interface LongMemoryBaseProfile {
  aggression: number;
  blockChance: number;
  dodgeChance: number;
}

/** His live effective profile: the row's values, with the adaptations applied. */
export interface LongMemoryProfile extends LongMemoryBaseProfile {
  /** `1 − blockChance`: the share of his defensive choices that are dodges. */
  dodgeShare: number;
}

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The long memory this opponent carries, or `null` when it carries none.
 *
 * THE FENCE, in full: `isBoss` ∧ `featureBout` ∧ the mechanic ∧ usable sub-data
 * (thresholds strictly descending inside (0, 1), a dominance threshold above a
 * half, finite moves that each fit the cap, a clamp that is a real interval). A
 * malformed row is refused rather than half-working.
 */
export function longMemoryConfigFor(
  opponent: OpponentConfig | null | undefined
): LongMemoryConfig | null {
  if (!opponent) return null;
  if (opponent.isBoss !== true) return null;
  if (opponent.featureBout !== true) return null;
  if (opponent.bossMechanic !== 'the_long_memory') return null;

  const config = opponent.longMemory;
  if (!config) return null;
  if (!Array.isArray(config.readAtHealthFractions) || config.readAtHealthFractions.length === 0) {
    return null;
  }
  let previous = 1;
  for (const fraction of config.readAtHealthFractions) {
    if (!finite(fraction) || fraction <= 0 || fraction >= 1) return null;
    if (fraction >= previous) return null;
    previous = fraction;
  }
  if (!finite(config.dominanceThreshold)) return null;
  if (config.dominanceThreshold <= 0.5 || config.dominanceThreshold >= 1) return null;
  if (!config.blockChanceDelta) return null;
  for (const move of [config.blockChanceDelta.power, config.blockChanceDelta.quick]) {
    if (!finite(move)) return null;
    if (Math.abs(move) > config.maxDeltaPerAdoption) return null;
  }
  if (!finite(config.oldCraftBlockChancePerAdoption)) return null;
  if (config.oldCraftBlockChancePerAdoption < 0) return null;
  if (config.oldCraftBlockChancePerAdoption > config.maxDeltaPerAdoption) return null;
  if (!finite(config.maxDeltaPerAdoption)) return null;
  if (config.maxDeltaPerAdoption <= 0 || config.maxDeltaPerAdoption > 1) return null;
  if (!config.clamp) return null;
  if (!finite(config.clamp.min) || !finite(config.clamp.max)) return null;
  if (config.clamp.min <= 0 || config.clamp.min >= config.clamp.max || config.clamp.max >= 1) {
    return null;
  }
  return config;
}

/** Is this opponent one who reads you? */
export function isLongMemoryBout(opponent: OpponentConfig | null | undefined): boolean {
  return longMemoryConfigFor(opponent) !== null;
}

/* ── THE STATE, AND THE COUNTER ──────────────────────────────────────────── */

/** A fresh bout: nothing counted, nothing read. */
export function createLongMemoryState(): LongMemoryState {
  return { mix: { quick: 0, power: 0 }, reads: [] };
}

/** Is this action one the counter counts? Only the two attacks are offensive. */
export function isOffensiveAction(actionType: CombatActionType): boolean {
  return offensiveClassOf(actionType) !== null;
}

/**
 * The class an action belongs to, or `null`. `quick_attack` and `power_attack`
 * are the counter's whole vocabulary — this is the one place that decides it, so
 * the duel cannot drift from the module.
 */
export function offensiveClassOf(actionType: CombatActionType): OffensiveClass | null {
  if (actionType === 'quick_attack') return 'quick';
  if (actionType === 'power_attack') return 'power';
  return null;
}

/**
 * Record one PLAYER action in the live counter. Returns a new state (the state is
 * treated as immutable, like every other duel-session record in this repo) and is
 * a no-op for anything that is not an offensive attack.
 */
export function notePlayerAction(
  state: LongMemoryState,
  actionType: CombatActionType
): LongMemoryState {
  const cls = offensiveClassOf(actionType);
  if (!cls) return state;
  const mix: LiveMixCounter = {
    quick: state.mix.quick + (cls === 'quick' ? 1 : 0),
    power: state.mix.power + (cls === 'power' ? 1 : 0),
  };
  return { ...state, mix };
}

/**
 * Read the counter. A class is dominant only when it EXCEEDS the threshold — a
 * mix sitting exactly on 60 % is not "past three-in-five", so it reads as the
 * balanced case and nothing fires.
 */
export function readOffensiveMix(
  state: LongMemoryState,
  config: LongMemoryConfig
): LiveMixRead {
  const { quick, power } = state.mix;
  const total = quick + power;
  const quickShare = total > 0 ? quick / total : 0;
  const powerShare = total > 0 ? power / total : 0;
  let dominant: OffensiveClass | null = null;
  if (powerShare > config.dominanceThreshold) dominant = 'power';
  else if (quickShare > config.dominanceThreshold) dominant = 'quick';
  return { quick, power, total, quickShare, powerShare, dominant };
}

/* ── THE EFFECTIVE PROFILE ───────────────────────────────────────────────── */

const clampRange = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clampMagnitude = (value: number, cap: number): number =>
  Math.max(-cap, Math.min(cap, value));

/** Six decimals: a probability never needs more, and it keeps 0.65 − 0.10 clean. */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** The row's own three profile values, unchanged. */
export function longMemoryBaseProfile(
  opponent: Pick<OpponentConfig, 'aggression' | 'blockChance' | 'dodgeChance'>
): LongMemoryBaseProfile {
  return {
    aggression: opponent.aggression,
    blockChance: opponent.blockChance,
    dodgeChance: opponent.dodgeChance,
  };
}

/** `1 − blockChance`: the dodge share of his defensive choices. */
export function dodgeShareOf(blockChance: number): number {
  return clampRange(1 - blockChance, 0, 1);
}

/**
 * His live effective profile. Only `blockChance` can move — the engine reads that
 * one knob for the block-vs-dodge split, and the row's `dodgeChance` field is not
 * read by a non-`counter_dodge` opponent at all (see the header).
 */
export function longMemoryProfile(
  config: LongMemoryConfig,
  base: LongMemoryBaseProfile,
  state: LongMemoryState
): LongMemoryProfile {
  let blockChance = clampRange(base.blockChance, config.clamp.min, config.clamp.max);
  for (const read of state.reads) {
    const wanted = read.blockAfter - read.blockBefore;
    blockChance = round6(clampRange(blockChance + wanted, config.clamp.min, config.clamp.max));
  }
  return {
    aggression: base.aggression,
    blockChance,
    dodgeChance: base.dodgeChance,
    dodgeShare: dodgeShareOf(blockChance),
  };
}

/** Just the blockChance — the one value the AI's chooser reads. */
export function longMemoryBlockChance(
  config: LongMemoryConfig,
  base: LongMemoryBaseProfile,
  state: LongMemoryState
): number {
  return longMemoryProfile(config, base, state).blockChance;
}

/* ── WHEN HE LOOKS ───────────────────────────────────────────────────────── */

/**
 * The thresholds whose HP crossing has happened and whose read has not been
 * taken, in the row's own order (66 % before 33 %). A single blow can cross both;
 * the caller applies them in sequence so the second reads the first's profile.
 */
export function dueLongMemoryReads(
  config: LongMemoryConfig,
  state: LongMemoryState,
  health: number,
  healthMax: number
): number[] {
  if (!finite(health) || !finite(healthMax) || healthMax <= 0) return [];
  const taken = new Set(state.reads.map((read) => read.threshold));
  return config.readAtHealthFractions.filter(
    (fraction) => !taken.has(fraction) && health <= healthMax * fraction
  );
}

/* ── THE READ ────────────────────────────────────────────────────────────── */

const pct = (value: number): number => Math.round(value * 100);
const two = (value: number): string => value.toFixed(2);
const signed = (value: number): string => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`;

/** The HUD line for the class he read — his actual numbers, never an example's. */
function readWords(
  cls: OffensiveClass,
  blockBefore: number,
  blockAfter: number,
  dodgeBefore: number,
  dodgeAfter: number
): string {
  const leaned =
    cls === 'power' ? 'power attacks' : 'quick strikes';
  const answer =
    cls === 'power'
      ? 'he sets himself to block'
      : 'he gives ground and lets you swing at the air';
  return (
    `The old man has seen enough of your ${leaned} — ${answer}. ` +
    `Old Craft settles his guard. (Block ${two(blockBefore)} → ${two(blockAfter)}; ` +
    `his dodge share ${pct(dodgeBefore)}% → ${pct(dodgeAfter)}%)`
  );
}

/** The result screen's line for one read, in numbers. */
function readLine(
  config: LongMemoryConfig,
  threshold: number,
  read: LiveMixRead,
  adaptation: Omit<LongMemoryAdaptation, 'line'>
): string {
  // The share printed is the LEADING class's own share, whichever class that is —
  // a balanced read still reports its biggest slice (`read.dominant` is null then).
  const leading: OffensiveClass = read.powerShare > read.quickShare ? 'power' : 'quick';
  const share = leading === 'power' ? read.powerShare : read.quickShare;
  const lean: OffensiveClass = read.dominant ?? leading;
  const mix =
    `At ${pct(threshold)}% HP your blend was ${read.power} power / ${read.quick} quick ` +
    `(${pct(share)}% ${lean})`;
  if (!adaptation.adapted) {
    return (
      `${mix} — nothing to read: neither class was past ` +
      `${pct(config.dominanceThreshold)}%, so he stayed as he was ` +
      `(block ${two(adaptation.blockBefore)}).`
    );
  }
  return (
    `${mix} — he read it: block ${two(adaptation.blockBefore)} → ${two(adaptation.blockAfter)}, ` +
    `his dodge share ${pct(adaptation.dodgeShareBefore)}% → ${pct(adaptation.dodgeShareAfter)}% ` +
    `(of that, Old Craft +${two(adaptation.oldCraft)}).`
  );
}

/**
 * TAKE one read at `threshold`: look at the live mix, and if a class is past the
 * threshold, apply that class's counter-shift plus Old Craft — inside the per-
 * adoption cap and the [min, max] clamp. A balanced mix changes nothing.
 */
export function applyLongMemoryRead(
  config: LongMemoryConfig,
  base: LongMemoryBaseProfile,
  state: LongMemoryState,
  threshold: number
): { state: LongMemoryState; adaptation: LongMemoryAdaptation } {
  const read = readOffensiveMix(state, config);
  const blockBefore = longMemoryBlockChance(config, base, state);
  const dodgeShareBefore = dodgeShareOf(blockBefore);

  let blockAfter = blockBefore;
  let oldCraft = 0;
  if (read.dominant) {
    const wanted =
      config.blockChanceDelta[read.dominant] + config.oldCraftBlockChancePerAdoption;
    const applied = clampMagnitude(wanted, config.maxDeltaPerAdoption);
    blockAfter = round6(clampRange(blockBefore + applied, config.clamp.min, config.clamp.max));
    oldCraft = config.oldCraftBlockChancePerAdoption;
  }
  const dodgeShareAfter = dodgeShareOf(blockAfter);

  const partial: Omit<LongMemoryAdaptation, 'line'> = {
    threshold,
    adapted: read.dominant,
    quick: read.quick,
    power: read.power,
    total: read.total,
    quickShare: read.quickShare,
    powerShare: read.powerShare,
    blockBefore,
    blockAfter,
    dodgeShareBefore,
    dodgeShareAfter,
    oldCraft,
    words: read.dominant
      ? readWords(read.dominant, blockBefore, blockAfter, dodgeShareBefore, dodgeShareAfter)
      : '',
  };
  const adaptation: LongMemoryAdaptation = {
    ...partial,
    line: readLine(config, threshold, read, partial),
  };
  return { state: { ...state, reads: [...state.reads, adaptation] }, adaptation };
}

/* ── WHAT THE SCREENS SAY ────────────────────────────────────────────────── */

/**
 * The result screen's lines, computed in memory from this duel's own state: one
 * line per read (in numbers), then, when he read you at all, the guard he ends
 * the bout holding. Empty when no threshold was reached — there is nothing to
 * explain.
 */
export function longMemoryResultLines(
  config: LongMemoryConfig,
  base: LongMemoryBaseProfile,
  state: LongMemoryState
): string[] {
  if (state.reads.length === 0) return [];
  const lines = state.reads.map((read) => read.line);
  const profile = longMemoryProfile(config, base, state);
  const adopted = state.reads.filter((read) => read.adapted !== null).length;
  lines.push(
    adopted === 0
      ? `He read you ${state.reads.length === 1 ? 'once' : 'twice'} and found nothing to answer — ` +
          `his block stays at ${two(profile.blockChance)}.`
      : `He adopted ${adopted} counter-shift${adopted === 1 ? '' : 's'} — his block ends the bout ` +
          `at ${two(profile.blockChance)} (base ${two(base.blockChance)}), his dodge share at ` +
          `${pct(profile.dodgeShare)}%.`
  );
  return lines;
}

/**
 * The tavern's deep card, built from the row so no figure is restated in a
 * component. It prints his BASE values and states, as the one honest unknown,
 * that whether he adapts at all depends on the player's own mix.
 */
export function longMemoryIntelLine(
  config: LongMemoryConfig | null | undefined,
  base: LongMemoryBaseProfile
): string {
  if (!config) return '';
  const thresholds = config.readAtHealthFractions.map((f) => `${pct(f)}%`).join(' and ');
  return (
    `Base block ${two(base.blockChance)}, aggression ${two(base.aggression)}, dodge share ` +
    `${pct(dodgeShareOf(base.blockChance))}% · he reads your mix at ${thresholds} HP and answers ` +
    `only a class you lean on past ${pct(config.dominanceThreshold)}% · power read ` +
    `${signed(config.blockChanceDelta.power)} block, quick read ` +
    `${signed(config.blockChanceDelta.quick)} block, Old Craft ` +
    `${signed(config.oldCraftBlockChancePerAdoption)} with each (cap ±` +
    `${config.maxDeltaPerAdoption.toFixed(2)} per adoption) · UNKNOWN: whether he reads you at ` +
    `all — that depends on your own mix`
  );
}
