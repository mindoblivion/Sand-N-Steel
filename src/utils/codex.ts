/**
 * A5 — THE CODEX (ideas-retention.md §3, System 2; retention build-order step 2).
 *
 * "A gladiator's life, indexed."  The Codex counts what a career has touched and
 * shows the untouched as an invitation.  Every page is a PURE DERIVATION over the
 * profile the game already saves — this module owns no new system, no new counter
 * and no new currency:
 *
 *   • Gladiators    — every opponent row, defeated or not yet faced;
 *   • Bosses        — the boss ladder, with kill marks;
 *   • Horses & Teams— the three team sizes, and every chariot part owned;
 *   • Arms & Armor  — every gear piece in `itemsDB`, grouped into A8's gear sets
 *                     and listed plainly when a piece belongs to none;
 *   • The City      — every hub location walked.
 *
 * ── THE ONE NEW SAVE FIELD ─────────────────────────────────────────────────
 * The City page needs first-visit evidence, and nothing in the save had it.  A5
 * adds ONE lazy array — `records.codexLocations` — nested INSIDE the existing
 * `records` object (A5 — Director ruling R6), so the profile keeps its 22 optional
 * top-level fields and `records` stays last.  It is written by
 * `withCodexLocation` through the caller's own `setProfile` + `saveProfile` pair,
 * on the FIRST trigger of an existing hub interaction only: a repeat visit
 * returns the same profile object, so nothing is saved twice.
 *
 * ── THE FRAGMENTS PAGE (STORY-5b) ──────────────────────────────────────────
 * A5 ruled "no Fragments page: an empty shell would advertise unbuilt story".
 * STORY-5b keeps that property and adds the page: `fragments` is present in the
 * snapshot ONLY once the Librarian chain has closed and opened the fragment
 * sequence (`utils/librarianChain.ts`), so a profile that has not walked the
 * chain sees exactly the five pages it always saw, and no empty shell exists.
 * It is a LORE page, not a counted one: it carries no percentage, no laurel and
 * no denominator, and it is deliberately outside `pages` so the Saga capstone's
 * condition (every SHIPPED page at 100%) is unchanged — re-gating a shipped
 * triumph is not this slice's to do.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 *   • No horse-tiers section (A5 — Director ruling R2): no studio horse tiers are
 *     integrated yet, so the page shows teams and parts only.
 *   • No "best hype" column (A5 — Director ruling R3a): hype is transient per duel
 *     and has no persistent per-opponent record.  DEFERRED until the save carries
 *     one — never invented.
 *   • No portraits (A5 — Director ruling R3b): no opponent art exists anywhere, so
 *     the surface draws an initials seal (the K1 `KeeperPlate` pattern) instead.
 *
 * ── PERCENTAGES AND LAURELS ────────────────────────────────────────────────
 * A page's percentage is `touched / dataset size` (A5 — Director ruling R1's
 * denominators), floored, so 23 of 24 never rounds up to a claim of 100%.  A
 * page's laurel is a DERIVED DISPLAY MARK earned at exactly 100% (R4) — no title,
 * no triumph, no state.  The ONE reward is the full-Codex Saga capstone
 * (`saga_codex_complete` in `utils/triumphs.ts`).
 *
 * Honest counting, stated where it matters: the Gladiators page counts all 24
 * opponent rows including the six bounty rows, which are Chapter-3-gated today.
 * Its 100% — and therefore the full-Codex triumph — is unreachable until Stage 2
 * opens Chapter 3.  That is the count being honest, not a defect.
 */

import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { ITEMS_DB, isWeapon } from '../data/itemsDB';
import { CHARIOT_PARTS } from '../data/chariotParts';
import { getArmatura } from '../data/armaturae';
import { getStorefrontStock } from '../data/shops';
import type { StorefrontId } from '../data/shops';
import { HUB_LOCATIONS } from './cityCollisions';
import { resolveChariotLoadout } from './chariotLoadout';
import { resolveRacingState } from './racingProgression';
// A8's gear grouping is the ONE statement of what a "set" is; the Codex reuses it
// rather than re-deriving it.  This import closes a cycle (triumphs.ts imports
// `isCodexComplete` for the full-Codex capstone), so `GEAR_SETS` is only ever read
// INSIDE a function — never at this module's top level — and both directions are
// safe to initialize in either order.
import { GEAR_SETS } from './triumphs';
// STORY-5b — the Fragments page's gate and rows.  Read-only and one-directional
// (librarianChain never imports this module), so this edge closes no cycle; the
// page is only ever built INSIDE `fragmentsPage`.
import { legendFragmentsOpen, legendFragmentsView } from './librarianChain';

/** The five shipped pages, in reading order. */
export type CodexPageId = 'gladiators' | 'bosses' | 'horses' | 'arms' | 'city';

/** One line of a page: a rival, a boss, a team, a part, a blade, a street. */
export interface CodexEntry {
  id: string;
  name: string;
  /** The second line: class and tier, slot, district — whatever tells them apart. */
  detail: string;
  /** Touched: defeated, killed, unlocked, owned, visited. */
  found: boolean;
  /** Arms & Armor only: the shop that sells it, already named.  Absent = none does. */
  source?: string;
}

/** A sub-list of a page (the ladder, the bounty board, a gear set, a district). */
export interface CodexGroup {
  id: string;
  label: string;
  entries: CodexEntry[];
}

export interface CodexPage {
  id: CodexPageId;
  label: string;
  /** Player-facing: what this page counts. */
  blurb: string;
  groups: CodexGroup[];
  touched: number;
  total: number;
  /** `floor(touched / total * 100)` — never rounds a page up to 100. */
  percent: number;
  /** A5 — Director ruling R4: the derived display laurel, at 100% only. */
  laurel: boolean;
}

export interface CodexSnapshot {
  pages: CodexPage[];
  touched: number;
  total: number;
  percent: number;
  /** Every shipped page at 100% — the Saga capstone's whole condition. */
  complete: boolean;
  /** How many page marks are lit (0 … 5).  A derived display count only — the
   *  Codex keeps no record of it and writes nothing. */
  laurelCount: number;
  /**
   * STORY-5b — the Fragments page, present ONLY once the Librarian chain has
   * opened the fragment sequence.  Absent on every profile that has not walked
   * the chain (so no empty shell is ever advertised), and never one of the
   * counted `pages` above (a lore page is not a completeness denominator).
   */
  fragments?: CodexFragmentsPage;
}

/** One fragment row on the Fragments page.  `text` is present only when found. */
export interface CodexFragmentsEntry {
  id: string;
  order: number;
  title: string;
  /** The authored fragment, present ONLY once the player has found it. */
  text?: string;
  found: boolean;
}

/** STORY-5b — the Codex's lore page: the erased champion's three fragments. */
export interface CodexFragmentsPage {
  id: 'fragments';
  label: string;
  blurb: string;
  entries: CodexFragmentsEntry[];
  found: number;
  total: number;
}

// ── The datasets (A5 — Director ruling R1) ─────────────────────────────────

/**
 * A5 — Director ruling R1: ALL 24 opponent rows — the 12-row tier ladder, the
 * Doctore's Test story bout (his own export, outside `ALL_OPPONENTS`), the five
 * Feature Bouts and the six bounty rows including the Deserter.
 */
export const CODEX_GLADIATOR_ROWS = [...ALL_OPPONENTS, DOCTORE_TEST_OPPONENT];

/**
 * A5 — Director ruling R1: the 9 boss-ladder rows — the four tier champions plus
 * the five Feature Bout bosses.  The Deserter is EXCLUDED: he is `isBoss` (his own
 * telegraph and dress) but he is a posting on the bounty board, not a rung.
 */
export const CODEX_BOSS_ROWS = ALL_OPPONENTS.filter(
  (opponent) => opponent.isBoss === true && opponent.bountyBout !== true,
);

/** A5 — Director ruling R1: the three team sizes. */
export const CODEX_TEAM_SIZES = 3;

/** The denominators as built, exported so a suite pins them rather than a literal. */
export const CODEX_DENOMINATORS: Readonly<Record<CodexPageId, number>> = {
  gladiators: CODEX_GLADIATOR_ROWS.length,
  bosses: CODEX_BOSS_ROWS.length,
  horses: CODEX_TEAM_SIZES + CHARIOT_PARTS.length,
  arms: ITEMS_DB.length,
  city: HUB_LOCATIONS.length,
};

// ── The City's one new record ──────────────────────────────────────────────

const HUB_IDS: ReadonlySet<string> = new Set(HUB_LOCATIONS.map((location) => location.id));

/**
 * The hub locations this gladiator has walked into.  Total and repairing nothing:
 * an absent, malformed or unknown entry resolves to "not yet visited" rather than
 * a guess — the `resolveRecords` contract the neighbouring records keep.
 */
export function resolveCodexLocations(profile: PlayerProfile | null | undefined): string[] {
  const stored = profile?.records;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
  const raw = (stored as { codexLocations?: unknown }).codexLocations;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !HUB_IDS.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * Record a hub location's FIRST visit, inside `records.codexLocations` (A5 —
 * Director ruling R6).  Pure, and identity-stable exactly like `recordKeeperVisit`:
 * an unknown id, an already-recorded id, or no profile at all returns the SAME
 * object, so a caller compares identity and never writes a save twice.
 */
export function withCodexLocation(
  profile: PlayerProfile | null | undefined,
  locationId: unknown,
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  if (typeof locationId !== 'string' || !HUB_IDS.has(locationId)) return profile;

  const already = resolveCodexLocations(profile);
  if (already.includes(locationId)) return profile;

  const stored = profile.records;
  const records =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};

  return {
    ...profile,
    records: { ...records, codexLocations: [...already, locationId] },
  };
}

// ── Small derived readers ──────────────────────────────────────────────────

function felledIdsOf(profile: PlayerProfile): Set<string> {
  const ids = Array.isArray(profile.defeatedOpponentIds) ? profile.defeatedOpponentIds : [];
  return new Set(ids.filter((id): id is string => typeof id === 'string'));
}

/** Every item id the profile OWNS: equipped or carried (A8's own ownership rule). */
function ownedItemIds(profile: PlayerProfile): Set<string> {
  const owned = new Set<string>();
  for (const item of Object.values(profile.equipped ?? {})) {
    if (item && typeof item.id === 'string') owned.add(item.id);
  }
  for (const item of Array.isArray(profile.inventory) ? profile.inventory : []) {
    if (item && typeof item.id === 'string') owned.add(item.id);
  }
  return owned;
}

/** The class line: the armatura's name when the row carries one, else its weapon. */
const WEAPON_LABELS: Readonly<Record<string, string>> = {
  sword_shield: 'Sword & shield',
  spear: 'Spear',
  dual_blades: 'Dual blades',
  mace: 'Mace',
};

function classOf(opponent: { armatura?: string; weaponType?: string }): string {
  const armatura = getArmatura(opponent.armatura);
  if (armatura) return armatura.name;
  return WEAPON_LABELS[opponent.weaponType ?? ''] ?? 'Fighter';
}

const ARMOR_SLOT_LABELS: Readonly<Record<string, string>> = {
  helm: 'Helm',
  chest: 'Cuirass',
  arms: 'Arm guard',
  legs: 'Greaves',
};

const DISTRICT_LABELS: Readonly<Record<string, string>> = {
  NORTH: 'The North',
  SOUTH: 'The South',
  EAST: 'The East',
  WEST: 'The West',
};

/**
 * Where a gear piece is sold, from the storefront catalogue's own stock lists —
 * never a second list.  A piece stocked by the dedicated shop wins over the
 * travelling merchant that also carries rare goods; the buildings are named from
 * `HUB_LOCATIONS`, so a renamed shop renames here too.
 */
const STOREFRONT_BUILDING: Readonly<Record<'forge' | 'armorer' | 'merchant', string>> = {
  forge: 'smithing_forge',
  armorer: 'armor_workshop',
  merchant: 'merchant_house',
};

const SHOP_PRECEDENCE: readonly ('forge' | 'armorer' | 'merchant')[] = [
  'forge',
  'armorer',
  'merchant',
];

let storefrontStockCache: ReadonlyMap<'forge' | 'armorer' | 'merchant', ReadonlySet<string>> | null =
  null;

function storefrontStock(): ReadonlyMap<'forge' | 'armorer' | 'merchant', ReadonlySet<string>> {
  if (storefrontStockCache) return storefrontStockCache;
  const map = new Map<'forge' | 'armorer' | 'merchant', ReadonlySet<string>>();
  for (const id of SHOP_PRECEDENCE) {
    map.set(id, new Set(getStorefrontStock(id as StorefrontId)));
  }
  storefrontStockCache = map;
  return map;
}

/** The name of the shop that sells this piece, or `null` when no city shop does. */
function shopNameFor(itemId: string): string | null {
  const stock = storefrontStock();
  for (const id of SHOP_PRECEDENCE) {
    if (!stock.get(id)?.has(itemId)) continue;
    const buildingId = STOREFRONT_BUILDING[id];
    const building = HUB_LOCATIONS.find((location) => location.id === buildingId);
    return building?.name ?? null;
  }
  return null;
}

// ── The pages ──────────────────────────────────────────────────────────────

function finishPage(
  page: Omit<CodexPage, 'touched' | 'total' | 'percent' | 'laurel'>,
): CodexPage {
  const entries = page.groups.flatMap((group) => group.entries);
  const total = entries.length;
  const touched = entries.filter((entry) => entry.found).length;
  const percent = total === 0 ? 0 : Math.floor((touched / total) * 100);
  return {
    ...page,
    touched,
    total,
    percent,
    // A5 — Director ruling R4: the laurel is the display mark, nothing more.
    laurel: total > 0 && touched === total,
  };
}

function gladiatorsPage(profile: PlayerProfile): CodexPage {
  const felled = felledIdsOf(profile);
  const row = (opponent: (typeof CODEX_GLADIATOR_ROWS)[number]): CodexEntry => ({
    id: opponent.id,
    name: opponent.name,
    detail: `${classOf(opponent)} · Tier ${opponent.tier}`,
    found: felled.has(opponent.id),
  });

  const ladder = ALL_OPPONENTS.filter(
    (opponent) => opponent.featureBout !== true && opponent.bountyBout !== true,
  );
  const feature = ALL_OPPONENTS.filter((opponent) => opponent.featureBout === true);
  const bounty = ALL_OPPONENTS.filter((opponent) => opponent.bountyBout === true);

  return finishPage({
    id: 'gladiators',
    label: 'Gladiators',
    blurb: 'Every rival in the city — the ladder, the story bout, the feature bouts and the board.',
    groups: [
      { id: 'ladder', label: 'The Ladder', entries: ladder.map(row) },
      { id: 'yard', label: "The Doctore's Test", entries: [row(DOCTORE_TEST_OPPONENT)] },
      { id: 'feature', label: 'Feature Bouts', entries: feature.map(row) },
      { id: 'bounty', label: 'The Bounty Board', entries: bounty.map(row) },
    ],
  });
}

/**
 * A5 — THE BOSS-KILL MARK, pinned: `bossKills` is a COUNT of ladder champions
 * (`utils/bossKills.ts`), not an id list, so a row's mark is read from
 * `defeatedOpponentIds` — the record the same victory write appends the id to
 * before it raises the count.  Feature Bout bosses appear ONLY in
 * `defeatedOpponentIds`, so their mark is read from the same place and shows with
 * `bossKills` still empty.  The Deserter is not on this page at all: he is a
 * bounty, not a boss-ladder row (R1).
 */
function bossesPage(profile: PlayerProfile): CodexPage {
  const felled = felledIdsOf(profile);
  const row = (opponent: (typeof CODEX_BOSS_ROWS)[number]): CodexEntry => ({
    id: opponent.id,
    name: opponent.name,
    detail: `${classOf(opponent)} · Tier ${opponent.tier}`,
    found: felled.has(opponent.id),
  });

  const ladderBosses = CODEX_BOSS_ROWS.filter((opponent) => opponent.featureBout !== true);
  const featureBosses = CODEX_BOSS_ROWS.filter((opponent) => opponent.featureBout === true);

  return finishPage({
    id: 'bosses',
    label: 'Bosses',
    blurb: 'The champions of the ladder, and the bosses the arena put in your road.',
    groups: [
      { id: 'ladder', label: 'Champions of the Ladder', entries: ladderBosses.map(row) },
      { id: 'feature', label: 'Bosses of the Feature Bouts', entries: featureBosses.map(row) },
    ],
  });
}

/**
 * A5 — Director ruling R2: teams and parts only.  The horse-tiers section does NOT
 * render until studio horse tiers integrate — no void is advertised.
 */
function horsesPage(profile: PlayerProfile): CodexPage {
  const racing = resolveRacingState(profile);
  const { owned } = resolveChariotLoadout(profile);

  const teams: CodexEntry[] = [
    {
      id: 'team_biga',
      name: 'Biga',
      detail: 'Two horses · every gladiator starts here',
      // Biga is never stored: it is unlocked by definition.
      found: true,
    },
    {
      id: 'team_triga',
      name: 'Triga',
      detail: 'Three horses to the yoke',
      found: racing.unlocked.includes(3),
    },
    {
      id: 'team_quadra',
      name: 'Quadra',
      detail: 'Four horses to the yoke',
      found: racing.unlocked.includes(4),
    },
  ];

  const parts: CodexEntry[] = CHARIOT_PARTS.map((part) => ({
    id: part.id,
    name: part.name,
    detail: `${part.slot[0].toUpperCase()}${part.slot.slice(1)} · ${part.partClass}`,
    // The stock part of every slot is owned by definition, exactly as the
    // workshop's own resolver reads it.
    found: part.defaultOwned || owned.includes(part.id),
  }));

  return finishPage({
    id: 'horses',
    label: 'Horses & Teams',
    blurb: 'The teams you can field, and every part the chariot workshop sells.',
    groups: [
      { id: 'teams', label: 'Teams', entries: teams },
      { id: 'parts', label: 'Chariot Parts', entries: parts },
    ],
  });
}

/**
 * Arms & Armor: every gear piece in `itemsDB`, grouped by A8's own `GEAR_SETS`
 * (a material with no full set is not a set — that is A8's rule, not a gap here),
 * with every remaining piece listed plainly under its own group.  A missing piece
 * is dimmed by the surface and names the shop that sells it, read from the
 * storefront catalogue.
 */
function armsPage(profile: PlayerProfile): CodexPage {
  const owned = ownedItemIds(profile);
  const setItemIds = new Set(GEAR_SETS.flatMap((set) => set.pieces.map((piece) => piece.itemId)));

  const entryFor = (itemId: string): CodexEntry | null => {
    const item = ITEMS_DB.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    const shop = shopNameFor(item.id);
    return {
      id: item.id,
      name: item.name,
      detail: isWeapon(item)
        ? WEAPON_LABELS[item.type] ?? 'Weapon'
        : ARMOR_SLOT_LABELS[item.slot] ?? 'Armour',
      found: owned.has(item.id),
      ...(shop ? { source: shop } : {}),
    };
  };

  const groups: CodexGroup[] = [];

  for (const set of GEAR_SETS) {
    const entries = set.pieces
      .map((piece) => entryFor(piece.itemId))
      .filter((entry): entry is CodexEntry => entry !== null);
    groups.push({ id: set.id, label: set.name, entries });
  }

  const loose = ITEMS_DB.filter((item) => !setItemIds.has(item.id))
    .map((item) => entryFor(item.id))
    .filter((entry): entry is CodexEntry => entry !== null);
  if (loose.length > 0) {
    groups.push({ id: 'ungrouped', label: 'Loose Pieces', entries: loose });
  }

  return finishPage({
    id: 'arms',
    label: 'Arms & Armor',
    blurb: 'Every blade and every plate the city sells — the sets first, then the rest.',
    groups,
  });
}

function cityPage(profile: PlayerProfile): CodexPage {
  const visited = new Set(resolveCodexLocations(profile));
  const groups: CodexGroup[] = [];

  for (const location of HUB_LOCATIONS) {
    const label = DISTRICT_LABELS[location.district] ?? location.district;
    let group = groups.find((candidate) => candidate.label === label);
    if (!group) {
      group = { id: location.district.toLowerCase(), label, entries: [] };
      groups.push(group);
    }
    group.entries.push({
      id: location.id,
      name: location.name,
      detail: location.subtitle,
      found: visited.has(location.id),
    });
  }

  return finishPage({
    id: 'city',
    label: 'The City',
    blurb: 'Every street of the city walked — a door you have not opened is still an invitation.',
    groups,
  });
}

// ── The snapshot ───────────────────────────────────────────────────────────

/** Every shipped page, in reading order.  Data-driven: a later page appends here. */
export function buildCodex(profile: PlayerProfile | null | undefined): CodexSnapshot {
  const source = profile ?? ({} as PlayerProfile);
  const pages = [
    gladiatorsPage(source),
    bossesPage(source),
    horsesPage(source),
    armsPage(source),
    cityPage(source),
  ];

  const total = pages.reduce((sum, page) => sum + page.total, 0);
  const touched = pages.reduce((sum, page) => sum + page.touched, 0);
  const laurelCount = pages.filter((page) => page.laurel).length;
  // STORY-5b — the lore page rides the snapshot, never the counted `pages`.
  const fragments = fragmentsPage(source);

  return {
    pages,
    touched,
    total,
    percent: total === 0 ? 0 : Math.floor((touched / total) * 100),
    complete: pages.every((page) => page.laurel),
    laurelCount,
    ...(fragments ? { fragments } : {}),
  };
}

/**
 * STORY-5b — THE FRAGMENTS PAGE, as data.  `undefined` until the Librarian chain
 * closes (the fragment sequence has not opened), so the page simply does not
 * exist for a profile that has not walked the chain — A5's "no empty shell"
 * property, kept.
 *
 * A found fragment carries its AUTHORED text; an unfound one carries none at all
 * (title and seal only), so the payload itself cannot spoil the reveal — the
 * surface is not the only guard.
 */
function fragmentsPage(profile: PlayerProfile): CodexFragmentsPage | undefined {
  if (!legendFragmentsOpen(profile)) return undefined;
  const entries: CodexFragmentsEntry[] = legendFragmentsView(profile).entries.map((entry) => ({
    id: entry.fragment.id,
    order: entry.fragment.order,
    title: entry.found ? entry.fragment.title : `Fragment ${entry.fragment.order}`,
    ...(entry.found ? { text: entry.fragment.text } : {}),
    found: entry.found,
  }));
  return {
    id: 'fragments',
    label: 'Fragments',
    blurb: 'What three old counters remember of a name the stone no longer holds.',
    entries,
    found: entries.filter((entry) => entry.found).length,
    total: entries.length,
  };
}

/** One page by id — the surface's own accessor, never a second derivation. */
export function codexPage(
  profile: PlayerProfile | null | undefined,
  id: CodexPageId,
): CodexPage | undefined {
  return buildCodex(profile).pages.find((page) => page.id === id);
}

/**
 * THE FULL-CODEX CONDITION — every shipped page at 100%.  Pure derivation over the
 * profile, so A8's existing evaluator can read it as one more fact at a duel
 * result (A5 — Director ruling R4); there is no second evaluator.
 */
export function isCodexComplete(profile: PlayerProfile | null | undefined): boolean {
  return buildCodex(profile).complete;
}
