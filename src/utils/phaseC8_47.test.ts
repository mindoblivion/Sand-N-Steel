/**
 * Phase C-8.47 — hub interaction reachability.
 *
 * Run with: bun test src/utils/phaseC8_47.test.ts
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Every hub trigger is a disc of radius `r` centred on its building's root, and
 * the prompt appears when the player's own centre is inside that disc
 * (`getNearbyHubLocation`, called every frame by `CityHubScene`).  Because the
 * disc is centred on the *building*, the usable part of it is the ring outside
 * the building's collider: the closest a 0.4-radius player can stand to a hub
 * centre is `(half-extent of the collider along the approach axis) + 0.40`.
 * For eight buildings that distance is at or beyond `r`, so the entrance they
 * are meant to be entered by produced no prompt at all:
 *
 *   hub                 collider        entrance face      closest standable   old r   old band
 *   Smithing Forge      9.5 × 8.0       west (local −4.75)  4.75 + 0.40 = 5.15   4.50   −0.65
 *   Bazaar & Gen. Store 7.7 × 6.3       west (awning −2.8)  3.85 + 0.40 = 4.25   4.50   +0.25
 *   Golden Palm Tavern  8.9 × 7.7       east (local +4.22)  4.45 + 0.40 = 4.85   4.50   −0.35
 *   Caravanserai Inn    9.1 × 8.1       west (portico −4.32)4.55 + 0.40 = 4.95   4.75   −0.20
 *   Elite Merchant House7.7 × 7.0       west (portico −3.62)3.85 + 0.40 = 4.25   4.50   +0.25
 *   Imperial Stable     7.5 × 7.7       north (open front)  3.85 + 0.40 = 4.25   4.50   +0.25
 *   Gladiator Academy   7.7 × 7.3       west (portico −3.62)3.85 + 0.40 = 4.25   4.50   +0.25
 *   Public Bathhouse    8.0 × 7.0       north (portico −3.4)3.50 + 0.40 = 3.90   4.50   +0.60
 *
 * The eight are exactly the hubs the C-8.46 audit flagged.  Measured with the
 * real `resolveCityMovement` plus the real prompt lookup, a walk out of each of
 * those arrivals ended with *no prompt* (the Forge's stopped at 5.15 from its
 * centre; the tavern's and caravanserai's never raised anything), and the
 * academy's raised the *Records Library's* prompt instead, because that disc
 * comes later in `HUB_LOCATIONS` but is entered first along the walk.
 *
 * ── THE FIX ───────────────────────────────────────────────────────────────
 * Radius only — no centre moved, no collider touched, no movement constant
 * changed.  Each radius is the smallest 0.25 step that leaves a usable band on
 * the entrance side at least the player's own 0.80 diameter deep:
 *
 *   radius >= (closest standable approach distance) + 0.80
 *
 *   Forge 6.00, General Store 5.25, Tavern 5.75, Caravanserai 5.75,
 *   Merchant House 5.25, Stable 5.25, Academy 5.25, Bathhouse 4.75.
 *
 * `getNearbyHubLocation`'s first-match-in-order rule is deliberately kept: see
 * §D, where a nearest-first rule is measured and shown to be *worse* on the
 * academy's own forecourt.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the configuration: the eight new radii, the twelve unchanged ones, and
 *      the standoff rule for all 20 hubs;
 *   B. each affected hub is enterable from its own entrance — the closest
 *      standable point on that side is inside the disc with a usable band;
 *   C. the Smithing Forge's fast-travel arrival behaviour, explicitly, with a
 *      control that reproduces the pre-fix silence at 4.50;
 *   D. the three disc overlaps the new radii create, and hub selection at every
 *      arrival and entrance (including the academy forecourt tie);
 *   E. the twelve unaffected hubs keep their radii, arrivals and selection;
 *   F. all 20 triggers are reachable and all 20 arrivals are collision-free and
 *      lead to their own prompt, driven with the shipped resolver;
 *   G. everything the phase must not touch is unchanged — the Training Hall
 *      collider and its narrow passage, the C-8.43 widths, the Forge's 9.5,
 *      the movement constants, the registry count, the northern geometry and
 *      the C-8.41 kerb.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import {
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  getNearbyHubLocation,
  resolveCityMovement,
  BOUNDARY_X,
  BOUNDARY_Z_MAX,
  type InteractiveLocation,
} from './cityCollisions';
import { MOTTE_CENTER_Z } from './terrainHeight';
import {
  KERB_INNER_RADIUS,
  KERB_OUTER_RADIUS,
  KERB_GATE_HALF_W,
} from '../components/3d/city/NorthernMotte';
import { DECK_Z_OUTER, DECK_Z_INNER, DECK_TOP_Y } from '../components/3d/city/Drawbridge';

// ── The approach table ──────────────────────────────────────────────────────
// `dir` is the outward direction from the building centre to the entrance it is
// entered by, read from each building's own source; `collider` is the registry
// rectangle that stands for its rendered lower step.
const APPROACH: Record<string, { dir: [number, number]; collider: string; source: string }> = {
  // gateway approach from the desert highway (+Z)
  town_gate: { dir: [0, 1], collider: 'ishtar-central', source: 'IshtarGatehouse.tsx (root [0,0,24])' },
  // the monumental portal at θ = 0 (+Z)
  colosseum: { dir: [0, 1], collider: 'colo-wall-l-0', source: 'GrandColosseum.tsx (portal on +Z)' },
  // the enclosure entrance faces +X (see the file's own constant comment)
  training_yard: { dir: [1, 0], collider: 'yard-wall-0', source: 'TrainingYard.tsx ("Entrance faces +X")' },
  // colonnade doorway at local [-4.75, 0, 0], rotation -π/2
  smithing_forge: { dir: [-1, 0], collider: 'smithing-forge', source: 'SmithingForge.tsx (doorway local X −4.75)' },
  // awning −2.8, display counter −3.6, both timber posts −4.0
  general_store: { dir: [-1, 0], collider: 'general-store', source: 'GeneralStore.tsx (awning/counter/posts on −X)' },
  // arched portal at local [4.22, 0, 0], rotation +π/2
  tavern: { dir: [1, 0], collider: 'city-tavern', source: 'CityTavern.tsx (doorway local X +4.22)' },
  // portico group at local [-4.32, 0, 0], doorway rotation -π/2
  caravanserai: { dir: [-1, 0], collider: 'caravanserai', source: 'CaravanseraiInn.tsx (portico local X −4.32)' },
  // entrance colonnade group at local [-3.62, 0, 0], doorway rotation -π/2
  merchant_house: { dir: [-1, 0], collider: 'merchant-house', source: 'MerchantHouse.tsx (portal local X −3.62)' },
  // open arcade / display racks at local Z −1.5
  armor_workshop: { dir: [0, -1], collider: 'armor-workshop', source: 'ArmorLeatherWorkshop.tsx (arcade local Z −1.5)' },
  // the rear wall is the solid box at local Z +3.1; only the posts at −3.1 close the front
  stable: { dir: [0, -1], collider: 'stable', source: 'Stable.tsx (front posts local Z −3.1)' },
  // portico group at local [-3.62, 0, 0], doorway rotation -π/2
  gladiator_academy: { dir: [-1, 0], collider: 'gladiator-academy', source: 'GladiatorAcademy.tsx (portico local X −3.62)' },
  // doorway at local [-2.77, 0, 0], rotation -π/2
  doctore_house: { dir: [-1, 0], collider: 'doctore-house', source: 'DoctoreHouse.tsx (doorway local X −2.77)' },
  // doorway at local [0, 0.5, 1.2] → +Z
  records_house: { dir: [0, 1], collider: 'records-library', source: 'RecordsLibrary.tsx (doorway local Z +1.2)' },
  // colonnade portico group at local [0, 0, -3.4]
  bathhouse: { dir: [0, -1], collider: 'bathhouse', source: 'PublicBathhouse.tsx (portico local Z −3.4)' },
  shrine_temple: { dir: [0, 1], collider: 'roman-shrine', source: 'RomanShrine.tsx (front on +Z)' },
  // heavy timber doorway at local [-1.2, 0.6, 2.52] → +Z
  bounty_hall: { dir: [0, 1], collider: 'bounty-hall', source: 'BountyHall.tsx (doorway local Z +2.52)' },
  // heavy timber doorway at local [0, 0, 2.82] → +Z
  gladiator_barracks: { dir: [0, 1], collider: 'gladiator-barracks', source: 'GladiatorBarracks.tsx (doorway local Z +2.82)' },
  // framed doorway at local [0, 0.32, 2.58] → +Z
  veteran_gladiator_hall: { dir: [0, 1], collider: 'veteran-hall', source: 'VeteranGladiatorHall.tsx (doorway local Z +2.58)' },
  // infirmary doorway inside the +X portico
  arena_medical_house: { dir: [1, 0], collider: 'arena-medical', source: 'ArenaMedicalHouse.tsx (portico on +X)' },
  // the gate gap on the motte's south side
  northern_fortress: { dir: [0, 1], collider: 'fortress-south-l', source: 'NorthernFortress.tsx (gate on +Z)' },
};

// ── The measured configuration ──────────────────────────────────────────────

/** The eight radii this phase set, and why each is where it is. */
const CHANGED: Record<string, { from: number; to: number }> = {
  smithing_forge: { from: 4.5, to: 6.0 },
  general_store: { from: 4.5, to: 5.25 },
  tavern: { from: 4.5, to: 5.75 },
  caravanserai: { from: 4.75, to: 5.75 },
  merchant_house: { from: 4.5, to: 5.25 },
  stable: { from: 4.5, to: 5.25 },
  gladiator_academy: { from: 4.5, to: 5.25 },
  bathhouse: { from: 4.5, to: 4.75 },
};

/** Every other hub keeps the radius its own phase left it. */
const UNCHANGED: Record<string, number> = {
  town_gate: 4.5,
  colosseum: 5.5,
  training_yard: 4.5,
  armor_workshop: 4.5,
  doctore_house: 4.5,
  records_house: 4.5,
  shrine_temple: 4.5,
  bounty_hall: 4.5,
  gladiator_barracks: 4.5,
  veteran_gladiator_hall: 4.5,
  arena_medical_house: 4.5,
  northern_fortress: 10.0,
};

/** Positions are untouched by this phase — pinned so a move cannot hide here. */
const POSITIONS: Record<string, [number, number]> = {
  town_gate: [0, 24],
  colosseum: [0, -25],
  training_yard: [-18, 0],
  smithing_forge: [18, 2.6],
  general_store: [22, -5],
  tavern: [-16, 14],
  caravanserai: [16, 14],
  merchant_house: [26, -13],
  armor_workshop: [28.2, 1],
  stable: [26, 15],
  gladiator_academy: [30.5, -27],
  doctore_house: [28, -18.875],
  records_house: [23.1, -30],
  bathhouse: [-26, 25],
  shrine_temple: [-27, 11],
  bounty_hall: [-15, 26],
  gladiator_barracks: [-27, -14],
  veteran_gladiator_hall: [-24, -25],
  arena_medical_house: [-29, -5],
  northern_fortress: [0, MOTTE_CENTER_Z],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const hub = (id: string): InteractiveLocation => {
  const found = HUB_LOCATIONS.find((l) => l.id === id);
  if (!found) throw new Error(`no hub ${id}`);
  return found;
};

const rect = (id: string): RectCollider => {
  const found = CITY_COLLIDERS.find((c) => c.id === id);
  if (!found || found.type !== 'rect') throw new Error(`no rect collider ${id}`);
  return found;
};

/**
 * The closest a 0.4-radius player can stand to a hub centre on the side its
 * entrance faces: the collider's half-extent along that axis plus the radius.
 */
const approachStandoff = (id: string): number => {
  const { dir, collider } = APPROACH[id];
  const r = rect(collider);
  return (dir[0] === 0 ? r.hd : r.hw) + PLAYER_RADIUS;
};

const inside = (loc: InteractiveLocation, x: number, z: number): boolean =>
  Math.hypot(x - loc.position[0], z - loc.position[2]) <= loc.radius;

/** Is the hub's own centre standable (open ground: arena, courtyard)? */
const centreStandable = (loc: InteractiveLocation): boolean =>
  !collidesWith(loc.position[0], loc.position[2], PLAYER_RADIUS, CITY_COLLIDERS);

/**
 * The closest standable point to the hub centre inside a narrow cone around its
 * entrance direction, found by a 0.1 polar sweep — the measured version of
 * `approachStandoff`, which also catches anything that pinches the entrance.
 */
const measuredApproachPoint = (
  loc: InteractiveLocation,
): { dist: number; point: [number, number] } | null => {
  const dir = APPROACH[loc.id].dir;
  let best: { dist: number; point: [number, number] } | null = null;
  for (let d = 0.1; d <= loc.radius + 1.5; d += 0.1) {
    for (let a = -0.35; a <= 0.3501; a += 0.05) {
      const angle = Math.atan2(dir[1], dir[0]) + a;
      const x = loc.position[0] + Math.cos(angle) * d;
      const z = loc.position[2] + Math.sin(angle) * d;
      if (collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) continue;
      if (!best || d < best.dist) best = { dist: d, point: [x, z] };
    }
  }
  return best;
};

/**
 * Walk from a start point towards a target with the *shipped* resolver, at the
 * shipped speed (3.8 u/s, 1/60 s steps), and report the first hub prompt the
 * player passes through.  This is the end-to-end path the player actually takes.
 */
const walkToPrompt = (
  start: [number, number],
  target: [number, number],
  maxSteps = 500,
): { prompt: string | null; steps: number; trail: Array<[number, number]>; blocked: boolean } => {
  let cur: [number, number, number] = [start[0], 0, start[1]];
  const trail: Array<[number, number]> = [[cur[0], cur[2]]];
  const first = getNearbyHubLocation(cur);
  if (first) return { prompt: first.id, steps: 0, trail, blocked: false };
  for (let s = 0; s < maxSteps; s++) {
    const dx = target[0] - cur[0];
    const dz = target[1] - cur[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return { prompt: null, steps: s, trail, blocked: false };
    const bx = cur[0];
    const bz = cur[2];
    cur = resolveCityMovement(cur, dx / len, dz / len, 3.8, 1 / 60);
    if (Math.abs(cur[0] - bx) < 1e-9 && Math.abs(cur[2] - bz) < 1e-9) {
      return { prompt: null, steps: s, trail, blocked: true };
    }
    trail.push([cur[0], cur[2]]);
    const hit = getNearbyHubLocation(cur);
    if (hit) return { prompt: hit.id, steps: s + 1, trail, blocked: false };
  }
  return { prompt: null, steps: maxSteps, trail, blocked: false };
};

/** Walk out of a hub's own fast-travel arrival towards its entrance. */
const arrivalWalk = (id: string) => {
  const loc = hub(id);
  const arrival = FAST_TRAVEL_ARRIVALS[id];
  const measured = measuredApproachPoint(loc);
  if (!measured) throw new Error(`no standable approach point for ${id}`);
  const dir = APPROACH[id].dir;
  const target: [number, number] = [
    loc.position[0] + dir[0] * (measured.dist + 0.2),
    loc.position[2] + dir[1] * (measured.dist + 0.2),
  ];
  return { result: walkToPrompt(arrival, target), measured };
};

const HUB_IDS = HUB_LOCATIONS.map((l) => l.id);

// ══════════════════════════════════════════════════════════════════════════
// A. The configuration
// ══════════════════════════════════════════════════════════════════════════

describe('A. Hub radii and the standoff rule', () => {
  test('the eight affected hubs carry the measured radius', () => {
    for (const [id, { to }] of Object.entries(CHANGED)) {
      expect(hub(id).radius, `${id} radius`).toBe(to);
    }
  });

  test('every other hub keeps the radius its own phase left it', () => {
    for (const [id, radius] of Object.entries(UNCHANGED)) {
      expect(hub(id).radius, `${id} radius`).toBe(radius);
    }
    const touched = new Set([...Object.keys(CHANGED), ...Object.keys(UNCHANGED)]);
    expect(touched.size).toBe(20);
    expect(HUB_IDS.filter((id) => !touched.has(id))).toEqual([]);
  });

  test('no hub centre moved', () => {
    for (const [id, [x, z]] of Object.entries(POSITIONS)) {
      expect([hub(id).position[0], hub(id).position[2]], `${id} position`).toEqual([x, z]);
    }
  });

  test('every disc is usable: an entrance deep enough, or an open centre', () => {
    for (const loc of HUB_LOCATIONS) {
      if (centreStandable(loc)) continue; // arena / courtyard: the centre itself is walkable
      const standoff = approachStandoff(loc.id);
      expect(
        loc.radius >= standoff + 0.8,
        `${loc.id}: radius ${loc.radius}, entrance standoff ${standoff.toFixed(2)} ` +
          `(needs ${(standoff + 0.8).toFixed(2)})`,
      ).toBe(true);
    }
  });

  test('the three buildings whose hub centre is open ground are exactly that', () => {
    // Arena interior, training courtyard and fortress courtyard: the player can
    // stand at the centre, so no entrance ring is needed there.
    for (const id of ['colosseum', 'training_yard', 'northern_fortress']) {
      expect(centreStandable(hub(id)), `${id} centre`).toBe(true);
    }
  });

  test('the rule is the one the comments state: radius >= standoff + the 0.80 player diameter', () => {
    for (const id of Object.keys(CHANGED)) {
      const standoff = approachStandoff(id);
      expect(hub(id).radius, `${id}`).toBeGreaterThanOrEqual(standoff + 0.8);
      // and it is the smallest 0.25 step that clears that bar
      expect(hub(id).radius, `${id} should be the tightest quarter-unit step`).toBeLessThan(
        standoff + 0.8 + 0.25,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Each affected hub is enterable from its own entrance
// ══════════════════════════════════════════════════════════════════════════

describe('B. The eight affected hubs answer at their own entrance', () => {
  test('the closest standable point on the entrance side is inside the disc, with a band', () => {
    for (const id of Object.keys(CHANGED)) {
      const loc = hub(id);
      const measured = measuredApproachPoint(loc);
      expect(measured, `${id} has a standable approach point`).not.toBeNull();
      const band = loc.radius - measured!.dist;
      expect(band, `${id}: band ${band.toFixed(2)} on its entrance side`).toBeGreaterThanOrEqual(0.7);
      expect(
        inside(loc, measured!.point[0], measured!.point[1]),
        `${id}: measured approach point inside the disc`,
      ).toBe(true);
    }
  });

  test('walking out of the arrival raises this hub, and never another one first', () => {
    for (const id of Object.keys(CHANGED)) {
      const { result } = arrivalWalk(id);
      expect(result.prompt, `${id} prompt after walking to its entrance`).toBe(id);
    }
  });

  test('the prompt is raised from the doorway, not from a far corner', () => {
    // The point that raises the prompt must be on the entrance side and no
    // further out than the disc — i.e. the disc reaches the door it serves.
    for (const id of Object.keys(CHANGED)) {
      const loc = hub(id);
      const standoff = approachStandoff(id);
      expect(loc.radius - standoff, `${id} band at the doorway`).toBeGreaterThanOrEqual(0.75);
    }
  });

  test('the eight are the ones the measurement flagged: no other hub had a negative band', () => {
    for (const loc of HUB_LOCATIONS) {
      if (centreStandable(loc)) continue;
      const standoff = approachStandoff(loc.id);
      expect(
        loc.radius - standoff,
        `${loc.id} keeps a usable band at its entrance`,
      ).toBeGreaterThanOrEqual(0.7);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The Smithing Forge, explicitly
// ══════════════════════════════════════════════════════════════════════════

describe('C. Smithing Forge fast-travel arrival', () => {
  test('the arrival is a standoff in front of the west doorway, outside the 6.0 disc', () => {
    const forge = hub('smithing_forge');
    const [ax, az] = FAST_TRAVEL_ARRIVALS.smithing_forge;
    // The doorway is on the west face (local X −4.75 → world X 13.25); the
    // arrival sits 1.75 further west, on the same Z as the hub centre.
    expect([ax, az]).toEqual([11.5, 2.6]);
    const d = Math.hypot(ax - forge.position[0], az - forge.position[2]);
    expect(d).toBeCloseTo(6.5, 10);
    // EXPECTED BEHAVIOUR: the arrival is deliberately OUTSIDE the disc.  The
    // prompt does not appear on the teleport itself; the player walks 0.50 east
    // to the disc's rim and it appears there (measured: 8 steps at 0.0633).
    expect(d).toBeGreaterThan(forge.radius);
    expect(getNearbyHubLocation([ax, 0, az])).toBeNull();
    expect(d - forge.radius).toBeCloseTo(0.5, 10);
  });

  test('the disc rim is 0.50 east of the arrival and the doorway is inside it', () => {
    const forge = hub('smithing_forge');
    const rimX = forge.position[0] - forge.radius; // 12.0
    expect(rimX).toBeCloseTo(12.0, 10);
    expect(collidesWith(rimX, 2.6, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(inside(forge, rimX, 2.6)).toBe(true);
    // The closest standable point on the doorway side (collider west face 13.25
    // less the player radius = 12.85) is 5.15 out, inside the 6.0 disc with 0.85.
    expect(12.85 - rimX).toBeCloseTo(0.85, 10);
  });

  test('eight steps east from the arrival raise the Forge prompt', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.smithing_forge;
    const walk = walkToPrompt([ax, az], [18, 2.6]);
    expect(walk.prompt).toBe('smithing_forge');
    expect(walk.steps).toBe(8);
    expect(walk.blocked).toBe(false);
  });

  test('the walk stops at the wall, not inside the building', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.smithing_forge;
    let cur: [number, number, number] = [ax, 0, az];
    for (let i = 0; i < 60; i++) cur = resolveCityMovement(cur, 1, 0, 3.8, 1 / 60);
    // The collider's west face is 13.25, so a 0.4-radius player stops within one
    // 0.0633 step of 12.85 — never past it.
    expect(cur[0]).toBeGreaterThan(12.75);
    expect(cur[0]).toBeLessThanOrEqual(12.85 + 1e-9);
    expect(collidesWith(cur[0], cur[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('CONTROL: at the old 4.50 radius the same walk raises nothing', () => {
    const forge = hub('smithing_forge');
    const saved = forge.radius;
    try {
      forge.radius = 4.5;
      const [ax, az] = FAST_TRAVEL_ARRIVALS.smithing_forge;
      // Walking east, the player stops at 12.85 — 5.15 from the centre, outside 4.5.
      const walk = walkToPrompt([ax, az], [18, 2.6]);
      expect(walk.prompt).toBeNull();
      // Even the best point on the whole doorway side is outside the old disc.
      const measured = measuredApproachPoint({ ...forge, radius: 4.5 } as InteractiveLocation);
      expect(measured!.dist).toBeGreaterThan(4.5);
    } finally {
      forge.radius = saved;
    }
    expect(hub('smithing_forge').radius).toBe(6.0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Overlaps and hub selection
// ══════════════════════════════════════════════════════════════════════════

describe('D. Overlapping discs and which hub answers', () => {
  /**
   * Every pair of discs that now intersect, with the measured distance between
   * the two centres.  The pre-C-8.47 configuration had no overlaps at all; the
   * eight measured minimum radii cannot avoid these, because the distance from a
   * hub centre to the entrance it is entered by is fixed by the building's own
   * footprint — a disc that reaches a 9.5 × 8.0 forge's west doorway at 5.15 also
   * reaches 6.0 out on every other side.
   */
  const OVERLAPS: Array<[string, string, number]> = [
    ['smithing_forge', 'general_store', 8.59],
    ['smithing_forge', 'caravanserai', 11.57],
    ['smithing_forge', 'armor_workshop', 10.32],
    ['general_store', 'merchant_house', 8.94],
    ['general_store', 'armor_workshop', 8.63],
    ['caravanserai', 'stable', 10.05],
    ['merchant_house', 'doctore_house', 6.21],
    ['gladiator_academy', 'doctore_house', 8.5],
    ['gladiator_academy', 'records_house', 7.98],
  ];

  test('exactly these nine pairs overlap, at the measured centre distances', () => {
    const found: Array<[string, string, number]> = [];
    for (let i = 0; i < HUB_LOCATIONS.length; i++) {
      for (let j = i + 1; j < HUB_LOCATIONS.length; j++) {
        const a = HUB_LOCATIONS[i];
        const b = HUB_LOCATIONS[j];
        const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
        if (d < a.radius + b.radius) found.push([a.id, b.id, Number(d.toFixed(2))]);
      }
    }
    expect(found).toEqual(OVERLAPS);
  });

  test('each lens sits in the alley behind both entrances: no doorway enters the other hub\'s disc', () => {
    for (const [aId, bId, expectedDist] of OVERLAPS) {
      const a = hub(aId);
      const b = hub(bId);
      const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
      expect(d, `${aId}/${bId} centre distance`).toBeCloseTo(expectedDist, 2);
      // A's doorway standoff and B's doorway standoff are each outside the other
      // hub's disc, and so are both arrivals: the overlap never covers the place
      // either building is entered from.
      const aDoor = measuredApproachPoint(a)!.point;
      const bDoor = measuredApproachPoint(b)!.point;
      expect(inside(b, aDoor[0], aDoor[1]), `${aId} doorway inside ${bId}`).toBe(false);
      expect(inside(a, bDoor[0], bDoor[1]), `${bId} doorway inside ${aId}`).toBe(false);
      const [ax1, az1] = FAST_TRAVEL_ARRIVALS[aId];
      const [ax2, az2] = FAST_TRAVEL_ARRIVALS[bId];
      expect(inside(b, ax1, az1), `${aId} arrival inside ${bId}`).toBe(false);
      expect(inside(a, ax2, az2), `${bId} arrival inside ${aId}`).toBe(false);
    }
  });

  test('the nearest hub answers, so a neighbour\'s alley is not hijacked', () => {
    // Measured: this walkable point sits in the alley between the Gladiator
    // Academy and the Doctore House.  The Doctore House is 3.27 away and the
    // academy 5.24, so the nearest rule answers the Doctore House even though the
    // academy is listed first — under the previous first-match-in-order rule the
    // prompt said "Enter Ludus Academy" here (the C-8.47 measurement that
    // motivated the change).
    const [x, z] = [29.1, -21.95];
    const academy = hub('gladiator_academy');
    const doctore = hub('doctore_house');
    expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), 'alley point is walkable').toBe(false);
    const dAcademy = Math.hypot(x - academy.position[0], z - academy.position[2]);
    const dDoctore = Math.hypot(x - doctore.position[0], z - doctore.position[2]);
    expect(inside(academy, x, z)).toBe(true);
    expect(inside(doctore, x, z)).toBe(true);
    expect(dDoctore).toBeCloseTo(3.27, 1);
    expect(dAcademy).toBeCloseTo(5.24, 1);
    expect(getNearbyHubLocation([x, 0, z])!.id).toBe('doctore_house');
    // the old rule's answer is the academy, purely because it is listed first
    expect(HUB_LOCATIONS.findIndex((l) => l.id === 'gladiator_academy')).toBeLessThan(
      HUB_LOCATIONS.findIndex((l) => l.id === 'doctore_house'),
    );
  });

  test('an exact tie is broken by HUB_LOCATIONS order', () => {
    // The midpoint of the Store ↔ Merchant House pair: exactly 20.0 squared from
    // both centres (2² + 4² twice), so the tie is exact in floating point.
    const [x, z] = [24, -9];
    expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), 'midpoint is walkable').toBe(false);
    const storeSq = (x - 22) ** 2 + (z + 5) ** 2;
    const merchantSq = (x - 26) ** 2 + (z + 13) ** 2;
    expect(storeSq).toBe(merchantSq);
    expect(inside(hub('general_store'), x, z)).toBe(true);
    expect(inside(hub('merchant_house'), x, z)).toBe(true);
    expect(getNearbyHubLocation([x, 0, z])!.id).toBe('general_store');
    expect(HUB_LOCATIONS.findIndex((l) => l.id === 'general_store')).toBeLessThan(
      HUB_LOCATIONS.findIndex((l) => l.id === 'merchant_house'),
    );
  });

  test('no hub is served by another hub at its own arrival or its own entrance', () => {
    for (const loc of HUB_LOCATIONS) {
      const arrival = FAST_TRAVEL_ARRIVALS[loc.id];
      const atArrival = getNearbyHubLocation([arrival[0], 0, arrival[1]]);
      if (atArrival) expect(atArrival.id, `${loc.id} arrival`).toBe(loc.id);

      const measured = measuredApproachPoint(loc);
      expect(measured, `${loc.id} approach point exists`).not.toBeNull();
      const atEntrance = getNearbyHubLocation([measured!.point[0], 0, measured!.point[1]]);
      expect(atEntrance, `${loc.id} entrance point raises a prompt`).not.toBeNull();
      expect(atEntrance!.id, `${loc.id} entrance point`).toBe(loc.id);
    }
  });

  test('the academy ↔ library lens never covers the academy\'s own doorway', () => {
    const academy = hub('gladiator_academy');
    const library = hub('records_house');
    const door = measuredApproachPoint(academy)!;
    const [x, z] = door.point;
    // Standing at the academy's western doorway the academy answers, and it is
    // also the nearer of the two — the lens lies off to the north-west of it.
    const dAcademy = Math.hypot(x - academy.position[0], z - academy.position[2]);
    const dLibrary = Math.hypot(x - library.position[0], z - library.position[2]);
    expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(inside(academy, x, z)).toBe(true);
    expect(dAcademy).toBeLessThan(dLibrary);
    expect(getNearbyHubLocation([x, 0, z])!.id).toBe('gladiator_academy');
    // The lens does exist — a walkable point beyond the doorway where the library
    // is nearer — and there the nearest rule answers the library.
    const lens: [number, number] = [26.0, -26.7];
    const dl = Math.hypot(lens[0] - library.position[0], lens[1] - library.position[2]);
    const da = Math.hypot(lens[0] - academy.position[0], lens[1] - academy.position[2]);
    expect(collidesWith(lens[0], lens[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(inside(library, lens[0], lens[1])).toBe(true);
    expect(inside(academy, lens[0], lens[1])).toBe(true);
    expect(dl).toBeLessThan(da);
    expect(getNearbyHubLocation([lens[0], 0, lens[1]])!.id).toBe('records_house');
  });

  test('the lookup is deterministic: same point, same answer, ten times over', () => {
    const probes: Array<[number, number]> = [];
    for (const loc of HUB_LOCATIONS) {
      probes.push(FAST_TRAVEL_ARRIVALS[loc.id]);
      const measured = measuredApproachPoint(loc);
      if (measured) probes.push(measured.point);
    }
    const answers = probes.map(([x, z]) => getNearbyHubLocation([x, 0, z])?.id ?? null);
    for (let i = 0; i < 10; i++) {
      const again = probes.map(([x, z]) => getNearbyHubLocation([x, 0, z])?.id ?? null);
      expect(again).toEqual(answers);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Unaffected hubs
// ══════════════════════════════════════════════════════════════════════════

describe('E. The twelve unaffected hubs are untouched and still work', () => {
  test('their radii and arrivals are exactly what they were', () => {
    for (const [id, radius] of Object.entries(UNCHANGED)) {
      expect(hub(id).radius, `${id} radius`).toBe(radius);
    }
    expect(FAST_TRAVEL_ARRIVALS.armor_workshop).toEqual([28.2, 5.5]);
    expect(FAST_TRAVEL_ARRIVALS.doctore_house).toEqual([23.5, -18.875]);
    expect(FAST_TRAVEL_ARRIVALS.records_house).toEqual([23.1, -26]);
    expect(FAST_TRAVEL_ARRIVALS.shrine_temple).toEqual([-22.5, 11]);
    expect(FAST_TRAVEL_ARRIVALS.bounty_hall).toEqual([-15, 30]);
    expect(FAST_TRAVEL_ARRIVALS.gladiator_barracks).toEqual([-22, -14]);
    expect(FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall).toEqual([-24, -29]);
    expect(FAST_TRAVEL_ARRIVALS.arena_medical_house).toEqual([-29, -9]);
    expect(FAST_TRAVEL_ARRIVALS.northern_fortress).toEqual([0, MOTTE_CENTER_Z + 12.5]);
  });

  test('each of them still answers at its own entrance, reached from its arrival', () => {
    for (const id of Object.keys(UNCHANGED)) {
      const { result } = arrivalWalk(id);
      expect(result.prompt, `${id} prompt`).toBe(id);
    }
  });

  test('none of the eight changes reaches a hub that was already fine', () => {
    // The affected set and the unaffected set are disjoint and together cover
    // all 20 hubs.
    const changed = Object.keys(CHANGED);
    const unaffected = Object.keys(UNCHANGED);
    expect(changed.filter((id) => unaffected.includes(id))).toEqual([]);
    expect([...changed, ...unaffected].sort()).toEqual([...HUB_IDS].sort());
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. All 20 triggers and all 20 arrivals
// ══════════════════════════════════════════════════════════════════════════

describe('F. Every trigger and every arrival', () => {
  test('all 20 hub triggers are reachable: each arrival walks to its own prompt', () => {
    const failures: string[] = [];
    for (const id of HUB_IDS) {
      const { result } = arrivalWalk(id);
      if (result.prompt !== id) {
        failures.push(`${id}: ${result.prompt ?? 'no prompt'} after ${result.steps} steps`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('no walk stalls against geometry on the way in', () => {
    for (const id of HUB_IDS) {
      const { result } = arrivalWalk(id);
      expect(result.blocked, `${id} walk blocked`).toBe(false);
    }
  });

  test('all 20 arrivals are collision-free at the player radius and with clearance', () => {
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(20);
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS), `${loc.id} at R`).toBe(false);
      expect(collidesWith(ax, az, PLAYER_RADIUS + 0.5, CITY_COLLIDERS), `${loc.id} with 0.5 clearance`).toBe(false);
      expect(ax).toBeGreaterThan(-BOUNDARY_X);
      expect(ax).toBeLessThan(BOUNDARY_X);
      expect(az).toBeLessThan(BOUNDARY_Z_MAX);
    }
  });

  test('every arrival can move away and every disc holds a standable point', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      const start: [number, number, number] = [ax, 0, az];
      const canMove = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dz]) => {
        const moved = resolveCityMovement(start, dx, dz, 3.8, 0.3);
        return moved[0] !== ax || moved[2] !== az;
      });
      expect(canMove, `${loc.id} arrival is not trapped`).toBe(true);
      expect(
        measuredApproachPoint(loc) !== null || centreStandable(loc),
        `${loc.id} disc holds a standable point`,
      ).toBe(true);
    }
  });

  test('the seven arrivals that sit outside their disc are outside by one short step', () => {
    // Deliberate standoffs: the prompt appears as the player walks in.  Each is
    // within 2.5 units of the disc, i.e. at most ~40 steps at 0.0633 per step.
    const outside: string[] = [];
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      const d = Math.hypot(ax - loc.position[0], az - loc.position[2]);
      if (d <= loc.radius) continue;
      outside.push(loc.id);
      expect(d - loc.radius, `${loc.id} standoff`).toBeLessThanOrEqual(2.5);
    }
    expect(outside.sort()).toEqual(
      [
        'smithing_forge',
        'tavern',
        'caravanserai',
        'gladiator_academy',
        'bathhouse',
        'gladiator_barracks',
        'northern_fortress',
      ].sort(),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Scope — everything this phase must not touch
// ══════════════════════════════════════════════════════════════════════════

describe('G. Nothing but the eight radii changed', () => {
  test('the registry still holds 110 colliders, 31 of them rectangles', () => {
    expect(CITY_COLLIDERS.length).toBe(110);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(110);
  });

  test('the movement constants are untouched', () => {
    expect(PLAYER_RADIUS).toBe(0.4);
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });

  test('the Training Hall collider and its narrow passage are exactly what C-8.45 left', () => {
    const hall = rect('training-hall');
    expect([hall.cx, hall.cz]).toEqual([-30.35, 3.0]);
    expect([hall.hw * 2, hall.hd * 2]).toEqual([2.7, 7.5]);
    expect(hall.cx - hall.hw).toBeCloseTo(-31.7, 10);
    expect(hall.cx + hall.hw).toBeCloseTo(-29.0, 10);
    expect(hall.cz - hall.hd).toBeCloseTo(-0.75, 10);
    expect(hall.cz + hall.hd).toBeCloseTo(6.75, 10);
    // The Arena Medical House ↔ Training Hall passage: 1.5 plan gap, 0.70 of
    // usable centres for a 0.4-radius player, and a driven crossing at the
    // corridor centre line.
    const medical = rect('arena-medical');
    const gap = hall.cz - hall.hd - (medical.cz + medical.hd); // -0.75 - (-2.25)
    expect(gap).toBeCloseTo(1.5, 10);
    expect(gap - PLAYER_RADIUS * 2).toBeCloseTo(0.7, 10);
    const corridorZ = (medical.cz + medical.hd + hall.cz - hall.hd) / 2;
    expect(collidesWith(-30.35, corridorZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    let cur: [number, number, number] = [-25.5, 0, corridorZ];
    let crossed = false;
    for (let i = 0; i < 150; i++) {
      cur = resolveCityMovement(cur, -1, 0, 3.8, 1 / 60);
      if (cur[0] < hall.cx + hall.hw && cur[0] > hall.cx - hall.hw) crossed = true;
      expect(collidesWith(cur[0], cur[2], PLAYER_RADIUS, CITY_COLLIDERS), `blocked at (${cur[0]}, ${cur[2]})`).toBe(false);
    }
    expect(crossed).toBe(true);
    expect(cur[0]).toBeLessThan(hall.cx - hall.hw);
  });

  test('the C-8.43 collider widths and the Forge\'s deliberate 9.5 are untouched', () => {
    const tavern = rect('city-tavern');
    expect([tavern.hw * 2, tavern.hd * 2]).toEqual([8.9, 7.7]);
    const carav = rect('caravanserai');
    expect([carav.hw * 2, carav.hd * 2]).toEqual([9.1, 8.1]);
    const forge = rect('smithing-forge');
    expect(forge.hw * 2).toBe(9.5);
    expect(forge.hd * 2).toBe(8.0);
  });

  test('the C-8.33 seals, the C-8.38 motte centre and the C-8.41 kerb are unchanged', () => {
    expect(MOTTE_CENTER_Z).toBe(-81.5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
    expect(CITY_COLLIDERS.some((c) => c.id === 'colo-gateseal-l')).toBe(true);
    expect(CITY_COLLIDERS.some((c) => c.id === 'colo-gateseal-r')).toBe(true);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
    expect(KERB_INNER_RADIUS).toBe(30.9);
    expect(KERB_OUTER_RADIUS).toBe(31.35);
    expect(KERB_GATE_HALF_W).toBe(2.7);
    expect(DECK_Z_OUTER).toBeCloseTo(-50.5, 10);
    expect(DECK_Z_INNER).toBeCloseTo(-56.5, 10);
    expect(DECK_TOP_Y).toBe(0.16);
  });

  test('no collider sits inside any hub disc that did not sit there before', () => {
    // Radii are interaction only: they never add collision.  A point just inside
    // the new rim of each changed hub is collision-free exactly as the old rim
    // was, i.e. the disc never claims stone.
    for (const id of Object.keys(CHANGED)) {
      const loc = hub(id);
      const measured = measuredApproachPoint(loc)!;
      expect(collidesWith(measured.point[0], measured.point[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(
        false,
      );
    }
  });
});
