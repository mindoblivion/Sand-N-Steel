/**
 * A8 — TRIUMPHS EVALUATOR (ideas-retention.md §2, System 1; retention build-order
 * step 1: Records state + Triumphs evaluator + Library view).
 *
 * This module is the DEEDS half of the record.  The fame honours a gladiator can
 * BUY are P2's (`utils/laurels.ts`, `purchaseLaurel`); the deeds he EARNS by
 * doing are here, and they are read off counters the game already writes:
 * `fightsWon`, `bossKills`, `defeatedOpponentIds`, `currentTier`, the chariot
 * loadout, the racing record, the gear he owns and wears, `deriveRank`'s answer —
 * plus this duel's own transient reading (`DuelTriumphStats`).
 *
 * ── THE SHAPE ───────────────────────────────────────────────────────────────
 *   • `TRIUMPH_CATALOGUE` — every triumph, shipped or dormant, each with its
 *     plain-language requirement.  **No secret achievements**: the requirement
 *     string is what the Library prints, and it is what the condition checks.
 *   • `resolveRecords(profile)` — the lazy reader for the one new save field
 *     (`PlayerProfile.records`), total and repairing nothing, exactly the
 *     `resolveRacingState` / `resolveStoryState` idiom.
 *   • `evaluateTriumphs(profile, duelStats?)` — the pure evaluation: every
 *     shipped entry whose condition holds AND whose id is not already earned.
 *   • `applyTriumphAwards(profile, duelStats?)` — the one write composition: the
 *     peak-gold record, the earned ids, the fame grants (A8 — Director ruling
 *     R1) and the earned titles (R2), all in ONE new profile for the caller's
 *     existing `setProfile()` + `saveProfile()` pair.
 *   • `withPeakGold` / `markTriumphsViewed` — the two smaller records writes that
 *     ride the same save path.
 *
 * ── THE DESIGN-PURE RULE (A8 — Director ruling R5) ──────────────────────────
 * Evaluation happens ONLY at result screens: the duel result now, the race
 * result DEFERRED (R6 — no profile-writing race seam exists, and every Circus
 * triumph is dormant anyway).  Never on Library open, never from a watcher, never
 * on a render.
 *
 * Two consequences follow, and they are the design's rule rather than defects:
 *   1. COUNTER-BASED triumphs catch up at the NEXT duel result after this slice
 *      lands — the counters persist, so a gladiator who already had fifty
 *      victories earns "Fifty Bouts Endured" the next time he stands on the
 *      sand.  Nothing is evaluated in between.
 *   2. TRANSIENT triumphs earned BEFORE this slice are NOT retro-credited: their
 *      moments (the fight at 10% health, the crowd at 90) are gone, and the only
 *      honest evidence lived in a `DuelStatistics` object that was never saved.
 *      That is stated here so it is never mistaken for a bug.
 *
 * ── WHAT IS DORMANT, AND WHY ────────────────────────────────────────────────
 * Every Circus triumph, the Rudis Granted retirement triumph and both NG+
 * triumphs are DEFINED in the catalogue — with their unblocker named — and are
 * flagged `dormant`.  They never evaluate and never render: no Circus section
 * appears in the Library while racing is unbuilt, the rudis is STORY-8's
 * ceremony and NG+ is out for Update 1.
 *
 * ── ZERO POWER ──────────────────────────────────────────────────────────────
 * A triumph is a laurel, not a loot drop: the only rewards are a flat fame grant
 * (R1) and the Library's own display cosmetics (R2's titles).  Nothing here
 * touches a stat, a price, a gate, a fight, gear or a gold amount, and
 * `utils/combatCalculations.ts` is not read at all — this module reads counters
 * and the transient reading, never a formula.
 */

import type { PlayerProfile, ArmorSlot } from '../types/game';
import { ALL_ARMORS } from '../data/itemsDB';
import { ALL_OPPONENTS, isLadderBoss } from '../data/opponents';
import { CHARIOT_PARTS } from '../data/chariotParts';
import { resolveChariotLoadout } from './chariotLoadout';
import { resolveRacingState } from './racingProgression';
import { deriveRank, rankAtLeast, type GladiatorRank } from './rank';
import {
  CODEX_CHRONICLER_TITLE_ID,
  earnedTitleForCategory,
  getEarnedTitle,
  grantTitle,
  ownedTitleOptions,
} from './laurels';
// A5 — the full-Codex capstone's condition is a pure derivation over the profile,
// read as ONE more fact by this evaluator (there is no second evaluator).  The
// import is a cycle in the other direction (codex.ts reads A8's `GEAR_SETS`), and
// both sides are safe because each usage happens inside a function.
import { isCodexComplete } from './codex';
import type { EarnedTitle } from './laurels';
// LUDI PHASE A — the two counters its six fame-only rows read. Both are read INSIDE
// `resolveTriumphFacts` (never at module scope), so the existing cycle discipline holds:
// `ludiCalendar` never imports this module, and `diceTrail` reaches it nowhere.
import { resolveLaudes } from './diceTrail';
import { resolveLudiProgress } from './ludiCalendar';

// ── The shipped categories ─────────────────────────────────────────────────

/** The four categories the shipped catalogue groups into. */
export type TriumphCategory = 'sand' | 'coin' | 'steel' | 'saga';

/** The dormant families — defined, never evaluated, never rendered. */
export type TriumphDormantFamily = 'circus' | 'rudis' | 'ngplus';

/** What unblocks a dormant triumph.  Named in the catalogue and in its suite. */
export type TriumphUnblocker = 'racing' | 'rudis' | 'ngplus';

/** A category a catalogue row may carry: the four shipped ones plus the two dormant families. */
export type TriumphRowCategory = TriumphCategory | 'circus' | 'ngplus';

/**
 * The transient reading a duel result hands the evaluator.  This is the brief's
 * "minimal honest extension" of a one-argument signature: the two transient
 * conditions can ONLY be decided where a result screen exists.
 *
 * `won` is required — and it is required because "Missio Denied" is a VICTORY at
 * 10% health or less; a defeat also ends at 0% and would otherwise earn it.  The
 * two readings are `DuelStatistics.lowestHealthFraction` (STORY-4b) and
 * `DuelStatistics.crowdHypePeak`.
 */
export interface DuelTriumphStats {
  won: boolean;
  lowestHealthFraction?: number;
  crowdHypePeak?: number;
}

/** Everything one evaluation reads off a profile, resolved once. */
export interface TriumphFacts {
  fightsWon: number;
  bossKills: number;
  /** How many ladder bosses the roster has (the "every boss class" capstone). */
  ladderBossCount: number;
  peakGold: number;
  /** Slots whose non-stock part the profile owns — 0 … 5. */
  chariotSlotsFilled: number;
  quadraOwned: boolean;
  gearSetComplete: boolean;
  wheelsAllOwned: boolean;
  finishesAllOwned: boolean;
  gildedLoadout: boolean;
  rank: GladiatorRank;
  currentTier: number;
  felledIds: readonly string[];
  /** A5 — every Codex page at 100%: the full-Codex capstone's whole condition. */
  codexComplete: boolean;
  /** LUDI PHASE A — the SHARED Laurel total (`records.laudes`, `resolveLaudes`). */
  laurels: number;
  /** LUDI PHASE A — the persistent Favour total (`resolveLudiProgress`). */
  favour: number;
  /** Absent when the evaluation has no result screen behind it. */
  /** Absent when the evaluation has no result screen behind it. */
  duel: DuelTriumphStats | undefined;
}

/** One catalogue row. */
export interface Triumph {
  id: string;
  category: TriumphRowCategory;
  name: string;
  /** Plain language, printed by the Library — never a hidden condition. */
  requirement: string;
  /** A8 — Director ruling R1: 25 fame instead of 10. */
  capstone?: boolean;
  /** Decided only where a result screen exists (a duel's transient reading). */
  transient?: boolean;
  /** Present only on a dormant row: which family, and what unblocks it. */
  dormant?: { family: TriumphDormantFamily; unblocker: TriumphUnblocker };
  /** The condition.  Dormant rows carry none — they never evaluate. */
  holds?: (facts: TriumphFacts) => boolean;
}

// ── The gear-set grouping (Steel's "full gear set") ────────────────────────

/**
 * The armour palette, as the material ladder `itemsDB`'s own comments name it.
 * The join is the catalogue's `color` field — no item id is listed here — so a
 * piece added to `ITEMS_DB` joins its material's set automatically.
 *
 * A5's Codex reuses this grouping; it is defined here, beside the triumph that
 * needs it, and exported.
 */
export const ARMOR_MATERIALS: readonly { key: string; name: string; color: string }[] = [
  { key: 'bronze', name: 'Bronze', color: '#b45309' },
  { key: 'iron', name: 'Iron', color: '#64748b' },
  { key: 'steel', name: 'Steel', color: '#475569' },
  { key: 'gilded', name: 'Gilded', color: '#ca8a04' },
];

const ARMOR_SLOTS: readonly ArmorSlot[] = ['helm', 'chest', 'arms', 'legs'];

export interface GearSetPiece {
  slot: ArmorSlot;
  itemId: string;
}

export interface GearSet {
  id: string;
  name: string;
  material: string;
  /** One piece per slot, in `ARMOR_SLOTS` order. */
  pieces: readonly GearSetPiece[];
}

/**
 * Only COMPLETE sets are defined — a material with no piece in one of the four
 * slots is not a set, because a triumph nobody can earn is worse than no
 * triumph.  Two of the four shipped materials qualify today (iron and gilded);
 * the suite pins that every piece is a real `ITEMS_DB` id, sits in its own slot
 * and is purchasable from shop stock.
 */
function buildGearSets(): GearSet[] {
  const sets: GearSet[] = [];
  for (const material of ARMOR_MATERIALS) {
    const pieces: GearSetPiece[] = [];
    let complete = true;
    for (const slot of ARMOR_SLOTS) {
      const item = ALL_ARMORS.find(
        (armor) => armor.slot === slot && armor.color === material.color,
      );
      if (!item) {
        complete = false;
        break;
      }
      pieces.push({ slot, itemId: item.id });
    }
    if (!complete) continue;
    sets.push({
      id: `set_${material.key}`,
      name: `${material.name} set`,
      material: material.key,
      pieces,
    });
  }
  return sets;
}

export const GEAR_SETS: readonly GearSet[] = buildGearSets();

// ── The catalogue ──────────────────────────────────────────────────────────

/** The roster's ladder bosses — one per tier, and the "every boss class" count. */
const LADDER_BOSS_IDS = ALL_OPPONENTS.filter((opponent) => isLadderBoss(opponent)).map(
  (opponent) => opponent.id,
);

/** The tier-4 ladder champion — Aurelius.  Read from the roster, never a literal id. */
const TIER_FOUR_FINAL_BOSS = ALL_OPPONENTS.find(
  (opponent) => opponent.tier === 4 && isLadderBoss(opponent),
);

/** Saga's tier-4 condition names him, so the suite can pin the roster entry. */
export const TIER_FOUR_FINAL_BOSS_ID = TIER_FOUR_FINAL_BOSS?.id ?? 'opp_aurelius_boss';

/** The Saga title's gate: only this triumph grants it (A8 — Director ruling R2). */
export const SAGA_LEGEND_TRIUMPH_ID = 'saga_legend';

/**
 * A5 — the FULL-CODEX capstone's id.  Its condition is `isCodexComplete`, a pure
 * derivation over the profile (no transient stat), and its one reward beyond the
 * fame grant is the authored title 'Chronicler of the Ludus' (R4).  It is the
 * Codex's whole reward sink: per-page 100% earns the display laurel and nothing
 * else, so the design's "a title from the Triumphs ladder" is honoured once.
 */
export const CODEX_COMPLETE_TRIUMPH_ID = 'saga_codex_complete';

/**
 * The catalogue, in display order.
 *
 * Sand (7) · Coin (5) · Steel (4) · Saga (14) = **30 shipped** (LUDI PHASE A appended
 * the six calendar rows below to Saga), then the six
 * dormant rows (A5 appended `saga_codex_complete` to Saga; every A8 row is
 * unchanged and in its place).  Every threshold is a shipped number already in the save; none is
 * invented here.  A8's fame grants and titles are Director rulings, flagged as
 * such, and are not design values.
 */
export const TRIUMPH_CATALOGUE: readonly Triumph[] = [
  // ── Sand — the arena itself ───────────────────────────────────────────────
  {
    id: 'sand_first_blood',
    category: 'sand',
    name: 'First Blood of the Sands',
    requirement: 'Win your first duel.',
    holds: (facts) => facts.fightsWon >= 1,
  },
  {
    id: 'sand_ten_victories',
    category: 'sand',
    name: 'Ten Times to the Sand',
    requirement: 'Win 10 duels.',
    holds: (facts) => facts.fightsWon >= 10,
  },
  {
    id: 'sand_fifty_victories',
    category: 'sand',
    name: 'Fifty Bouts Endured',
    requirement: 'Win 50 duels.',
    holds: (facts) => facts.fightsWon >= 50,
  },
  {
    id: 'sand_hundred_victories',
    category: 'sand',
    name: 'A Hundred Victories',
    requirement: 'Win 100 duels.',
    capstone: true,
    holds: (facts) => facts.fightsWon >= 100,
  },
  {
    id: 'sand_missio_denied',
    category: 'sand',
    name: 'Missio Denied',
    requirement: 'Win a duel with 10% of your health or less remaining.',
    transient: true,
    holds: (facts) =>
      facts.duel !== undefined &&
      facts.duel.won &&
      typeof facts.duel.lowestHealthFraction === 'number' &&
      facts.duel.lowestHealthFraction <= 0.1,
  },
  {
    id: 'sand_crowd_chants',
    category: 'sand',
    name: 'The Crowd Chants Your Name',
    requirement: 'Reach 90 crowd hype in a single duel.',
    transient: true,
    holds: (facts) =>
      facts.duel !== undefined &&
      typeof facts.duel.crowdHypePeak === 'number' &&
      facts.duel.crowdHypePeak >= 90,
  },
  {
    id: 'sand_every_boss',
    category: 'sand',
    name: 'Every Champion Felled',
    requirement: 'Defeat the champion of every tier of the ladder.',
    capstone: true,
    holds: (facts) => facts.ladderBossCount > 0 && facts.bossKills >= facts.ladderBossCount,
  },

  // ── Coin — the purse and the team ─────────────────────────────────────────
  {
    id: 'coin_1000_gold',
    category: 'coin',
    name: 'A Purse of Gold',
    requirement: 'Hold 1,000 gold at once.',
    holds: (facts) => facts.peakGold >= 1000,
  },
  {
    id: 'coin_5000_gold',
    category: 'coin',
    name: 'A Fortune in the Chest',
    requirement: 'Hold 5,000 gold at once.',
    holds: (facts) => facts.peakGold >= 5000,
  },
  {
    id: 'coin_25000_gold',
    category: 'coin',
    name: 'The Golden Ludus',
    requirement: 'Hold 25,000 gold at once.',
    capstone: true,
    holds: (facts) => facts.peakGold >= 25000,
  },
  {
    id: 'coin_full_chariot',
    category: 'coin',
    name: 'Five Slots Filled',
    requirement: 'Own a non-stock part for all five chariot slots.',
    holds: (facts) => facts.chariotSlotsFilled >= 5,
  },
  {
    id: 'coin_quadra',
    category: 'coin',
    name: 'Four to the Yoke',
    requirement: 'Buy the Quadra team.',
    capstone: true,
    holds: (facts) => facts.quadraOwned,
  },

  // ── Steel — what the smith and the workshop sell ──────────────────────────
  {
    id: 'steel_full_set',
    category: 'steel',
    name: 'A Set of Armour',
    requirement: `Own every piece of one armour set (${GEAR_SETS.map((set) =>
      set.name.toLowerCase(),
    ).join(' or ')}).`,
    holds: (facts) => facts.gearSetComplete,
  },
  {
    id: 'steel_wheels',
    category: 'steel',
    name: 'Every Wheel',
    requirement: 'Own the standard and the reinforced wheel set.',
    holds: (facts) => facts.wheelsAllOwned,
  },
  {
    id: 'steel_finishes',
    category: 'steel',
    name: 'Every Finish',
    requirement: 'Own the charred, gilded and oxblood finishes.',
    holds: (facts) => facts.finishesAllOwned,
  },
  {
    id: 'steel_gilded_loadout',
    category: 'steel',
    name: 'Gilded Head and Chest',
    requirement: 'Wear the gilded champion cuirass and the gilded champion galea together.',
    capstone: true,
    holds: (facts) => facts.gildedLoadout,
  },

  // ── Saga — the long road ──────────────────────────────────────────────────
  {
    id: 'saga_veteran',
    category: 'saga',
    name: 'Veteran of the Ludus',
    requirement: 'Reach the rank of Veteran.',
    holds: (facts) => rankAtLeast(facts.rank, 'Veteran'),
  },
  {
    id: 'saga_champion',
    category: 'saga',
    name: 'Champion of the Arena',
    requirement: 'Reach the rank of Champion.',
    holds: (facts) => rankAtLeast(facts.rank, 'Champion'),
  },
  {
    id: SAGA_LEGEND_TRIUMPH_ID,
    category: 'saga',
    name: 'Legend of the Ludus',
    requirement: 'Reach the rank of Legend.',
    capstone: true,
    holds: (facts) => rankAtLeast(facts.rank, 'Legend'),
  },
  {
    id: 'saga_tier_one',
    category: 'saga',
    name: 'The First Circuit',
    requirement: 'Clear Tier 1 by reaching Tier 2.',
    // A8 — Director ruling R4: a tier clear is read from `currentTier` and
    // `defeatedOpponentIds` — there is no `tierProgress` field to read.
    holds: (facts) => facts.currentTier >= 2,
  },
  {
    id: 'saga_tier_two',
    category: 'saga',
    name: 'The Second Circuit',
    requirement: 'Clear Tier 2 by reaching Tier 3.',
    holds: (facts) => facts.currentTier >= 3,
  },
  {
    id: 'saga_tier_three',
    category: 'saga',
    name: 'The Third Circuit',
    requirement: 'Clear Tier 3 by reaching Tier 4.',
    holds: (facts) => facts.currentTier >= 4,
  },
  {
    id: 'saga_tier_four',
    category: 'saga',
    name: 'Aurelius Falls',
    requirement: 'Defeat Aurelius, the Tier 4 champion.',
    holds: (facts) => facts.felledIds.includes(TIER_FOUR_FINAL_BOSS_ID),
  },
  // A5 — THE CODEX CAPSTONE (A5 — Director ruling R4).  Counter-based like every
  // other Saga row: it is decided at a duel result from the profile alone, because
  // its whole condition is the derivation `isCodexComplete`.  Honest counting,
  // stated on the row: the six bounty rows are Chapter-3-gated today, so no
  // profile can reach Gladiators 100% — and therefore this triumph — before Stage 2.
  {
    id: CODEX_COMPLETE_TRIUMPH_ID,
    category: 'saga',
    name: 'Codex Complete — The Whole City Knows Your Name',
    requirement: 'Fill every page of the Codex — every rival, every boss, every team, every blade and every street.',
    capstone: true,
    holds: (facts) => facts.codexComplete,
  },

  // LUDI PHASE A — THE CALENDAR'S SIX SAGA ROWS.  Fame-only deeds, counter-based, decided
  // at a duel result like every other Saga row: `records.laudes` (the shared honour the
  // Acta's third deed pays) and `ludi.favour` (the alms-day and third-deed currency). A7 —
  // Director ruling: 10 fame at 7 and 30, 25 at 100 (`capstone`), and NO titles — the Saga
  // title stays gated on `saga_legend` alone, which `titlesDueFor` enforces by id.
  // The copy names the SHARED counter in its own word, "Laudes": P2's naming law reserves
  // "laurel" for the palma the fame honours are bought with, and the Triumphs page must not
  // print it (`triumphsSurface.test.tsx` §D). The ids keep the design's `saga_laurel_*`
  // names because they are the catalogue's keys, not copy.
  {
    id: 'saga_laurel_7',
    category: 'saga',
    name: 'Seven Laudes',
    requirement: 'Hold 7 Laudes from the Acta, the daily gazette.',
    holds: (facts) => facts.laurels >= 7,
  },
  {
    id: 'saga_laurel_30',
    category: 'saga',
    name: 'Thirty Laudes',
    requirement: 'Hold 30 Laudes from the Acta, the daily gazette.',
    holds: (facts) => facts.laurels >= 30,
  },
  {
    id: 'saga_laurel_100',
    category: 'saga',
    name: 'A Hundred Laudes',
    requirement: 'Hold 100 Laudes from the Acta, the daily gazette.',
    capstone: true,
    holds: (facts) => facts.laurels >= 100,
  },
  {
    id: 'saga_favour_7',
    category: 'saga',
    name: 'Favour of the City',
    requirement: 'Hold 7 Favour from the third deed and the shrine alms.',
    holds: (facts) => facts.favour >= 7,
  },
  {
    id: 'saga_favour_30',
    category: 'saga',
    name: 'Kept in the Favour of the City',
    requirement: 'Hold 30 Favour from the third deed and the shrine alms.',
    holds: (facts) => facts.favour >= 30,
  },
  {
    id: 'saga_favour_100',
    category: 'saga',
    name: 'The City Favourite',
    requirement: 'Hold 100 Favour from the third deed and the shrine alms.',
    capstone: true,
    holds: (facts) => facts.favour >= 100,
  },

  // ── DORMANT — defined, never evaluated, never rendered ────────────────────
  // A8: no Circus triumph ships before racing exists, the rudis is STORY-8's
  // ceremony, and NG+ is out for Update 1.  Each row keeps its unblocker so the
  // catalogue stays the single list of what is coming.
  {
    id: 'circus_first_race',
    category: 'circus',
    name: 'First Race Run',
    requirement: 'Win a circus race.',
    dormant: { family: 'circus', unblocker: 'racing' },
  },
  {
    id: 'circus_triga',
    category: 'circus',
    name: 'Three to the Yoke',
    requirement: 'Win a circus race driving a Triga.',
    dormant: { family: 'circus', unblocker: 'racing' },
  },
  {
    id: 'circus_quadra',
    category: 'circus',
    name: 'Four in the Dust',
    requirement: 'Win a circus race driving a Quadra.',
    dormant: { family: 'circus', unblocker: 'racing' },
  },
  {
    id: 'saga_rudis_granted',
    category: 'saga',
    name: 'The Rudis Granted',
    requirement: 'Retire from the sand with the rudis.',
    dormant: { family: 'rudis', unblocker: 'rudis' },
  },
  {
    id: 'ngplus_second_life',
    category: 'ngplus',
    name: 'Twice to the Sand',
    requirement: 'Begin a second life.',
    dormant: { family: 'ngplus', unblocker: 'ngplus' },
  },
  {
    id: 'ngplus_third_life',
    category: 'ngplus',
    name: 'Thrice to the Sand',
    requirement: 'Begin a third life.',
    dormant: { family: 'ngplus', unblocker: 'ngplus' },
  },
];

/** The shipped rows — everything that evaluates and renders. */
export const SHIPPED_TRIUMPHS: readonly Triumph[] = TRIUMPH_CATALOGUE.filter(
  (triumph) => triumph.dormant === undefined,
);

/** The dormant rows — kept in the catalogue, never in a surface. */
export const DORMANT_TRIUMPHS: readonly Triumph[] = TRIUMPH_CATALOGUE.filter(
  (triumph) => triumph.dormant !== undefined,
);

/** The four category headings, in the Library's own order. */
export const TRIUMPH_CATEGORIES: readonly { id: TriumphCategory; label: string }[] = [
  { id: 'sand', label: 'Sand' },
  { id: 'coin', label: 'Coin' },
  { id: 'steel', label: 'Steel' },
  { id: 'saga', label: 'Saga' },
];

/** One category's shipped rows, in catalogue order. */
export function triumphsInCategory(category: TriumphCategory): Triumph[] {
  return SHIPPED_TRIUMPHS.filter((triumph) => triumph.category === category);
}

// ── Fame and titles (A8 — Director rulings R1 and R2) ──────────────────────

/**
 * A8 — Director ruling R1: a flat, one-time fame grant.  **10 for a standard
 * triumph, 25 for a capstone.**  These are Director rulings, not design values:
 * they are small on purpose (a triumph is a laurel, not a loot drop) and they
 * are paid once, in the same save as the earn.
 */
export const TRIUMPH_FAME_STANDARD = 10;
export const TRIUMPH_FAME_CAPSTONE = 25;

/** The fame one triumph pays, per R1. */
export function triumphFame(triumph: Pick<Triumph, 'capstone'>): number {
  return triumph.capstone === true ? TRIUMPH_FAME_CAPSTONE : TRIUMPH_FAME_STANDARD;
}

/**
 * A8 — Director ruling R2, resolved into the titles this award grants:
 *   • the FIRST Sand / Coin / Steel triumph of the batch grants that category's
 *     title;
 *   • Saga's title is CAPSTONE-GATED: it is granted only when this batch earns
 *     the Legend-rank triumph, never on the first Saga triumph.
 */
function titlesDueFor(earned: readonly Triumph[]): EarnedTitle[] {
  const due: EarnedTitle[] = [];
  for (const category of ['sand', 'coin', 'steel'] as const) {
    if (!earned.some((triumph) => triumph.category === category)) continue;
    const title = earnedTitleForCategory(category);
    if (title) due.push(title);
  }
  if (earned.some((triumph) => triumph.id === SAGA_LEGEND_TRIUMPH_ID)) {
    const title = earnedTitleForCategory('saga');
    if (title) due.push(title);
  }
  // A5 — the full-Codex capstone grants its OWN authored title, by id, because it
  // is not a category rule (the Saga category's title is the Legend one above).
  if (earned.some((triumph) => triumph.id === CODEX_COMPLETE_TRIUMPH_ID)) {
    const title = getEarnedTitle(CODEX_CHRONICLER_TITLE_ID);
    if (title) due.push(title);
  }
  return due;
}

// ── The records reader ─────────────────────────────────────────────────────

/** The resolved `records` state.  Never a repair: an absent field is this. */
export interface TriumphRecords {
  /** Earned ids, in the order they were earned; unknown ids and duplicates dropped. */
  earnedTriumphs: string[];
  /** The subset the player has read on the Library's Triumphs page. */
  viewedTriumphs: string[];
  /** The highest `gold` this gladiator has ever held.  Monotonic. */
  peakGold: number;
}

const TRIUMPH_BY_ID: ReadonlyMap<string, Triumph> = new Map(
  TRIUMPH_CATALOGUE.map((triumph) => [triumph.id, triumph]),
);

/** Look a triumph up by id — `undefined` for anything the catalogue does not know. */
export function getTriumphEntry(ref: unknown): Triumph | undefined {
  return typeof ref === 'string' ? TRIUMPH_BY_ID.get(ref) : undefined;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A stored id list, keeping known ids only, in stored order, without duplicates. */
function knownIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !TRIUMPH_BY_ID.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/** The stored `records` object, or `undefined` when it is absent or not an object. */
function storedRecords(profile: PlayerProfile | null | undefined): PlayerProfile['records'] {
  const stored = profile?.records;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored;
}

/**
 * Read the record.  Total, never throwing and never repairing the save — the same
 * contract `resolveRacingState`, `resolveStoryState` and `resolveLaurels` keep:
 * an absent field, a partial field and a malformed field all resolve to "nothing
 * earned, nothing read, no purse recorded".
 */
export function resolveRecords(profile: PlayerProfile | null | undefined): TriumphRecords {
  const stored = storedRecords(profile);
  const peak = finiteOrNull(stored?.peakGold);
  return {
    earnedTriumphs: knownIds(stored?.earnedTriumphs),
    viewedTriumphs: knownIds(stored?.viewedTriumphs),
    peakGold: peak !== null && peak > 0 ? peak : 0,
  };
}

/** The earned ids the player has not read yet — the ✦ marker's own test (R7). */
export function unviewedTriumphs(profile: PlayerProfile | null | undefined): string[] {
  const records = resolveRecords(profile);
  const viewed = new Set(records.viewedTriumphs);
  return records.earnedTriumphs.filter((id) => !viewed.has(id));
}

/** Does the Library's interaction prompt carry the ✦ marker?  (A8 — ruling R7.) */
export function hasUnviewedTriumphs(profile: PlayerProfile | null | undefined): boolean {
  return unviewedTriumphs(profile).length > 0;
}

// ── The small records writes ───────────────────────────────────────────────

/**
 * THE PEAK-GOLD UPDATER — the single records updater at the save path.
 *
 * `peakGold = max(peakGold, profile.gold)`: spending never lowers it, and a save
 * that carries no record gains one the first time gold rises.  Pure, and
 * identity-stable — it returns the SAME profile object when the peak does not
 * move, so a caller can compare identity to know whether a save is needed.
 */
export function withPeakGold(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const gold = finiteOrNull(profile.gold);
  if (gold === null) return profile;
  const peak = resolveRecords(profile).peakGold;
  if (gold <= peak) return profile;
  return { ...profile, records: { ...(storedRecords(profile) ?? {}), peakGold: gold } };
}

/**
 * A8 — Director ruling R7: opening the Triumphs page marks every EARNED triumph
 * as viewed, in ONE save.  The marker shows once and never repeats, because the
 * difference it reads is empty from then on.
 */
export function markTriumphsViewed(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const records = resolveRecords(profile);
  const missing = unviewedTriumphs(profile);
  if (missing.length === 0) return profile;
  return {
    ...profile,
    records: {
      ...(storedRecords(profile) ?? {}),
      earnedTriumphs: records.earnedTriumphs,
      viewedTriumphs: [...records.viewedTriumphs, ...missing],
      peakGold: records.peakGold,
    },
  };
}

// ── The evaluation ─────────────────────────────────────────────────────────

/** Owns a weapon OR armour piece: equipped or carried. */
function ownsItem(profile: PlayerProfile, itemId: string): boolean {
  const equipped = Object.values(profile.equipped ?? {});
  if (equipped.some((item) => item?.id === itemId)) return true;
  const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
  return inventory.some((item) => item?.id === itemId);
}

/** How many chariot slots carry a non-stock part the profile OWNS. */
function fittedChariotSlots(profile: PlayerProfile): number {
  const { owned } = resolveChariotLoadout(profile);
  const slots = new Set<string>();
  for (const part of CHARIOT_PARTS) {
    if (part.defaultOwned || !owned.includes(part.id)) continue;
    slots.add(part.slot);
  }
  return slots.size;
}

/** Resolve every fact one evaluation reads, once. */
export function resolveTriumphFacts(
  profile: PlayerProfile | null | undefined,
  duel?: DuelTriumphStats | null,
): TriumphFacts {
  const source = profile ?? ({} as PlayerProfile);
  const records = resolveRecords(profile);
  const chariot = resolveChariotLoadout(profile);
  const racing = resolveRacingState(profile);
  const felledIds = Array.isArray(source.defeatedOpponentIds)
    ? source.defeatedOpponentIds.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    fightsWon: finiteOrNull(source.fightsWon) ?? 0,
    bossKills: finiteOrNull(source.bossKills) ?? 0,
    ladderBossCount: LADDER_BOSS_IDS.length,
    peakGold: records.peakGold,
    chariotSlotsFilled: fittedChariotSlots(source),
    quadraOwned: racing.unlocked.includes(4),
    gearSetComplete: GEAR_SETS.some((set) =>
      set.pieces.every((piece) => ownsItem(source, piece.itemId)),
    ),
    wheelsAllOwned:
      chariot.owned.includes('wheels_standard') && chariot.owned.includes('wheels_reinforced'),
    finishesAllOwned: ['finish_charred', 'finish_gilded', 'finish_oxblood'].every((id) =>
      chariot.owned.includes(id),
    ),
    gildedLoadout:
      source.equipped?.chest?.id === 'chest_champion_gilded' &&
      source.equipped?.helm?.id === 'helm_champion_gilded',
    rank: deriveRank(source),
    currentTier: finiteOrNull(source.currentTier) ?? 0,
    felledIds,
    codexComplete: isCodexComplete(source),
    laurels: resolveLaudes(source),
    favour: resolveLudiProgress(source).favour,
    duel: duel ?? undefined,
  };
}

/**
 * THE EVALUATION.
 *
 * `newlyEarned` = every SHIPPED catalogue entry whose condition holds AND whose
 * id is not already in `records.earnedTriumphs`, in catalogue order.  Pure and
 * idempotent: re-running it against the same profile after `applyTriumphAwards`
 * earns nothing twice.
 *
 * Without `duelStats` only counter-based conditions evaluate — that is the
 * design's rule (R5), not a limitation to work around: transient conditions have
 * no evidence outside a result screen, and nothing may invent one.
 */
export function evaluateTriumphs(
  profile: PlayerProfile | null | undefined,
  duelStats?: DuelTriumphStats,
): Triumph[] {
  if (!profile) return [];
  const earned = new Set(resolveRecords(profile).earnedTriumphs);
  const facts = resolveTriumphFacts(profile, duelStats);

  return SHIPPED_TRIUMPHS.filter(
    (triumph) => !earned.has(triumph.id) && triumph.holds !== undefined && triumph.holds(facts),
  );
}

/** What one award composition produced, for the caller's toast and save. */
export interface TriumphAwardOutcome {
  /** The profile to hand to `setProfile()` + `saveProfile()`. */
  profile: PlayerProfile;
  /** The triumphs this evaluation earned, in catalogue order. */
  earned: Triumph[];
  /** The titles this evaluation newly granted, in category order. */
  titles: EarnedTitle[];
}

/**
 * THE ONE WRITE COMPOSITION — everything a duel result changes about the record,
 * in a single new profile:
 *
 *   1. the peak-gold updater (a victory's purse counts);
 *   2. the newly earned ids, appended to `records.earnedTriumphs`;
 *   3. the fame grants (R1) — 10 / 25, once, in this same save;
 *   4. the earned titles (R2) appended to the laurels record, owned permanently.
 *
 * The displayed `profile.title` is deliberately NOT moved: an earned title is
 * owned, and the Library's title row is where the player chooses to wear it (the
 * P2 model, one step further).
 */
export function applyTriumphAwards(
  profile: PlayerProfile | null | undefined,
  duelStats?: DuelTriumphStats,
): TriumphAwardOutcome {
  if (!profile) {
    return { profile: profile as unknown as PlayerProfile, earned: [], titles: [] };
  }

  const withPeak = withPeakGold(profile);
  const earned = evaluateTriumphs(withPeak, duelStats);
  if (earned.length === 0) return { profile: withPeak, earned, titles: [] };

  const records = resolveRecords(withPeak);
  const fame = earned.reduce((sum, triumph) => sum + triumphFame(triumph), 0);
  const due = titlesDueFor(earned);
  const ownedTitles = new Set(ownedTitleOptions(withPeak).map((title) => title.id));
  const granted = due.filter((title) => !ownedTitles.has(title.id));

  let next: PlayerProfile = {
    ...withPeak,
    fame: (finiteOrNull(withPeak.fame) ?? 0) + fame,
    records: {
      ...(storedRecords(withPeak) ?? {}),
      earnedTriumphs: [...records.earnedTriumphs, ...earned.map((triumph) => triumph.id)],
      viewedTriumphs: records.viewedTriumphs,
      peakGold: records.peakGold,
    },
  };

  for (const title of granted) next = grantTitle(next, title.id);

  return { profile: next, earned, titles: granted };
}
