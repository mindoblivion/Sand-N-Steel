/**
 * FIRST SIXTY SECONDS — THE HERALD'S POINTER (ideas-retention.md §5, retention
 * build-order step 4: CORE ONLY).
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * ONE pure rules table over LIVE profile + records state. It answers, at most,
 * one pointer: `{ line, targetLocationId }`. It is SEQUENCING ONLY — it reads
 * what the retention systems already built (A8's Triumphs catalogue, the tier
 * ladder, A5's Codex) and prints one line about the nearest open one. It never
 * evaluates a triumph, never awards anything, never draws a deed, never writes a
 * profile and never reads a clock.
 *
 * ── THE PRIORITY (the design's table, top to bottom) ───────────────────────
 *   (a) a COUNT triumph exactly 1 step from done (see R-STEP below);
 *   (b) the next UNDEFEATED ladder boss, in tier order
 *       (Goliath → Ignis → Valeria → Aurelius; Feature Bouts are excluded — they
 *       are not the campaign path);
 *   (c) a Codex gap: 'N gladiators in the Codex remain unfaced'.
 * Nothing live → `null`, and the city prints nothing at all.
 *
 * ── First Sixty Seconds — Director ruling R-STEP ───────────────────────────
 * "1 step from done" counts ONLY for integer count-based triumphs whose current
 * value is exactly `threshold - 1`. The table below is the enumeration for the
 * SHIPPED catalogue (A8's rows, in catalogue order):
 *   • `fightsWon`           1 / 10 / 50 / 100  (the four Sand victory rows);
 *   • `bossKills`           the ladder's own boss count (Sand's "every champion");
 *   • `chariotSlotsFilled`  5 (Coin's "five slots filled" — a count, not a peak);
 *   • `currentTier`         2 / 3 / 4 (the three tier-circuit rows);
 *   • `rank`                one rank step below Veteran / Champion / Legend;
 *   • the shared Laudes total  7 / 30 / 100 (`records.laudes`, read through
 *                        `resolveLaudes` — the Acta's third deed is what pays it);
 *   • `favour`              7 / 30 / 100 (the Ludi persistent total).
 * EXCLUDED from 1-step, deliberately and by the ruling: every PEAK row
 * (`coin_1000_gold`, `coin_5000_gold`, `coin_25000_gold` — a peak is not "1
 * away"), every TRANSIENT row (`sand_missio_denied`, `sand_crowd_chants` — they
 * have no reading outside a result screen), every BOOLEAN/ownership row
 * (`coin_quadra`, the four Steel rows, `saga_tier_four`'s felled-id test) and the
 * Codex capstone (its condition is the whole derivation `isCodexComplete`, which
 * is not a count — the Gladiators gap is pointer source (c) instead).
 *
 * ── First Sixty Seconds — Director ruling R-SKIP ───────────────────────────
 * The Grand Deed and the selected-goal pointer sources are SKIPPED, not faked: no
 * Grand Deed tracking exists (Ludi Phase B), no goal-selection system exists, and
 * there are no gameplay modifiers. §5-core NEVER prints a line for a system that
 * does not exist, and the table simply falls through to the next live source.
 *
 * ── THE LOCATION MAPPING (every id is a real `HUB_LOCATIONS` id) ───────────
 * A pointer names a place the city already has, so the scene draws its marker on
 * that location's own disc (see `CityHubScene`) and an id the registry does not
 * know renders no marker rather than a broken one.
 *   • 'colosseum'      — the tournament arena: the sand pays `fightsWon`,
 *                        `bossKills`, `currentTier` and `rank`, and the ladder is
 *                        fought there. Both the (a) combat-counter rows and the
 *                        whole (b) boss pointer aim here.
 *   • 'stable'         — the Imperial Stable & Chariot Workshop: the one place a
 *                        chariot slot is filled (`coin_full_chariot`).
 *   • 'bounty_hall'    — the Bounty Hall posts the Acta's own deeds
 *                        (`BountyBoardPanel` renders `ActaDeeds`), and a full Acta
 *                        is what pays a Laurel, so the `laurels` rows aim there.
 *   • 'shrine_temple'  — the Shrine of Fortuna, whose alms pay Favour daily, so the
 *                        `favour` rows aim there.
 *   • 'records_house'  — the Records & Lore Library, where the Codex is read, so
 *                        source (c) aims there.
 *
 * PURE AND TOTAL: no storage, no save, no profile write, no clock, no randomness,
 * no React. A malformed save reads as "nothing live" through the resolvers it
 * borrows (`resolveTriumphFacts`, `resolveRecords`, `buildCodex`) rather than
 * through a repair of its own.
 */
import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, isLadderBoss } from '../data/opponents';
import { RANK_INDEX, type GladiatorRank } from './rank';
import { CODEX_GLADIATOR_ROWS, buildCodex } from './codex';
import { getTriumphEntry, resolveRecords, resolveTriumphFacts } from './triumphs';
import { resolveLaudes } from './diceTrail';

/** Which live source the one pointer came from. */
export type HeraldPointerKind = 'triumph' | 'boss' | 'codex';

/** The one line the herald gets, and the place its marker is drawn on. */
export interface HeraldPointer {
  kind: HeraldPointerKind;
  /** The whole line — the herald prints ONE of these, never two. */
  line: string;
  /** A real `HUB_LOCATIONS` id. The marker's target id is exactly this. */
  targetLocationId: string;
}

/* ── The 1-step table (R-STEP) ────────────────────────────────────────────── */

/** The integer counters a count triumph is measured on. */
export type CountFact =
  | 'fightsWon'
  | 'bossKills'
  | 'chariotSlotsFilled'
  | 'currentTier'
  | 'laudes'
  | 'favour';

/** How one row is measured: an integer count, or a rank step. */
export type OneStepThreshold =
  /** `value === threshold - 1`. `'ladderBossCount'` reads the roster's own count. */
  | { kind: 'count'; fact: CountFact; threshold: number | 'ladderBossCount' }
  /** The rank ONE step below `at` (a rank is an ordinal counter, not a peak). */
  | { kind: 'rank'; at: GladiatorRank };

/** One catalogue row the 1-step rule can speak about, and where it is worked on. */
export interface OneStepRow {
  /** The A8 catalogue id — the row's name comes from the catalogue, never a copy. */
  id: string;
  threshold: OneStepThreshold;
  targetLocationId: string;
}

/**
 * THE ENUMERATION (R-STEP), in A8's own catalogue order so the answer is
 * deterministic when two rows are both one step away.
 */
export const ONE_STEP_TRIUMPHS: readonly OneStepRow[] = [
  // Sand — the arena's own integer counters.
  { id: 'sand_first_blood', threshold: { kind: 'count', fact: 'fightsWon', threshold: 1 }, targetLocationId: 'colosseum' },
  { id: 'sand_ten_victories', threshold: { kind: 'count', fact: 'fightsWon', threshold: 10 }, targetLocationId: 'colosseum' },
  { id: 'sand_fifty_victories', threshold: { kind: 'count', fact: 'fightsWon', threshold: 50 }, targetLocationId: 'colosseum' },
  { id: 'sand_hundred_victories', threshold: { kind: 'count', fact: 'fightsWon', threshold: 100 }, targetLocationId: 'colosseum' },
  { id: 'sand_every_boss', threshold: { kind: 'count', fact: 'bossKills', threshold: 'ladderBossCount' }, targetLocationId: 'colosseum' },
  // Coin — the one row that counts slots rather than gold.
  { id: 'coin_full_chariot', threshold: { kind: 'count', fact: 'chariotSlotsFilled', threshold: 5 }, targetLocationId: 'stable' },
  // Saga — the circuits, the ranks, the Acta's two currencies.
  { id: 'saga_tier_one', threshold: { kind: 'count', fact: 'currentTier', threshold: 2 }, targetLocationId: 'colosseum' },
  { id: 'saga_tier_two', threshold: { kind: 'count', fact: 'currentTier', threshold: 3 }, targetLocationId: 'colosseum' },
  { id: 'saga_tier_three', threshold: { kind: 'count', fact: 'currentTier', threshold: 4 }, targetLocationId: 'colosseum' },
  { id: 'saga_veteran', threshold: { kind: 'rank', at: 'Veteran' }, targetLocationId: 'colosseum' },
  { id: 'saga_champion', threshold: { kind: 'rank', at: 'Champion' }, targetLocationId: 'colosseum' },
  { id: 'saga_legend', threshold: { kind: 'rank', at: 'Legend' }, targetLocationId: 'colosseum' },
  { id: 'saga_laurel_7', threshold: { kind: 'count', fact: 'laudes', threshold: 7 }, targetLocationId: 'bounty_hall' },
  { id: 'saga_laurel_30', threshold: { kind: 'count', fact: 'laudes', threshold: 30 }, targetLocationId: 'bounty_hall' },
  { id: 'saga_laurel_100', threshold: { kind: 'count', fact: 'laudes', threshold: 100 }, targetLocationId: 'bounty_hall' },
  { id: 'saga_favour_7', threshold: { kind: 'count', fact: 'favour', threshold: 7 }, targetLocationId: 'shrine_temple' },
  { id: 'saga_favour_30', threshold: { kind: 'count', fact: 'favour', threshold: 30 }, targetLocationId: 'shrine_temple' },
  { id: 'saga_favour_100', threshold: { kind: 'count', fact: 'favour', threshold: 100 }, targetLocationId: 'shrine_temple' },
];

/** One triumph that is exactly one step from done, with the reading that says so. */
export interface OneStepTriumph {
  row: OneStepRow;
  /** The catalogue's own name — read from A8, never restated here. */
  name: string;
  /** What the counter reads now. */
  value: number;
  /** What it must reach. */
  threshold: number;
}

/**
 * One integer count, read off the facts A8 resolves.
 *
 * The Laudes total is read through its own shared counter (`resolveLaudes`, the reader
 * `records.laudes` already has) rather than restated: P2's naming law keeps the palma's
 * word out of every new module, and this slice must not become a second reader of it.
 */
function countOf(
  profile: PlayerProfile,
  facts: ReturnType<typeof resolveTriumphFacts>,
  fact: CountFact,
): number {
  switch (fact) {
    case 'fightsWon':
      return facts.fightsWon;
    case 'bossKills':
      return facts.bossKills;
    case 'chariotSlotsFilled':
      return facts.chariotSlotsFilled;
    case 'currentTier':
      return facts.currentTier;
    case 'laudes':
      return resolveLaudes(profile);
    case 'favour':
      return facts.favour;
  }
}

/**
 * Every shipped triumph a single step from done, in catalogue order. `earned` ids
 * are skipped: a triumph already in `records.earnedTriumphs` is not "1 away" from
 * anything.
 */
export function oneStepTriumphs(profile: PlayerProfile | null | undefined): OneStepTriumph[] {
  if (!profile) return [];
  const facts = resolveTriumphFacts(profile);
  const earned = new Set(resolveRecords(profile).earnedTriumphs);
  const out: OneStepTriumph[] = [];
  for (const row of ONE_STEP_TRIUMPHS) {
    const entry = getTriumphEntry(row.id);
    if (!entry || earned.has(row.id)) continue;
    if (row.threshold.kind === 'rank') {
      const target = RANK_INDEX[row.threshold.at];
      const value = RANK_INDEX[facts.rank];
      if (value === target - 1) out.push({ row, name: entry.name, value, threshold: target });
      continue;
    }
    const threshold =
      row.threshold.threshold === 'ladderBossCount'
        ? facts.ladderBossCount
        : row.threshold.threshold;
    const value = countOf(profile, facts, row.threshold.fact);
    if (value === threshold - 1) out.push({ row, name: entry.name, value, threshold });
  }
  return out;
}

/* ── (b) the ladder ───────────────────────────────────────────────────────── */

/**
 * THE LADDER, IN TIER ORDER — Goliath (T1) → Ignis (T2) → Valeria (T3) →
 * Aurelius (T4).
 *
 * Read from the roster (`isLadderBoss`, then tier, then fight order) rather than
 * written out as ids, so a roster change moves the pointer with it. A Feature
 * Bout is excluded by `isLadderBoss` itself: it is a boss but not a rung, and it
 * is not the campaign path — so the pointer can never name one.
 */
export const LADDER_BOSS_ORDER: readonly string[] = ALL_OPPONENTS.filter((opponent) =>
  isLadderBoss(opponent),
)
  .slice()
  .sort((a, b) => a.tier - b.tier || a.fightIndex - b.fightIndex)
  .map((opponent) => opponent.id);

/** The next rung's champion the save has not felled, or `null` once all four are down. */
export function nextUndefeatedLadderBoss(
  profile: PlayerProfile | null | undefined,
): { id: string; name: string; tier: number } | null {
  if (!profile) return null;
  const felled = new Set(
    Array.isArray(profile.defeatedOpponentIds)
      ? profile.defeatedOpponentIds.filter((id): id is string => typeof id === 'string')
      : [],
  );
  for (const id of LADDER_BOSS_ORDER) {
    if (felled.has(id)) continue;
    const opponent = ALL_OPPONENTS.find((row) => row.id === id);
    if (!opponent) continue;
    return { id: opponent.id, name: opponent.name, tier: opponent.tier };
  }
  return null;
}

/* ── (c) the Codex gap ────────────────────────────────────────────────────── */

/**
 * How many of A5's Gladiators rows this save has not faced: the page's own
 * denominator (24 — `CODEX_GLADIATOR_ROWS`, pinned by the Codex suite) minus the
 * rows it reports as touched. Read through the shipped builder, so the count can
 * never disagree with the Codex the player opens.
 */
export function unfacedGladiatorCount(profile: PlayerProfile | null | undefined): number {
  const page = buildCodex(profile).pages.find((entry) => entry.id === 'gladiators');
  if (!page) return CODEX_GLADIATOR_ROWS.length;
  return Math.max(0, page.total - page.touched);
}

/* ── THE ONE POINTER ──────────────────────────────────────────────────────── */

/**
 * The city's ONE pointer for this entry, in the design's order: a triumph one
 * step from done, else the next ladder champion, else the Codex's unfaced count,
 * else nothing. PURE: the same profile always answers the same pointer, and no
 * branch of this function writes anything.
 */
export function resolveHeraldPointer(
  profile: PlayerProfile | null | undefined,
): HeraldPointer | null {
  if (!profile) return null;

  const step = oneStepTriumphs(profile)[0];
  if (step) {
    return {
      kind: 'triumph',
      line: `One step from a triumph: ${step.name}.`,
      targetLocationId: step.row.targetLocationId,
    };
  }

  const boss = nextUndefeatedLadderBoss(profile);
  if (boss) {
    return {
      kind: 'boss',
      line: `The ladder's next champion: ${boss.name}.`,
      targetLocationId: 'colosseum',
    };
  }

  const unfaced = unfacedGladiatorCount(profile);
  if (unfaced > 0) {
    return {
      kind: 'codex',
      line: `${unfaced} gladiators in the Codex remain unfaced.`,
      targetLocationId: 'records_house',
    };
  }

  return null;
}
