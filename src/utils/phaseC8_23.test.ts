/**
 * Phase C-8.23 — courtyard collision audit (obelisk ↔ practice rack, the combat
 * courtyard's stone border ring, and the Tavern's internal patio group).
 *
 * The C-8.20 audit left three courtyard-level findings.  This phase acts on two and
 * documents the third:
 *
 *   1. The Academy-courtyard obelisk group at [25, 0, -21.6] passed its base (a
 *      0.9 × 0.4 × 0.9 box) 0.15 from the C-8.19 practice rack.  Both objects are
 *      plain boxes sharing a Y band and a Z band, so 0.15 was the *exact* X
 *      separation — a real gap, tight rather than conservative, below the 0.2 floor
 *      the neighbouring phases hold.  The group steps 0.10 west (X 25 → 24.9):
 *      base ↔ rack 0.25, spire ↔ rack 0.42, and every Z-governed gap to the Doctore
 *      House (plinth 0.40, plinth step 0.50, west quoin stack 0.475, wall 0.65) and
 *      to the Gladiator Academy plinth (1.30) is unchanged.
 *   2. The west combat courtyard's low stone border ring (r 3.0, tube 0.08 at
 *      Y 0.08) really did cross the Gladiator Barracks plinth: the plinth's
 *      north-east corner (-23.45, -10.95) lies only 1.051 from the courtyard centre
 *      (-23, -10), so the ring entered the plinth's north face at (-25.85, -10.95)
 *      and left through its east face at (-23.45, -12.97).  Neither a smaller radius
 *      nor a re-centred ring is viable (see the source note in CityStreets.tsx), so
 *      the affected arc is trimmed: 292.55° of ring (arc 5.106 rad) rotated 163.975°
 *      in-plane, which leaves both ends with the tube surface 0.10 clear of the
 *      plinth.  This suite rebuilds the *exact* TorusGeometry with the parsed torus
 *      arguments and the parsed mesh rotation and tests it against the plinth and
 *      wall boxes.
 *   3. The Tavern's internal patio group is deliberately *not* changed by this phase.
 *      Its anchor [3.6, 0, 2.2] sat inside the solid 8.4 × 6.4 × 7.2 wall box, so the
 *      table, cups and barrel stack were buried (the table's east face protruded 0.10
 *      above the plinth) while the two amphorae stood just outside the wall.  No group
 *      shift fixes that safely — west buries the amphorae in the façade, east leaves
 *      the buried props buried — so the re-seat is left as a documented follow-up and
 *      section E pins the measured baseline for it.  Nothing in this phase touches
 *      the group.  (Phase C-8.24 later performed that re-seat; section E keeps the
 *      baseline as frozen literals and points at phaseC8_24.test.ts for the shipped
 *      transforms.)
 *
 * Every number below is derived from the components' own sources (CityStreets.tsx,
 * GladiatorBarracks.tsx, DoctoreHouse.tsx, GladiatorAcademy.tsx, CityTavern.tsx,
 * CivicFurnishingProps.tsx) and, for the ring, from three.js itself.
 *
 * Run with: bun test src/utils/phaseC8_23.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { FAST_TRAVEL_ARRIVALS } from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const streetsSrc = load('../components/3d/city/CityStreets.tsx');
const barracksSrc = load('../components/3d/city/GladiatorBarracks.tsx');
const doctoreSrc = load('../components/3d/city/DoctoreHouse.tsx');
const academySrc = load('../components/3d/city/GladiatorAcademy.tsx');
const tavernSrc = load('../components/3d/city/CityTavern.tsx');
const civicSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const c21 = load('./phaseC8_21.test.ts');
const c22 = load('./phaseC8_22.test.ts');

// ── Tiny parsers (same style as the C-8.18 / 19 / 21 / 22 suites) ─────────

function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}
function triple(src: string, re: RegExp): [number, number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`triple not found: ${re}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}
function all(src: string, re: RegExp): RegExpExecArray[] {
  return [...src.matchAll(re)];
}
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── Axis-aligned boxes and their separations ──────────────────────────────

interface Box {
  n: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
}
/** Axis separation of two boxes: ≥ 0 clear, < 0 overlapping. */
const gapOf = (a: Box, b: Box) =>
  Math.max(b.x[0] - a.x[1], a.x[0] - b.x[1], b.y[0] - a.y[1], a.y[0] - b.y[1], b.z[0] - a.z[1], a.z[0] - b.z[1]);
const contains = (p: { x: number; y: number; z: number }, b: Box) =>
  p.x > b.x[0] && p.x < b.x[1] && p.y > b.y[0] && p.y < b.y[1] && p.z > b.z[0] && p.z < b.z[1];
const boxDistance = (p: { x: number; y: number; z: number }, b: Box) =>
  Math.hypot(
    Math.max(b.x[0] - p.x, p.x - b.x[1], 0),
    Math.max(b.y[0] - p.y, p.y - b.y[1], 0),
    Math.max(b.z[0] - p.z, p.z - b.z[1], 0),
  );

// ══════════════════════════════════════════════════════════════════════════
// A. The two transforms this phase declares
// ══════════════════════════════════════════════════════════════════════════

const OBELISK_POS = triple(
  streetsSrc,
  /Center Academy Monumental Obelisk[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
const OBELISK_BASE_BOX = triple(
  streetsSrc,
  /Center Academy Monumental Obelisk[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const OBELISK_BASE_Y = num(
  streetsSrc,
  /Square Marble base plinth[\s\S]*?<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/,
);
const OBELISK_SPIRE = triple(
  streetsSrc,
  /Tapered Obelisk Spire[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*4\s*\]\}/,
);
const OBELISK_SPIRE_Y = num(streetsSrc, /Tapered Obelisk Spire[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}/);

/** The low stone border ring, exactly as the scene renders it. */
const RING_ANCHOR = 'Low Stone Border around Courtyard';
const RING_PLACEMENT = (() => {
  const m = new RegExp(
    `${RING_ANCHOR}[\\s\\S]*?<mesh position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\} rotation=\\{\\[-Math\\.PI \\/ 2, 0, ([\\d.]+)\\]\\}>`,
  ).exec(streetsSrc);
  if (!m) throw new Error('ring placement not found');
  return { position: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number], rotZ: Number(m[4]) };
})();
const RING_TORUS = (() => {
  const m = new RegExp(
    `${RING_ANCHOR}[\\s\\S]*?<torusGeometry args=\\{\\[\\s*([\\d.]+),\\s*([\\d.]+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\]\\} \\/>`,
  ).exec(streetsSrc);
  if (!m) throw new Error('ring torus not found');
  return {
    radius: Number(m[1]),
    tube: Number(m[2]),
    radialSegments: Number(m[3]),
    tubularSegments: Number(m[4]),
    arc: Number(m[5]),
  };
})();
/** The paved combat courtyard circle the ring borders. */
const COURTYARD_FLOOR = (() => {
  const m =
    /Circular Combat Courtyard Paved Floor \*\/\}\s*<mesh receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}>\s*<circleGeometry args=\{\[\s*([\d.]+),\s*\d+\s*\]\}/.exec(
      streetsSrc,
    );
  if (!m) throw new Error('courtyard floor not found');
  return { position: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number], radius: Number(m[4]) };
})();
/** The Academy courtyard's paved circle, which the obelisk group stands on. */
const ACADEMY_COURTYARD = (() => {
  const m =
    /Minerva Courtyard Floor \(Circular Travertine\) \*\/\}\s*<mesh receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}>\s*<circleGeometry args=\{\[\s*([\d.]+),\s*\d+\s*\]\}/.exec(
      streetsSrc,
    );
  if (!m) throw new Error('Academy courtyard floor not found');
  return { position: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number], radius: Number(m[4]) };
})();
/** The courtyard's own central obelisk (distinct from the Academy one). */
const CENTRAL_OBELISK = triple(
  streetsSrc,
  /Central Courtyard Monumental Obelisk[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
const CENTRAL_OBELISK_BASE = triple(
  streetsSrc,
  /Central Courtyard Monumental Obelisk[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);

describe('A. The sources declare the two C-8.23 transforms', () => {
  test('the Academy obelisk group stepped 0.10 west, Z untouched', () => {
    expect(OBELISK_POS).toEqual([24.9, 0, -21.6]);
    expect(streetsSrc).not.toContain('<group position={[25, 0, -21.6]}>');
    // Internal transform, orientation and the π/4 spire are unchanged.
    expect(OBELISK_BASE_BOX).toEqual([0.9, 0.4, 0.9]);
    expect(OBELISK_BASE_Y).toBe(0.2);
    expect(OBELISK_SPIRE).toEqual([0.15, 0.28, 2.0]);
    expect(OBELISK_SPIRE_Y).toBe(1.4);
    expect(streetsSrc).toContain('<mesh castShadow position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]}>');
  });

  test('the ring keeps its centre, radius, tube, height and material, and is trimmed', () => {
    expect(RING_PLACEMENT.position).toEqual([-23, 0.08, -10]);
    expect(RING_PLACEMENT.rotZ).toBeCloseTo(2.8619, 6);
    expect(RING_TORUS.radius).toBe(3.0);
    expect(RING_TORUS.tube).toBe(0.08);
    expect(RING_TORUS.radialSegments).toBe(6);
    expect(RING_TORUS.tubularSegments).toBe(24);
    expect(RING_TORUS.arc).toBeCloseTo(5.106, 6);
    expect(streetsSrc).toContain('<meshStandardMaterial color="#cbd5e1" roughness={0.6} />');
    // …still a border: ~292.55° of ring, more than four fifths of the circle.
    const arcDegrees = (RING_TORUS.arc * 180) / Math.PI;
    expect(arcDegrees).toBeGreaterThan(280);
    expect(arcDegrees).toBeLessThan(300);
    // The paved floor it edges is untouched.
    expect(COURTYARD_FLOOR.position).toEqual([-23, 0.005, -10]);
    expect(COURTYARD_FLOOR.radius).toBe(RING_TORUS.radius);
  });

  test('both changes are documented in the source they change', () => {
    expect(all(streetsSrc, /Phase C-8\.23[\s\S]*?phaseC8_23\.test\.ts\. \*\//g).length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The obelisk ↔ practice-rack clearance
// ══════════════════════════════════════════════════════════════════════════

const DOCTORE_ROOT = triple(doctoreSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
/** The C-8.19 practice rack: group [-1.9, 0, -2.7] with a 1.0 × 0.8 × 1.2 box at y 0.4. */
const RACK: Box = (() => {
  const m =
    /Wooden Rack Bench \*\/\}\s*<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<mesh castShadow position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/.exec(
      doctoreSrc,
    );
  if (!m) throw new Error('practice rack not found');
  const gx = DOCTORE_ROOT[0] + Number(m[1]);
  const gz = DOCTORE_ROOT[2] + Number(m[3]);
  const y = Number(m[4]);
  const [w, h, d] = [Number(m[5]), Number(m[6]), Number(m[7])];
  return {
    n: 'rack',
    x: [gx - w / 2, gx + w / 2],
    y: [y - h / 2, y + h / 2],
    z: [gz - d / 2, gz + d / 2],
  };
})();

const obeliskBase = (x: number, z: number): Box => ({
  n: 'obelisk.base',
  x: [x - OBELISK_BASE_BOX[0] / 2, x + OBELISK_BASE_BOX[0] / 2],
  y: [0, OBELISK_BASE_Y * 2],
  z: [z - OBELISK_BASE_BOX[2] / 2, z + OBELISK_BASE_BOX[2] / 2],
});
/** The spire is yawed π/4; its 0.28 vertex radius bounds it on both world axes. */
const obeliskSpire = (x: number, z: number): Box => ({
  n: 'obelisk.spire',
  x: [x - OBELISK_SPIRE[1], x + OBELISK_SPIRE[1]],
  y: [OBELISK_SPIRE_Y - OBELISK_SPIRE[2] / 2, OBELISK_SPIRE_Y + OBELISK_SPIRE[2] / 2],
  z: [z - OBELISK_SPIRE[1], z + OBELISK_SPIRE[1]],
});

/** The Doctore House boxes the obelisk shares its height band with. */
const DOCTORE_BOXES: Box[] = (() => {
  const [rx, , rz] = DOCTORE_ROOT;
  const [fw, fd] = pair(doctoreSrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const proj = num(doctoreSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
  const height = num(doctoreSrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
  const wall = triple(
    doctoreSrc,
    /<mesh castShadow receiveShadow position=\{\[\s*0,\s*[\d.]+,\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  );
  const qHalf = Math.max(...pair(archSrc, /const qx = isLong \? ([\d.]+) : ([\d.]+);/), ...pair(archSrc, /const qz = isLong \? ([\d.]+) : ([\d.]+);/)) / 2;
  const [bw, bd] = pair(doctoreSrc, /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const lower = height * 0.45;
  const quoinZ: [number, number] = [rz - bd / 2 - qHalf, rz - bd / 2 + qHalf];
  return [
    { n: 'plinth.lower', x: [rx - fw / 2 - proj, rx + fw / 2 + proj], y: [0, lower], z: [rz - fd / 2 - proj, rz + fd / 2 + proj] },
    { n: 'plinth.upper', x: [rx - fw / 2 - proj * 0.6, rx + fw / 2 + proj * 0.6], y: [lower, height], z: [rz - fd / 2 - proj * 0.6, rz + fd / 2 + proj * 0.6] },
    { n: 'wall', x: [rx - wall[0] / 2, rx + wall[0] / 2], y: [0, wall[1]], z: [rz - wall[2] / 2, rz + wall[2] / 2] },
    { n: 'quoins.west', x: [rx - bw / 2 - qHalf, rx - bw / 2 + qHalf], y: [0, wall[1]], z: quoinZ },
  ];
})();

/** The Gladiator Academy's stepped plinth (its north face is the practice lane limit). */
const ACADEMY_PLINTH: Box = (() => {
  const [rx, , rz] = triple(academySrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
  const [fw, fd] = pair(academySrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const proj = num(academySrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
  const height = num(academySrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
  return {
    n: 'academy.plinth.lower',
    x: [rx - fw / 2 - proj, rx + fw / 2 + proj],
    y: [0, height * 0.45],
    z: [rz - fd / 2 - proj, rz + fd / 2 + proj],
  };
})();
const doctoreBox = (n: string): Box => {
  const b = DOCTORE_BOXES.find((x) => x.n === n);
  if (!b) throw new Error(`no Doctore box ${n}`);
  return b;
};

describe('B. The obelisk now clears the practice rack by 0.25', () => {
  test('the rack is a 1.0 × 0.8 × 1.2 box at world [26.1, 0.4, -21.575]', () => {
    expect(DOCTORE_ROOT).toEqual([28, 0, -18.875]);
    expect(RACK.x[0]).toBeCloseTo(25.6, 10);
    expect(RACK.x[1]).toBeCloseTo(26.6, 10);
    expect(RACK.y[0]).toBeCloseTo(0, 10);
    expect(RACK.y[1]).toBeCloseTo(0.8, 10);
    expect(RACK.z[0]).toBeCloseTo(-22.175, 10);
    expect(RACK.z[1]).toBeCloseTo(-20.975, 10);
  });

  test('0.15 was the exact X separation, not a conservative bound', () => {
    const old = obeliskBase(25, -21.6);
    // Same Y band and same Z band, so the two boxes are separated on X alone and the
    // audit's 0.15 is exact.
    expect(old.y[0]).toBeLessThan(RACK.y[1]);
    expect(old.y[1]).toBeGreaterThan(RACK.y[0]);
    expect(old.z[0]).toBeLessThan(RACK.z[1]);
    expect(old.z[1]).toBeGreaterThan(RACK.z[0]);
    expect(old.x[1]).toBeLessThan(RACK.x[0]);
    expect(gapOf(old, RACK)).toBeCloseTo(0.15, 10);
  });

  test('the shipped 0.10 westward step buys the 0.25 gap and is the smallest one', () => {
    const base = obeliskBase(OBELISK_POS[0], OBELISK_POS[2]);
    const spire = obeliskSpire(OBELISK_POS[0], OBELISK_POS[2]);
    expect(gapOf(base, RACK)).toBeCloseTo(0.25, 10);
    expect(gapOf(base, RACK)).toBeGreaterThanOrEqual(0.25);
    expect(gapOf(spire, RACK)).toBeCloseTo(0.42, 10);
    // 0.10 west is the smallest step that reaches the 0.25 minimum.
    expect(gapOf(obeliskBase(25.0, -21.6), RACK)).toBeLessThan(0.25);
    expect(gapOf(obeliskBase(24.95, -21.6), RACK)).toBeLessThan(0.25);
  });

  test('every Z-governed gap to the Doctore House and Academy is unchanged', () => {
    const base = obeliskBase(OBELISK_POS[0], OBELISK_POS[2]);
    const spire = obeliskSpire(OBELISK_POS[0], OBELISK_POS[2]);
    expect(gapOf(base, doctoreBox('plinth.lower'))).toBeCloseTo(0.4, 10);
    expect(gapOf(base, doctoreBox('plinth.upper'))).toBeCloseTo(0.5, 10);
    expect(gapOf(base, doctoreBox('quoins.west'))).toBeCloseTo(0.475, 10);
    expect(gapOf(base, doctoreBox('wall'))).toBeCloseTo(0.65, 10);
    expect(gapOf(spire, doctoreBox('plinth.lower'))).toBeCloseTo(0.57, 10);
    expect(gapOf(base, ACADEMY_PLINTH)).toBeCloseTo(1.3, 10);
    expect(gapOf(spire, ACADEMY_PLINTH)).toBeCloseTo(1.47, 10);
    // The X step changed nothing for the house: the pair keeps its X overlap and its
    // Z-governed gap at the pre-C-8.23 X too.
    const old = obeliskBase(25, -21.6);
    for (const b of DOCTORE_BOXES) {
      expect(gapOf(old, b)).toBeCloseTo(gapOf(base, b), 10);
    }
  });

  test('the group stays inside the paved Academy courtyard circle', () => {
    const base = obeliskBase(OBELISK_POS[0], OBELISK_POS[2]);
    for (const x of base.x) {
      for (const z of base.z) {
        expect(Math.hypot(x - ACADEMY_COURTYARD.position[0], z - ACADEMY_COURTYARD.position[2])).toBeLessThan(ACADEMY_COURTYARD.radius);
      }
    }
    // …0.61 from the circle's centre: the 0.10 step keeps it where it belongs.
    expect(Math.hypot(OBELISK_POS[0] - ACADEMY_COURTYARD.position[0], OBELISK_POS[2] - ACADEMY_COURTYARD.position[2])).toBeCloseTo(0.608, 3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The ring against the Gladiator Barracks plinth
// ══════════════════════════════════════════════════════════════════════════

const BARRACKS_ROOT = triple(barracksSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const BARRACKS_BOXES: Box[] = (() => {
  const [rx, , rz] = BARRACKS_ROOT;
  const [fw, fd] = pair(barracksSrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const proj = num(barracksSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
  const height = num(barracksSrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
  const wall = triple(
    barracksSrc,
    /<mesh castShadow receiveShadow position=\{\[\s*0,\s*[\d.]+,\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  );
  const lower = height * 0.45;
  return [
    { n: 'plinth.lower', x: [rx - fw / 2 - proj, rx + fw / 2 + proj], y: [0, lower], z: [rz - fd / 2 - proj, rz + fd / 2 + proj] },
    { n: 'plinth.upper', x: [rx - fw / 2 - proj * 0.6, rx + fw / 2 + proj * 0.6], y: [lower, height], z: [rz - fd / 2 - proj * 0.6, rz + fd / 2 + proj * 0.6] },
    { n: 'wall', x: [rx - wall[0] / 2, rx + wall[0] / 2], y: [0, wall[1]], z: [rz - wall[2] / 2, rz + wall[2] / 2] },
  ];
})();

/** The ring exactly as three.js builds it: parsed torus args + parsed mesh rotation. */
const RING_MESH = (() => {
  const geometry = new THREE.TorusGeometry(
    RING_TORUS.radius,
    RING_TORUS.tube,
    RING_TORUS.radialSegments,
    RING_TORUS.tubularSegments,
    RING_TORUS.arc,
  );
  const mesh = new THREE.Mesh(geometry);
  mesh.rotation.set(-Math.PI / 2, 0, RING_PLACEMENT.rotZ);
  mesh.position.set(...RING_PLACEMENT.position);
  mesh.updateMatrixWorld(true);
  return { geometry, mesh };
})();
const RING_VERTICES = (() => {
  const attr = RING_MESH.geometry.attributes.position;
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < attr.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(RING_MESH.mesh.matrixWorld);
    out.push({ x: v.x, y: v.y, z: v.z });
  }
  return out;
})();

const [RCX, RCY, RCZ] = RING_PLACEMENT.position;
const azimuth = (x: number, z: number) => {
  const a = (Math.atan2(z - RCZ, x - RCX) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
};
/** The largest angular hole in the ring's own vertices — i.e. the trimmed gap. */
function angularGap(points: Array<{ x: number; z: number }>) {
  const angs = points.map((p) => azimuth(p.x, p.z)).sort((a, b) => a - b);
  let best = { start: 0, end: 0, width: -1 };
  for (let i = 0; i < angs.length; i++) {
    const start = angs[i];
    const end = angs[(i + 1) % angs.length];
    const width = (end - start + 360) % 360;
    if (width > best.width) best = { start, end, width };
  }
  return best;
}
const RING_GAP = angularGap(RING_VERTICES);
/** True when an azimuth falls inside the removed arc. */
const inGap = (a: number) => (a - RING_GAP.start + 360) % 360 < RING_GAP.width;
/** Sample the (untrimmed) tube surface at one azimuth. */
function tubeSamples(azDeg: number, tubeSamples = 48) {
  const phi = (azDeg * Math.PI) / 180;
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let j = 0; j < tubeSamples; j++) {
    const beta = (2 * Math.PI * j) / tubeSamples;
    const rad = RING_TORUS.radius + RING_TORUS.tube * Math.sin(beta);
    out.push({
      x: RCX + rad * Math.cos(phi),
      y: RCY + RING_TORUS.tube * Math.cos(beta),
      z: RCZ + rad * Math.sin(phi),
    });
  }
  return out;
}
/**
 * Sweep the *ideal* torus surface over an azimuth span (the rendered mesh is facetted,
 * so this is the conservative check) against the barracks boxes.
 */
function sweepRing(azStart: number, azEnd: number, azimuthSamples = 1500) {
  let inside = 0;
  let minClearance = Infinity;
  let worstAzimuth = 0;
  for (let i = 0; i <= azimuthSamples; i++) {
    const az = azStart + ((azEnd - azStart) * i) / azimuthSamples;
    for (const p of tubeSamples(az)) {
      for (const b of BARRACKS_BOXES) {
        const d = boxDistance(p, b);
        if (d < minClearance) {
          minClearance = d;
          worstAzimuth = ((az % 360) + 360) % 360;
        }
        if (contains(p, b)) inside++;
      }
    }
  }
  return { inside, minClearance, worstAzimuth, samples: (azimuthSamples + 1) * 48 };
}
/** The azimuth span where the untrimmed ring's tube is inside a barracks box. */
function intersectingSpan() {
  const hits: number[] = [];
  const steps = 3000;
  for (let i = 0; i <= steps; i++) {
    const az = (360 * i) / steps;
    if (tubeSamples(az).some((p) => BARRACKS_BOXES.some((b) => contains(p, b)))) hits.push(az);
  }
  return { first: hits[0], last: hits[hits.length - 1] };
}
const nearAngle = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('C. The trimmed ring clears the Gladiator Barracks plinth', () => {
  test('the barracks plinth really does reach the courtyard centre', () => {
    expect(BARRACKS_ROOT).toEqual([-27, 0, -14]);
    const lower = BARRACKS_BOXES[0];
    expect(lower.x[0]).toBeCloseTo(-30.55, 10);
    expect(lower.x[1]).toBeCloseTo(-23.45, 10);
    expect(lower.z[0]).toBeCloseTo(-17.05, 10);
    expect(lower.z[1]).toBeCloseTo(-10.95, 10);
    expect(lower.y[1]).toBeCloseTo(0.135, 10);
    // Its north-east corner is 1.051 from the ring's centre — inside the circle the
    // ring draws, which is why the overlap existed at all.
    expect(Math.hypot(-23.45 - RCX, -10.95 - RCZ)).toBeCloseTo(1.051, 3);
    // …and the collider is that same plinth footprint, so the removed arc was ground
    // the player could never stand on anyway.
    const collider = findRect('gladiator-barracks');
    expect(collider.cx - collider.hw).toBeCloseTo(lower.x[0], 10);
    expect(collider.cz - collider.hd).toBeCloseTo(lower.z[0], 10);
  });

  test('the audit reproduces on the untrimmed ring: about a third of the tube inside', () => {
    const full = sweepRing(0, 360);
    expect(full.inside).toBeGreaterThan(0);
    const pct = (full.inside / full.samples) * 100;
    expect(pct).toBeGreaterThan(25);
    expect(pct).toBeLessThan(40);
  });

  test('the trimmed ring never enters the plinth or the wall', () => {
    const trimmed = sweepRing(RING_GAP.end, 360 + RING_GAP.start);
    expect(trimmed.inside).toBe(0);
    expect(trimmed.minClearance).toBeGreaterThanOrEqual(0.099);
    // Its tightest point is one of the two cut ends, 0.10 from the plinth face.
    expect(Math.min(nearAngle(trimmed.worstAzimuth, RING_GAP.start), nearAngle(trimmed.worstAzimuth, RING_GAP.end))).toBeLessThan(0.6);
    // And the rendered geometry itself — vertices, both cut ends included — is clear.
    let vertexInside = 0;
    let minVertexClearance = Infinity;
    for (const v of RING_VERTICES) {
      for (const b of BARRACKS_BOXES) {
        minVertexClearance = Math.min(minVertexClearance, boxDistance(v, b));
        if (contains(v, b)) vertexInside++;
      }
    }
    expect(vertexInside).toBe(0);
    expect(minVertexClearance).toBeGreaterThanOrEqual(0.099);
  });

  test('the removed arc is the one that crossed the plinth, with margin to spare', () => {
    const span = intersectingSpan();
    expect(span.first).toBeGreaterThan(196);
    expect(span.first).toBeLessThan(200);
    expect(span.last).toBeGreaterThan(260);
    expect(span.last).toBeLessThan(264);
    // The gap brackets the whole crossing span with margin on both sides.
    expect(RING_GAP.start).toBeLessThan(span.first - 1.5);
    expect(RING_GAP.end).toBeGreaterThan(span.last + 1.5);
    expect(RING_GAP.width).toBeCloseTo(67.45, 1);
  });

  test('the ring carries no collider and the barracks collider is untouched', () => {
    expect(CITY_COLLIDERS.filter((c) => /ring|border/i.test(c.id))).toEqual([]);
    expect(findRect('gladiator-barracks')).toMatchObject({ cx: -27, cz: -14, hw: 7.1 / 2, hd: 6.1 / 2 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The courtyard's own furniture, walkways and arrivals
// ══════════════════════════════════════════════════════════════════════════

const WEST_FURNITURE_ANCHOR = 'Western Combat Services Courtyard Benches & Notice Board';
const westFurniture = (tag: string, extra = '') =>
  triple(
    streetsSrc,
    new RegExp(
      `${WEST_FURNITURE_ANCHOR}[\\s\\S]*?<${tag} position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}${extra}`,
    ),
  );
const WEST_BENCH = westFurniture('RomanBench', ' rotationY=\\{0\\} \\/>');
const WEST_BOARD = westFurniture('TabulaNoticeBoard', ' rotationY=\\{0\\} \\/>');
const WEST_BARREL = westFurniture('WineBarrel', ' isLyingDown=\\{true\\} rotationY=\\{0\\.8\\} \\/>');
/** RomanBench's two leg pedestals sit at local x ±0.8; the foot plinth is the first box. */
const BENCH_LEG_X = pair(civicSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(lx, li\)/);
const BENCH_FOOT = (() => {
  const m = /export const RomanBench[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/.exec(civicSrc);
  if (!m) throw new Error('bench foot not found');
  return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
})();
/** TabulaNoticeBoard's two 0.12 posts sit at local x ±0.7. */
const BOARD_POST_X = pair(civicSrc, /Two Timber Support Posts[\s\S]*?\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/);
const BOARD_POST_SIZE = pair(civicSrc, /Two Timber Support Posts[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*[\d.]+,\s*([\d.]+)\s*\]\} \/>/);

describe('D. Furniture, walkways and arrivals are untouched', () => {
  test('the west courtyard furniture keeps its transforms', () => {
    expect(WEST_BENCH).toEqual([-23.0, 0, -7.5]);
    expect(WEST_BOARD).toEqual([-23.0, 0, -12.5]);
    expect(WEST_BARREL).toEqual([-25.5, 0, -9.2]);
    expect(WEST_BARREL[1]).toBe(0);
    expect(BENCH_LEG_X).toEqual([-0.8, 0.8]);
    expect(BOARD_POST_X).toEqual([-0.7, 0.7]);
  });

  test('none of them sits in the removed arc, so the trim cannot reach them', () => {
    expect(inGap(azimuth(WEST_BENCH[0], WEST_BENCH[2]))).toBe(false);
    expect(inGap(azimuth(WEST_BARREL[0], WEST_BARREL[2]))).toBe(false);
    // The bench's own graze of the tube (a 0.026 sliver on the inner foot corner) is
    // therefore exactly as C-8.22 left it.
    const footMaxRadius = Math.max(
      ...BENCH_LEG_X.flatMap((lx) =>
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            Math.hypot(WEST_BENCH[0] + lx + (sx * BENCH_FOOT[0]) / 2 - RCX, WEST_BENCH[2] + (sz * BENCH_FOOT[2]) / 2 - RCZ),
          ),
        ),
      ),
    );
    expect(footMaxRadius).toBeCloseTo(2.954, 3);
    expect(footMaxRadius).toBeGreaterThan(RING_TORUS.radius - RING_TORUS.tube);
    // The notice board stands inside the ring's inner edge (plan radius 2.670 against
    // the tube's inner 2.92), so its whole footprint is clear — including the west
    // post, whose azimuth does fall inside the gap.
    const boardMaxRadius = Math.max(
      ...BOARD_POST_X.flatMap((px) =>
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            Math.hypot(WEST_BOARD[0] + px + (sx * BOARD_POST_SIZE[0]) / 2 - RCX, WEST_BOARD[2] + (sz * BOARD_POST_SIZE[1]) / 2 - RCZ),
          ),
        ),
      ),
    );
    expect(boardMaxRadius).toBeCloseTo(2.67, 2);
    expect(boardMaxRadius).toBeLessThan(RING_TORUS.radius - RING_TORUS.tube);
  });

  test('the central courtyard obelisk and the ring itself are unaffected', () => {
    expect(CENTRAL_OBELISK).toEqual([-23, 0, -10]);
    expect(CENTRAL_OBELISK_BASE).toEqual([0.7, 0.3, 0.7]);
    // 0.35 half-width against the tube's 2.92 inner edge: nowhere near it.
    expect(CENTRAL_OBELISK_BASE[0] / 2).toBeLessThan(RING_TORUS.radius - RING_TORUS.tube);
    // The ring still stands its full 0.16 proud of the courtyard floor.
    expect(RCY).toBeCloseTo(RING_TORUS.tube, 10);
  });

  test('no fast-travel arrival stands on the ring or in the removed arc', () => {
    for (const [name, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
      const r = Math.hypot(ax - RCX, az - RCZ);
      expect(r, `${name} sits on the border ring`).toBeGreaterThan(RING_TORUS.radius + RING_TORUS.tube);
    }
    expect(FAST_TRAVEL_ARRIVALS.gladiator_barracks).toEqual([-22, -14]);
    expect(FAST_TRAVEL_ARRIVALS.doctore_house).toEqual([23.5, -18.875]);
    expect(FAST_TRAVEL_ARRIVALS.gladiator_academy).toEqual([25.5, -23]);
    expect(FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall).toEqual([-24, -29]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The Tavern patio group — the baseline this phase measured (re-seated in C-8.24)
// ══════════════════════════════════════════════════════════════════════════

const TAVERN_WALL = (() => {
  const m =
    /<mesh castShadow receiveShadow position=\{\[\s*0,\s*([\d.]+),\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/.exec(
      tavernSrc,
    );
  if (!m) throw new Error('tavern wall not found');
  return { y: Number(m[1]), size: [Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number] };
})();
/**
 * The C-8.23 baseline.  That phase measured the group's anchor [3.6, 0, 2.2]
 * inside the rendered wall box and left the re-seat as a documented follow-up;
 * **C-8.24 performed it** (the shipped transforms live in phaseC8_24.test.ts), so
 * the values below are frozen here as the record the re-seat was designed
 * against.  They are literals rather than source parses precisely because the
 * source no longer holds them — the defect arithmetic itself is unchanged.
 */
const PATIO_C823 = [3.6, 0, 2.2] as const;
const PATIO_TABLE_C823 = { y: 0.5, size: [1.4, 0.9, 1.2] as const };
const PATIO_AMPHORAE_C823 = [
  { x: 0.9, z: 0.4, scale: 0.8 },
  { x: 0.8, z: -0.2, scale: 0.75 },
] as const;
const PATIO_BARRELS_C823 = [
  { x: -0.8, y: 0, z: -1.8, lying: false },
  { x: -0.8, y: 0.72, z: -1.8, lying: true },
] as const;
const AMPHORA_BELLY_R = num(civicSrc, /export const RomanAmphora[\s\S]*?<sphereGeometry args=\{\[\s*([\d.]+),/);
const BARREL_RADIUS = Math.max(
  ...pair(civicSrc, /Bulged Stave Oak Barrel Body[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*[\d.]+,\s*\d+\s*\]\} \/>/),
);
const TAVERN_WALL_HALF_X = TAVERN_WALL.size[0] / 2;

describe('E. The Tavern patio baseline C-8.23 measured — re-seated by C-8.24', () => {
  test('the wall the baseline sat in is the rendered box, not a conservative envelope', () => {
    expect(TAVERN_WALL.y).toBe(3.2);
    expect(TAVERN_WALL.size).toEqual([8.4, 6.4, 7.2]);
    expect(TAVERN_WALL_HALF_X).toBe(4.2);
  });

  test('the baseline itself: anchor, parts and the defects it measured', () => {
    expect(PATIO_C823).toEqual([3.6, 0, 2.2]);
    expect(PATIO_TABLE_C823.y).toBe(0.5);
    expect(PATIO_TABLE_C823.size).toEqual([1.4, 0.9, 1.2]);
    expect(PATIO_AMPHORAE_C823.map((a) => [a.x, a.z, a.scale])).toEqual([
      [0.9, 0.4, 0.8],
      [0.8, -0.2, 0.75],
    ]);
    expect(PATIO_BARRELS_C823.map((b) => [b.x, b.y, b.z, b.lying])).toEqual([
      [-0.8, 0, -1.8, false],
      [-0.8, 0.72, -1.8, true],
    ]);
    // The anchor sat inside the rendered box in plan — which is why the table, cups
    // and barrels read as buried inside a solid rather than clipping a thin shell.
    expect(Math.abs(PATIO_C823[0])).toBeLessThan(TAVERN_WALL_HALF_X);
    expect(Math.abs(PATIO_C823[2])).toBeLessThan(TAVERN_WALL.size[2] / 2);
    // Table: local X [2.9, 4.3] against the wall face at 4.2 → 0.10 through the
    // façade, above the plinth, where the stepped base does not cover it.
    const tableEast = PATIO_C823[0] + PATIO_TABLE_C823.size[0] / 2;
    expect(tableEast).toBeCloseTo(4.3, 10);
    expect(tableEast - TAVERN_WALL_HALF_X).toBeCloseTo(0.1, 10);
    // Barrel stack: wholly inside the wall box (local X [2.42, 3.18]).
    for (const b of PATIO_BARRELS_C823) {
      expect(PATIO_C823[0] + b.x - BARREL_RADIUS).toBeGreaterThan(-TAVERN_WALL_HALF_X);
      expect(PATIO_C823[0] + b.x + BARREL_RADIUS).toBeLessThan(TAVERN_WALL_HALF_X);
    }
    // Amphorae: outside the wall face, standing against the plinth step.
    for (const a of PATIO_AMPHORAE_C823) {
      expect(PATIO_C823[0] + a.x - AMPHORA_BELLY_R * a.scale).toBeGreaterThan(TAVERN_WALL_HALF_X);
    }
    // …and the smallest group shift that would hide the table (0.10 west) drove the
    // second amphora 0.095 into the façade instead — why C-8.23 left the group for a
    // proper re-seat rather than nudging it, and C-8.24 re-seated it.
    const shifted = PATIO_C823[0] - 0.1;
    expect(shifted + PATIO_AMPHORAE_C823[1].x - AMPHORA_BELLY_R * PATIO_AMPHORAE_C823[1].scale).toBeLessThan(TAVERN_WALL_HALF_X);
  });

  test('C-8.24 replaced that anchor, and it now sits outside the wall box', () => {
    // The baseline anchor is gone, and the shipped one is north of the Z = 10.4 face.
    expect(tavernSrc).not.toContain('<group position={[3.6, 0, 2.2]}>');
    const patio = triple(
      tavernSrc,
      /OUTDOOR PATIO TAVERN BENCHES & WINE BARRELS[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
    );
    expect(patio).toEqual([-2.8, 0, -5.4]);
    // Tavern root Z = 14, north wall face Z = 10.4: the group is 1.8 north of it.
    expect(14 + patio[2] - 10.4).toBeCloseTo(-1.8, 10);
  });

  test('no patio prop ever gained a collider', () => {
    expect(CITY_COLLIDERS.filter((c) => /patio|amphora|barrel|^table/.test(c.id))).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Scope — buildings, prior phases and their suites
// ══════════════════════════════════════════════════════════════════════════

const DOCTORE_FOUNDATION = pair(doctoreSrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

describe('F. The phase moves two props and one ring, and nothing else', () => {
  test('building roots and colliders are untouched', () => {
    expect(BARRACKS_ROOT).toEqual([-27, 0, -14]);
    expect(DOCTORE_ROOT).toEqual([28, 0, -18.875]);
    expect(DOCTORE_FOUNDATION).toEqual([5.5, 3.25]);
    expect(triple(tavernSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/)).toEqual([-16, 0, 14]);
    expect(triple(academySrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/)).toEqual([30.5, 0, -27]);
    expect(findRect('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 9.4 / 2, hd: 7.7 / 2 });
    expect(findRect('doctore-house')).toMatchObject({ cx: 28, cz: -18.875, hw: 6.0 / 2, hd: 3.75 / 2 });
    expect(findRect('gladiator-barracks')).toMatchObject({ cx: -27, cz: -14, hw: 7.1 / 2, hd: 6.1 / 2 });
  });

  test('the C-8.18, C-8.19, C-8.21 and C-8.22 corrections are preserved', () => {
    expect(findRect('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(streetsSrc).toContain('<MerchantCart position={[10.8, 0, -1.7]} rotationY={Math.PI / 4} />');
    expect(streetsSrc).toContain('<MerchantPropsCluster position={[11.9, 0, 5.2]} />');
    expect(streetsSrc).toContain('<RomanBench position={[-13.8, 0, 8.4]} rotationY={Math.PI / 4} />');
    expect(streetsSrc).toContain('<RomanBench position={[13.8, 0, 8.4]} rotationY={-Math.PI / 4} />');
    expect(streetsSrc).toContain('<TimberCrate position={[15.5, 0, 9.1]} size={[0.9, 0.8, 0.9]} />');
    expect(streetsSrc).toContain('<RomanAmphora position={[16.9, 0, 9.1]} scale={0.85} tone="terracotta" />');
    expect(streetsSrc).toContain('<RomanBench position={[27.5, 0, -22.0]} rotationY={-Math.PI / 2}');
  });

  test('the earlier suites are neither deleted nor relaxed', () => {
    for (const preserved of [
      'expect(CYPRESS_Z).toEqual([-7.5, 8.55, 20]);',
      'expect(CART_POS).toEqual([10.8, 0, -1.7]);',
      'expect(rows[0].clearance).toBeCloseTo(0.4909, 4);',
      'expect(worst.clearance).toBeCloseTo(0.7901, 3);',
    ]) {
      expect(c21).toContain(preserved);
    }
    for (const preserved of [
      // the C-8.22 prop moves and their clearances still hold…
      'expect(TAVERN_BENCH).toEqual([-13.8, 0, 8.4]);',
      "expect(at(rows, 'crate ↔ plinth.lower')).toBeCloseTo(0.4, 4);",
      "expect(at(rows, 'cluster.amphora ↔ curb1')).toBeCloseTo(0.38, 4);",
      "expect(at(rows, 'obelisk.base ↔ plinth.lower')).toBeCloseTo(0.4, 4);",
      // …including the historical 0.15 rack gap at the C-8.22 X…
      "expect(at(pairs([base(25, OBELISK_POS[2])], DOCTORE_NEIGHBOURS), 'obelisk.base ↔ rack')).toBeCloseTo(0.15, 4);",
      // …and the current 0.25 the C-8.23 step produced.
      "expect(at(pairs([base(OBELISK_POS[0], OBELISK_POS[2])], DOCTORE_NEIGHBOURS), 'obelisk.base ↔ rack')).toBeCloseTo(0.25, 4);",
      'expect(OBELISK_POS).toEqual([24.9, 0, -21.6]);',
    ]) {
      expect(c22).toContain(preserved);
    }
  });

  test('street routes, paved circles and courtyard paving are untouched', () => {
    expect(streetsSrc).toContain('VIA_MERCATORIA_PATH.cx');
    expect(COURTYARD_FLOOR.radius).toBe(3.0);
    expect(CENTRAL_OBELISK).toEqual([-23, 0, -10]);
    // The Academy courtyard's own paved circle and bronze border are unchanged.
    expect(streetsSrc).toContain('<circleGeometry args={[5.2, 16]} />');
    expect(streetsSrc).toContain('<ringGeometry args={[4.9, 5.2, 16]} />');
  });
});
