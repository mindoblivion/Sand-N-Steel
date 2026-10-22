/**
 * Tier integrity — when a victory may open the next tournament tier, and which
 * opponent the city's duel doors may offer.
 *
 * The arena is organised in four tiers, each ending in its own boss
 * (`data/opponents.ts`): Goliath in Tier 1, Ignis in Tier 2, Valéria in Tier 3
 * and Aurelius in Tier 4. The tier is the campaign's spine — `utils/rank.ts` and
 * `utils/storyState.ts` derive every rank and every tier-keyed gate from
 * `profile.currentTier` — so the rule that moves it has to mean something:
 *
 *   • **A tier advances only on a boss's FIRST defeat.** The evidence is the
 *     boss's own id newly entering `defeatedOpponentIds` in that same write. A
 *     rematch is a fight like any other — it pays its rewards and counts as a
 *     win — but the boss is already in the book, so nothing new was proven and
 *     the tier does not move. Without this, one boss could be farmed to climb
 *     tiers whose champions were never faced, and every tier-keyed gate that
 *     reads `currentTier` would lie.
 *   • **The city's duel doors resolve their ticket at the door.** A door offers
 *     the current tier's first UNDEFEATED boss — the boss the tournament tab
 *     presents as the next one to beat — and never a stored `activeOpponent`
 *     that may belong to a tier the player already left. Rematches stay where
 *     they belong: the tab, which lists every fighter and is always one walk
 *     away.
 *   • **A tier with every boss down falls back to that tier's boss rematch.**
 *     That is the standing state at the top tier once Aurelius has fallen (the
 *     tier cannot go past 4), and it can also be a legacy save that arrived
 *     mid-tier. The door keeps working as a door; the rematch is inert on the
 *     tier because the boss is already recorded.
 *   • **The tab also lists earlier divisions' beaten fighters as rematches.**
 *     `listTournamentBouts` answers the current division in full plus every
 *     earlier-division fighter already in `defeatedOpponentIds`. They are fights
 *     like any other — same rewards, same level gate — and they exist so the top
 *     tier can never strand a gladiator whose only current bout is level-locked.
 *
 * Everything here is a pure function of the roster and the record it is handed:
 * no profile write, no storage, no clock.
 */

import { ALL_OPPONENTS } from '../data/opponents';
import type { OpponentConfig } from '../types/game';

/** The highest tier the tournament has; a first defeat at it moves nothing. */
export const FINAL_TIER = 4;

/** The two fields of an opponent this rule reads — a roster entry satisfies it. */
export interface TierOpponent {
  id: string;
  isBoss?: boolean;
}

export interface VictoryTierInput {
  /** The save's `currentTier` before the victory is written. */
  currentTier: number;
  /** The opponent that was beaten. */
  opponent: TierOpponent | null | undefined;
  /** The save's `defeatedOpponentIds` BEFORE this victory is written. */
  defeatedOpponentIds?: readonly unknown[] | null;
}

export interface VictoryTierResult {
  /** The tier to write — unchanged unless a first defeat advanced it. */
  currentTier: number;
  /** True only when this victory is the boss's first defeat (its id newly entering the book). */
  firstDefeat: boolean;
  /** True only when that first defeat also advanced the tier. */
  advanced: boolean;
}

export interface BoutLevelGate {
  /** True when the player may not start this bout yet. */
  locked: boolean;
  /** The level the bout asks for (the roster's `recommendedLevel`, read safely). */
  requiredLevel: number;
}

export interface DoorDuelTarget {
  /** The opponent the door must start; never a stored selection. */
  opponent: OpponentConfig;
  /** True when the tier has no undefeated boss left and the door offers the rematch. */
  rematch: boolean;
}

/** The stored ids, dropped unless they are really ids (strings). */
function readDefeatedIds(ids: readonly unknown[] | null | undefined): string[] {
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** A missing or malformed tier reads as the first tier, never as NaN. */
function readTier(tier: number): number {
  if (typeof tier !== 'number' || !Number.isFinite(tier) || tier < 1) return 1;
  return Math.floor(tier);
}

/** Every boss of a tier, in the order the tournament tab lists them. */
function tierBosses(tier: number): OpponentConfig[] {
  return ALL_OPPONENTS.filter(
    (opponent) => opponent.tier === tier && opponent.isBoss === true
  ).sort((a, b) => a.fightIndex - b.fightIndex);
}

/** Every fighter of a tier, in the roster's `fightIndex` order. */
function tierFighters(tier: number): OpponentConfig[] {
  return ALL_OPPONENTS.filter((opponent) => opponent.tier === tier).sort(
    (a, b) => a.fightIndex - b.fightIndex
  );
}

/**
 * The tier after a won duel.
 *
 * `defeatedOpponentIds` is the record as it stood BEFORE the win, so "first
 * defeat" is exactly "the boss's id is not in the book yet" — the same test the
 * win path uses to decide whether the id has to be appended at all.
 */
export function resolveVictoryTier(input: VictoryTierInput): VictoryTierResult {
  const tier = readTier(input.currentTier);
  const opponent = input.opponent;
  const id = opponent && typeof opponent.id === 'string' ? opponent.id : '';
  const firstDefeat =
    id !== '' &&
    opponent?.isBoss === true &&
    !readDefeatedIds(input.defeatedOpponentIds).includes(id);
  const advanced = firstDefeat && tier < FINAL_TIER;

  return { currentTier: advanced ? tier + 1 : tier, firstDefeat, advanced };
}

/**
 * The tournament's level gate for ONE bout — the single rule both the Colosseum
 * tab and the city's duel doors read, so a door can never open a fight its own
 * tab would lock.
 *
 * A bout is locked while the player is below the fighter's recommended level AND
 * that fighter has never been beaten: an opponent already in the book has been
 * faced, so the recommended level is advice rather than a gate, and a rematch is
 * always offered. Pure: no save, no storage, no clock.
 *
 * A bout whose gate cannot be evaluated at all (no fighter, or no id to check the
 * book against) is reported LOCKED, because a fight nothing can vouch for must not
 * start.
 */
export function resolveBoutLevelGate(
  level: number,
  opponent: (TierOpponent & { recommendedLevel?: number }) | null | undefined,
  defeatedOpponentIds?: readonly unknown[] | null
): BoutLevelGate {
  if (!opponent || typeof opponent.id !== 'string') {
    return { locked: true, requiredLevel: 1 };
  }
  const requiredLevel =
    typeof opponent.recommendedLevel === 'number' &&
    Number.isFinite(opponent.recommendedLevel) &&
    opponent.recommendedLevel >= 1
      ? Math.floor(opponent.recommendedLevel)
      : 1;
  const alreadyBeaten = readDefeatedIds(defeatedOpponentIds).includes(opponent.id);
  const locked = readTier(level) < requiredLevel && !alreadyBeaten;
  return { locked, requiredLevel };
}

/**
 * The opponent a city duel door may start, resolved when the player interacts.
 *
 * The tier's first undefeated boss is the legal ticket. When every boss of the
 * tier is already down, the door falls back to that tier's last boss as a
 * rematch (`rematch: true`) — the duel is still offered, and the tier rule above
 * makes it inert because the boss is already recorded. A tier with no boss in the
 * shipped roster answers `null`, and the caller opens the tab instead.
 */
export function resolveDoorDuelTarget(
  tier: number,
  defeatedOpponentIds?: readonly unknown[] | null
): DoorDuelTarget | null {
  const bosses = tierBosses(readTier(tier));
  const defeated = readDefeatedIds(defeatedOpponentIds);

  const undefeated = bosses.find((boss) => !defeated.includes(boss.id));
  if (undefeated) return { opponent: undefeated, rematch: false };

  const fallen = bosses[bosses.length - 1];
  return fallen ? { opponent: fallen, rematch: true } : null;
}

/** One entry of the tournament list: the roster entry and why it is offered. */
export interface TournamentBout {
  /** The roster's own entry — never a copy, so the card and the duel see the same fighter. */
  opponent: OpponentConfig;
  /** True only for an earlier division's fighter the profile has already beaten. */
  rematch: boolean;
}

export interface TournamentBoutList {
  /** The current division's fighters, in the roster's `fightIndex` order. */
  currentTier: TournamentBout[];
  /** Already-beaten fighters of EARLIER divisions — division, then `fightIndex`, order. */
  rematches: TournamentBout[];
}

/**
 * The fighters the tournament tab lists: the current division in full, plus — as
 * rematches — the earlier divisions' fighters the profile has actually beaten.
 *
 * This is a LIST, not an eligibility rule: it decides only WHAT is shown, and the
 * shared `resolveBoutLevelGate` above stays the single rule for whether a bout may
 * start, exactly as it is for the current division. Because every entry is a
 * roster fighter and rematches are filtered by the record itself, an unbeaten
 * earlier-division opponent is never exposed and a defeated one is never missing.
 *
 * Earlier divisions exist to keep the arena reachable: at the top tier the only
 * current-division bout can be level-locked, and without an XP source the player
 * would be stranded. Rematch rewards are unchanged — they are the same fight.
 *
 * Total on read: an unknown id in the record matches nothing, a duplicate cannot
 * appear twice (the roster is the source), and a malformed tier reads as the first.
 */
export function listTournamentBouts(
  currentTier: number,
  defeatedOpponentIds?: readonly unknown[] | null
): TournamentBoutList {
  const tier = readTier(currentTier);
  const defeated = readDefeatedIds(defeatedOpponentIds);

  return {
    currentTier: tierFighters(tier).map((opponent) => ({ opponent, rematch: false })),
    rematches: ALL_OPPONENTS.filter(
      (opponent) => opponent.tier < tier && defeated.includes(opponent.id)
    )
      .sort((a, b) => a.tier - b.tier || a.fightIndex - b.fightIndex)
      .map((opponent) => ({ opponent, rematch: true })),
  };
}
