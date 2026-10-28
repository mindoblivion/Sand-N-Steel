/**
 * ===========================================================================
 * STORY-5a — THE LOADED DICE (Story §3A) and the QUIET DICE chain (§2.4)
 * ===========================================================================
 * The Golden Palm's dice table has ruined three fighters this month, and the
 * keeper of the Palm wants it stopped quietly.  This module owns that arc's
 * whole rule set; `components/hub/DiceTrailSection.tsx` is its only surface and
 * `App.tsx` is the only place a save is written.
 *
 * THE SHAPE, in the order the player walks it (keeper-lives §2.4 first, §3A
 * after it — the personal run-up earns Aelia's trust BEFORE the board opens,
 * and it pays out before the arc's own rewards so nothing is told or paid twice):
 *
 *   STEP 1 — 'Buy a true thing.'  Any S7 deep card bought at her counter
 *            (`profile.intel` non-empty).  ALL tavern rumours are Aelia's, so a
 *            single 15 g purchase IS "a rumour from her"; the price is S7's
 *            `INTEL_PRICE`, untouched here.  DERIVED, never stored.
 *   STEP 2 — 'His champion, then.'  A standard duel against the cheat's named
 *            champion, a regular ladder row staged as a tavern bout entry
 *            (`DICE_CHAIN_CHAMPION`).  No boss mechanics, no new opponent row:
 *            the row is fought exactly as the arena would fight it.  DERIVED
 *            from `defeatedOpponentIds`, like the Doctore's Test's own gate.
 *   STEP 3 — 'Tell me what he said.'  Return to her counter.  Her closing line
 *            — QUIET_DICE_CLOSING_LINE, 'Now. About the dice.' — is spoken and
 *            the rumor board opens.  THIS is the chain's completion and its ONE
 *            write (`withDiceChainClosed`): the backstory is told, 5 Laudes are
 *            paid and the house cup is handed over.
 *
 * THE BOARD (§3A) rides UNDER that same counter, as a section of the existing
 * tavern intel panel (Director ruling R6 — one panel, one interaction).  Three
 * escalating rumours, each a card that names its bout honestly, unlocked in
 * sequence: rumor 1 at board-open, rumor N after bout N-1 is won.  Each bout is
 * a standard duel against a staged ladder row (`DICE_RUMORS[].bout`).
 *
 *   • NO RACE BOUT IN THIS SLICE.  §3A's "a duel or a race" per rumor resolves
 *     to DUELS ONLY until Stage 2 lands a profile-writing race-results seam
 *     (T2): there is no way to record a finish today, so a race card could not
 *     be honoured.  Flagged here, not silently omitted.
 *   • THE CHEAT.  Titus Piso, called the Smiler — a Golden Palm regular, all
 *     warmth and clean hands, whose tali are loaded (the settled naming
 *     addendum).  He is a NAME in this fiction and is never an opponent row.
 *   • THE ENDING is ONE binary flag in the existing story object:
 *     `story.diceEnding` — 'cut' | 'refused'.  It is the flag Story-design §9's
 *     Chapter 4 row already names as 'Loaded Dice resolved (either ending)', and
 *     it is what `resolveStoryState`'s `dice-ending` gate reads today.  THIS
 *     SLICE WRITES IT; it builds none of Chapter 4's gate logic.
 *
 * STORY-5a — Director rulings (RULINGS, not design values; flagged at the code
 * each one governs so the Director can countermand any of them):
 *   R1  'cut' pays DICE_CUT_GOLD = 300 gold — a Tier-3-scale bribe: a sum worth
 *       taking, less than a boss purse.
 *   R2  'refused' pays the staged ending champion's STANDARD purse exactly (the
 *       ordinary victory write already pays it; nothing is added here).
 *   R3  GATING: the trail and the chain are UNGATED — playable the moment S7 and
 *       the tavern exist.  Nothing in this module reads a chapter.
 *   R4  Servers and the 3 g cheap-talk tier are NOT built: the board's currency
 *       of truth is the 15 g deep card, and Aelia + her house carry the rest in
 *       fiction.
 *   R5  Every rumor text and every staged row is AUTHORED here, flagged
 *       'STORY-5a — authored, not design-transcribed': the design names only
 *       Piso.  The rows are named in the texts and in the chain text.
 *   R6  The board is a SECTION of the tavern intel panel, not a panel of its own.
 *
 * STORY-5a — THE 'cut' COST, all of it mechanical except the fiction: gold paid
 * now (R1), Aelia's enmity as FICTION only, and her rumour service CLOSED to
 * you permanently — `isRumourServiceClosed` makes the panel print the closure and
 * every purchase refused.  There is NO un-close path.
 *
 * The whole module is pure: no storage, no clock, no mutation.  Every writer
 * returns a NEW profile, and is identity-stable when nothing applies, so a
 * caller can compare identity to know whether a save is needed.
 */
import type {
  DiceTrailProgress,
  OpponentConfig,
  PlayerProfile,
  StoryProgress,
} from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { INTEL_PRICE, resolveIntel } from './intel';
import { mercyOfferFor, type MercyOffer } from './mercyBouts';

/* ── The published values ────────────────────────────────────────────────── */

/**
 * The chain's reward in Laudes (keeper-lives §2.4: "backstory + 5 Laudes +
 * cosmetic: the house cup").
 */
export const DICE_CHAIN_LAUDES = 5;

/**
 * STORY-5a — Director ruling R1: 'cut' pays 300 gold now.  A Tier-3-scale bribe
 * — worth taking, less than a boss purse.  A ruling, not a design value.
 */
export const DICE_CUT_GOLD = 300;

/** The deep card's price is S7's, restated nowhere: the trail never reprices it. */
export const DICE_DEEP_CARD_PRICE = INTEL_PRICE;

/* ── The staged rows (they exist already; nothing new is added to the roster) ─ */

/** The five bouts the trail stages, keyed as the panel and the writers name them. */
export type DiceTrailBoutKey = 'chain' | 'rumor1' | 'rumor2' | 'rumor3' | 'ending';

/**
 * One staged bout: an EXISTING ladder row (`opponentId`) fought as a tavern bout
 * entry.  `staging` is how the fiction names that row; it is the same string the
 * chain/rumor text prints, so the card and the bout can never disagree.
 *
 * STORY-5a — Director ruling R5: every staged row is an AUTHORED staging choice,
 * not design-transcribed.  Five DIFFERENT rows are staged, and none of them is a
 * boss: a trail bout is a standard duel, so no boss HUD, no boss music and no
 * telegraph mechanic can fire on one.
 */
export interface DiceTrailBout {
  key: DiceTrailBoutKey;
  /** The EXISTING roster id.  Never a new row. */
  opponentId: string;
  /** The name the trail's own text uses for him. */
  staging: string;
}

/**
 * STORY-5a — authored staging (R5).  Step 2's champion: Flaccus the Nimble, a
 * Tier 1 Thracian skirmisher — quick hands, quicker knife, the cheat's cheap
 * blade, met across the sand first and across a dice table later.
 */
export const DICE_CHAIN_CHAMPION: DiceTrailBout = {
  key: 'chain',
  opponentId: 'opp_flaccus',
  staging: 'Flaccus the Nimble',
};

/** The rumor board's three bout ids. */
export type DiceRumorId = 'rumor1' | 'rumor2' | 'rumor3';

export interface DiceRumor {
  id: DiceRumorId;
  /** The card's head line. */
  title: string;
  /**
   * The card's text.  STORY-5a — authored, not design-transcribed (R5): the
   * design gives the trail its shape and names only Piso, so every word here is
   * this slice's, and each text NAMES ITS BOUT honestly (the design's rule for
   * the trail's currency of truth).
   */
  text: string;
  bout: DiceTrailBout;
}

/**
 * STORY-5a — the three cards, escalating: the doorman who keeps the book, the
 * man who carries the loaded tali, and the hand that lifts the cup off the
 * table.  After the third there is only Piso himself — and he does not fight.
 *
 * STORY-5a — authored, not design-transcribed (R5).  The staged rows, in order:
 * Cassius the Phalanx (Tier 2 spearman), Brutus "The Anvil" (Tier 2 provocator),
 * Naija the Fisher (Tier 2 net-fighter).
 */
export const DICE_RUMORS: readonly DiceRumor[] = [
  {
    id: 'rumor1',
    title: 'The man on the stair',
    text:
      'Card one, and it is cheap and it is true. Piso keeps a doorman: Cassius the Phalanx, who holds the stair of the Palm and writes down every debt the table invents. He drinks at the third hour, and a man cannot hold a spear and a secret at once. Put him on the sand — he names the book.',
    bout: {
      key: 'rumor1',
      opponentId: 'opp_hoplite',
      staging: 'Cassius the Phalanx',
    },
  },
  {
    id: 'rumor2',
    title: 'The tali in the sewn pouch',
    text:
      'Card two, and it costs more than the first. The dice on that table are honest; the pair that comes out at the pour is not. Brutus "The Anvil" carries them in a pouch sewn into his belt and swaps them when the cup goes round. He is a wall with a mouth. Crack the wall, and the mouth tells you who paid for the pouch.',
    bout: {
      key: 'rumor2',
      opponentId: 'opp_brutus_anvil',
      staging: 'Brutus "The Anvil"',
    },
  },
  {
    id: 'rumor3',
    title: 'The cup that leaves the table',
    text:
      'Card three, and after this there is no one left to ask but him. The switch is made after the pour, when the cup leaves the table — and Naija the Fisher is the hand that lifts it. Beat her net, and the last name is yours: Titus Piso, called the Smiler. He does not fight.',
    bout: {
      key: 'rumor3',
      opponentId: 'opp_naija_fisher',
      staging: 'Naija the Fisher',
    },
  },
];

/**
 * STORY-5a — authored staging (R5).  The champion Piso sends when the offer is
 * refused: Kallias of Sparta, a Tier 3 champion — a name with a price on it, and
 * Piso has paid it.  A different row from every other row the trail stages.
 */
export const DICE_ENDING_CHAMPION: DiceTrailBout = {
  key: 'ending',
  opponentId: 'opp_kallias_sparta',
  staging: 'Kallias of Sparta',
};

/** Every staged row of the slice, for the mercy fence and the panel. */
export const DICE_TRAIL_BOUTS: readonly DiceTrailBout[] = [
  DICE_CHAIN_CHAMPION,
  ...DICE_RUMORS.map((rumor) => rumor.bout),
  DICE_ENDING_CHAMPION,
];

/** The roster rows this slice stages.  Read from the table, never a second list. */
const DICE_TRAIL_STAGED_IDS: ReadonlySet<string> = new Set(
  DICE_TRAIL_BOUTS.map((bout) => bout.opponentId)
);

/** The roster lookup the staged ids resolve through. */
const ROSTER_BY_ID = new Map(ALL_OPPONENTS.map((opponent) => [opponent.id, opponent]));

/** The staged bout's own roster row, or `undefined` if the roster no longer has it. */
export function diceTrailBoutOpponent(bout: DiceTrailBout): OpponentConfig | undefined {
  return ROSTER_BY_ID.get(bout.opponentId);
}

/**
 * Is this opponent a row the dice trail stages?  True for all five (the chain's
 * champion, the three cards' champions and the ending champion).  The MERCY
 * FENCE reads this through `mercyOfferForDuel` below.
 */
export function isDiceTrailStaged(opponent: OpponentConfig | null | undefined): boolean {
  return !!opponent && typeof opponent.id === 'string' && DICE_TRAIL_STAGED_IDS.has(opponent.id);
}

/* ── The words (authored in voice; the design writes none of them) ────────── */

/** Step 1's card.  The counter's own line tells the player where the price is. */
export const QUIET_DICE_STEP_LINES = {
  1: 'Aelia Prisca tests a new face by what it pays for. Buy a rumour from the list above — 15 gold for the deep card — and she will know whether you came for the wine or for the truth.',
  2: 'She names him without lowering her voice. Flaccus the Nimble: quick hands, quicker knife, and Piso’s man since the spring. Beat him on the sand and come back to me.',
  3: 'Flaccus talked. Come back to her counter and hear what he said.',
} as const;

/** The chain's closing line — the ONLY thing that opens the board (§2.4 step 3). */
export const QUIET_DICE_CLOSING_LINE = 'Now. About the dice.';

/** Her backstory beat, told once, with the chain's own reward. */
export const QUIET_DICE_BACKSTORY_LINE =
  'Her brother fought for the Palm’s purse, she says, and owed the table money he never borrowed, at dice that never rolled honest. He is in the ground south of the gate. The table is still dealing.';

/** The house cup — pure flavour, stated as such, and it wears no mechanic. */
export const HOUSE_CUP_LINE =
  'She sets a battered bronze cup on the counter and does not explain it. Your wine at her counter is, from tonight, noticeably less watered.';

/** The tavern's ordinary cup line, for a gladiator who has not earned the house cup. */
export const TAVERN_WINE_LINE = 'The wine is watered and the keeper does not pretend otherwise.';

/** Piso's offer, printed before either answer (§3A's ending choice). */
export const PISO_OFFER_LINE =
  'Titus Piso, called the Smiler, sends a cup of unwatered wine and a smile that has never once been honest: “Three of my people on the sand in a week. You are wasted on her. Take the gold and forget the book.”';

/** The two answers to Piso's offer. */
export type DiceChoice = 'cut' | 'refused';

/**
 * THE FULL COST, printed BEFORE the choice is made — the acceptance rule, not
 * decoration.  Each line names what that answer pays and what it takes.
 */
export const DICE_CHOICE_COST_LINES: Record<DiceChoice, string> = {
  cut: `Take his cut: +${DICE_CUT_GOLD} gold, now. Aelia Prisca’s rumour counter closes to you permanently — she will never sell you a word again — and the Palm will remember your face.`,
  refused:
    'Refuse him: no gold now. His champion, Kallias of Sparta, meets you on the sand; win and the purse is Kallias’s own, paid to the copper, and nothing more.',
};

/** What the panel says once an answer is given (mutually exclusive, for good). */
export const DICE_CHOICE_LINES: Record<DiceChoice, string> = {
  cut: 'You took the Smiler’s coin. The keeper counts out your change without looking at you, and the words that used to be for sale are not for sale to you.',
  refused:
    'You put the cup back on the table. Piso’s smile does not move. “Kallias, then.” His champion is waiting on the sand.',
};

/** The closure, printed in place of the rumour list once 'cut' is answered. */
export const RUMOURS_CLOSED_LINE =
  'Aelia Prisca will not sell you a word. Not tonight, not ever — the Palm’s counter is shut to you, and the list of names is gone.';

/* ── The state (nested in `story`; no top-level field is added) ──────────── */

/**
 * STORY-5a — the chain's and the board's own state, stored INSIDE the existing
 * `story` object exactly as STORY-4b's `story.bountyRungs` is.  §J stays at 22
 * optional top-level profile fields and `records` stays last.
 *
 * Two of the chain's three steps are DERIVED and stored nowhere: step 1 from
 * `intel` (a deep card bought), step 2 from `defeatedOpponentIds` (his champion
 * beaten).  `boardOpen` is step 3 — the return to her counter — and it is also
 * the chain's completion (the write that pays it).  `rumorsWon` is the board's
 * clear order, like a bounty rung's; `cup` is the cosmetic the chain hands over.
 */
export type { DiceTrailProgress };

/**
 * STORY-5a — LAUDES: the SHARED honour counter, nested in `records` so §J is
 * untouched.  `records.laudes` is written by `withLaudes` and read by
 * `resolveLaudes`, and LUDI PHASE A MUST REUSE BOTH for its daily Laurels — do
 * not invent a second counter, a second field or a parallel name for the same
 * number.  A malformed or absent value reads as 0.
 */
export function resolveLaudes(profile: PlayerProfile | null | undefined): number {
  const stored = profile?.records;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return 0;
  const laudes = (stored as { laudes?: unknown }).laudes;
  return typeof laudes === 'number' && Number.isFinite(laudes) && laudes > 0
    ? Math.floor(laudes)
    : 0;
}

/** The stored `records` object, or `{}` — the same lazy read every records writer uses. */
function recordsObject(profile: PlayerProfile): Record<string, unknown> {
  const stored = profile.records;
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? { ...(stored as Record<string, unknown>) }
    : {};
}

/**
 * Add Laudes to the shared counter.  Pure and identity-stable: a non-positive
 * amount, or no profile, returns the profile untouched.  THE ONE writer of
 * `records.laudes` — Ludi Phase A extends this, never forks it.
 */
export function withLaudes(
  profile: PlayerProfile | null | undefined,
  amount: number
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (!Number.isFinite(amount) || amount <= 0) return profile;
  return {
    ...profile,
    records: { ...recordsObject(profile), laudes: resolveLaudes(profile) + Math.floor(amount) },
  };
}

/** The stored story field, read defensively. */
function storedStory(profile: PlayerProfile | null | undefined): Partial<StoryProgress> {
  const stored = profile?.story;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return stored as Partial<StoryProgress>;
}

/** The trail state as resolved: known card ids only, in clear order, deduped. */
export interface ResolvedDiceTrail {
  boardOpen: boolean;
  rumorsWon: DiceRumorId[];
  cup: boolean;
}

const RUMOR_IDS: ReadonlySet<string> = new Set(DICE_RUMORS.map((rumor) => rumor.id));

export function resolveDiceTrail(profile: PlayerProfile | null | undefined): ResolvedDiceTrail {
  const stored = storedStory(profile).diceTrail;
  const raw = stored && typeof stored === 'object' ? stored : undefined;
  const won = Array.isArray(raw?.rumorsWon) ? (raw?.rumorsWon as unknown[]) : [];
  const rumorsWon: DiceRumorId[] = [];
  for (const value of won) {
    if (typeof value !== 'string' || !RUMOR_IDS.has(value)) continue;
    if (rumorsWon.includes(value as DiceRumorId)) continue;
    rumorsWon.push(value as DiceRumorId);
  }
  return {
    boardOpen: raw?.boardOpen === true,
    rumorsWon,
    cup: raw?.cup === true,
  };
}

/** The chain's three steps, DERIVED: no stored step counter exists anywhere. */
export function diceChainSteps(profile: PlayerProfile | null | undefined): {
  step1Done: boolean;
  step2Done: boolean;
  complete: boolean;
} {
  const step1Done = resolveIntel(profile).length > 0;
  const felled = Array.isArray(profile?.defeatedOpponentIds) ? profile?.defeatedOpponentIds : [];
  const step2Done = felled.includes(DICE_CHAIN_CHAMPION.opponentId);
  return { step1Done, step2Done, complete: resolveDiceTrail(profile).boardOpen };
}

/**
 * STEP 3's trigger: is her closing line owed?  True only between his champion's
 * defeat and the return to her counter — the exact moment the panel opens on.
 */
export function diceChainAwaitingReturn(profile: PlayerProfile | null | undefined): boolean {
  const steps = diceChainSteps(profile);
  return steps.step1Done && steps.step2Done && !steps.complete;
}

/** Has the 'cut' answer closed her rumour service?  There is no un-close path. */
export function isRumourServiceClosed(profile: PlayerProfile | null | undefined): boolean {
  return storedStory(profile).diceEnding === 'cut';
}

/** Piso's answer, or `undefined` while the offer is unanswered. */
export function diceChoiceOf(profile: PlayerProfile | null | undefined): DiceChoice | undefined {
  const ending = storedStory(profile).diceEnding;
  return ending === 'cut' || ending === 'refused' ? ending : undefined;
}

/* ── The board's view model ──────────────────────────────────────────────── */

export interface DiceRumorState {
  rumor: DiceRumor;
  /** The roster row the card stages, or `undefined` if the roster lost it. */
  opponent: OpponentConfig | undefined;
  unlocked: boolean;
  won: boolean;
}

export interface DiceTrailView {
  step1Done: boolean;
  step2Done: boolean;
  chainComplete: boolean;
  boardOpen: boolean;
  rumors: DiceRumorState[];
  /** All three cards won and no answer given — the offer is on the table. */
  offerOpen: boolean;
  offerChampion: OpponentConfig | undefined;
  choice: DiceChoice | undefined;
  endingChampionWon: boolean;
  cup: boolean;
  laudes: number;
  /** The one bout the panel may enter right now, if any. */
  nextBout: { bout: DiceTrailBout; opponent: OpponentConfig } | undefined;
}

/**
 * Everything the panel draws, derived once from the profile.  Pure: the panel
 * holds no copy of any rule (no unlock order, no price, no offer condition).
 */
export function diceTrailView(profile: PlayerProfile | null | undefined): DiceTrailView {
  const steps = diceChainSteps(profile);
  const trail = resolveDiceTrail(profile);
  const choice = diceChoiceOf(profile);
  const felled = Array.isArray(profile?.defeatedOpponentIds) ? profile?.defeatedOpponentIds : [];

  const rumors: DiceRumorState[] = DICE_RUMORS.map((rumor, index) => {
    const previous = index === 0 ? undefined : DICE_RUMORS[index - 1];
    const won = trail.rumorsWon.includes(rumor.id);
    const unlocked =
      trail.boardOpen && (index === 0 || (!!previous && trail.rumorsWon.includes(previous.id)));
    return {
      rumor,
      opponent: ROSTER_BY_ID.get(rumor.bout.opponentId),
      unlocked,
      won,
    };
  });

  const allWon = rumors.every((entry) => entry.won);
  const offerOpen = trail.boardOpen && allWon && choice === undefined;

  const openRumor = rumors.find((entry) => entry.unlocked && !entry.won);
  let nextBout: DiceTrailView['nextBout'];
  if (!steps.step1Done) nextBout = undefined;
  else if (!steps.step2Done) {
    const opponent = diceTrailBoutOpponent(DICE_CHAIN_CHAMPION);
    nextBout = opponent ? { bout: DICE_CHAIN_CHAMPION, opponent } : undefined;
  } else if (!trail.boardOpen) nextBout = undefined;
  else if (openRumor && openRumor.opponent) {
    nextBout = { bout: openRumor.rumor.bout, opponent: openRumor.opponent };
  } else if (allWon && choice === 'refused') {
    const opponent = diceTrailBoutOpponent(DICE_ENDING_CHAMPION);
    nextBout = opponent ? { bout: DICE_ENDING_CHAMPION, opponent } : undefined;
  }

  return {
    step1Done: steps.step1Done,
    step2Done: steps.step2Done,
    chainComplete: steps.complete,
    boardOpen: trail.boardOpen,
    rumors,
    offerOpen,
    offerChampion: diceTrailBoutOpponent(DICE_ENDING_CHAMPION),
    choice,
    endingChampionWon: felled.includes(DICE_ENDING_CHAMPION.opponentId),
    cup: trail.cup,
    laudes: resolveLaudes(profile),
    nextBout,
  };
}

/* ── The writes ──────────────────────────────────────────────────────────── */

/**
 * STEP 3 — the return to her counter: her closing line is spoken, the board
 * opens, and the chain PAYS what §2.4 says it pays — 5 Laudes into the shared
 * `records.laudes` counter and the house cup (`story.diceTrail.cup`).
 *
 * Identity-stable: a profile whose steps are not both done, or whose board is
 * already open, comes back untouched, so a second open of the panel writes
 * nothing and can never pay twice.
 */
export function withDiceChainClosed(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (!diceChainAwaitingReturn(profile)) return profile;

  const trail = resolveDiceTrail(profile);
  const closed: PlayerProfile = {
    ...profile,
    story: {
      ...storedStory(profile),
      diceTrail: { ...trail, boardOpen: true, cup: true },
    },
  };
  return withLaudes(closed, DICE_CHAIN_LAUDES);
}

/**
 * A TRAIL VICTORY — recorded in the SAME save as the victory itself.
 *
 * The chain's bout needs no write (the ordinary victory write already put his id
 * in `defeatedOpponentIds`, which is what step 2 derives from).  A card's bout is
 * recorded here: only the CARD THAT IS OPEN counts, and only when the row fought
 * is that card's own staged row — so a re-fight, a stale click or a win on a row
 * after the board moved on all come back identity-stable.
 */
export function withDiceTrailVictory(
  profile: PlayerProfile | null | undefined,
  opponentId: string | undefined
): PlayerProfile {
  if (!profile || typeof opponentId !== 'string') return profile as unknown as PlayerProfile;
  const view = diceTrailView(profile);
  if (!view.boardOpen) return profile;
  const open = view.rumors.find((entry) => entry.unlocked && !entry.won);
  if (!open || open.rumor.bout.opponentId !== opponentId) return profile;

  const trail = resolveDiceTrail(profile);
  return {
    ...profile,
    story: {
      ...storedStory(profile),
      diceTrail: { ...trail, rumorsWon: [...trail.rumorsWon, open.rumor.id] },
    },
  };
}

/** A refused answer, with no profile — so it can never be handed to a save writer. */
export type DiceChoiceRejectionReason = 'not-open' | 'already-answered';

export type DiceChoiceResult =
  | { ok: true; profile: PlayerProfile; choice: DiceChoice }
  | { ok: false; reason: DiceChoiceRejectionReason };

/**
 * PISO'S OFFER, ANSWERED — the ONE binary flag (§3A), written in the existing
 * `story.diceEnding`.  Both answers are his, mutually exclusive and permanent:
 * once 'cut' or 'refused' is stored the offer is gone and no second answer is
 * possible (the write and the panel both refuse).
 *
 *   'cut'     — R1: 300 gold paid NOW, and her rumour service closes for good
 *               (derived from the flag; nothing else is written).
 *   'refused' — nothing is paid here.  The champion bout is a standard duel and
 *               its own row's purse is paid by the ordinary victory write (R2),
 *               exactly, with no bonus and no penalty.
 */
export function applyDiceChoice(
  profile: PlayerProfile | null | undefined,
  choice: DiceChoice
): DiceChoiceResult {
  if (!profile) return { ok: false, reason: 'not-open' };
  if (diceChoiceOf(profile) !== undefined) return { ok: false, reason: 'already-answered' };

  const view = diceTrailView(profile);
  if (!view.boardOpen || !view.rumors.every((entry) => entry.won)) {
    return { ok: false, reason: 'not-open' };
  }

  const gold = typeof profile.gold === 'number' && Number.isFinite(profile.gold) ? profile.gold : 0;
  return {
    ok: true,
    choice,
    profile: {
      ...profile,
      ...(choice === 'cut' ? { gold: gold + DICE_CUT_GOLD } : {}),
      story: { ...storedStory(profile), diceEnding: choice },
    },
  };
}

/* ── STORY-4a's mercy fence ──────────────────────────────────────────────── */

/**
 * STORY-5a — A TRAIL BOUT IS NOT A MERCY BOUT.
 *
 * Four of the five staged rows (Cassius, Brutus, Naija and Kallias) are Tier 2+
 * named ladder regulars, so `mercyOfferFor` WOULD offer Spare/Finish on their
 * first defeat — but a tavern bout is fought at Aelia's asking, not in the
 * arena's book: nobody is being spared there and the trail's own record is the
 * thing that moves.  This wrapper is the fence, and it is the ONLY way `App`
 * asks for an offer, so no trail victory can ever raise STORY-4a's choice.
 *
 * The fence does not weaken 4a: the same row fought as an ordinary duel still
 * offers mercy exactly as it always did (`trailStaged: false`).
 */
export function mercyOfferForDuel(
  profile: PlayerProfile | null | undefined,
  opponent: OpponentConfig | null | undefined,
  didWin: boolean,
  trailStaged: boolean,
  /**
   * STORY-4a's own dormant seam, forwarded unchanged: `resolveStoryState` cannot
   * reach Chapter 3 until Stage 2 lands its race-results write, so a suite drives
   * the offer through this argument.  The shipped call (`App`) passes nothing.
   */
  chapterOverride?: number
): MercyOffer | null {
  if (trailStaged) return null;
  return mercyOfferFor(profile, opponent, didWin, chapterOverride);
}
