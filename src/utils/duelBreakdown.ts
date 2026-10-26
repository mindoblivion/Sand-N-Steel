/**
 * ===========================================================================
 * SAND & STEEL — "WHY YOU FELL" (Phase C-8.70C, Slice C-D)
 * ===========================================================================
 * A defeat's short, factual breakdown, computed from the finished duel's own
 * in-memory combat log at result time. Nothing here is persisted, and nothing
 * here is a new game rule: it only reads events the engine already resolved.
 *
 * THE "MOST-USED" DEFINITION IS THIS ONE. Addendum C asks the player's
 * most-used action to read the same dominant-class computation a live mix
 * counter uses. Slice C-A's `dominantClassOfMix` / `DuelStatistics` field is not
 * in this repository's history (a repo-wide search finds no `dominantClass`,
 * no action-mix counter and no such statistics field on this branch), so this
 * module defines it ONCE — `countActionMix` + `dominantClassOfMix` — and
 * `DuelScene` feeds both the live duel and the result screen through it. If C-A
 * lands, replace these two functions with C-A's rather than adding a second.
 *
 * Plain language, three lines maximum, no blame formatting (see the staged
 * prompt, item 5).
 */
import { BossMechanic } from '../types/game';
import { BOSS_MECHANIC_LABELS } from '../data/bossPhases';

/** One action a fighter took in a turn that resolved something. */
export type DuelActionClass =
  | 'quick_attack'
  | 'power_attack'
  /** Goliath's resolved telegraphed overhead smash. */
  | 'heavy_slam'
  /** Valéria's queued answering counter. */
  | 'counter'
  | 'shield_block'
  | 'dodge'
  | 'taunt'
  | 'rest'
  | 'advance'
  | 'retreat';

export type DuelActionOutcome =
  | 'landed'
  | 'blocked'
  | 'evaded'
  | 'missed'
  | 'out_of_range'
  /** Non-attack actions, which cannot miss or land. */
  | 'none';

/** One resolved combat event, as `DuelScene` records it. */
export interface DuelCombatEvent {
  actor: 'player' | 'opponent';
  action: DuelActionClass;
  outcome: DuelActionOutcome;
  /** Damage that actually came off the defender's HP (0 when nothing landed). */
  damage: number;
  /** Seconds into the duel when the action resolved. */
  atSeconds: number;
  /** The boss mechanic that produced this action, when one did. */
  mechanic?: BossMechanic;
}

/** How many times an actor used each action class. */
export type ActionMix = Partial<Record<DuelActionClass, number>>;

/**
 * Tie-break order for the dominant class. Earlier wins, so a tie between two
 * actions always names the same one for the same log.
 */
export const ACTION_CLASS_ORDER: DuelActionClass[] = [
  'quick_attack',
  'power_attack',
  'heavy_slam',
  'counter',
  'shield_block',
  'dodge',
  'taunt',
  'rest',
  'advance',
  'retreat',
];

/** At most three lines, per the staged prompt. */
export const WHY_YOU_FELL_MAX_LINES = 3;

/** Below this crowd peak the arena never warmed to the player. */
export const CROWD_NEVER_WARMED_PEAK = 50;

/** Count one actor's actions by class. */
export function countActionMix(
  events: readonly DuelCombatEvent[],
  actor: DuelCombatEvent['actor'],
): ActionMix {
  const mix: ActionMix = {};
  for (const event of events) {
    if (event.actor !== actor) continue;
    mix[event.action] = (mix[event.action] ?? 0) + 1;
  }
  return mix;
}

/**
 * The action class an actor used most — the single definition of "most-used".
 * Returns `null` for an empty mix. Ties resolve by `ACTION_CLASS_ORDER`.
 */
export function dominantClassOfMix(mix: ActionMix): DuelActionClass | null {
  let best: DuelActionClass | null = null;
  let bestCount = 0;
  for (const action of ACTION_CLASS_ORDER) {
    const count = mix[action] ?? 0;
    if (count > bestCount) {
      best = action;
      bestCount = count;
    }
  }
  return best;
}

/** `m:ss`, matching the duel's own clock. */
export function formatDuelClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, '0')}`;
}

const OPPONENT_CLASS_LABELS: Partial<Record<DuelActionClass, string>> = {
  quick_attack: 'quick strike',
  power_attack: 'power strike',
  heavy_slam: 'heavy slam',
  counter: 'counter',
};

const PLAYER_CLASS_LABELS: Partial<Record<DuelActionClass, string>> = {
  quick_attack: 'quick attacks',
  power_attack: 'power attacks',
  shield_block: 'shield blocks',
  dodge: 'dodges',
  taunt: 'taunts',
  rest: 'rests',
  advance: 'advances',
  retreat: 'retreats',
};

export interface WhyYouFellInput {
  opponentName: string;
  isBoss: boolean;
  events: readonly DuelCombatEvent[];
  /** Highest crowd hype the duel reached. */
  crowdPeak: number;
  /**
   * When the crowd turned against the player, if it ever did. The engine only
   * reports a turn when hype actually fell; a duel that never sees a fall
   * passes `null` and the line is replaced by the cold-crowd reading below.
   */
  crowdTurnedAtSeconds: number | null;
}

const plural = (count: number): string => (count === 1 ? 'time' : 'times');

/**
 * The defeat breakdown: up to three plain lines, in this order of importance —
 * the opponent's heaviest action class (with the signature mechanic folded in
 * when it is the same class), any other boss mechanic that landed, the crowd,
 * and the player's own most-used action. Returns `[]` for an empty log.
 */
export function buildWhyYouFell(input: WhyYouFellInput): string[] {
  const lines: string[] = [];
  const events = input.events;
  // Nothing resolved means nothing to explain.
  if (events.length === 0) return lines;

  // 1. The opponent's highest-damage action class, and its total.
  const damageByClass: Partial<Record<DuelActionClass, { damage: number; blows: number }>> = {};
  for (const event of events) {
    if (event.actor !== 'opponent' || event.damage <= 0) continue;
    const entry = damageByClass[event.action] ?? { damage: 0, blows: 0 };
    entry.damage += event.damage;
    entry.blows += 1;
    damageByClass[event.action] = entry;
  }
  let topClass: DuelActionClass | null = null;
  let topDamage = 0;
  for (const action of ACTION_CLASS_ORDER) {
    const entry = damageByClass[action];
    if (entry && entry.damage > topDamage) {
      topClass = action;
      topDamage = entry.damage;
    }
  }

  // 2. The boss mechanic that landed most often.
  const mechanicCounts: Partial<Record<BossMechanic, number>> = {};
  for (const event of events) {
    if (event.actor !== 'opponent' || !event.mechanic || event.outcome !== 'landed') continue;
    mechanicCounts[event.mechanic] = (mechanicCounts[event.mechanic] ?? 0) + 1;
  }
  let topMechanic: BossMechanic | null = null;
  let topMechanicCount = 0;
  for (const mechanic of Object.keys(mechanicCounts) as BossMechanic[]) {
    const count = mechanicCounts[mechanic] ?? 0;
    if (count > topMechanicCount) {
      topMechanic = mechanic;
      topMechanicCount = count;
    }
  }

  const heavyIsTop = topClass === 'heavy_slam';
  if (topClass) {
    const label = OPPONENT_CLASS_LABELS[topClass] ?? 'blow';
    const blows = damageByClass[topClass]?.blows ?? 0;
    // The signature heavy is folded into the damage line when it IS the top
    // class, so the three-line budget still has room for the player's own mix.
    lines.push(
      heavyIsTop
        ? `${input.opponentName}'s ${label} dealt ${topDamage} of the damage (${blows} ${plural(blows)}).`
        : `${input.opponentName}'s ${label} dealt ${topDamage} of the damage.`,
    );
  }

  if (input.isBoss && topMechanic && !(heavyIsTop && topMechanic === 'heavy_telegraph')) {
    const label = BOSS_MECHANIC_LABELS[topMechanic];
    lines.push(`${input.opponentName}'s ${label} landed ${topMechanicCount} ${plural(topMechanicCount)}.`);
  }

  // 3. Whether the crowd turned.
  if (input.crowdTurnedAtSeconds !== null && Number.isFinite(input.crowdTurnedAtSeconds)) {
    lines.push(`The crowd turned cold at ${formatDuelClock(input.crowdTurnedAtSeconds)}.`);
  } else if (Number.isFinite(input.crowdPeak) && input.crowdPeak < CROWD_NEVER_WARMED_PEAK) {
    lines.push(`The crowd never warmed (peak ${Math.round(input.crowdPeak)}%).`);
  }

  // 4. The player's most-used action, from the one mix computation.
  const playerMix = countActionMix(events, 'player');
  const playerClass = dominantClassOfMix(playerMix);
  if (playerClass) {
    const label = PLAYER_CLASS_LABELS[playerClass] ?? 'attacks';
    const used = playerMix[playerClass] ?? 0;
    const blocked = events.filter(
      (event) => event.actor === 'player' && event.action === playerClass && event.outcome === 'blocked',
    ).length;
    lines.push(
      blocked > 0
        ? `Your ${label} met his block ${blocked} ${plural(blocked)}.`
        : `Your ${label} were your most-used action (${used} ${plural(used)}).`,
    );
  }

  return lines.slice(0, WHY_YOU_FELL_MAX_LINES);
}
