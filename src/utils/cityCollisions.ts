// Phase 31D — Safe collision recovery and exterior fast travel
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  totalPenetration,
  overlappingColliderIds,
  maxPenetration,
} from './collisionShapes';

// ── Phase 31H: Recovery history for oscillation detection ───────────────
// Tracks the last N source positions of fallback calls.  Candidates that
// would reverse to a recently visited position are rejected, breaking
// oscillation cycles.  The history is cleared whenever the normal resolver
// makes progress, so it only accumulates while the player is stuck.
const RECOVERY_HISTORY_SIZE = 8;
const _recoveryHistory: Array<[number, number]> = [];

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
  tabKey?: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | null;
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
    position: [18, 0, 2],
    radius: 4.5,
    icon: 'Hammer',
    tabKey: 'shop',
    actionPrompt: 'Buy Weapons & Armor',
    color: '#ca8a04',
    district: 'EAST',
  },
  {
    id: 'general_store',
    name: 'Bazaar & General Store',
    subtitle: 'Potions & Trade Wares',
    position: [22, 0, -5],
    radius: 4.5,
    icon: 'ShoppingCart',
    tabKey: 'shop',
    actionPrompt: 'Visit Bazaar Merchant',
    color: '#16a34a',
    district: 'EAST',
  },
  {
    id: 'tavern',
    name: 'The Golden Palm Tavern',
    subtitle: 'Rumors & Gambling',
    position: [-16, 0, 14],
    radius: 4.5,
    icon: 'Beer',
    tabKey: 'stats',
    actionPrompt: 'Gather Intel & Rest',
    color: '#9333ea',
    district: 'SOUTH',
  },
  {
    id: 'caravanserai',
    name: 'Caravanserai Inn',
    subtitle: 'Rest & Quarters',
    position: [16, 0, 14],
    radius: 4.75,
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
    position: [26, 0, -12],
    radius: 4.5,
    icon: 'ShoppingCart',
    tabKey: 'shop',
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
    tabKey: 'gear',
    actionPrompt: 'Forge Armor & Accessories',
    color: '#f59e0b',
    district: 'EAST',
  },
  {
    id: 'stable',
    name: 'Imperial Horse Stable',
    subtitle: 'Mounts & Caravans',
    position: [26, 0, 15],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Visit Stables',
    color: '#10b981',
    district: 'EAST',
  },
  {
    id: 'gladiator_academy',
    name: 'Gladiator Ludus Academy',
    subtitle: 'Advanced Gladiator Training',
    position: [30.5, 0, -27],
    radius: 4.5,
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
    position: [28, 0, -17],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Consult Doctore',
    color: '#ea580c',
    district: 'NORTH',
  },
  {
    id: 'records_house',
    name: 'Records & Lore Library',
    subtitle: 'Ancient Parchments & Achievements',
    position: [24, 0, -30],
    radius: 4.5,
    icon: 'BookOpen',
    tabKey: 'stats',
    actionPrompt: 'Read Ancient Scrolls',
    color: '#9333ea',
    district: 'NORTH',
  },
  {
    id: 'bathhouse',
    name: 'Imperial Public Bathhouse',
    subtitle: 'Thermae & Recuperation Pools',
    position: [-26, 0, 25],
    radius: 4.5,
    icon: 'Home',
    tabKey: 'stats',
    actionPrompt: 'Rest in Bathhouse Thermae',
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
    const nx = Math.max(-35, Math.min(35, x + cdx * step));
    const nz = Math.max(-35, Math.min(35, z + cdz * step));
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
  const testX = Math.max(-35, Math.min(35, x + dx * speed * delta));
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
  const testZ = Math.max(-35, Math.min(35, z + dz * speed * delta));
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
//   smithing_forge    [11.5, 2]  — 1.5 W of forge west edge (x=13.0)
//   general_store     [17, -5]   — 1.15 W of store west edge (x=18.15)
//   tavern            [-10, 14]  — 1.3 E of tavern east edge (x=-11.3)
//   caravanserai      [10, 14]   — 1.2 W of caravanserai west edge (x=11.2)
//   merchant_house    [21, -12]  — 1.15 W of merchant west edge (x=22.15)
//   armor_workshop    [28.2, 5.5]— 1.5 N of workshop north edge (z=4.0)
//   stable            [26, 10]   — 1.15 S of stable south edge (z=11.15)
//   gladiator_academy [25.5, -23]— 1.15 NW of academy NW corner (x=26.65,z=-23.35)
//   doctore_house     [23.5, -17]— 1.5 W of doctore west edge (x=25.0)
//   records_house     [24, -26]  — 1.15 N of records north edge (z=-27.15)
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
  smithing_forge:     [11.5, 2],
  general_store:      [17, -5],
  tavern:             [-10, 14],
  caravanserai:       [10, 14],
  merchant_house:     [21, -12],
  armor_workshop:     [28.2, 5.5],
  stable:             [26, 10],
  gladiator_academy:  [25.5, -23],
  doctore_house:      [23.5, -17],
  records_house:      [24, -26],
  bathhouse:          [-21, 25],
  shrine_temple:      [-22.5, 11],
  bounty_hall:        [-15, 30],
  gladiator_barracks: [-22, -14],
  veteran_gladiator_hall: [-24, -29],
  arena_medical_house:[-29, -9],
};

export function getNearbyHubLocation(
  pos: [number, number, number]
): InteractiveLocation | null {
  for (const loc of HUB_LOCATIONS) {
    const distSq =
      Math.pow(pos[0] - loc.position[0], 2) + Math.pow(pos[2] - loc.position[2], 2);
    if (distSq <= loc.radius * loc.radius) {
      return loc;
    }
  }
  return null;
}
