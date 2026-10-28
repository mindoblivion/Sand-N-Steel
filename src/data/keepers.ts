/**
 * ===========================================================================
 * SAND & STEEL — THE KEEPERS OF THE CITY (slice K1)
 * ===========================================================================
 * The people who stand behind each counter in the hub: who they are, what they
 * call themselves, and the two things they say — a first-visit greeting and the
 * line they fall back on once they know your face.
 *
 * DATA AND PRESENTATION ONLY.  This module owns no stock, no price, no purchase
 * and no combat rule: the shops keep selling exactly what `data/shops.ts` says
 * they sell, and no keeper is ever an opponent — nothing here is added to
 * `data/opponents.ts` or to any racing rival pool.
 *
 * `buildingId` is the `HUB_LOCATIONS` id the keeper's building carries in
 * `utils/cityCollisions.ts` wherever one exists.  One building has no id of its
 * own in the registry and uses a stable slug instead — the Chariot Workshop,
 * because the `stable` location already hosts the stable's own keeper and the
 * four storefront plates must stay one-to-one: see `SLUG_BUILDINGS`.
 *
 * ── The save ─────────────────────────────────────────────────────────────
 * `PlayerProfile.seenKeepers?: string[]` records the keeper ids the player has
 * actually met.  It is optional exactly like `chariot`, `racing` and `intel`: a
 * save written before this slice has no field at all and must keep loading, so
 * every read goes through `resolveSeenKeepers`, which answers `[]` for a missing,
 * null or malformed field and drops ids the registry no longer knows.  Nothing
 * migrates it and `createNewProfile()` never writes it — the field appears the
 * first time a storefront's keeper is actually opened.
 *
 * `recordKeeperVisit` is idempotent in the way that matters for a save: a keeper
 * already met returns the SAME profile reference, so a repeated render, a second
 * mount or a stale click can never rewrite the save.  A first visit returns a NEW
 * profile with only `seenKeepers` changed.
 */

import type { PlayerProfile } from '../types/game';
import type { StorefrontId } from './shops';

/** One keeper: who they are, where they stand, and what they say. */
export interface Keeper {
  /** Stable id, also the value recorded in `PlayerProfile.seenKeepers`. */
  id: string;
  /** The `HUB_LOCATIONS` id of the keeper's building (or a documented slug). */
  buildingId: string;
  /** The full display name, called names included: `Scribonia, called "the Ledger"`. */
  name: string;
  /** What the city calls them: `the clerk`, `the Doctore`. */
  title: string;
  /** Said the first time the player opens their counter. */
  firstVisitLine: string;
  /** Said on every later visit, chosen deterministically by visit count. */
  repeatLines: string[];
  /**
   * Day/Night T3 — what the counter says after dark, when the stall is kept by the
   * night clerk. Optional: a keeper without one simply keeps saying his own lines, and
   * nothing about stock, prices or availability changes with the hour.
   */
  nightLine?: string;
}

/**
 * Buildings with no `HUB_LOCATIONS` id of their own.  The Chariot Workshop is a
 * distinct building in the keeper data, while the registry's `stable` location
 * covers the stable AND the workshop and already carries its own keeper; a later
 * slice wires the workshop's plate to that hub's chariot subview.
 */
export const SLUG_BUILDINGS: ReadonlySet<string> = new Set(['chariot_workshop']);

/** The registry, in the order the city introduces its keepers. */
export const KEEPERS: Keeper[] = [
  {
    id: 'sextus_ferratus',
    buildingId: 'smithing_forge',
    name: 'Sextus Ferratus',
    title: 'weaponsmith',
    firstVisitLine:
      "Grip it like you mean it. Every blade here is honest steel at an honest price — the Forge sells weapons, nothing else. Armor is across the way, at Salvia's.",
    repeatLines: [
      "Your edge is nicked again. You block with the sharp side, boy — that's what the flat is for.",
    ],
    nightLine:
      "Sextus has banked the forge and gone up. I'm the night clerk — the blades are his, the prices are his, and the lamp is mine.",
  },
  {
    id: 'salvia_coriaria',
    buildingId: 'armor_workshop',
    name: 'Salvia Coriaria',
    title: 'armorer',
    firstVisitLine:
      'Stand still — a cuirass fitted by eye is a coffin fitted by guess. Every piece of armor in the city is sold here, and the fitting is free.',
    repeatLines: [
      "You've filled out since the last fitting. Winning suits you. The straps remember, even if you don't.",
    ],
    nightLine:
      "Salvia's asleep and the straps can wait till morning — but I'm the night clerk, and the rack is open. Fittings by lamplight, same as by day.",
  },
  {
    id: 'pasion_of_alexandria',
    buildingId: 'general_store',
    name: 'Pasion of Alexandria',
    title: 'Bazaar keeper',
    firstVisitLine:
      "Poultices, salves, and small mercies! A poultice eases a hurt by one fight for 20 — and my salve ends it whole for 90. The Medica's own receipt, bottled by me.",
    repeatLines: [
      'You walk like a man shopping for a poultice. Twenty gold, and you walk out like a statue.',
    ],
    nightLine:
      "The stall is kept by the night clerk now. Poultices and salves are exactly where Pasion left them, at exactly his prices.",
  },
  {
    id: 'gaius_norbanus_sura',
    buildingId: 'merchant_house',
    name: 'Gaius Norbanus Sura',
    title: 'the factor',
    firstVisitLine:
      'You are expected — eventually, everyone with gold is. This house keeps only the rare and the legendary. If you must ask a price twice, it is not for you.',
    repeatLines: ['The Vipers are still here. They wait better than you do.'],
    nightLine:
      "The factor keeps civilised hours; I don't. I'm the night clerk — the rare shelf is locked, not closed, and I know where he keeps the key.",
  },
  {
    id: 'antiochis_of_pergamon',
    buildingId: 'arena_medical_house',
    name: 'Antiochis of Pergamon',
    title: 'the Medica',
    firstVisitLine:
      'Sit — before you fall and make it two injuries. A lost fight leaves you hurt: weaker and slower for three fights after. I end it here for 75 gold, whole and clean.',
    repeatLines: [
      'Back again. At this rate I should charge the Colosseum rent — you are here more often than its statues.',
    ],
  },
  {
    id: 'barates_of_palmyra',
    buildingId: 'caravanserai',
    name: 'Barates of Palmyra',
    title: 'the host',
    firstVisitLine:
      'Rest, friend — real rest. Twenty-five gold, and your hurt fades two fights sooner. The Medica is quicker; I am cheaper. We are both honest.',
    repeatLines: [
      'Your usual pallet is free, and I have kept the noisy Romans at the far end. You are welcome.',
    ],
  },
  {
    id: 'hanno_of_carthage',
    buildingId: 'stable',
    name: 'Hanno of Carthage',
    title: 'the stablemaster',
    firstVisitLine:
      'Easy — speak low. The horses judge you before I do. Biga is yours by right; Triga is 750 when your team is ready, Quadra 1,500 after. I will teach you the rein myself.',
    repeatLines: [
      'Your pair took their water well. A driver who waters his horses before himself may live to grow old.',
    ],
  },
  {
    id: 'decimus_rotarius',
    buildingId: 'chariot_workshop',
    name: 'Decimus Rotarius',
    title: 'the faber',
    firstVisitLine:
      "Mind the shavings. Wheels and finishes are mine — Reinforced at 450, fitted while you watch. The spiked ones? Not until they measure true. I don't sell maybes.",
    repeatLines: [
      "She rolls straight. Bring her back when she doesn't — and don't let the smith touch her. He thinks in iron.",
    ],
  },
  {
    id: 'aulus_galerius_rufus',
    buildingId: 'gladiator_academy',
    name: 'Aulus Galerius Rufus',
    title: 'the Doctore',
    firstVisitLine:
      "I am Rufus. I don't train names I expect to bury — so we will learn what you are. A session costs 25 times your level, and buys one point of strength, speed, or staying power.",
    repeatLines: ['Again. The sand remembers your feet better than your head remembers my lessons.'],
  },
  {
    id: 'aelia_prisca',
    buildingId: 'tavern',
    name: 'Aelia Prisca',
    title: 'keeper of the Palm',
    firstVisitLine:
      'Sit where I can see you. Wine is coin, but talk is gold: 15 buys you the deep truth on any fighter in the lists — habits, tricks, breaking points.',
    repeatLines: [
      'The dice are honest tonight, which is more than I can say for half my customers. What are you drinking — or who are you asking about?',
    ],
  },
  {
    id: 'dionysios_of_athens',
    buildingId: 'records_house',
    name: 'Dionysios of Athens',
    title: 'the librarian',
    firstVisitLine:
      'Careful — some of these names are older than the stones. Earn triumphs and I will write them here myself. I keep the lists, the titles — and one name someone paid to erase.',
    repeatLines: [
      'Your name is in the new lists. Third page. Earn me a reason to move it to the first.',
    ],
  },
  {
    id: 'scribonia',
    buildingId: 'bounty_hall',
    name: 'Scribonia, called "the Ledger"',
    title: 'the clerk',
    firstVisitLine:
      "Read the board; sign nothing you haven't read twice. Five names, five purses — the deserter last, and he pays best taken alive.",
    repeatLines: ['Paid to the copper, as always. The board has a new name, if your sword is bored.'],
  },
  {
    id: 'cornelius_felix',
    buildingId: 'bounty_hall',
    name: 'Cornelius Felix',
    title: 'the agent',
    firstVisitLine:
      'Contracts, notices, honest work for dishonest hours. Three fresh deeds on my board every morning — small gold, steady fame, no questions either way.',
    repeatLines: [
      'I put your name in two conversations today. Ten percent of whatever comes of them is mine — that was always the arrangement.',
    ],
  },
  {
    id: 'postumia',
    buildingId: 'shrine_temple',
    name: 'Postumia',
    title: 'the priestess',
    firstVisitLine:
      'Fortuna hears everyone; she answers those who pay attention. Leave an offering before a great fight and take the omen she gives — kind or ill, it is yours.',
    repeatLines: [
      'She turned her face from you last time, and you won anyway. Either she is testing you — or you are becoming interesting.',
    ],
  },
  {
    id: 'quintus_caecilius_niger',
    buildingId: 'colosseum',
    name: 'Quintus Caecilius Niger',
    title: 'Editor of the Games',
    firstVisitLine:
      'Every laurel in this city passes through my hands. Fight well, and I will make sure the crowd knows your name before you do.',
    repeatLines: ['The crowd asked for you by name today. By name, gladiator. Do not waste it.'],
  },
  {
    id: 'gnaeus_octavius_mappa',
    buildingId: 'east_circus_arena',
    name: 'Gnaeus Octavius, called "Mappa"',
    title: 'the starter',
    firstVisitLine:
      'When my cloth falls, the gates open — not a breath before. Twelve gates, one signal, no favourites. Not even you.',
    repeatLines: [
      "Clean start, last time. The Vulture's wheel worked at your line by the spina — I saw it, whatever the judges pretended.",
    ],
  },
  {
    id: 'straton_of_corinth',
    buildingId: 'bathhouse',
    name: 'Straton of Corinth',
    title: 'the bathkeeper',
    firstVisitLine:
      "Water's hot, oil's fresh, and everything said in my steam is forgotten by law — mine. Rest your bones; the Thermae ask nothing of you but the dirt.",
    repeatLines: [
      'Heard a thing in the steam about you. Heard three things. Two of them were even true.',
    ],
  },
  {
    id: 'gaius_pontius',
    buildingId: 'veteran_gladiator_hall',
    name: 'Gaius Pontius, called "the Old Wolf"',
    title: 'keeper of the rudis',
    firstVisitLine:
      'I won that, and stayed anyway. Beat the best this city has, then come back. The wooden sword is freedom, and freedom is heavier than it looks.',
    repeatLines: [
      'Still breathing, still hungry. Good. This hall remembers two kinds of men: champions, and warnings.',
    ],
  },
  {
    id: 'belibni_of_babylon',
    buildingId: 'town_gate',
    name: 'Belibni of Babylon',
    title: 'the warden',
    firstVisitLine:
      'New to the city? The gate sees it kindly. Colosseum north, markets east, the fountain at the heart of it — welcome to the sand.',
    repeatLines: ['Out and back in one piece. The tally likes you.'],
  },
  {
    id: 'titus_aufidius',
    buildingId: 'gladiator_barracks',
    name: 'Titus Aufidius',
    title: 'the lanista',
    firstVisitLine:
      'You cost me money, so we understand each other. I bought a fighter, not a corpse — make me rich slowly: win, and live to win again.',
    repeatLines: [
      'The yard talks about your last fight. So does my ledger — and my ledger does not gossip. It approves.',
    ],
  },
];

/**
 * Day/Night T3 — the line the counter speaks after dark: the night clerk's, when the
 * keeper has one, and the keeper's own line otherwise. Empty for a keeper with neither.
 * Display only: it changes no stock, no price and no availability.
 */
export function nightClerkLine(keeper: Keeper): string {
  return keeper.nightLine ?? '';
}

/** The registry by id, so a plate and the save agree on one lookup. */
const KEEPERS_BY_ID = new Map(KEEPERS.map((keeper) => [keeper.id, keeper]));

/** One keeper by id — `undefined` for an id this city does not know. */
export function getKeeper(id: string): Keeper | undefined {
  return KEEPERS_BY_ID.get(id);
}

/**
 * Which keeper stands behind each storefront.  The hub's own `market` tab sells
 * the whole catalogue from no one counter and is deliberately absent.
 */
const STOREFRONT_KEEPERS: Partial<Record<StorefrontId, string>> = {
  forge: 'sextus_ferratus',
  armorer: 'salvia_coriaria',
  bazaar: 'pasion_of_alexandria',
  merchant: 'gaius_norbanus_sura',
};

/** The keeper whose counter a storefront is, or `undefined` for the market. */
export function getKeeperForStorefront(shopId: StorefrontId): Keeper | undefined {
  const id = STOREFRONT_KEEPERS[shopId];
  return id === undefined ? undefined : KEEPERS_BY_ID.get(id);
}

/* ── the save, read lazily ───────────────────────────────────────────────── */

/** The field this module reads, so a bare literal in a suite satisfies it. */
export interface KeeperSeenRecord {
  seenKeepers?: string[] | null;
}

/**
 * The keepers this profile has met, resolved lazily: absent, null or malformed is
 * `[]`; non-strings and ids the registry no longer knows are dropped, and a
 * duplicate keeps its first position.  Always a fresh array.
 */
export function resolveSeenKeepers(profile: KeeperSeenRecord | null | undefined): string[] {
  const raw = profile?.seenKeepers;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    if (!KEEPERS_BY_ID.has(value)) continue;
    if (ids.includes(value)) continue;
    ids.push(value);
  }
  return ids;
}

/** Has this gladiator already met this keeper? A malformed save: no. */
export function hasMetKeeper(profile: KeeperSeenRecord | null | undefined, id: unknown): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return resolveSeenKeepers(profile).includes(id);
}

/**
 * Record a first visit.
 *
 * A keeper already met (or an id the registry does not know) returns the SAME
 * profile reference, so a repeated mount never rewrites the save.  A real first
 * visit returns a NEW profile carrying the existing ids plus this one, with every
 * other field untouched — the caller's own object and array are never mutated.
 */
export function recordKeeperVisit(
  profile: PlayerProfile | null | undefined,
  id: unknown
): PlayerProfile | null {
  if (!profile) return null;
  if (typeof id !== 'string' || !KEEPERS_BY_ID.has(id)) return profile;
  if (hasMetKeeper(profile, id)) return profile;

  return { ...profile, seenKeepers: [...resolveSeenKeepers(profile), id] };
}

/**
 * The repeat line for a given visit count.  Pure and deterministic — the same
 * keeper and count always answer the same line, and successive counts rotate
 * through `repeatLines` in order.  No RNG, so a re-render can never change what
 * the keeper is saying.
 */
export function selectRepeatLine(keeper: Keeper, visitCount: number): string {
  const lines = keeper.repeatLines;
  if (lines.length === 0) return '';
  const count = Number.isFinite(visitCount) ? Math.trunc(Math.abs(visitCount)) : 0;
  return lines[count % lines.length];
}
