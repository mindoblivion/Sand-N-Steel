/**
 * ===========================================================================
 * STORY-4b — THE DESERTER'S PRICE: the bounty ladder's rules
 * ===========================================================================
 * The Bounty Hall's board posts five contract bouts and then the Deserter. This
 * module is the ONE statement of what that means: the ladder's order, the gate
 * that opens it, each rung's TWIST and its posted price, the Deserter's own gate
 * and his capture-or-kill split, and the two writes the board makes.
 *
 * WHERE THE STATE LIVES — stated plainly, because it is the slice's one design
 * choice the brief left open:
 *   • A RUNG CLEAR is `story.bountyRungs` (an array of rung opponent ids, in clear
 *     order). It cannot be derived from `defeatedOpponentIds`: the ordinary
 *     victory write records EVERY win, and STORY-4b's Director ruling R4 says a
 *     victory that misses its twist clears nothing — so the two records would
 *     disagree the first time a player won without meeting the twist. The array
 *     lives INSIDE the existing `story` object, so no top-level profile field is
 *     added and `saveCorpus` §J stays at twenty-one fields.
 *   • The DESERTER'S CHOICE is `story.deserterChoice` (`'spared' | 'taken'`), the
 *     field STORY-1 already declares. STORY-4b — Director ruling R7: it stays
 *     there and does NOT move into STORY-4a's `spared` map, because he is a bounty
 *     row and not a mercy-eligible ladder regular; his capture-or-kill is separate
 *     UI from 4a's mercy, and 4a's mercy never fires on him (the boss-grade fence
 *     in `mercyBouts.ts`).
 *
 * Director rulings are flagged `STORY-4b — Director ruling` at the code they
 * govern. Authored values (the rung names and stats) are flagged in the data
 * rows (`data/bountyBoard.ts`).
 *
 * Pure: no storage, no clock, no randomness, no React. Every write returns a NEW
 * profile; the caller saves it through the normal path (`saveProfile`).
 */
import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { BOUNTY_DESERTER, BOUNTY_RUNG_OPPONENTS } from '../data/bountyBoard';
import { CROWD_HYPE_TIER_MAX } from './crowdHype';
import { resolveStoryState } from './storyState';
import { DOCTORE_TEST_COMBO_TARGET } from './storyBeats';

/* ── THE GATE ────────────────────────────────────────────────────────────── */

/**
 * STORY-4b — Director ruling R6: the whole ladder opens at Chapter 3. Before that
 * the panel still RENDERS (Scribonia's plate and the posted prices are readable),
 * and nothing on it can be entered.
 */
export const BOUNTY_CHAPTER = 3;

/** The board's rule, printed on the panel: a miss pays the purse, not the bounty. */
export const BOUNTY_RULES_LINE =
  'A contract bout pays its bounty only when the printed rule is met. Win without it and you keep the ordinary purse — the posting stays on the board.';

/** What the panel says while the ladder is shut. */
export const BOUNTY_LOCKED_LINE = `The board opens in Chapter ${BOUNTY_CHAPTER}.`;

/** What the final says before the five rungs are down. */
export const BOUNTY_FINAL_LOCKED_LINE = 'Five names, or the clerk keeps his ledger shut.';

/* ── THE TWISTS ──────────────────────────────────────────────────────────── */

/**
 * A rung's printed twist, as data. Every condition reads `DuelStatistics` — never
 * a combat formula (`combatCalculations.ts` is untouched by this slice):
 *   • `combo`        — victory AND `maxCombo >= DOCTORE_TEST_COMBO_TARGET`.
 *   • `left_handed`  — victory. The twist is the OPPONENT's stance (the row's own
 *                      `leftHanded` flag, rendered as the shipped lefty mesh); no
 *                      condition is added, and no stat was invented for it.
 *   • `stamina_war`  — victory. The twist is the armoured build itself.
 *   • `crowd`        — victory AND peak crowd hype at the MAX tier (C-B's own 75).
 *   • `clean`        — victory AND the player never fell below half health.
 */
export type BountyTwist = 'combo' | 'left_handed' | 'stamina_war' | 'crowd' | 'clean';

export interface BountyRung {
  /** 1 … 5, the ladder's own order. */
  rung: number;
  /** The roster row this rung posts (`data/bountyBoard.ts`). */
  opponentId: string;
  twist: BountyTwist;
  /** The one-line rule the board prints under the name. */
  twistText: string;
  /** The posted price, paid in full on EVERY clear (Director ruling R3). */
  bountyGold: number;
  bountyFame: number;
}

/**
 * STORY-4b — Director ruling R1: the rung bounties, gold/fame at Tier-3 scale.
 * R2: the twists are authored from systems that already exist (combo count, a
 * left-handed stance, an armoured build, the crowd meter, a clean fight).
 */
export const BOUNTY_LADDER: readonly BountyRung[] = [
  {
    rung: 1,
    opponentId: 'opp_bounty_decimus',
    twist: 'combo',
    twistText: `Win by combination — reach a ${DOCTORE_TEST_COMBO_TARGET}-hit combo before he falls.`,
    bountyGold: 280,
    bountyFame: 95,
  },
  {
    rung: 2,
    opponentId: 'opp_bounty_sextus',
    twist: 'left_handed',
    twistText: 'Win against a man who fights left-handed.',
    bountyGold: 300,
    bountyFame: 100,
  },
  {
    rung: 3,
    opponentId: 'opp_bounty_gaius',
    twist: 'stamina_war',
    twistText: 'Win the stamina war — he is armoured, and he does not tire.',
    bountyGold: 320,
    bountyFame: 110,
  },
  {
    rung: 4,
    opponentId: 'opp_bounty_publius',
    twist: 'crowd',
    twistText: `Win with the stands at full roar — peak crowd hype ${CROWD_HYPE_TIER_MAX} or better.`,
    bountyGold: 340,
    bountyFame: 115,
  },
  {
    rung: 5,
    opponentId: 'opp_bounty_manius',
    twist: 'clean',
    twistText: 'Win clean — never fall below half your health.',
    bountyGold: 380,
    bountyFame: 125,
  },
];

/**
 * The final. STORY-4b — Director ruling R1: a captured Deserter pays 550 gold and
 * 90 fame; a killed one pays 350 gold and 180 fame. The choice is `story.deserterChoice`.
 */
export const BOUNTY_FINAL = {
  opponentId: 'opp_bounty_deserter',
  capturedGold: 550,
  capturedFame: 90,
  takenGold: 350,
  takenFame: 180,
} as const;

/** The two answers at the final, in the board's own words. */
export type DeserterChoice = 'spared' | 'taken';

/** The exact roster ids this module owns, as a set (a fence for other resolvers). */
const RUNG_IDS = new Set(BOUNTY_RUNG_OPPONENTS.map((row) => row.id));

/** The roster row a rung id names, or `undefined`. */
export function bountyOpponentFor(opponentId: string): OpponentConfig | undefined {
  return ALL_OPPONENTS.find((row) => row.id === opponentId);
}

/** Is this row one of the five rungs? */
export function isBountyRung(opponent: OpponentConfig | null | undefined): boolean {
  return !!opponent && RUNG_IDS.has(opponent.id);
}

/** Is this row the Deserter? */
export function isBountyFinal(opponent: OpponentConfig | null | undefined): boolean {
  return opponent?.id === BOUNTY_FINAL.opponentId;
}

/** Is this row any bounty row (rung or final)? */
export function isBountyBout(opponent: OpponentConfig | null | undefined): boolean {
  return opponent?.bountyBout === true;
}

/* ── THE RECORD ──────────────────────────────────────────────────────────── */

/** The rung ids this save has cleared, in clear order (malformed reads as none). */
export function resolveClearedRungs(profile: PlayerProfile | null | undefined): string[] {
  const stored = profile?.story?.bountyRungs;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string' && id !== '');
}

/** The rungs cleared, in LADDER order — which is what the gate reads. */
export function clearedRungCount(profile: PlayerProfile | null | undefined): number {
  const cleared = new Set(resolveClearedRungs(profile));
  return BOUNTY_LADDER.filter((rung) => cleared.has(rung.opponentId)).length;
}

/** Has this save met the Deserter's gate? Chapter 3+, then all five rungs. */
export function isDeserterUnlocked(
  profile: PlayerProfile | null | undefined,
  chapterOverride?: number
): boolean {
  return (
    chapterOf(profile, chapterOverride) >= BOUNTY_CHAPTER &&
    clearedRungCount(profile) === BOUNTY_LADDER.length
  );
}

/** Is the ladder open at all? */
export function isBountyLadderOpen(
  profile: PlayerProfile | null | undefined,
  chapterOverride?: number
): boolean {
  return chapterOf(profile, chapterOverride) >= BOUNTY_CHAPTER;
}

/**
 * The campaign chapter the gate reads (STORY-1's resolver, never a stored field).
 *
 * The `chapterOverride` is the SAME seam STORY-4a's `mercyOfferFor` carries, and for
 * the same reason: `resolveStoryState` holds the campaign at Chapter 2 until Stage 2
 * lands its race-results write, so no live record can reach Chapter 3 yet. The
 * ladder is therefore DORMANT exactly as 4a's mercy is — the panel renders, the
 * board is shut — and a suite drives the open ladder through this argument. The
 * panel and `App` always pass the real reading.
 */
function chapterOf(profile: PlayerProfile | null | undefined, chapterOverride?: number): number {
  if (typeof chapterOverride === 'number' && Number.isFinite(chapterOverride)) {
    return chapterOverride;
  }
  return resolveStoryState(profile).chapter;
}

/* ── THE BOARD'S STATE ───────────────────────────────────────────────────── */

export type BountyLockReason = 'ladder' | 'order' | 'final' | null;

export interface BountyRungState {
  rung: BountyRung;
  opponent: OpponentConfig;
  cleared: boolean;
  /** May the player enter it right now? */
  open: boolean;
  lockReason: BountyLockReason;
  postedGold: number;
  postedFame: number;
  twistText: string;
  /** The R2 left-handed note, printed only on the rung that carries the flag. */
  note: string;
}

export interface BountyFinalState {
  opponent: OpponentConfig;
  cleared: boolean;
  open: boolean;
  lockReason: BountyLockReason;
  capturedGold: number;
  capturedFame: number;
  takenGold: number;
  takenFame: number;
  note: string;
}

export interface BountyBoardState {
  open: boolean;
  chapter: number;
  rulesLine: string;
  lockedLine: string;
  rungs: BountyRungState[];
  final: BountyFinalState;
}

/** The printed note for the left-handed rung (R5's "note alone" carries it too). */
const LEFT_HANDED_NOTE = 'fights left-handed';

/**
 * The board, resolved for any profile. Total: a malformed save reads as nothing
 * cleared and the ladder shut, and the panel therefore renders exactly as it does
 * for a fresh gladiator.
 */
export function bountyBoardState(
  profile: PlayerProfile | null | undefined,
  chapterOverride?: number
): BountyBoardState {
  const chapter = chapterOf(profile, chapterOverride);
  const open = chapter >= BOUNTY_CHAPTER;
  const cleared = new Set(resolveClearedRungs(profile));

  const rungs: BountyRungState[] = BOUNTY_LADDER.map((rung) => {
    const opponent = bountyOpponentFor(rung.opponentId);
    if (!opponent) throw new Error(`STORY-4b: no roster row for rung ${rung.rung}`);
    const isCleared = cleared.has(rung.opponentId);
    // Director ruling R3 — sequential unlock: rung n needs 1…n-1 cleared. A cleared
    // rung stays free to re-fight and pays its FULL bounty again.
    const predecessorCleared = BOUNTY_LADDER.filter((other) => other.rung < rung.rung).every(
      (other) => cleared.has(other.opponentId)
    );
    const lockReason: BountyLockReason = !open ? 'ladder' : predecessorCleared ? null : 'order';
    return {
      rung,
      opponent,
      cleared: isCleared,
      open: lockReason === null,
      lockReason,
      postedGold: rung.bountyGold,
      postedFame: rung.bountyFame,
      twistText: rung.twistText,
      note: opponent.leftHanded === true ? LEFT_HANDED_NOTE : '',
    };
  });

  const deserter = bountyOpponentFor(BOUNTY_FINAL.opponentId) ?? BOUNTY_DESERTER;
  const allRungsCleared = clearedRungCount(profile) === BOUNTY_LADDER.length;
  const finalLock: BountyLockReason = !open ? 'ladder' : allRungsCleared ? null : 'final';

  return {
    open,
    chapter,
    rulesLine: BOUNTY_RULES_LINE,
    lockedLine: BOUNTY_LOCKED_LINE,
    rungs,
    final: {
      opponent: deserter,
      cleared: profile?.story?.deserterChoice !== undefined,
      open: finalLock === null,
      lockReason: finalLock,
      capturedGold: BOUNTY_FINAL.capturedGold,
      capturedFame: BOUNTY_FINAL.capturedFame,
      takenGold: BOUNTY_FINAL.takenGold,
      takenFame: BOUNTY_FINAL.takenFame,
      note: '',
    },
  };
}

/* ── THE TWIST CONDITIONS ────────────────────────────────────────────────── */

/**
 * Does a finished bout meet this rung's twist? Every answer is read off the
 * duel's own statistics; `maxCombo` and `crowdHypePeak` are the fields
 * `DuelStatistics` already tracks, and `lowestHealthFraction` is this slice's one
 * new transient reading (absent = never dropped).
 */
export function twistMetFor(
  twist: BountyTwist,
  stats: Pick<DuelStatistics, 'maxCombo' | 'crowdHypePeak' | 'lowestHealthFraction'> | null
): boolean {
  if (!stats) return false;
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  switch (twist) {
    case 'combo':
      return finite(stats.maxCombo) && stats.maxCombo >= DOCTORE_TEST_COMBO_TARGET;
    case 'crowd':
      return finite(stats.crowdHypePeak) && stats.crowdHypePeak >= CROWD_HYPE_TIER_MAX;
    case 'clean': {
      const low = stats.lowestHealthFraction;
      // Absent reads as 1 (the duel never saw the player drop) — the same default
      // `lowestStaminaFraction` keeps for a bout that never moved.
      const fraction = finite(low) ? Math.max(0, Math.min(1, low)) : 1;
      return fraction >= 0.5;
    }
    // The stance and the armour ARE the twist: winning is meeting it.
    case 'left_handed':
    case 'stamina_war':
      return true;
  }
}

/* ── THE ONE RESOLVER THE RESULT WRITE READS ─────────────────────────────── */

export interface BountyVictory {
  kind: 'none' | 'rung' | 'final';
  /** The rung's id when this victory CLEARED it. */
  clearedRungId: string | null;
  /** Bounty gold/fame this write pays (0 when it pays none). */
  gold: number;
  fame: number;
  /** The line the result screen prints. */
  line: string;
}

const NONE: BountyVictory = { kind: 'none', clearedRungId: null, gold: 0, fame: 0, line: '' };

/**
 * What a finished bounty bout did. `profile` is the record the bout was FOUGHT
 * with (the same convention `mercyOfferFor` keeps).
 *
 * Rung: a victory that meets its twist CLEARS it and pays the full posted bounty;
 * a victory that misses it pays nothing extra (the duel's own purse has already
 * been paid by the ordinary write) and clears nothing — R4.
 * Final: the bounty is settled at the CAPTURE/KILL answer, so this resolver pays
 * nothing and only asks for it.
 */
export function resolveBountyVictory(
  profile: PlayerProfile | null | undefined,
  opponent: OpponentConfig | null | undefined,
  stats: DuelStatistics | null | undefined,
  didWin: boolean
): BountyVictory {
  if (!didWin || !opponent || opponent.bountyBout !== true) return NONE;

  if (isBountyFinal(opponent)) {
    return {
      kind: 'final',
      clearedRungId: null,
      gold: 0,
      fame: 0,
      line: 'The Oathbreaker is down. The board wants an answer: taken alive, or killed outright.',
    };
  }

  const rung = BOUNTY_LADDER.find((entry) => entry.opponentId === opponent.id);
  if (!rung) return NONE;

  const met = twistMetFor(rung.twist, stats ?? null);
  if (!met) {
    return {
      kind: 'rung',
      clearedRungId: null,
      gold: 0,
      fame: 0,
      line: `The posting stands: ${rung.twistText} The purse is yours; the bounty is not.`,
    };
  }

  return {
    kind: 'rung',
    clearedRungId: opponent.id,
    gold: rung.bountyGold,
    fame: rung.bountyFame,
    line: `Posting cleared — ${rung.bountyGold} gold and ${rung.bountyFame} fame paid in full.`,
  };
}

/** Write one rung clear (inside the existing `story` object; idempotent). */
export function withRungCleared(profile: PlayerProfile, rungId: string): PlayerProfile {
  if (!profile || typeof rungId !== 'string' || rungId === '') return profile;
  const cleared = resolveClearedRungs(profile);
  if (cleared.includes(rungId)) return profile;
  return {
    ...profile,
    story: { ...(profile.story ?? {}), bountyRungs: [...cleared, rungId] },
  };
}

/* ── THE DESERTER'S ANSWER ───────────────────────────────────────────────── */

export interface DeserterOutcome {
  profile: PlayerProfile;
  gold: number;
  fame: number;
  /** The answer was already on the record, so nothing was written or paid. */
  alreadyAnswered: boolean;
  line: string;
}

/** The two answers' words, printed on the result screen and the board. */
export const DESERTER_CHOICE_LINES: Record<DeserterChoice, string> = {
  spared:
    'Taken alive. The board pays for a body that can still speak, and the northern road keeps a name on it.',
  taken: 'Killed outright. The board pays more for a corpse the deserters can see.',
};

/**
 * Write the Deserter's answer EXACTLY ONCE: `story.deserterChoice` is the guard
 * as well as the record, so a double tap or a stale control pays nothing twice.
 * STORY-4b — Director ruling R7: the choice stays in `story.deserterChoice`.
 */
export function applyDeserterChoice(
  profile: PlayerProfile | null | undefined,
  choice: DeserterChoice
): DeserterOutcome {
  if (!profile) {
    return { profile: profile as unknown as PlayerProfile, gold: 0, fame: 0, alreadyAnswered: true, line: '' };
  }
  if (profile.story?.deserterChoice !== undefined) {
    return { profile, gold: 0, fame: 0, alreadyAnswered: true, line: '' };
  }
  const gold = choice === 'spared' ? BOUNTY_FINAL.capturedGold : BOUNTY_FINAL.takenGold;
  const fame = choice === 'spared' ? BOUNTY_FINAL.capturedFame : BOUNTY_FINAL.takenFame;
  return {
    profile: {
      ...profile,
      gold: profile.gold + gold,
      fame: profile.fame + fame,
      story: { ...(profile.story ?? {}), deserterChoice: choice },
    },
    gold,
    fame,
    alreadyAnswered: false,
    line: DESERTER_CHOICE_LINES[choice],
  };
}
