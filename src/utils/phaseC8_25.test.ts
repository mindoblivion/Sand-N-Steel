/**
 * Phase C-8.25 — Combat Courtyard Ring and Furniture Clearance.
 *
 * C-8.23 trimmed the west combat courtyard's low stone border ring so the ring no
 * longer crossed the Gladiator Barracks plinth, and left two furniture grazes in
 * place as out-of-scope: the west bench's east foot clipped the tube by 0.026 at
 * azimuth 71°, and the lying barrel at [-25.5, 0, -9.2] enclosed the ring outright.
 * This phase re-seats exactly those two props; the ring itself is untouched.
 *
 * ── The model ────────────────────────────────────────────────────────────────
 *
 *  • The ring is the *rendered* geometry: `TorusGeometry(3.0, 0.08, 6, 24, 5.106)`
 *    placed at [-23, 0.08, -10] with rotation [-π/2, 0, 2.8619] — the args and the
 *    transform are parsed from CityStreets.tsx, never hard-coded here.  The trimmed
 *    arc is read back from the mesh's own world vertices as the largest angular gap
 *    in azimuth about the ring centre, so the tests never sample the arc C-8.23
 *    removed.  The tube is sampled analytically at its full 0.08 radius, which is
 *    *outside* the 6-segment faceted tube the mesh actually draws (the facet inradius
 *    is 0.08·cos 30° = 0.069): every reported gap is therefore a lower bound and
 *    every reported penetration an upper bound.
 *  • The bench is rebuilt from `RomanBench`'s own primitives — two leg groups at
 *    local x ±0.8, each carrying its foot plinth, stanchion and capital box, plus the
 *    seat slab at local x 0 — at the real box sizes and the source `rotationY = 0`,
 *    so every part is an exact axis-aligned box.
 *  • The barrel is modelled as the geometry it renders — the tapered cylinder
 *    `CylinderGeometry(0.34, 0.38, 0.9, 12)` — with the source's own lying pose
 *    `rotation=[0, yaw, π/2]` (local +Y maps to world (−cos yaw, 0, sin yaw)) and
 *    `yOffset` 0.38.  A point's clearance is the exact signed distance to that
 *    cylinder (negative inside), evaluated in the barrel's local frame.
 *  • Separations to architecture are conservative: the building *colliders* are taken
 *    as full-height solids, and a box↔barrel gap subtracts the barrel's 0.38 outer
 *    radius from the box↔axis-segment distance.
 *
 * Measured before → after (world, min signed clearance of the prop to the ring tube):
 *   bench  [-23, 0, -7.5]  −0.0258  →  [-23, 0, -7.75]    +0.2011  (az 110.9°)
 *   barrel [-25.5, 0, -9.2] −0.1055 →  [-25.0, 0, -9.4]   +0.3235  (az 163.9°)
 * Both re-seated props stay on the courtyard's paving and clear the central obelisk,
 * the notice board, each other, the Gladiator Barracks plinth and the Arena Medical
 * House by ≥ 0.87.  The C-8.23 ring and the C-8.24 Tavern patio placement are
 * asserted unchanged.
 *
 * Run with: bun test src/utils/phaseC8_25.test.ts
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
const civicSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const c23 = load('./phaseC8_23.test.ts');
const c24 = load('./phaseC8_24.test.ts');

// ── Tiny parsers (same style as the C-8.18 … C-8.24 suites) ───────────────

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
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── The ring, exactly as CityStreets.tsx renders it ───────────────────────

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

const RING_MESH = (() => {
  const geometry = new THREE.TorusGeometry(
    RING_TORUS.radius,
    RING_TORUS.tube,
    RING_TORUS.radialSegments,
    RING_TORUS.tubularSegments,
    RING_TORUS.arc,
  );
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(...RING_PLACEMENT.position);
  mesh.rotation.set(-Math.PI / 2, 0, RING_PLACEMENT.rotZ);
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
const inGap = (a: number) => (a - RING_GAP.start + 360) % 360 < RING_GAP.width;
/** Shortest angular distance between two azimuths, in degrees. */
const nearAngle = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** The azimuths the rendered ring actually occupies. */
const RETAINED_AZ: number[] = [];
for (let a = 0; a < 360; a += 0.2) if (!inGap(a)) RETAINED_AZ.push(a);

/** The (untrimmed) tube surface, sampled at one retained azimuth. */
function tubePoints(azDeg: number, tubeSamples = 120): THREE.Vector3[] {
  const phi = (azDeg * Math.PI) / 180;
  const out: THREE.Vector3[] = [];
  for (let j = 0; j < tubeSamples; j++) {
    const beta = (2 * Math.PI * j) / tubeSamples;
    const rad = RING_TORUS.radius + RING_TORUS.tube * Math.sin(beta);
    out.push(
      new THREE.Vector3(RCX + rad * Math.cos(phi), RCY + RING_TORUS.tube * Math.cos(beta), RCZ + rad * Math.sin(phi)),
    );
  }
  return out;
}
const TUBE_ROWS = RETAINED_AZ.map((a) => tubePoints(a));

// ── Solids ────────────────────────────────────────────────────────────────

interface Box {
  n: string;
  c: THREE.Vector3;
  h: THREE.Vector3;
}
const at = (x: number, y: number, z: number, hx: number, hy: number, hz: number, n: string): Box => ({
  n,
  c: new THREE.Vector3(x, y, z),
  h: new THREE.Vector3(hx, hy, hz),
});
/** Signed distance of a point to an axis-aligned box: ≥ 0 clear, < 0 inside. */
function signedToBox(p: THREE.Vector3, b: Box): number {
  const dx = Math.abs(p.x - b.c.x) - b.h.x;
  const dy = Math.abs(p.y - b.c.y) - b.h.y;
  const dz = Math.abs(p.z - b.c.z) - b.h.z;
  const out = Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2 + Math.max(dz, 0) ** 2;
  if (out > 0) return Math.sqrt(out);
  return Math.max(dx, dy, dz);
}
/** Distance of a point to a box (0 when inside) — the conservative form. */
function boxDistance(p: THREE.Vector3, b: Box): number {
  return Math.max(0, signedToBox(p, b));
}
/** Min signed clearance of a ring-tube sample set to a box. */
function ringToBox(parts: Box[]): { clearance: number; azimuth: number; part: string } {
  let clearance = Infinity;
  let worstAz = 0;
  let worstPart = '';
  for (let i = 0; i < RETAINED_AZ.length; i++) {
    for (const p of TUBE_ROWS[i]) {
      for (const b of parts) {
        const d = signedToBox(p, b);
        if (d < clearance) {
          clearance = d;
          worstAz = RETAINED_AZ[i];
          worstPart = b.n;
        }
      }
    }
  }
  return { clearance, azimuth: worstAz, part: worstPart };
}

// ── The bench, rebuilt from RomanBench's own primitives ───────────────────

const BENCH_SRC = (() => {
  const m = /export const RomanBench[\s\S]*?\n};/.exec(civicSrc);
  if (!m) throw new Error('RomanBench not found');
  return m[0];
})();
const BENCH_LEG_X = pair(BENCH_SRC, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(lx, li\)/);
/** The four boxes in render order: foot plinth, stanchion, capital, seat slab. */
const BENCH_BOXES = [...BENCH_SRC.matchAll(/<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/g)].map(
  (m) => [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
);
/** Their local Y centres, in the same order. */
const BENCH_YS = [...BENCH_SRC.matchAll(/<mesh castShadow(?: receiveShadow)? position=\{\[0, ([\d.]+), 0\]\}/g)].map(
  (m) => Number(m[1]),
);

function benchParts(bx: number, bz: number): Box[] {
  const out: Box[] = [];
  for (const lx of BENCH_LEG_X) {
    const side = lx > 0 ? 'E' : 'W';
    for (let k = 0; k < 3; k++) {
      const [w, h, d] = BENCH_BOXES[k];
      out.push(at(bx + lx, BENCH_YS[k], bz, w / 2, h / 2, d / 2, `leg.${['foot', 'stanchion', 'capital'][k]}.${side}`));
    }
  }
  const [sw, sh, sd] = BENCH_BOXES[3];
  out.push(at(bx, BENCH_YS[3], bz, sw / 2, sh / 2, sd / 2, 'seat'));
  return out;
}

// ── The barrel, rebuilt as the tapered cylinder it renders ────────────────

const BARREL_BODY = triple(
  civicSrc,
  /Bulged Stave Oak Barrel Body[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\}/,
);
const BARREL_R_TOP = BARREL_BODY[0]; // local +Y end
const BARREL_R_BOTTOM = BARREL_BODY[1]; // local −Y end
const BARREL_LEN = BARREL_BODY[2];
const BARREL_Y_OFFSET = num(civicSrc, /const yOffset = isLyingDown \? ([\d.]+) : ([\d.]+);/);
const BARREL_MAX_R = Math.max(BARREL_R_TOP, BARREL_R_BOTTOM);

/** The barrel's world transform for its lying pose: position + [0, yaw, π/2]. */
function barrelMatrix(px: number, pz: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, BARREL_Y_OFFSET, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  );
}
/** The barrel's world→local inverse for its lying pose. */
const barrelInverse = (px: number, pz: number, yaw: number) => barrelMatrix(px, pz, yaw).invert();
/** Signed distance of a point to the tapered barrel solid (negative inside). */
function signedToBarrel(p: THREE.Vector3, inv: THREE.Matrix4): number {
  const local = p.clone().applyMatrix4(inv); // axis = local Y, y ∈ [−L/2, L/2]
  const half = BARREL_LEN / 2;
  const r = BARREL_R_BOTTOM + (BARREL_R_TOP - BARREL_R_BOTTOM) * ((local.y + half) / BARREL_LEN);
  const radial = Math.hypot(local.x, local.z);
  const dy = Math.abs(local.y) - half;
  const dr = radial - r;
  if (dy <= 0 && dr <= 0) return Math.max(dy, dr);
  return Math.hypot(Math.max(dy, 0), Math.max(dr, 0));
}
/** Min signed clearance of the ring tube surface to the barrel. */
function ringToBarrel(px: number, pz: number, yaw: number): { clearance: number; azimuth: number } {
  const inv = barrelInverse(px, pz, yaw);
  let clearance = Infinity;
  let worstAz = 0;
  for (let i = 0; i < RETAINED_AZ.length; i++) {
    for (const p of TUBE_ROWS[i]) {
      const d = signedToBarrel(p, inv);
      if (d < clearance) {
        clearance = d;
        worstAz = RETAINED_AZ[i];
      }
    }
  }
  return { clearance, azimuth: worstAz };
}
/** Conservative box↔barrel gap: box↔axis-segment distance minus the barrel radius. */
function boxToBarrel(b: Box, px: number, pz: number, yaw: number): number {
  const axis = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const centre = new THREE.Vector3(px, BARREL_Y_OFFSET, pz);
  let m = Infinity;
  for (let t = -0.5; t <= 0.5001; t += 0.005) {
    m = Math.min(m, boxDistance(centre.clone().addScaledVector(axis, t * BARREL_LEN), b));
  }
  return m - BARREL_MAX_R;
}
/** Exact axis-aligned box↔box gap (all these solids share axes). */
const boxGap = (a: Box, b: Box) =>
  Math.max(
    b.c.x - b.h.x - (a.c.x + a.h.x),
    a.c.x - a.h.x - (b.c.x + b.h.x),
    b.c.y - b.h.y - (a.c.y + a.h.y),
    a.c.y - a.h.y - (b.c.y + b.h.y),
    b.c.z - b.h.z - (a.c.z + a.h.z),
    a.c.z - a.h.z - (b.c.z + b.h.z),
  );

// ── The declared transforms ───────────────────────────────────────────────

const WEST_ANCHOR = 'Western Combat Services Courtyard Benches & Notice Board';
const westProp = (tag: string, extra = '') =>
  triple(
    streetsSrc,
    new RegExp(
      `${WEST_ANCHOR}[\\s\\S]*?<${tag} position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}${extra}`,
    ),
  );
const BENCH = westProp('RomanBench', ' rotationY=\\{0\\} \\/>');
const BOARD = westProp('TabulaNoticeBoard', ' rotationY=\\{0\\} \\/>');
const BARREL = westProp('WineBarrel', ' isLyingDown=\\{true\\} rotationY=\\{0\\.8\\} \\/>');
const BARREL_YAW = num(streetsSrc, new RegExp(`${WEST_ANCHOR}[\\s\\S]*?<WineBarrel[^>]*rotationY=\\{([\\d.]+)\\} \\/>`));

/** The C-8.23 transforms these props carried into this phase. */
const BENCH_C823 = [-23.0, 0, -7.5] as const;
const BARREL_C823 = [-25.5, 0, -9.2] as const;

// ── Nearby solids (source-derived) ────────────────────────────────────────

const CENTRAL_OBELISK = triple(
  streetsSrc,
  /Central Courtyard Monumental Obelisk[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
const CENTRAL_OBELISK_BASE = triple(
  streetsSrc,
  /Central Courtyard Monumental Obelisk[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const CENTRAL_OBELISK_Y = num(
  streetsSrc,
  /Central Courtyard Monumental Obelisk[\s\S]*?<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/,
);
const BOARD_POST_X = pair(civicSrc, /Two Timber Support Posts[\s\S]*?\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/);
const BOARD_POST_SIZE = triple(civicSrc, /Two Timber Support Posts[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const BOARD_POST_Y = num(civicSrc, /Two Timber Support Posts[\s\S]*?<mesh key=\{`tabula-post-\$\{pi\}`\} castShadow position=\{\[px, ([\d.]+), 0\]\}>/);

/** A full-height solid for a building collider — conservative in Y. */
const buildingBox = (id: string): Box => {
  const c = findRect(id);
  return at(c.cx, 5, c.cz, c.hw, 5, c.hd, id);
};

const OBELISK_BOX = at(
  CENTRAL_OBELISK[0],
  CENTRAL_OBELISK_Y,
  CENTRAL_OBELISK[2],
  CENTRAL_OBELISK_BASE[0] / 2,
  CENTRAL_OBELISK_BASE[1] / 2,
  CENTRAL_OBELISK_BASE[2] / 2,
  'obelisk.base',
);
const BOARD_POSTS: Box[] = BOARD_POST_X.map((px, i) =>
  at(
    BOARD[0] + px,
    BOARD_POST_Y,
    BOARD[2],
    BOARD_POST_SIZE[0] / 2,
    BOARD_POST_SIZE[1] / 2,
    BOARD_POST_SIZE[2] / 2,
    `board.post.${i}`,
  ),
);
const NEIGHBOURS: Box[] = [OBELISK_BOX, ...BOARD_POSTS, buildingBox('gladiator-barracks'), buildingBox('arena-medical')];
const minBenchTo = (b: Box) => Math.min(...benchParts(BENCH[0], BENCH[2]).map((p) => boxGap(p, b)));
const minBarrelTo = (b: Box) => boxToBarrel(b, BARREL[0], BARREL[2], BARREL_YAW);

// ══════════════════════════════════════════════════════════════════════════
// A. The source declares the two re-seats
// ══════════════════════════════════════════════════════════════════════════

describe('A. The source declares the two C-8.25 re-seats', () => {
  test('the bench stepped 0.25 toward the courtyard centre, X and yaw untouched', () => {
    expect(BENCH).toEqual([-23.0, 0, -7.75]);
    expect(streetsSrc).not.toContain('<RomanBench position={[-23.0, 0, -7.5]} rotationY={0} />');
    expect(streetsSrc).toContain('<RomanBench position={[-23.0, 0, -7.75]} rotationY={0} />');
  });

  test('the lying barrel stepped 0.5 east and 0.2 south, pose untouched', () => {
    expect(BARREL).toEqual([-25.0, 0, -9.4]);
    expect(streetsSrc).not.toContain('<WineBarrel position={[-25.5, 0, -9.2]} isLyingDown={true} rotationY={0.8} />');
    expect(streetsSrc).toContain('<WineBarrel position={[-25.0, 0, -9.4]} isLyingDown={true} rotationY={0.8} />');
    expect(BARREL_YAW).toBe(0.8);
  });

  test('the notice board the courtyard pinned there is untouched', () => {
    expect(BOARD).toEqual([-23.0, 0, -12.5]);
  });

  test('the props keep their primitive forms and sizes', () => {
    expect(BENCH_LEG_X).toEqual([-0.8, 0.8]);
    expect(BENCH_BOXES).toEqual([
      [0.34, 0.16, 0.58],
      [0.24, 0.26, 0.44],
      [0.3, 0.08, 0.52],
      [2.0, 0.1, 0.65],
    ]);
    expect(BENCH_YS).toEqual([0.08, 0.28, 0.44, 0.52]);
    expect(BARREL_R_TOP).toBe(0.34);
    expect(BARREL_R_BOTTOM).toBe(0.38);
    expect(BARREL_LEN).toBe(0.9);
    expect(BARREL_Y_OFFSET).toBe(0.38);
  });

  test('the phase is documented in the source it changes', () => {
    expect(streetsSrc).toContain('See src/utils/phaseC8_25.test.ts.');
    expect(streetsSrc).toContain('Phase C-8.25');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Both findings reproduce from the C-8.23 transforms
// ══════════════════════════════════════════════════════════════════════════

describe('B. The two findings reproduce on the old C-8.23 transforms', () => {
  test('the west bench clipped the tube by 0.026 near azimuth 71°', () => {
    const parts = benchParts(BENCH_C823[0], BENCH_C823[2]);
    const r = ringToBox(parts);
    expect(r.clearance).toBeLessThan(0); // real intersection, not a bounding box
    expect(r.clearance).toBeCloseTo(-0.0258, 3);
    // …on an inner leg-foot corner: the bench straddles the ring's north radius, so
    // its two feet graze symmetrically, the east one at azimuth ≈ 71° (as the C-8.23
    // note states) and the west at the ≈ 109° mirror.
    expect(r.part).toMatch(/leg\.foot\./);
    const eastFoot = parts.filter((p) => p.n === 'leg.foot.E');
    const rE = ringToBox(eastFoot);
    expect(rE.clearance).toBeCloseTo(-0.0258, 3);
    expect(nearAngle(rE.azimuth, 71)).toBeLessThan(1.5);
    const westFoot = parts.filter((p) => p.n === 'leg.foot.W');
    expect(ringToBox(westFoot).clearance).toBeCloseTo(-0.0258, 3);
  });

  test('the lying barrel enclosed the ring — the ring ran through its body', () => {
    const r = ringToBarrel(BARREL_C823[0], BARREL_C823[2], BARREL_YAW);
    expect(r.clearance).toBeLessThan(-0.09); // deeper than a graze
    expect(r.clearance).toBeCloseTo(-0.1055, 3);
    // The ring centreline is inside the barrel over an azimuth span around 158°;
    // it is well outside to either side.
    const M = barrelInverse(BARREL_C823[0], BARREL_C823[2], BARREL_YAW);
    const centreAt = (deg: number) => {
      const phi = (deg * Math.PI) / 180;
      return new THREE.Vector3(RCX + RING_TORUS.radius * Math.cos(phi), RCY, RCZ + RING_TORUS.radius * Math.sin(phi));
    };
    expect(signedToBarrel(centreAt(158), M)).toBeLessThan(0);
    expect(signedToBarrel(centreAt(161), M)).toBeLessThan(0);
    expect(signedToBarrel(centreAt(150), M)).toBeGreaterThan(0);
    expect(signedToBarrel(centreAt(170), M)).toBeGreaterThan(0);
  });

  test('neither old transform sat in the removed arc, so the trim never reached them', () => {
    expect(inGap(azimuth(BENCH_C823[0], BENCH_C823[2]))).toBe(false);
    expect(inGap(azimuth(BARREL_C823[0], BARREL_C823[2]))).toBe(false);
    expect(inGap(azimuth(BENCH[0], BENCH[2]))).toBe(false);
    expect(inGap(azimuth(BARREL[0], BARREL[2]))).toBe(false);
  });

  test('the ring is the rendered geometry: its arc and tube are the ones sampled', () => {
    expect(RING_TORUS.radius).toBe(3.0);
    expect(RING_TORUS.tube).toBe(0.08);
    expect(RING_TORUS.radialSegments).toBe(6);
    expect(RING_TORUS.tubularSegments).toBe(24);
    expect(RING_TORUS.arc).toBeCloseTo(5.106, 6);
    expect(RING_PLACEMENT.rotZ).toBeCloseTo(2.8619, 6);
    // (tubularSegments + 1) × (radialSegments + 1) rendered vertices.
    expect(RING_VERTICES.length).toBe(25 * 7);
    // The sampled arc skips the trimmed gap, and it is the largest gap in the mesh.
    expect(RING_GAP.width).toBeGreaterThan(60);
    expect(RING_GAP.width).toBeLessThan(75);
    expect(RETAINED_AZ.some((a) => inGap(a))).toBe(false);
    expect(RETAINED_AZ.length).toBeGreaterThan(1400);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The shipped placements clear the ring
// ══════════════════════════════════════════════════════════════════════════

describe('C. Both re-seated props clear the trimmed ring', () => {
  test('the bench clears the tube by 0.20 ≥ the 0.15 floor', () => {
    const r = ringToBox(benchParts(BENCH[0], BENCH[2]));
    expect(r.clearance).toBeGreaterThanOrEqual(0.15);
    expect(r.clearance).toBeCloseTo(0.2011, 3);
    // Its tightest point is the inner corner of a leg foot, not the seat above the
    // tube's 0.16 top.
    expect(r.part).toMatch(/leg\.foot\./);
  });

  test('the barrel clears the tube by 0.32 ≥ the 0.15 floor', () => {
    const r = ringToBarrel(BARREL[0], BARREL[2], BARREL_YAW);
    expect(r.clearance).toBeGreaterThanOrEqual(0.15);
    expect(r.clearance).toBeCloseTo(0.3235, 3);
    expect(r.azimuth).toBeGreaterThan(160);
    expect(r.azimuth).toBeLessThan(170);
  });

  test('both still rest on the courtyard paving and inside the ring the border draws', () => {
    // Bench: its widest part is the 2.0-wide seat; every corner stays inside the
    // tube's 2.92 inner edge.
    const benchPartsAll = benchParts(BENCH[0], BENCH[2]);
    const maxR = Math.max(
      ...benchPartsAll.flatMap((b) =>
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => Math.hypot(b.c.x + sx * b.h.x - RCX, b.c.z + sz * b.h.z - RCZ)),
        ),
      ),
    );
    expect(maxR).toBeCloseTo(2.762, 3);
    expect(maxR).toBeLessThan(RING_TORUS.radius - RING_TORUS.tube);
    // Barrel: axis-segment extent + outer radius stays inside the 3.0 floor radius.
    const barrelMax = Math.hypot(BARREL[0] - RCX, BARREL[2] - RCZ) + BARREL_LEN / 2 + BARREL_MAX_R;
    expect(barrelMax).toBeLessThanOrEqual(3.0);
  });

  test('the ring keeps its role as the courtyard border — not shrunk, not restored', () => {
    const arcDegrees = (RING_TORUS.arc * 180) / Math.PI;
    expect(arcDegrees).toBeGreaterThan(280);
    expect(arcDegrees).toBeLessThan(300);
    // The paved circle it edges is unchanged and matches the ring radius.
    expect(streetsSrc).toContain('<circleGeometry args={[3.0, 24]} />');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The props clear nearby architecture and each other
// ══════════════════════════════════════════════════════════════════════════

describe('D. The props clear the courtyard neighbours and each other', () => {
  test('the bench clears the obelisk, the notice board and both buildings', () => {
    const gaps = NEIGHBOURS.map((b) => ({ n: b.n, d: minBenchTo(b) }));
    for (const g of gaps) expect(g.d, `bench ↔ ${g.n}`).toBeGreaterThan(0.15);
    expect(gaps.find((g) => g.n === 'obelisk.base')!.d).toBeCloseTo(1.575, 3);
    expect(gaps.find((g) => g.n === 'gladiator-barracks')!.d).toBeCloseTo(2.875, 3);
    expect(gaps.find((g) => g.n === 'arena-medical')!.d).toBeCloseTo(2.25, 3);
  });

  test('the barrel clears the obelisk, the notice board and both buildings', () => {
    const gaps = NEIGHBOURS.map((b) => ({ n: b.n, d: minBarrelTo(b) }));
    for (const g of gaps) expect(g.d, `barrel ↔ ${g.n}`).toBeGreaterThan(0.15);
    expect(gaps.find((g) => g.n === 'obelisk.base')!.d).toBeCloseTo(0.959, 3);
    // Against the barracks' full-height footprint this is the plan gap of the
    // barrel's far end, 1.227, less the 0.38 outer radius.
    expect(gaps.find((g) => g.n === 'gladiator-barracks')!.d).toBeCloseTo(0.847, 3);
    expect(gaps.find((g) => g.n === 'arena-medical')!.d).toBeCloseTo(1.244, 3);
  });

  test('the two re-seated props clear each other', () => {
    const gap = Math.min(...benchParts(BENCH[0], BENCH[2]).map((p) => boxToBarrel(p, BARREL[0], BARREL[2], BARREL_YAW)));
    expect(gap).toBeGreaterThan(0.15);
    expect(gap).toBeCloseTo(1.263, 3);
  });

  test('neither prop gained a collider, and the building colliders are untouched', () => {
    expect(CITY_COLLIDERS.filter((c) => /ring|border|bench|barrel/i.test(c.id))).toEqual([]);
    expect(findRect('gladiator-barracks')).toMatchObject({ cx: -27, cz: -14, hw: 7.1 / 2, hd: 6.1 / 2 });
    expect(findRect('arena-medical')).toMatchObject({ cx: -29, cz: -5, hw: 5.5 / 2, hd: 5.5 / 2 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. C-8.23 and C-8.24 are unchanged
// ══════════════════════════════════════════════════════════════════════════

describe('E. The C-8.23 ring and the C-8.24 Tavern patio placement are unchanged', () => {
  test('the ring keeps the exact geometry C-8.23 shipped', () => {
    expect(RING_PLACEMENT.position).toEqual([-23, 0.08, -10]);
    expect(RING_PLACEMENT.rotZ).toBeCloseTo(2.8619, 6);
    expect(RING_TORUS).toEqual({ radius: 3.0, tube: 0.08, radialSegments: 6, tubularSegments: 24, arc: 5.106 });
    expect(streetsSrc).toContain('<torusGeometry args={[3.0, 0.08, 6, 24, 5.106]} />');
    expect(streetsSrc).toContain('<meshStandardMaterial color="#cbd5e1" roughness={0.6} />');
    // The removed arc is the same one C-8.23 proved safe: both cut ends stop 0.10
    // clear of the barracks plinth.
    expect(RING_GAP.start).toBeCloseTo(196.03, 1);
    expect(RING_GAP.end).toBeCloseTo(263.47, 1);
  });

  test('the Academy obelisk step and the courtyard obelisk are untouched', () => {
    expect(streetsSrc).toContain('<group position={[24.9, 0, -21.6]}>');
    expect(CENTRAL_OBELISK).toEqual([-23, 0, -10]);
    expect(CENTRAL_OBELISK_BASE).toEqual([0.7, 0.3, 0.7]);
  });

  test('the C-8.23 suite keeps its frozen baseline and gained no relaxation', () => {
    // The C-8.23 furniture transforms are preserved as literals, not deleted.
    expect(c23).toContain('const WEST_BENCH_C823 = [-23.0, 0, -7.5] as const;');
    expect(c23).toContain('const WEST_BARREL_C823 = [-25.5, 0, -9.2] as const;');
    expect(c23).toContain('expect(footMaxRadius).toBeCloseTo(2.954, 3);');
    expect(c23).toContain('expect(WEST_BOARD).toEqual([-23.0, 0, -12.5]);');
    // …and its earlier frozen baselines are still there.
    expect(c23).toContain('const PATIO_C823 = [3.6, 0, 2.2] as const;');
    expect(c23).toContain('expect(RING_TORUS.arc).toBeCloseTo(5.106, 6);');
  });

  test('the C-8.24 Tavern patio placement is untouched', () => {
    expect(c24).toContain('expect(PATIO_TAG).toBe(\'<group position={[-2.8, 0, -5.4]}>\');');
    expect(c24).toContain('expect([BARREL_Y_LYING, BARREL_Y_UP]).toEqual([0.38, 0.45]);');
    expect(c24).toContain('expect([BARREL_BODY[0], BARREL_BODY[1], BARREL_H]).toEqual([0.34, 0.38, 0.9]);');
  });

  test('no fast-travel arrival stands on the ring or in the removed arc', () => {
    for (const [name, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
      const r = Math.hypot(ax - RCX, az - RCZ);
      expect(r, `${name} sits on the border ring`).toBeGreaterThan(RING_TORUS.radius + RING_TORUS.tube);
    }
    expect(FAST_TRAVEL_ARRIVALS.gladiator_barracks).toEqual([-22, -14]);
  });
});
