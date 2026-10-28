/**
 * ===========================================================================
 * STORY-5b — THE ERASED CHAMPION (Story §3C) and "THE NAME IN THE STONE"
 *             (keeper-lives §2.2), the second half of STORY-5.
 * ===========================================================================
 * The Librarian keeps one name somebody paid to erase, and the three oldest
 * counters in the city each remember a piece of it. This module owns that arc's
 * whole rule set; `components/hub/LegendBoutsSection.tsx` (the tournament tab's
 * Legend Bouts), `components/hub/LegendStopPanel.tsx` (the three stops'
 * conversations), `components/hub/FragmentsPage.tsx` (the Codex's Fragments
 * page) are its surfaces, and `App.tsx` is the only place a save is written.
 *
 * THE CHAIN (§2.2), in the order the player walks it:
 *
 *   STEP 1 — 'Read the Codex.'  Opening the Codex page of the Library rack.
 *            LibraryTab DOES distinguish its pages ('road' | 'triumphs' |
 *            'codex'), and the Codex is ONE page holding every section — so the
 *            page-open IS the read, and there is no separate entry list to walk.
 *            RULED HERE (flagged): the 'codex' page counts, and no other rack
 *            page does; the Gladiators page is a section inside it, so opening
 *            the page opens every row at once.  DERIVED from one recorded
 *            boundary (`story.librarianChain`), never from a per-row click.
 *   STEP 2 — 'Beat a name the lists did not hold.'  A FIRST defeat after step 1:
 *            a duel victory over a rival who was NOT in `defeatedOpponentIds` when
 *            the Codex was read.  DERIVED from the felled array against the
 *            boundary step 1 recorded; there is no per-bout tracking anywhere.
 *   STEP 3 — 'Come back to me.'  The return to Dionysios at the Library stop at
 *            Veteran (`deriveRank`: fame >= 150 AND Tier 2).  This is the chain's
 *            completion and its one write (`withLibrarianChainClosed`): the
 *            backstory is told, 5 Laudes are paid into the SHARED counter
 *            (`withLaudes`, STORY-5a's — never a second counter), the vellum is
 *            earned (derived) and the fragment sequence OPENS.
 *
 * THE FRAGMENTS (§3C), in the fixed order the design gives them:
 *   F1 — the Library    (Dionysios of Athens)     — unlocks exhibition 1
 *   F2 — the Barracks   (Titus Aufidius, lanista) — unlocks exhibition 2
 *   F3 — the Bathhouse  (Straton of Corinth)      — unlocks exhibition 3
 * F2 is locked until F1 is found, F3 until F2: the bathhouse is THIRD by design.
 * Each is stored in Story-design §9's own field, `story.fragmentsFound`, in
 * order, capped at three. THE REVEAL FIRES ON F3: the erased champion is FELIX,
 * the Lucky — champion of both arenas a generation ago, chiselled out of the
 * Hall's stone by decree for refusing to throw a fixed final. His COGNOMEN is
 * all that survives and all that is ever written: every string in this module
 * styles him as FELIX and never invents a fuller name.
 *
 * THE EXHIBITIONS: each fragment unlocks one exhibition bout — a staged EXISTING
 * roster row dressed in an era kit from `itemsDB`. The purse is that row's own
 * standard purse (`rewardGold`), paid by the ordinary victory write. Repeatable.
 *
 * THE ECHO BOUT: unlocked ONLY when all three fragments are found — the
 * fragments gate it and nothing else. Its first victory speaks the echo line
 * ONCE (`story.echoWon`); the bout stays repeatable afterwards.
 *
 * ── STORY-5b — Director rulings (RULINGS, not design values; flagged at the
 *    code each one governs so the Director can countermand any of them) ──────
 *   R1  CHAIN GATING (mirroring STORY-5a's board): the fragment conversations are
 *       NOT available before the chain completes. Before it, each of the three
 *       stops shows its normal content; the chain's close unlocks the first
 *       fragment conversation.
 *   R2  NO CHAPTER GATE beyond the chain: the chain's Veteran step already paces
 *       this slice to Chapter-3-era play, so nothing here reads a chapter.
 *   R3  NO MECHANICAL TIMING GATE ON THE REVEAL: the design's "after Vexus + dice
 *       gold" is narrative order, not a lock. No Vexus state exists to gate on,
 *       so F3's reveal fires regardless of the Vexus/dice state.
 *   R4  EXHIBITION RESULT FENCING (load-bearing): an exhibition/echo bout rides
 *       the duel result path with a session flag that SKIPS ladder-identity
 *       bookkeeping — no `defeatedOpponentIds` append, no grudge generation, no
 *       STORY-4a mercy offer, no triumph evaluation, no `fightsWon` /
 *       `fightsLost` counters, no omen consumption. KEPT: the purse, the duel's
 *       one time advance, and the injury on a loss (it is a real bout). The flag
 *       and the fence live in `App`; `isLegendBoutStaged` is the predicate it
 *       reads. Rationale: an exhibition win against a staged ladder row must
 *       never corrupt first-defeat semantics, grudge generation, Codex
 *       faced-states, or the omen.
 *   R5  AUTHORED CONTENT: every fragment text, exhibition staging, era-kit pick
 *       and line is AUTHORED for this slice, flagged 'STORY-5b — authored, not
 *       design-transcribed'. The design names only FELIX and the three stops.
 *   R6  THE LEGEND BOUTS SECTION is built HERE — Beat 4's slot did not exist on
 *       the tournament tab, so this slice builds the slot (not Beat 4's story
 *       content), flagged at the component.
 *
 * NO NEW TOP-LEVEL PROFILE FIELD (§J stays at 22): the chain's progress is a
 * STORY SUBFIELD (`story.librarianChain`), the echo's first victory is
 * `story.echoWon`, the fragments are §9's `story.fragmentsFound`, and the Laudes
 * are nested in `records.laudes`. `createNewProfile()` writes none of them.
 *
 * The module is pure: no storage, no clock, no mutation, no combat import. Every
 * writer returns a NEW profile and is identity-stable when nothing applies, so a
 * caller can compare identity to know whether a save is needed.
 */
import type {
  ArmorItem,
  FighterLoadout,
  LibrarianChainProgress,
  OpponentConfig,
  PlayerProfile,
  StoryProgress,
  WeaponItem,
} from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { getItemById, isWeapon } from '../data/itemsDB';
import { getKeeper, type Keeper } from '../data/keepers';
import { deriveRank, type GladiatorRank } from './rank';
import { withLaudes } from './diceTrail';

/* ── The published values ────────────────────────────────────────────────── */

/**
 * The chain's reward in Laudes (keeper-lives §2.2: "backstory + 5 Laudes +
 * cosmetic: the vellum"). Paid into STORY-5a's shared `records.laudes` counter.
 */
export const LIBRARIAN_CHAIN_LAUDES = 5;

/**
 * STORY-5b — Director ruling R2: the chain's own Veteran step is the only gate,
 * and this is the rank it asks for (read from `deriveRank`, never restated).
 */
export const LIBRARIAN_REQUIRED_RANK: GladiatorRank = 'Veteran';

/* ── The three stops (one keeper, one building, one fragment each) ───────── */

export type LegendStopId = 'library' | 'barracks' | 'bathhouse';

/** One stop: the building the player walks into and the keeper who remembers. */
export interface LegendStop {
  id: LegendStopId;
  /** The `HUB_LOCATIONS` id the city interaction reports. */
  buildingId: string;
  /** The `data/keepers.ts` id standing at that counter. */
  keeperId: string;
  /** How the stop reads in the panels and the Codex. */
  label: string;
}

/**
 * The three stops, in the design's order: the Library first (the chain's own
 * counter), the Barracks second, the Bathhouse THIRD.
 */
export const LEGEND_STOPS: readonly LegendStop[] = [
  {
    id: 'library',
    buildingId: 'records_house',
    keeperId: 'dionysios_of_athens',
    label: 'Records & Lore Library',
  },
  {
    id: 'barracks',
    buildingId: 'gladiator_barracks',
    keeperId: 'titus_aufidius',
    label: 'Gladiator Barracks',
  },
  {
    id: 'bathhouse',
    buildingId: 'bathhouse',
    keeperId: 'straton_of_corinth',
    label: 'Imperial Public Bathhouse',
  },
];

/** The stop a city building hosts, or `undefined` for every other door. */
export function legendStopForBuilding(buildingId: string): LegendStop | undefined {
  return LEGEND_STOPS.find((stop) => stop.buildingId === buildingId);
}

/** The keeper of a stop, read from the shipped registry (never restated). */
export function legendStopKeeper(stop: LegendStop): Keeper | undefined {
  return getKeeper(stop.keeperId);
}

/* ── The words (authored in voice; the design writes none of them) ───────── */

/**
 * STORY-5b — authored, not design-transcribed (R5): the design gives the chain
 * its shape and the reveal its fact, and writes none of these words.
 */

/** The three steps' titles, as the chain card names them. */
export const LIBRARIAN_STEP_TITLES = [
  'Read the Codex.',
  'Beat a name the lists did not hold.',
  'Come back to me.',
] as const;

/** The three steps' own words, at the Library counter. */
export const LIBRARIAN_STEP_LINES = {
  1: 'Read the Codex — the Gladiators page will do, and any page of it will do. I want to know what the lists say to you before I show you what they leave out.',
  2: 'Now beat a man the lists do not already hold. Not a rematch. A name that is not in the book when you step onto the sand, and in it when you step off.',
  3: 'You are a name in this city now. Come back to me and I will show you the one I was paid to cut out.',
} as const;

/**
 * STORY-5b — authored, not design-transcribed (R5): Dionysios's backstory, told
 * once at the chain's close. It names the erasure and never the erased man: his
 * cognomen is the fragments' to recover, not the librarian's to hand over.
 */
export const LIBRARIAN_BACKSTORY_LINES: readonly string[] = [
  'He kept the Hall\'s stone for eleven years, he says, and in his first month a magistrate\'s clerk came with a chisel and a sealed writ. A champion\'s name came off the stone in an afternoon — the letters gone, the hollow left, the hollow left deliberately.',
  'He copied what he could before the chisel reached it, and the copy is short: a cognomen, a generation, and two arenas. He has kept it under the counter ever since, because a name cut out of stone is still a name owed to somebody.',
  'Three counters in this city are older than the writ, he says. The yard, the bath, and this room. Bring me what they remember and I will write him back as far as the law allows — the cognomen, and not one letter more.',
];

/** The chain's closing line, spoken as the fragments open. */
export const LIBRARIAN_CLOSING_LINE = 'Three doors. Ask them what the stone used to say.';

/* ── The fragments (three, in the design's fixed order) ─────────────────── */

export type FragmentId = 'felix_f1' | 'felix_f2' | 'felix_f3';

export interface LegendFragment {
  id: FragmentId;
  /** 1 … 3 — the sequence, and the order `fragmentsFound` records them in. */
  order: number;
  stop: LegendStopId;
  /** The panel's head line. */
  title: string;
  /**
   * STORY-5b — authored, not design-transcribed (R5). The design writes no
   * fragment text: it gives only the reveal fact, which F3 carries.
   */
  text: string;
  /** The exhibition this fragment unlocks, by key. */
  exhibitionKey: LegendBoutKey;
}

/**
 * THE THREE FRAGMENTS. The reveal is F3's, and F3 is the bathhouse's — the
 * design's order, not a preference. Nothing here names FELIX more fully than
 * his cognomen, in any fragment.
 */
export const LEGEND_FRAGMENTS: readonly LegendFragment[] = [
  {
    id: 'felix_f1',
    order: 1,
    stop: 'library',
    title: 'The hollow in the stone',
    text:
      'Dionysios lays a rubbing on the counter: a champion\'s slab from the Veteran Hall, and in the middle of it a shape where letters used to be. The chisel went in level and went in deep, and it went in evenly — this was not anger, it was paperwork. Beneath the hollow, faint as a scar, one letter survived the cut: the tail of an X. He does not say the name. He says the yard will remember the kit, because a lanista never throws away good bronze.',
    exhibitionKey: 'exhibition1',
  },
  {
    id: 'felix_f2',
    order: 2,
    stop: 'barracks',
    title: 'The kit on the high rail',
    text:
      'Titus Aufidius takes you to the back of the barracks, where the old kit hangs on a rail too high for the recruits to reach: a bronze murmillo helm, a mail shirt gone dull, greaves polished by somebody\'s hands and not by time. It was written off the rolls the year of the writ, he says, and the yard kept it because the yard is not the magistrate. On the inside of the greave, scratched where a strap hides it, three letters and no more: FEL. He remembers the man who wore it had a way of taking a shield-cut on the shoulder and laughing at it. He does not remember what the man was called, and says so plainly.',
    exhibitionKey: 'exhibition2',
  },
  {
    id: 'felix_f3',
    order: 3,
    stop: 'bathhouse',
    title: 'FELIX, the Lucky',
    text:
      'Straton of Corinth talks the way bathkeepers talk: slowly, with the steam, and only once. A generation ago, he says, one man held both arenas at the same time — the sand of the Colosseum and the sand of the circus — and the city called him FELIX, the Lucky, and meant it as a joke about how often he should have died. Then came a final that was already decided. He was told to throw it. He put the man on his back instead, and the crowd said his name for a quarter of an hour. By the next games the name was off the stone, off the rolls, off the lips of everybody who wanted to keep their stall. Erased by decree for refusing a fixed final. Only the cognomen survives — FELIX, the Lucky, champion of both arenas, a generation ago. Every other name he had is gone, and Straton says the city is poorer for it and richer for the writ, and does not say which he means.',
    exhibitionKey: 'exhibition3',
  },
];

/** The fragment ids, in sequence — the module's one ordered list. */
export const LEGEND_FRAGMENT_IDS: readonly FragmentId[] = LEGEND_FRAGMENTS.map(
  (fragment) => fragment.id
);

/** One fragment by id, or `undefined` for an id this slice does not own. */
export function getLegendFragment(id: string | undefined): LegendFragment | undefined {
  if (typeof id !== 'string') return undefined;
  return LEGEND_FRAGMENTS.find((fragment) => fragment.id === id);
}

/** The fragment a stop holds. */
export function fragmentForStop(stopId: LegendStopId): LegendFragment | undefined {
  return LEGEND_FRAGMENTS.find((fragment) => fragment.stop === stopId);
}

/**
 * THE NAMING (settled): the Erased Champion has no name to give back — that is
 * the point. The city styles him by his cognomen alone, everywhere.
 */
export const FELIX = 'FELIX';
export const FELIX_STYLE = 'FELIX, the Lucky';

/* ── The staged bouts (existing roster rows, era kits) ──────────────────── */

export type LegendBoutKey = 'exhibition1' | 'exhibition2' | 'exhibition3' | 'echo';

/**
 * An era kit: `itemsDB` item ids, resolved through `getItemById` so no stat,
 * name or colour is restated. The weapon belongs to the staged row's own weapon
 * family, so the fight the row was tuned for is the fight the player gets.
 */
export interface EraKitPick {
  weaponId: string;
  helmId: string;
  chestId?: string;
  armsId: string;
  legsId: string;
}

/** One staged bout: an EXISTING roster row, dressed, plus how the card names it. */
export interface LegendBout {
  key: LegendBoutKey;
  /** The EXISTING roster id. Never a new row. */
  opponentId: string;
  /** The name the Legend Bouts card gives the bout (authored, R5). */
  staging: string;
  /** The line under the card's name (authored, R5). */
  subtitle: string;
  /** The era kit from `itemsDB` (authored picks, R5). */
  kit: EraKitPick;
}

/**
 * STORY-5b — authored staging and era kits (R5). Every kit is a generation-old
 * panoply: bronze and mail, the older kit the Hall's stone remembers, not the
 * gilded Imperial pieces. Every staged row is a standard (non-boss) ladder row,
 * so no boss HUD or telegraph mechanic can fire on one.
 *
 *   exhibition 1 — Marcus the Rookie   (T1, sword & shield) — F1's bout
 *   exhibition 2 — Cassius the Phalanx (T2, spear)          — F2's bout
 *   exhibition 3 — Brutus "The Anvil"  (T2, sword & shield) — F3's bout
 *   echo         — Centurion Drusus    (T3, sword & shield) — FELIX's echo
 *
 * The purses are the rows' own `rewardGold`, read from the roster and restated
 * nowhere (flagged: purses = the staged rows' standard purses).
 */
export const LEGEND_EXHIBITIONS: readonly LegendBout[] = [
  {
    key: 'exhibition1',
    opponentId: 'opp_marcus',
    staging: 'The Old Forms',
    subtitle: 'A recruit drilled in a dead man\'s footwork — bronze helm, iron manica, and nothing modern.',
    kit: {
      weaponId: 'gladius_standard',
      helmId: 'helm_murmillo',
      armsId: 'arms_manica',
      legsId: 'legs_greaves_bronze',
    },
  },
  {
    key: 'exhibition2',
    opponentId: 'opp_hoplite',
    staging: 'The Yard\'s Long Memory',
    subtitle: 'A spearman of the old school, mailed and greaved as the yard kept them.',
    kit: {
      weaponId: 'hoplite_spear',
      helmId: 'helm_galea_iron',
      chestId: 'chest_lorica_hamata',
      armsId: 'arms_manica',
      legsId: 'legs_greaves_bronze',
    },
  },
  {
    key: 'exhibition3',
    opponentId: 'opp_brutus_anvil',
    staging: 'The Fixed Final',
    subtitle: 'A wall of a man in the champion\'s own bronze, fighting like the bout was already bought.',
    kit: {
      weaponId: 'gladius_standard',
      helmId: 'helm_galea_iron',
      chestId: 'chest_lorica_hamata',
      armsId: 'arms_manica_iron',
      legsId: 'legs_greaves_iron',
    },
  },
];

/**
 * STORY-5b — the ECHO BOUT: Centurion Drusus in the old champion's mail, put up
 * for the crowd to see the shape of a man they are not allowed to name. Unlocked
 * ONLY by all three fragments — nothing else gates it.
 */
export const LEGEND_ECHO_BOUT: LegendBout = {
  key: 'echo',
  opponentId: 'opp_centurion_drusus',
  staging: 'The Echo of FELIX',
  subtitle: 'The arena puts up its best man in a dead champion\'s kit and lets the crowd fill in the name.',
  kit: {
    weaponId: 'gladius_standard',
    helmId: 'helm_centurion',
    chestId: 'chest_lorica_hamata',
    armsId: 'arms_manica_iron',
    legsId: 'legs_greaves_iron',
  },
};

/** Every staged bout of the slice, in card order. */
export const LEGEND_BOUTS: readonly LegendBout[] = [...LEGEND_EXHIBITIONS, LEGEND_ECHO_BOUT];

/** The roster rows this slice stages. Read from the table, never a second list. */
export const LEGEND_STAGED_IDS: ReadonlySet<string> = new Set(
  LEGEND_BOUTS.map((bout) => bout.opponentId)
);

const ROSTER_BY_ID = new Map(ALL_OPPONENTS.map((opponent) => [opponent.id, opponent]));

/** The staged bout's own roster row (undressed), or `undefined`. */
export function legendBoutBaseRow(bout: LegendBout): OpponentConfig | undefined {
  return ROSTER_BY_ID.get(bout.opponentId);
}

/** One armour piece from the kit, validated against its slot. */
function kitArmor(id: string | undefined, slot: ArmorItem['slot']): ArmorItem | undefined {
  if (typeof id !== 'string') return undefined;
  const item = getItemById(id);
  if (!item || isWeapon(item) || item.slot !== slot) return undefined;
  return item;
}

/**
 * The kit as a `FighterLoadout`, resolved from `itemsDB` (the single source of
 * truth for every stat, name and colour). `undefined` when the database no
 * longer holds a piece — a card whose kit cannot be assembled does not render,
 * rather than fighting in the wrong bronze.
 */
export function legendBoutLoadout(bout: LegendBout): FighterLoadout | undefined {
  const weapon = getItemById(bout.kit.weaponId);
  if (!weapon || !isWeapon(weapon)) return undefined;
  const helm = kitArmor(bout.kit.helmId, 'helm');
  const arms = kitArmor(bout.kit.armsId, 'arms');
  const legs = kitArmor(bout.kit.legsId, 'legs');
  const chest = kitArmor(bout.kit.chestId, 'chest');
  if (!helm || !arms || !legs) return undefined;
  if (bout.kit.chestId !== undefined && !chest) return undefined;
  return {
    weapon: weapon as WeaponItem,
    helm,
    ...(chest ? { chest } : {}),
    arms,
    legs,
  };
}

/**
 * The bout as it is FOUGHT: the existing row, unchanged in id, name, stats, AI
 * and purse, with the era kit on its `loadout`. The row's own `weaponType` is
 * never touched, and the kit's weapon is the same family, so reach and class
 * stay the row's own.
 */
export function legendBoutOpponent(bout: LegendBout): OpponentConfig | undefined {
  const base = legendBoutBaseRow(bout);
  const loadout = legendBoutLoadout(bout);
  if (!base || !loadout) return undefined;
  return { ...base, loadout };
}

/**
 * STORY-5b — Director ruling R4's predicate: is this opponent one of the
 * slice's staged bouts? An exhibition/echo bout rides the duel result path with
 * a session flag; this is how a surface or a suite names what that flag means.
 */
export function isLegendBoutStaged(opponent: OpponentConfig | null | undefined): boolean {
  return !!opponent && typeof opponent.id === 'string' && LEGEND_STAGED_IDS.has(opponent.id);
}

/** The exhibition a fragment unlocks. */
export function exhibitionForFragment(fragment: LegendFragment): LegendBout | undefined {
  return LEGEND_EXHIBITIONS.find((bout) => bout.key === fragment.exhibitionKey);
}

/* ── The chain's state (nested in `story`; no top-level field) ───────────── */

/** The stored story field, read defensively. */
function storedStory(profile: PlayerProfile | null | undefined): Partial<StoryProgress> {
  const stored = profile?.story;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return stored as Partial<StoryProgress>;
}

/** The felled ids as ids — the record step 2 is derived from. */
function felledIds(profile: PlayerProfile | null | undefined): string[] {
  const stored = profile?.defeatedOpponentIds;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string');
}

/** A finite non-negative count, floored; anything malformed reads as 0. */
function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/**
 * The chain's stored record, resolved: a missing, partial or malformed
 * `story.librarianChain` reads as "not read, no boundary, not closed".
 */
export interface ResolvedLibrarianChain {
  codexRead: boolean;
  felledAtRead: number;
  closed: boolean;
}

export function resolveLibrarianChain(
  profile: PlayerProfile | null | undefined
): ResolvedLibrarianChain {
  const raw = storedStory(profile).librarianChain;
  const stored: LibrarianChainProgress =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    codexRead: stored.codexRead === true,
    felledAtRead: countOrZero(stored.felledAtRead),
    closed: stored.closed === true,
  };
}

/** Veteran or above — the chain asks for a rank, and a rank is a floor. */
function rankAtLeastVeteran(rank: GladiatorRank): boolean {
  return rank === 'Veteran' || rank === 'Champion' || rank === 'Legend';
}

/**
 * The chain's three steps, DERIVED:
 *   step 1 — the Codex was opened (the one recorded boundary);
 *   step 2 — a rival who was NOT in `defeatedOpponentIds` at that boundary now
 *            is: a FIRST defeat after step 1. A repeat win grows nothing, and a
 *            first defeat from BEFORE the boundary is inside the count already;
 *   complete — step 3's return was made (`closed`).
 */
export function librarianChainSteps(profile: PlayerProfile | null | undefined): {
  step1Done: boolean;
  step2Done: boolean;
  complete: boolean;
  rank: GladiatorRank;
  veteran: boolean;
} {
  const chain = resolveLibrarianChain(profile);
  const rank = deriveRank(profile);
  return {
    step1Done: chain.codexRead,
    step2Done: chain.codexRead && felledIds(profile).length > chain.felledAtRead,
    complete: chain.closed,
    rank,
    veteran: rankAtLeastVeteran(rank),
  };
}

/**
 * Step 3's trigger: is the return owed? True only between step 2 and the
 * return, and only once the rank the chain asks for is reached.
 */
export function librarianChainAwaitingClose(
  profile: PlayerProfile | null | undefined
): boolean {
  const steps = librarianChainSteps(profile);
  return steps.step1Done && steps.step2Done && !steps.complete && steps.veteran;
}

/** The fragments' stored list, as ids this slice owns, in stored order, deduped. */
export function resolveFragmentsFound(profile: PlayerProfile | null | undefined): FragmentId[] {
  const stored = storedStory(profile).fragmentsFound;
  if (!Array.isArray(stored)) return [];
  const out: FragmentId[] = [];
  for (const value of stored) {
    const fragment = getLegendFragment(typeof value === 'string' ? value : undefined);
    if (!fragment || out.includes(fragment.id)) continue;
    out.push(fragment.id);
  }
  return out;
}

/** Has this fragment been found? */
export function fragmentFound(
  profile: PlayerProfile | null | undefined,
  id: FragmentId
): boolean {
  return resolveFragmentsFound(profile).includes(id);
}

/** The fragment sequence is OPEN once the chain closes (and only then). */
export function legendFragmentsOpen(profile: PlayerProfile | null | undefined): boolean {
  return resolveLibrarianChain(profile).closed;
}

/**
 * Is this fragment's conversation available right now? Only after the chain
 * closes, and only when every earlier fragment is already found — the design's
 * sequence, enforced in one place.
 */
export function fragmentAvailable(
  profile: PlayerProfile | null | undefined,
  fragment: LegendFragment
): boolean {
  if (!legendFragmentsOpen(profile)) return false;
  if (fragmentFound(profile, fragment.id)) return false;
  const found = resolveFragmentsFound(profile);
  return LEGEND_FRAGMENTS.slice(0, fragment.order - 1).every((earlier) =>
    found.includes(earlier.id)
  );
}

/** The next fragment the player may find, if any. */
export function nextFragment(
  profile: PlayerProfile | null | undefined
): LegendFragment | undefined {
  return LEGEND_FRAGMENTS.find((fragment) => fragmentAvailable(profile, fragment));
}

/** All three fragments found — the echo bout's one gate. */
export function allFragmentsFound(profile: PlayerProfile | null | undefined): boolean {
  const found = resolveFragmentsFound(profile);
  return LEGEND_FRAGMENTS.every((fragment) => found.includes(fragment.id));
}

/** Has the echo bout's first victory been spoken? (`story.echoWon`) */
export function resolveEchoWon(profile: PlayerProfile | null | undefined): boolean {
  return storedStory(profile).echoWon === true;
}

/** The vellum cosmetic: the chain is complete, and it wears NO mechanic. */
export function hasVellum(profile: PlayerProfile | null | undefined): boolean {
  return resolveLibrarianChain(profile).closed;
}

/* ── The view models (the surfaces hold no rule) ────────────────────────── */

export interface LegendFragmentState {
  fragment: LegendFragment;
  found: boolean;
  available: boolean;
}

export interface LegendFragmentsView {
  /** The sequence is open — the Codex page and the Legend Bouts exist. */
  open: boolean;
  entries: LegendFragmentState[];
  found: FragmentId[];
}

export function legendFragmentsView(
  profile: PlayerProfile | null | undefined
): LegendFragmentsView {
  return {
    open: legendFragmentsOpen(profile),
    found: resolveFragmentsFound(profile),
    entries: LEGEND_FRAGMENTS.map((fragment) => ({
      fragment,
      found: fragmentFound(profile, fragment.id),
      available: fragmentAvailable(profile, fragment),
    })),
  };
}

export interface LegendBoutState {
  bout: LegendBout;
  /** The dressed row (existing row + era kit), or `undefined` if unusable. */
  opponent: OpponentConfig | undefined;
  unlocked: boolean;
  /** The words printed while the bout is sealed. */
  gateText: string;
}

export interface LegendBoutsView {
  /** R1/§3C: no section at all until the chain opens the sequence. */
  visible: boolean;
  exhibitions: LegendBoutState[];
  echo: LegendBoutState | undefined;
}

/**
 * The Legend Bouts, resolved once. An exhibition is unlocked by ITS fragment;
 * the echo by all three and by nothing else. A bout whose roster row or kit no
 * longer resolves is dropped rather than half-drawn.
 */
export function legendBoutsView(profile: PlayerProfile | null | undefined): LegendBoutsView {
  const open = legendFragmentsOpen(profile);
  const found = resolveFragmentsFound(profile);

  const exhibitions: LegendBoutState[] = LEGEND_EXHIBITIONS.map((bout, index) => {
    const fragment = LEGEND_FRAGMENTS[index];
    return {
      bout,
      opponent: legendBoutOpponent(bout),
      unlocked: open && !!fragment && found.includes(fragment.id),
      gateText: fragment
        ? `Sealed — ${fragment.title.toLowerCase()} is still to be found.`
        : 'Sealed.',
    };
  }).filter((entry) => entry.opponent !== undefined);

  const echoOpponent = legendBoutOpponent(LEGEND_ECHO_BOUT);
  const echo: LegendBoutState | undefined = echoOpponent
    ? {
        bout: LEGEND_ECHO_BOUT,
        opponent: echoOpponent,
        unlocked: open && allFragmentsFound(profile),
        gateText: 'Sealed — the city will not put him up until all three fragments are found.',
      }
    : undefined;

  return { visible: open, exhibitions, echo };
}

/**
 * One stop's conversation, resolved: the chain's closing backstory at the
 * Library while the return is owed, then the stop's fragment once the sequence
 * is open (a found fragment stays readable — lore panels are re-readable), and
 * `null` — the stop's NORMAL content — in every other case (Director ruling R1:
 * before the chain completes the stops show what they always showed).
 */
export interface LegendStopConversation {
  stop: LegendStop;
  keeper: Keeper;
  kind: 'return' | 'fragment';
  title: string;
  lines: string[];
  /** Present for `kind: 'fragment'` — the fragment being read. */
  fragment?: LegendFragment;
}

export function legendStopConversation(
  profile: PlayerProfile | null | undefined,
  buildingId: string
): LegendStopConversation | null {
  const stop = legendStopForBuilding(buildingId);
  if (!stop) return null;
  const keeper = legendStopKeeper(stop);
  if (!keeper) return null;

  // The chain's own close: the Library counter, while the return is owed.
  if (stop.id === 'library' && librarianChainAwaitingClose(profile)) {
    return {
      stop,
      keeper,
      kind: 'return',
      title: 'The name he was paid to erase',
      lines: [...LIBRARIAN_BACKSTORY_LINES, LIBRARIAN_CLOSING_LINE],
    };
  }

  if (!legendFragmentsOpen(profile)) return null;

  const fragment = fragmentForStop(stop.id);
  if (!fragment) return null;
  const found = fragmentFound(profile, fragment.id);
  const available = fragmentAvailable(profile, fragment);
  if (!found && !available) return null;

  return {
    stop,
    keeper,
    kind: 'fragment',
    title: fragment.title,
    lines: [fragment.text],
    fragment,
  };
}

/** The echo's first-victory reveal line: spoken ONCE, at the first win. */
export const ECHO_FIRST_VICTORY_LINE =
  'The crowd says the old name before it remembers it is not allowed to. FELIX, the Lucky — spoken once, out loud, in the arena, a generation late.';

/* ── The writes ─────────────────────────────────────────────────────────── */

/**
 * STEP 1 — the Codex was opened. Records the boundary step 2 is derived against:
 * how many names the lists already held at that moment. Identity-stable once
 * read, so every later Codex open writes nothing.
 */
export function withCodexRead(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (resolveLibrarianChain(profile).codexRead) return profile;
  const story = storedStory(profile);
  const previous: LibrarianChainProgress = story.librarianChain ?? {};
  return {
    ...profile,
    story: {
      ...story,
      librarianChain: {
        ...previous,
        codexRead: true,
        felledAtRead: felledIds(profile).length,
      },
    },
  };
}

/**
 * STEP 3 — the return to Dionysios at Veteran: the chain's one write. Tells the
 * backstory (the panel's words), pays 5 Laudes into STORY-5a's SHARED
 * `records.laudes` counter through `withLaudes`, marks the chain closed (which
 * opens the fragment sequence and earns the vellum) and nothing else.
 *
 * Identity-stable: a profile whose steps are not both done, whose rank is below
 * Veteran, or whose chain is already closed comes back untouched — so a second
 * open of the counter writes nothing and can never pay twice.
 */
export function withLibrarianChainClosed(
  profile: PlayerProfile | null | undefined
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (!librarianChainAwaitingClose(profile)) return profile;
  const story = storedStory(profile);
  const previous: LibrarianChainProgress = story.librarianChain ?? {};
  const closed: PlayerProfile = {
    ...profile,
    story: {
      ...story,
      librarianChain: { ...previous, codexRead: true, closed: true },
    },
  };
  return withLaudes(closed, LIBRARIAN_CHAIN_LAUDES);
}

/**
 * A FRAGMENT READ — recorded in the same save as the read. Only the NEXT
 * fragment in sequence can be recorded, only once the sequence is open, and a
 * repeat read writes nothing (identity-stable).
 */
export function withFragmentFound(
  profile: PlayerProfile | null | undefined,
  fragmentId: string | undefined
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const fragment = getLegendFragment(fragmentId);
  if (!fragment) return profile;
  if (!fragmentAvailable(profile, fragment)) return profile;
  return {
    ...profile,
    story: {
      ...storedStory(profile),
      fragmentsFound: [...resolveFragmentsFound(profile), fragment.id],
    },
  };
}

/** The echo's reveal is owed: all three fragments found and not yet spoken. */
export function echoRevealOwed(profile: PlayerProfile | null | undefined): boolean {
  return allFragmentsFound(profile) && !resolveEchoWon(profile);
}

/**
 * THE ECHO'S FIRST VICTORY — `story.echoWon`, written once, and only when all
 * three fragments are found. The bout itself stays repeatable; this flag only
 * decides whether the reveal line is still owed.
 */
export function withEchoWon(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (!echoRevealOwed(profile)) return profile;
  return {
    ...profile,
    story: { ...storedStory(profile), echoWon: true },
  };
}
