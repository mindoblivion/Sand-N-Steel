/**
 * ===========================================================================
 * C-8.70C — Slice C-D: "WHY YOU FELL"
 * ===========================================================================
 * On a DEFEAT the result screen gains a short, factual breakdown of how the
 * fight went — at most three plain-language lines, computed from the finished
 * duel's own in-memory tallies. No saves, no blame formatting, no advice: it
 * reports numbers the duel already counts.
 *
 * ── THE PLAYER'S OWN MIX IS READ, NOT RE-COMPUTED (Director addendum C) ───
 * "Most used action" comes from the EXISTING `dominantClassOfMix` — D-5's live
 * offensive-mix counter as Slice C-A widened it into
 * `DuelStatistics.dominantOffensiveClass` (the 0.60 dominance line). This module
 * builds no second counter and no second breakdown: the duel hands over the
 * counter it already keeps for every bout, and the answer is that module's.
 *
 * ── WHAT IT REPORTS, IN THIS ORDER ─────────────────────────────────────────
 *   1. the opponent's highest-damage action class and its total — plus, in a
 *      boss fight, the signature mechanic that landed most often
 *      ("Goliath's heavy attacks dealt 214 damage — his overhead slam landed 3
 *      times.");
 *   2. whether the crowd turned, and when it did ("The crowd turned cold at
 *      0:41." / "The crowd stayed with you.");
 *   3. the player's own most-used action, from the shared mix reading.
 *
 * Victory results are untouched: this module is only called on a defeat.
 *
 * Everything here is pure — no React, no storage, no clock, no randomness.
 */
import { dominantClassOfMix } from './grudgeBouts';
import type { LiveMixCounter } from './longMemory';

/** The opponent's damage, split by the class of the action that dealt it. */
export interface DamageByClass {
  quick: number;
  power: number;
}

/** The boss's signature mechanic and how often it actually landed. */
export interface MechanicTally {
  /** The possessive the boss's own name needs ("His" / "Her"). */
  owner: 'His' | 'Her';
  /** The mechanic as a player would say it ("overhead slam", "counter"). */
  mechanic: string;
  /** Resolutions of that mechanic that landed. 0 = never mention it. */
  landings: number;
}

export interface WhyYouFellInput {
  /** The opponent's display name, as the duel already prints it. */
  opponentName: string;
  /** Bosses report their signature mechanic; everyone else reports damage only. */
  mechanic?: MechanicTally | null;
  /** The damage the opponent landed, by the class of the action that dealt it. */
  damageByClass: DamageByClass;
  /** The crowd's one-shot verdict, and the second of the fight it latched at. */
  crowdTurned: boolean;
  crowdTurnedAtSeconds?: number;
  /** D-5's live counter — the player's own offensive mix over the bout. */
  playerMix: LiveMixCounter | null | undefined;
}

/** mm:ss for the clock the result screen already prints, e.g. 41 → "0:41". */
export function whyYouFellClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`;
}

const count = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

/**
 * The breakdown, in at most three lines. An unknown or malformed input never
 * throws: a missing tally simply contributes no line.
 */
export function whyYouFellLines(input: WhyYouFellInput): string[] {
  const lines: string[] = [];
  const name = (input.opponentName || 'Your opponent').trim();
  const quick = count(input.damageByClass?.quick ?? 0);
  const power = count(input.damageByClass?.power ?? 0);
  const total = quick + power;

  // 1. the heaviest class of blow, and (bosses) the mechanic behind it
  // The amount is that class's own damage, not the bout total.
  if (total > 0) {
    const words =
      quick === power ? 'attacks' : power > quick ? 'heavy attacks' : 'quick attacks';
    const amount = quick === power ? total : Math.max(quick, power);
    let line = `${name}'s ${words} dealt ${amount} damage`;
    const tally = input.mechanic;
    const landings = count(tally?.landings ?? 0);
    if (tally && landings > 0) {
      const mechanic = (tally.mechanic || '').trim();
      if (mechanic) {
        line += ` — ${tally.owner.toLowerCase()} ${mechanic} landed ${landings} ${
          landings === 1 ? 'time' : 'times'
        }`;
      }
    }
    lines.push(`${line}.`);
  }

  // 2. whether the crowd turned
  lines.push(
    input.crowdTurned
      ? `The crowd turned cold at ${whyYouFellClock(input.crowdTurnedAtSeconds ?? 0)}.`
      : 'The crowd stayed with you.',
  );

  // 3. the player's most-used action — the SHARED mix reading, never a new count
  const dominant = dominantClassOfMix(input.playerMix);
  lines.push(
    dominant === 'power'
      ? 'You built your fight on heavy attacks.'
      : dominant === 'quick'
        ? 'You built your fight on quick strikes.'
        : 'Your attacks stayed an even mix.',
  );

  return lines.slice(0, 3);
}
