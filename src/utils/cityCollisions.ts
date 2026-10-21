// Phase 31D — Safe collision recovery and exterior fast travel
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  totalPenetration,
  overlappingColliderIds,
  maxPenetration,
} from './collisionShapes';
import { MOTTE_CENTER_Z, MOTTE_PERIMETER_RADIUS } from './terrainHeight';
// Phase C-8.70B — the East Circus District's race entry position, single-sourced
// with the signpost mesh the district draws (see `circusDistrictGeometry.ts`).
import { CIRCUS_RACE_ENTRY } from './circusDistrictGeometry';
// Phase SHOP-2 — the storefront a hub's shop tab opens (see `data/shops.ts`).
import type { StorefrontId } from '../data/shops';

// ── World movement boundaries ────────────────────────────────────────────
// These four constants describe the CITY square: X is symmetric ±35, and the Z
// axis extends north to reach the Northern
// Motte perimeter: the perimeter's north point is
// MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS (-103.5 since Phase C-8.38 moved the
// motte north with its moat and fortress), and the boundary keeps the same
// documented 2.5-unit margin south of it (-101).  Stating it as that derivation
// rather than a literal means the walkable envelope follows the landmark
// instead of silently shrinking when the landmark moves.  The southern limit
// remains +35.
export const BOUNDARY_X = 35;
export const BOUNDARY_Z_MIN = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5; // -101
export const BOUNDARY_Z_MAX = 35;

// ── Phase C-8.64A / C-8.64B — East Circus District envelope ─────────────
// The city's own limits above are untouched: they still describe the square
// every earlier phase measured (±35 in X, +35 south, the motte-derived north
// limit).  The East Circus District lies entirely outside them — the arena's
// footprint is X 37.60 … 66.34, Z −30.157 … 46.00, and its two entrances are at
// (X 43.34 … 61.34, Z 43.80 … 46.00) and (X 49.84 … 54.84, Z −30.16 … −22.5) —
// so without an envelope there the district could not be walked to at all.
//
// The extension is a rectangle that makes the district usable rather than
// merely reachable:
//   • east 67.5 = the arena's east wall (66.30) + 1.20, so the whole building is
//     inside the walkable area and the player can walk round it instead of into
//     an invisible wall inside its own track (C-8.64A);
//   • north −35.0 = the shell's north tip (−30.157) less 4.84, so the north end
//     can be reached round the sphendone (C-8.64A);
//   • south 55.0 = the forecourt parapet's outer face, i.e. the district's own
//     southern edge (C-8.64B).  C-8.64A ended the band at 47.5 — the carceres'
//     front face (46.00) + 1.50, a 1.50-deep apron — which is not a gathering
//     space.  The district's paved forecourt is 8.40 deep in front of that face
//     and is closed by a parapet, so the band follows the measured district
//     instead of the apron: 55.0 is that wall's outer face, which makes the
//     boundary the player is stopped at south of the forecourt STONE rather
//     than nothing at all.  The whole forecourt pavement (Z 46.10 … 54.50) sits
//     inside it.
//
// It is a *union* with the city square, not a replacement: the band applies
// only east of BOUNDARY_X and only inside that Z range, so the city's own
// envelope is bit-for-bit what it was.  Two rules keep the union consistent at
// its shared edge (X = BOUNDARY_X), and both are load-bearing:
//   • clampBoundaryX may not clamp a point WEST of BOUNDARY_X while it is south
//     of the city square.  There is no walkable ground there (the union holds
//     only the district band south of Z 35), so clamping inward would leave the
//     player inside the city square's Z range and the following Z clamp would
//     then snap them north — measured before this rule existed: a step west
//     from (36, 50) teleported the player to (35, 35), a 15-unit jump.
//   • clampBoundaryZ treats X = BOUNDARY_X itself as district, so a player
//     clamped exactly onto the city's east limit is never pulled back into the
//     square's Z range by the axis that runs second.
export const CIRCUS_ENVELOPE_X_EAST = 67.5;
export const CIRCUS_ENVELOPE_Z_MIN = -35.0;
export const CIRCUS_ENVELOPE_Z_MAX = 55.0;

/** Phase C-8.64A/B — clamp an X move: the district's band is open east only. */
export function clampBoundaryX(x: number, z: number): number {
  const inDistrictBand = z >= CIRCUS_ENVELOPE_Z_MIN && z <= CIRCUS_ENVELOPE_Z_MAX;
  const east = inDistrictBand ? CIRCUS_ENVELOPE_X_EAST : BOUNDARY_X;
  // South of the city square the district band is the union's only rectangle,
  // so its west edge is BOUNDARY_X, not −BOUNDARY_X.
  const west = inDistrictBand && z > BOUNDARY_Z_MAX ? BOUNDARY_X : -BOUNDARY_X;
  return Math.max(west, Math.min(east, x));
}

/** Phase C-8.64A/B — clamp a Z move: east of the city the district's band applies. */
export function clampBoundaryZ(x: number, z: number): number {
  // >= so the shared edge belongs to the district side too (see above).
  const inDistrict = x >= BOUNDARY_X;
  const zMin = inDistrict ? CIRCUS_ENVELOPE_Z_MIN : BOUNDARY_Z_MIN;
  const zMax = inDistrict ? CIRCUS_ENVELOPE_Z_MAX : BOUNDARY_Z_MAX;
  return Math.max(zMin, Math.min(zMax, z));
}

// ── Phase 31H: Recovery history for oscillation detection ───────────────
// Tracks the last N source positions of fallback calls.  Candidates that
// would reverse to a recently visited position are rejected, breaking
// oscillation cycles.  The history is cleared whenever the normal resolver
// makes progress, so it only accumulates while the player is stuck.
const RECOVERY_HISTORY_SIZE = 8;
const _recoveryHistory: Array<[number, number]> = [];

/**
 * Phase 31J — Reset the recovery-history buffer.
 *
 * Called after a fast-travel teleport so stale oscillation-prevention
 * entries from a prior location don't cause the fallback to reject valid
 * escape candidates at the new position.  Safe to call at any time —
 * clearing an already-empty buffer is a no-op.
 */
export function clearRecoveryHistory(): void {
  _recoveryHistory.length = 0;
}

function isInRecoveryHistory(x: number, z: number): boolean {
  for (const [hx, hz] of _recoveryHistory) {
    if (Math.abs(hx - x) < 1e-6 && Math.abs(hz - z) < 1e-6) return true;
  }
  return false;
}

export type CityDistrictType = 'CENTER' | 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | string;

export interface InteractiveLocation {
  id: string;
  name: string;
  subtitle: string;
  position: [number, number, number];
  radius: number;
  icon: string;
  tabKey?: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library' | null;
  /**
   * Phase SHOP-2 — which storefront of the `shop` tab the interaction opens,
   * for the four city buildings that each sell their own stock.  Optional and
   * back-compatible exactly like `subTab`: absent means the tab's own default,
   * the open market (`'market'`, the hub tab's behaviour).  Only `ShopTab`
   * reads it; a hub that sells nothing leaves it unset.
   */
  shopId?: StorefrontId;
  /**
   * Phase C-8.66B — which subview of `tabKey` the interaction opens, for the one
   * hub that needs it.  The Imperial Stable opens the gear tab straight onto the
   * Chariot Workshop; the tab's own switch returns to the gear list.
   */
  subTab?: 'chariot';
  actionPrompt: string;
  color: string;
  district: CityDistrictType;
}

export const HUB_LOCATIONS: InteractiveLocation[] = [
  {
    id: 'town_gate',
    name: 'Monumental Ishtar Town Gate',
    subtitle: 'City Entrance & Desert Highway',
    position: [0, 0, 24],
    radius: 4.5,
    icon: 'DoorOpen',
    tabKey: 'stats',
    actionPrompt: 'Inspect City Gate',
    color: '#0284c7',
    district: 'SOUTH',
  },
  {
    id: 'colosseum',
    name: 'The Grand Colosseum',
    subtitle: 'Enter Tournament Arena',
    position: [0, 0, -25],
    radius: 5.5,
    icon: 'Swords',
    tabKey: 'tournament',
    actionPrompt: 'Enter Arena Duels',
    color: '#dc2626',
    district: 'NORTH',
  },
  {
    id: 'training_yard',
    name: 'Ludus Martial Yard',
    subtitle: 'Attribute Conditioning',
    position: [-18, 0, 0],
    radius: 4.5,
    icon: 'Dumbbell',
    tabKey: 'training',
    actionPrompt: 'Train Gladiator Stats',
    color: '#ea580c',
    district: 'WEST',
  },
  {
    id: 'smithing_forge',
    name: 'Imperial Smithing Forge',
    subtitle: 'Armory & Weaponsmith',
    // Phase C-8.19: follows the SmithingForge root relocation (Z 2 → 2.6).
    position: [18, 0, 2.6],
    // Phase C-8.47: 4.5 → 6.0.  The Forge's colonnade doorway is on its WEST face
    // (local X −4.75), and the nearest point a 0.4-radius player can stand on that
    // side is the collider's west face (18 − 4.75 = 13.25) plus the player radius =
    // 5.15 from the hub centre.  A 4.5 disc therefore never reached the entrance
    // from the west: the walk out of the fast-travel arrival [11.5, 2.6] (6.50 out)
    // stopped at 5.15 and raised no prompt at all.  6.0 is the smallest 0.25 step
    // that leaves a 0.85 band on the doorway side — deeper than the player's own
    // 0.80 diameter — and puts the disc's west rim at X = 12.0, 0.50 east of the
    // arrival, so eight walk steps bring the prompt up.
    radius: 6.0,
    icon: 'Hammer',
    tabKey: 'shop',
    // Phase SHOP-2: the Forge's interaction opens the forge storefront — every
    // weapon except the starter gladius every gladiator already carries.
    shopId: 'forge',
    actionPrompt: 'Buy Weapons',
    color: '#ca8a04',
    district: 'EAST',
  },
  {
    id: 'general_store',
    name: 'Bazaar & General Store',
    subtitle: 'Potions & Trade Wares',
    position: [22, 0, -5],
    // Phase C-8.47: 4.5 → 5.25.  The bazaar's open front is its WEST side — the
    // striped awning (local X −2.8), the display counter (−3.6) and both timber
    // posts (−4.0) face the Via Mercatoria — and the nearest standable point there
    // is the collider's west face (22 − 3.85 = 18.15) plus the 0.40 player radius =
    // 4.25 from the hub centre, so the old 4.5 disc left a 0.25 band.  5.25 is the
    // smallest 0.25 step with a band at least the player's own 0.80 diameter deep
    // (1.00 here), and it puts the [17, −5] arrival (5.00) inside the disc.
    radius: 5.25,
    icon: 'ShoppingCart',
    tabKey: 'shop',
    // Phase SHOP-2: the general store is the Bazaar — potions and trade wares,
    // whose stock arrives with the medicus trade, so the storefront is honestly
    // empty today rather than stocked with goods it does not trade in.
    shopId: 'bazaar',
    actionPrompt: 'Visit Bazaar Merchant',
    color: '#16a34a',
    district: 'EAST',
  },
  {
    id: 'tavern',
    name: 'The Golden Palm Tavern',
    subtitle: 'Rumors & Gossip',
    position: [-16, 0, 14],
    // Phase C-8.47: 4.5 → 5.75.  The tavern's arched portal is on its EAST face
    // (local X +4.22 — the side its [−10, 14] arrival stands off), where the nearest
    // standable point is the 8.9-wide collider's east face (−11.55) plus the 0.40
    // player radius = 4.85 from the centre.  That is outside the old 4.5 disc, so no
    // prompt could be raised from the doorway or the arrival at all.  5.75 is the
    // smallest 0.25 step with a band ≥ the player's 0.80 diameter (0.90 here); the
    // arrival stays 0.25 outside it, one walk step.
    radius: 5.75,
    icon: 'Beer',
    tabKey: 'stats',
    actionPrompt: 'Hear Rumors',
    color: '#9333ea',
    district: 'SOUTH',
  },
  {
    id: 'caravanserai',
    name: 'Caravanserai Inn',
    subtitle: 'Rest & Quarters',
    position: [16, 0, 14],
    // Phase 31F raised this 4.5 → 4.75 for the south approach; C-8.47 raises it
    // 4.75 → 5.75 for the portico the inn actually uses.  That portico (local X
    // −4.32) faces WEST toward the [10, 14] arrival, and the nearest standable point
    // is the 9.1-wide collider's west face (11.45) plus the 0.40 player radius = 4.95
    // from the centre, so the 4.75 disc left a 0.20 band and the walk from the
    // arrival raised no prompt.  5.75 is the smallest 0.25 step with a band ≥ the
    // player's 0.80 diameter (0.80 here); the arrival sits 0.25 outside, one step.
    radius: 5.75,
    icon: 'Home',
    tabKey: 'gear',
    actionPrompt: 'Equip Loadout',
    color: '#0891b2',
    district: 'EAST',
  },
  {
    id: 'merchant_house',
    name: 'Elite Merchant House',
    subtitle: 'Prestigious Trade Taberna',
    position: [26, 0, -13],
    // Phase C-8.47: 4.5 → 5.25.  The taberna's colonnade portal (local X −3.62)
    // faces WEST, and the nearest standable point is the 7.7-wide collider's west
    // face (22.15) plus the 0.40 player radius = 4.25 from the centre — a 0.25 band
    // under the old 4.5.  5.25 leaves a 1.00 band and puts the [21, −13] arrival
    // (5.00) inside the disc.
    radius: 5.25,
    icon: 'ShoppingCart',
    tabKey: 'shop',
    // Phase SHOP-2: the merchant house deals only in rare and legendary goods.
    shopId: 'merchant',
    actionPrompt: 'Inspect High-Tier Wares',
    color: '#10b981',
    district: 'EAST',
  },
  {
    id: 'armor_workshop',
    name: 'Armor & Leather Workshop',
    subtitle: 'Tannery & Shieldsmith',
    position: [28.2, 0, 1],
    radius: 4.5,
    icon: 'Shield',
    // Phase SHOP-2: the workshop sells armor and accessories, so its interaction
    // opens the SHOP tab's armorer storefront.  It used to open the Armory
    // (`tabKey: 'gear'`), which equips owned gear and has nothing to sell.
    tabKey: 'shop',
    shopId: 'armorer',
    actionPrompt: 'Buy Armor & Accessories',
    color: '#f59e0b',
    district: 'EAST',
  },
  {
    id: 'stable',
    // Phase C-8.66B: the stable's city interaction now opens the Chariot
    // Workshop through the EXISTING gear tab (tabKey 'gear') with its 'chariot'
    // subview — no sixth global tab and no new building.  Name, subtitle and
    // prompt describe what the interaction actually does; the id, position,
    // radius, icon, colour, district and the [26, 10] arrival are unchanged.
    name: 'Imperial Stable & Chariot Workshop',
    subtitle: 'Racing Chariots & Mounts',
    tabKey: 'gear',
    subTab: 'chariot',
    position: [26, 0, 15],
    // Phase C-8.47: 4.5 → 5.25.  The stable's open front is its NORTH side — the
    // solid box at local Z +3.1 is the rear wall and only the two cutout posts at
    // −3.1 close the front — and the nearest standable point there is the 7.7-deep
    // collider's north face (11.15) plus the 0.40 player radius = 4.25 from the
    // centre, so the old 4.5 disc left a 0.25 band.  5.25 leaves a 1.00 band and puts
    // the [26, 10] arrival (5.00) inside the disc.
    radius: 5.25,
    icon: 'Compass',
    actionPrompt: 'Visit Chariot Workshop',
    color: '#10b981',
    district: 'EAST',
  },
  {
    id: 'gladiator_academy',
    name: 'Gladiator Ludus Academy',
    subtitle: 'Advanced Gladiator Training',
    position: [30.5, 0, -27],
    // Phase C-8.47: 4.5 → 5.25.  The academy's recessed portal (local X −3.62) faces
    // WEST onto its own forecourt, where the nearest standable point is the 7.7-wide
    // collider's west face (26.65) plus the 0.40 player radius = 4.25 from the centre;
    // the old 4.5 disc left a 0.25 band, and a walk out of the [25.5, −23] arrival
    // entered the Records Library's disc first — that hub is listed later, so the
    // wrong building answered.  5.25 leaves a 1.00 band on the portal side, and the
    // same walk out of the arrival now raises the academy's own prompt.
    radius: 5.25,
    icon: 'Dumbbell',
    tabKey: 'training',
    actionPrompt: 'Enter Ludus Academy',
    color: '#dc2626',
    district: 'NORTH',
  },
  {
    id: 'doctore_house',
    name: 'Doctore Tactical House',
    subtitle: 'Consult Chief Combat Instructor',
    // Phase C-8.13: hub tracks the DoctoreHouse root (Z = -18).
    // Phase C-8.19: root moved to Z = -18.875 with the shallower (3.25 deep)
    // footprint, so the hub follows it.
    position: [28, 0, -18.875],
    radius: 4.5,
    // STORY-2 — the Doctore House is the ludus, so it opens the school's own
    // Training Yard: that is where the Doctore's Test entry now stands (a
    // restricted-rules duel beside the conditioning cards). It used to fall
    // through to a plain notice.
    tabKey: 'training',
    icon: 'Compass',
    actionPrompt: 'Consult Doctore',
    color: '#ea580c',
    district: 'NORTH',
  },
  {
    id: 'records_house',
    name: 'Records & Lore Library',
    subtitle: 'Ancient Parchments & Achievements',
    // Phase C-8.18: hub tracks the RecordsLibrary root, which moved 0.90 west
    // (X 24 → 23.10) to clear the Gladiator Academy plinth.
    position: [23.1, 0, -30],
    radius: 4.5,
    icon: 'BookOpen',
    // Progression Slice 1: the building opens its own Library view (the Records &
    // Lore Library tab), whose first page is the Road of Glory.  Everything else
    // about this hub — its centre, radius, prompt, colour and district — is
    // exactly as it was; only the door it opens changed.
    tabKey: 'library',
    actionPrompt: 'Read Ancient Scrolls',
    color: '#9333ea',
    district: 'NORTH',
  },
  {
    id: 'bathhouse',
    name: 'Imperial Public Bathhouse',
    subtitle: 'Thermae & Recuperation Pools',
    position: [-26, 0, 25],
    // Phase C-8.47: 4.5 → 4.75.  The thermae's colonnade portico (local Z −3.4) faces
    // NORTH, and the nearest standable point is the 7.0-deep collider's north face
    // (21.5) plus the 0.40 player radius = 3.90 from the centre, so the old 4.5 disc
    // left a 0.60 band — below the player's own 0.80 diameter.  4.75 is the smallest
    // 0.25 step with a band ≥ 0.80 (0.85 here).
    radius: 4.75,
    icon: 'Home',
    tabKey: 'stats',
    actionPrompt: 'Visit the Thermae',
    color: '#0ea5e9',
    district: 'SOUTH',
  },
  {
    id: 'shrine_temple',
    name: 'Shrine of Fortuna',
    subtitle: 'Altar of Luck & Providence',
    position: [-27, 0, 11],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Offer Alms to Fortuna',
    color: '#a855f7',
    district: 'SOUTH',
  },
  {
    id: 'bounty_hall',
    name: 'Bounty & Mercenary Hall',
    subtitle: 'Contracts & Combat Notices',
    position: [-15, 0, 26],
    radius: 4.5,
    icon: 'Swords',
    tabKey: 'tournament',
    actionPrompt: 'Consult Mercenary Board',
    color: '#f43f5e',
    district: 'SOUTH',
  },
  {
    id: 'gladiator_barracks',
    name: 'Gladiator Barracks',
    subtitle: "Recruits' Quarters",
    position: [-27, 0, -14],
    radius: 4.5,
    icon: 'Home',
    actionPrompt: 'Visit Gladiator Barracks',
    color: '#10b981',
    district: 'WEST',
  },
  {
    id: 'veteran_gladiator_hall',
    name: 'Veteran Gladiator Hall',
    subtitle: "Fighters' Clubhouse",
    position: [-24, 0, -25],
    radius: 4.5,
    icon: 'Trophy',
    actionPrompt: 'Enter Veteran Gladiator Hall',
    color: '#ca8a04',
    district: 'WEST',
  },
  {
    id: 'arena_medical_house',
    name: 'Arena Medical House',
    subtitle: 'Roman Infirmary',
    position: [-29, 0, -5],
    radius: 4.5,
    icon: 'Shield',
    actionPrompt: 'Visit Arena Medical House',
    color: '#dc2626',
    district: 'WEST',
  },
  {
    id: 'northern_fortress',
    name: 'Northern Roman Fortress',
    subtitle: 'Imperial Garrison Outpost',
    // Centred on the motte it stands on (Phase C-8.37).
    position: [0, 0, MOTTE_CENTER_Z],
    radius: 10.0,
    icon: 'Shield',
    actionPrompt: 'Approach the Fortress Gate',
    color: '#78716c',
    district: 'NORTH',
  },
  {
    // Phase C-8.70B — the East Circus District's race entry point.
    //
    // It is the city's existing interaction component and nothing new: a hub
    // trigger disc the 2-in-1 action button (and the desktop prompt banner)
    // answers exactly like every other entrance, opening the pre-race panel in
    // `CityHubScene`.  Its position, its radius and the arrival below all read
    // `CIRCUS_RACE_ENTRY`, the same numbers the district's signpost mesh draws
    // from, so the stone and the trigger cannot drift.
    //
    // `tabKey` is deliberately absent: this entry opens a modal in the city, not
    // a hub tab, so `CityHubScene` branches on the id (the same way it already
    // branches on `doctore_house` and the other tabless hubs).
    id: 'east_circus_arena',
    name: 'East Circus Race Forecourt',
    subtitle: 'Chariot Racing',
    position: [CIRCUS_RACE_ENTRY.x, 0, CIRCUS_RACE_ENTRY.z],
    radius: CIRCUS_RACE_ENTRY.radius,
    icon: 'Flag',
    actionPrompt: 'Enter the Circus Race',
    color: '#ca8a04',
    district: 'EAST',
  },
];

/**
 * Phase 31D — Safe collision recovery resolver.
 *
 * Resolves X and Z axes independently (enabling wall sliding) using a
 * penetration-score approach instead of the former global "already
 * colliding" exemption.
 *
 * For each axis:
 *  1. Target clear  → move (normal movement).
 *  2. Target blocked, current clear → block (wall).
 *  3. Both blocked → allow only if the target's total penetration score
 *     is strictly less than the current's (reducing penetration / escaping).
 *     Otherwise block (fail safe — player stays rather than walking through).
 *
 * This prevents the player from walking through buildings when they start
 * inside a collider (e.g. after a buggy fast-travel), while still allowing
 * them to move toward the nearest edge to escape.
 */
/**
 * Phase 31F — Deterministic recovery fallback for saddle-point traps.
 *
 * Activates only when resolveCityMovement's normal axis-independent resolution
 * made zero progress and the player is still overlapping one or more
 * colliders.  Tries 8 candidate directions with a bounded step equal to the
 * normal movement delta (speed * delta).
 *
 * A candidate is rejected if it enters a NEW collider (one not overlapping at
 * the current position) or worsens any collision metric: overlap count,
 * maximum individual penetration, or total penetration.
 *
 * Among accepted candidates, prefers those that improve the lexicographic
 * score (count → max penetration → total penetration).  If no candidate
 * improves the score, accepts a lateral candidate (all metrics unchanged)
 * to allow sliding along a wall or narrow gap.  If no candidate qualifies,
 * returns null — the player stays put.
 *
 * This does NOT restore the old global "already colliding = free movement"
 * exemption: every candidate is checked against all colliders, no new
 * collider may be entered, and no metric may worsen.
 */
function recoveryEscape(
  x: number, z: number, r: number, step: number,
  inputDx: number, inputDz: number,
): [number, number] | null {
  const currentIds = overlappingColliderIds(x, z, r, CITY_COLLIDERS);
  const curCount = currentIds.size;
  const curMax = maxPenetration(x, z, r, CITY_COLLIDERS);
  const curTotal = totalPenetration(x, z, r, CITY_COLLIDERS);

  // 8 candidate directions, reordered to prioritize player's input direction
  // so that equally-scored candidates align with the player's intent.
  const baseDirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const dirs = baseDirs
    .map(d => ({ dir: d, align: d[0] * inputDx + d[1] * inputDz }))
    .sort((a, b) => b.align - a.align)
    .map(d => d.dir);

  let best: [number, number] | null = null;
  let bestScore = Infinity;

  for (const [cdx, cdz] of dirs) {
    const nx = clampBoundaryX(x + cdx * step, z);
    const nz = clampBoundaryZ(nx, z + cdz * step);
    if (nx === x && nz === z) continue;

    // Phase 31H: reject candidates that would reverse to a recently
    // visited position, preventing oscillation between two positions.
    if (isInRecoveryHistory(nx, nz)) continue;

    // Reject if entering any new collider
    const candidateIds = overlappingColliderIds(nx, nz, r, CITY_COLLIDERS);
    let entersNew = false;
    for (const id of candidateIds) {
      if (!currentIds.has(id)) { entersNew = true; break; }
    }
    if (entersNew) continue;

    const cCount = candidateIds.size;
    const cMax = maxPenetration(nx, nz, r, CITY_COLLIDERS);
    const cTotal = totalPenetration(nx, nz, r, CITY_COLLIDERS);

    // Must not worsen on ANY metric — even if count improves, a worse max
    // means the candidate crosses deeper into a building wall, which is
    // explicitly forbidden.  This prevents the fallback from being exploited
    // to cross through a building by reducing overlap count.
    if (cCount > curCount) continue;
    if (cMax > curMax + 1e-9) continue;
    if (Math.abs(cMax - curMax) <= 1e-9 && cTotal > curTotal + 1e-9) continue;

    const isLateral =
      cCount === curCount &&
      Math.abs(cMax - curMax) <= 1e-9 &&
      Math.abs(cTotal - curTotal) <= 1e-9
        ? 1 : 0;

    // Lexicographic score: lateral flag → count → max → total (lower = better)
    const score = isLateral * 1e9 + cCount * 1e6 + cMax * 1e3 + cTotal;
    if (score < bestScore) {
      bestScore = score;
      best = [nx, nz];
    }
  }

  return best;
}

export function resolveCityMovement(
  currentPos: [number, number, number],
  dx: number,
  dz: number,
  speed: number,
  delta: number
): [number, number, number] {
  const r = PLAYER_RADIUS;
  let x = currentPos[0];
  let z = currentPos[2];
  const origX = x;
  const origZ = z;

  // ── X axis ──
  const testX = clampBoundaryX(x + dx * speed * delta, z);
  if (!collidesWith(testX, z, r, CITY_COLLIDERS)) {
    x = testX;
  } else if (!collidesWith(x, z, r, CITY_COLLIDERS)) {
    // Current clear, target blocked — wall, don't move
  } else {
    // Both overlap — Phase 31H: allow only if reducing total penetration
    // AND not entering a new collider AND not increasing max penetration.
    const currentPen = totalPenetration(x, z, r, CITY_COLLIDERS);
    const targetPen = totalPenetration(testX, z, r, CITY_COLLIDERS);
    if (targetPen < currentPen) {
      const currentIds = overlappingColliderIds(x, z, r, CITY_COLLIDERS);
      const targetIds = overlappingColliderIds(testX, z, r, CITY_COLLIDERS);
      let entersNew = false;
      for (const id of targetIds) {
        if (!currentIds.has(id)) { entersNew = true; break; }
      }
      if (!entersNew) {
        const currentMax = maxPenetration(x, z, r, CITY_COLLIDERS);
        const targetMax = maxPenetration(testX, z, r, CITY_COLLIDERS);
        if (targetMax <= currentMax + 1e-9) {
          x = testX;
        }
      }
    }
  }

  // ── Z axis (tested at the resolved X to enable wall sliding) ──
  const testZ = clampBoundaryZ(x, z + dz * speed * delta);
  if (!collidesWith(x, testZ, r, CITY_COLLIDERS)) {
    z = testZ;
  } else if (!collidesWith(x, z, r, CITY_COLLIDERS)) {
    // blocked
  } else {
    // Both overlap — Phase 31H: same checks as X axis.
    const currentPen = totalPenetration(x, z, r, CITY_COLLIDERS);
    const targetPen = totalPenetration(x, testZ, r, CITY_COLLIDERS);
    if (targetPen < currentPen) {
      const currentIds = overlappingColliderIds(x, z, r, CITY_COLLIDERS);
      const targetIds = overlappingColliderIds(x, testZ, r, CITY_COLLIDERS);
      let entersNew = false;
      for (const id of targetIds) {
        if (!currentIds.has(id)) { entersNew = true; break; }
      }
      if (!entersNew) {
        const currentMax = maxPenetration(x, z, r, CITY_COLLIDERS);
        const targetMax = maxPenetration(x, testZ, r, CITY_COLLIDERS);
        if (targetMax <= currentMax + 1e-9) {
          z = testZ;
        }
      }
    }
  }

  // ── Phase 31F/31H: Recovery fallback for saddle-point traps ──
  // Activates only when the normal axis-independent resolution made zero
  // progress AND the player is still overlapping one or more colliders.
  const normalProgress = x !== origX || z !== origZ;
  if (!normalProgress) {
    const step = speed * delta;
    if (step > 1e-6 && collidesWith(x, z, r, CITY_COLLIDERS)) {
      // Phase 31H: record source position in recovery history before
      // calling the fallback, so candidates that would reverse to a
      // recently visited position are rejected.
      _recoveryHistory.push([x, z]);
      if (_recoveryHistory.length > RECOVERY_HISTORY_SIZE) {
        _recoveryHistory.shift();
      }
      const esc = recoveryEscape(x, z, r, step, dx, dz);
      if (esc) { x = esc[0]; z = esc[1]; }
    }
  } else {
    // Normal movement made progress — clear oscillation history.
    _recoveryHistory.length = 0;
  }

  return [x, currentPos[1], z];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 31D — Verified exterior fast-travel arrival points.
//
// Each coordinate is hand-computed to be:
//   • Outside every collider with ≥ 0.9-unit clearance (player radius 0.4
//     + 0.5 safety margin).
//   • Within the ±35 world boundary.
//   • On the side of the building that faces the city center or an
//     accessible path, so the player can walk to the interaction point
//     without crossing a collider.
//
// The Colosseum and Training Yard already-safe destinations are preserved
// unchanged.  All other destinations were inside building footprints under
// the old "[lx, 0, lz+2]" formula and are now replaced with verified
// exterior positions.
//
// Per-point safety rationale:
//   town_gate         [0, 20]    — 1.35 S of ishtar-central front edge (z=21.35)
//   colosseum         [0, -23]   — preserved (already safe, inside Colosseum ring)
//   training_yard     [-18, 2]   — preserved (already safe, inside yard ring)
//   smithing_forge    [11.5, 2.6] — 1.5 W of forge west edge (x=13.0), on the
//                                  forge root's centre line.  Phase C-8.19 moved
//                                  the forge root Z 2 → 2.6, so the arrival's
//                                  (-6.5, 0) offset from the root is preserved.
//   general_store     [17, -5]   — 1.15 W of store west edge (x=18.15)
//   tavern            [-10, 14]  — 1.55 E of tavern east edge (x=-11.55)
//                                  (Phase C-8.43: collider width 9.4 → 8.9)
//   caravanserai      [10, 14]   — 1.45 W of caravanserai west edge (x=11.45)
//                                  (Phase C-8.43: collider width 9.6 → 9.1)
//   merchant_house    [21, -13]  — 1.15 W of merchant west edge (x=22.15)
//   armor_workshop    [28.2, 5.5]— 1.5 N of workshop north edge (z=4.0)
//   stable            [26, 10]   — 1.15 S of stable south edge (z=11.15)
//   gladiator_academy [25.5, -23]— 1.15 NW of academy NW corner (x=26.65,z=-23.35)
//   doctore_house     [23.5, -18.875] — 1.5 W of the doctore west edge
//                                  (x=25.0), on the west doorway's centre line
//                                  (Phase C-8.19: house root Z = -18.875) and
//                                  2.375 S of the MerchantHouse south edge
//                                  (z=-16.5).  Phase C-8.13 moved this point
//                                  from [23.5, -17], where the C-8.12
//                                  MerchantHouse shift had left it only 0.5
//                                  from that south edge (below the 0.9
//                                  invariant).
//   records_house     [23.1, -26]— 1.15 S of the records plinth south face
//                                  (z=-27.15), on the root's centre line.
//                                  Phase C-8.18: X follows the root
//                                  (24 → 23.10); the 1.15-offset is unchanged.
//   bathhouse         [-21, 25]  — 1.0 E of bathhouse east edge (x=-22.0)
//   shrine_temple     [-22.5, 11]— 1.35 E of shrine east edge (x=-23.85)
//   bounty_hall       [-15, 30]  — 1.0 S of bounty south edge (z=29.0)
//   gladiator_barracks[-22, -14] — 1.45 E of barracks east edge (x=-23.45)
//   veteran_gladiator_hall [-24, -29] — 0.95 N of veteran north edge (z=-28.05)
//   arena_medical_house[-29, -9] — 1.25 N of medical north edge (z=-7.75)
// ─────────────────────────────────────────────────────────────────────────────

export const FAST_TRAVEL_ARRIVALS: Record<string, [number, number]> = {
  town_gate:          [0, 20],
  colosseum:          [0, -23],
  training_yard:      [-18, 2],
  smithing_forge:     [11.5, 2.6],
  general_store:      [17, -5],
  tavern:             [-10, 14],
  caravanserai:       [10, 14],
  merchant_house:     [21, -13],
  armor_workshop:     [28.2, 5.5],
  stable:             [26, 10],
  gladiator_academy:  [25.5, -23],
  doctore_house:      [23.5, -18.875],
  records_house:      [23.1, -26],
  bathhouse:          [-21, 25],
  shrine_temple:      [-22.5, 11],
  bounty_hall:        [-15, 30],
  gladiator_barracks: [-22, -14],
  veteran_gladiator_hall: [-24, -29],
  arena_medical_house:[-29, -9],
  // Fortress arrival: on the motte summit just south of the gate, in the
  // gate gap corridor at X=0.  Z is 12.5 north of the motte centre (-69.0
  // since Phase C-8.38), i.e. inside the summit (cardinal radius 12.58) and
  // 2.0 south of the fortress south wall (outer face MOTTE_CENTER_Z + 10.5 =
  // -71.0).  Terrain height at this point is Y≈4.72 (summit level).
  // Collision-free with the fortress wall gap (X=0) and the motte perimeter
  // opening.
  northern_fortress:   [0, MOTTE_CENTER_Z + 12.5],
  // Phase C-8.70B — the East Circus District's race entry, 2.0 south of the
  // signpost on the carceres forecourt (Z 46.10 … 54.50, X 35 … 65.50).  Inside
  // the entry disc, so the prompt is up as the player lands; 3.66 clear of the
  // carceres' front face, 4.50 of the arena's south face and 6.20 of the
  // parapet.  Its X/Z come from `CIRCUS_RACE_ENTRY`.
  east_circus_arena:   [CIRCUS_RACE_ENTRY.x, CIRCUS_RACE_ENTRY.z - 2],
};

/**
 * Nearest-hub lookup for the interaction prompt.
 *
 * Selection is the NEAREST hub whose disc contains `pos` (inclusive of the rim),
 * with an exact tie broken by `HUB_LOCATIONS` order, so the answer is
 * deterministic and independent of frame timing.
 *
 * Phase C-8.47 measured why the lookup has to be distance-based.  How far a hub
 * centre is from the entrance it is entered by is fixed by the building's own
 * footprint, so an interaction radius large enough to reach that entrance reaches
 * just as far on every other side: the eight corrected radii below therefore
 * overlap their neighbours' discs in nine pairs.  Under the previous
 * first-match-in-order rule the *earlier* hub answered across all of those lenses,
 * even where the player was standing beside the later one.  Measured at a walkable
 * point in the alley between the Gladiator Academy and the Doctore House, the
 * prompt said "Enter Ludus Academy" with the Doctore House 3.27 away and the
 * academy 5.24 — a 1.97-unit error, alone affecting 297 cells of that one lens
 * (300+ across the city).  Nearest-first answers the Doctore House there, and
 * leaves every fast-travel arrival and every doorway answering the building it
 * belongs to (`phaseC8_47.test.ts` §D).
 */
export function getNearbyHubLocation(
  pos: [number, number, number]
): InteractiveLocation | null {
  let nearest: InteractiveLocation | null = null;
  let nearestDistSq = Infinity;
  for (const loc of HUB_LOCATIONS) {
    const distSq =
      Math.pow(pos[0] - loc.position[0], 2) + Math.pow(pos[2] - loc.position[2], 2);
    if (distSq > loc.radius * loc.radius) continue;
    // Strictly nearer only: an exact tie keeps the earlier HUB_LOCATIONS entry.
    if (distSq < nearestDistSq) {
      nearest = loc;
      nearestDistSq = distSq;
    }
  }
  return nearest;
}
