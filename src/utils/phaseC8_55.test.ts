/**
 * Phase C-8.55 — Ishtar Gatehouse: the facade order's seat under the attic.
 *
 * ── THE DEFECT (re-derived here from the shipped formulas, not restated) ───
 * The four facade columns ran `height={10.4}` at Z 2.4, radius 0.36, Corinthian.
 * `ClassicalColumn` puts the top of the order AT `height`: the capital drum is
 * centred `height − capitalHeight / 2` with half-extent `capitalHeight / 2`, and
 * the square abacus is centred `height − 0.04` with half-extent `0.08 / 2` — so
 * BOTH end exactly on `height`. The attic storey (`[0, 10.6, 0]`, box
 * `[15.2, 2.0, 5.0]`) has its underside at **9.60** and its +Z face at **2.50**.
 *
 *   • At 10.4 the capital stood at **10.08 … 10.40** and the abacus at
 *     10.32 … 10.40 — i.e. the whole capital sat 0.48 … 0.80 ABOVE the attic's
 *     underside, swallowed by the attic volume, with the order reading as
 *     running into the storey instead of seating beneath it.
 *   • The order's top must engage that soffit as a *seat*: a positive contact
 *     inside the project's 0.02 seating tolerance (the same 0.02 the architrave
 *     uses on its piers, the C-8.52 canopy on its tie-beam, the C-8.53 wall on
 *     the lean-to's underside).
 *
 * ── THE CORRECTION (the only source literal changed) ───────────────────────
 * `height` 10.4 → **9.62** = soffit (9.60) + the 0.02 tolerance, derived rather
 * than guessed. Nothing else moved: four columns, X ±6.2 / ±2.8, Z 2.4, radius
 * 0.36, Corinthian, the same marble/gold materials, the same attic, towers,
 * arches, torches and registry.
 *
 *   | quantity | before (10.4) | after (9.62) |
 *   |---|---|---|
 *   | plinthHeight / capitalHeight (capped at 0.25 / 0.32) | 0.25 / 0.32 | 0.25 / 0.32 |
 *   | shaft | 0.33 … 10.16 | 0.33 … **9.38** |
 *   | astragal / necking ring | 10.01 … 10.07 | **9.25 … 9.31** |
 *   | capital drum | 10.08 … 10.40 | **9.30 … 9.62** |
 *   | square abacus | 10.32 … 10.40 | **9.54 … 9.62** |
 *   | order's top vs the attic soffit (9.60) | **+0.80 embedded** | **+0.02 seated** |
 *   | capital's own engagement with the attic | all 0.32 of the drum | **0.02 of it** |
 *
 * The capital drum and the abacus are the SAME SIZE in both frames (both
 * coefficients are capped at this height), so the whole 0.78 went into the
 * shaft: the order keeps its proportions and only its elevation changed.
 *
 * ── HOW THIS SUITE MEASURES IT ────────────────────────────────────────────
 * Nothing here is a copied constant. The gatehouse's own map array, column
 * props and attic/central-block/tower transforms are parsed from its source;
 * the shared primitive's coefficients (0.25 / 0.07, 0.32 / 0.09, the abacus's
 * 0.04 drop and 0.08 thickness, the capital's 1.5·r top, 2.5·r abacus width)
 * are parsed from `ClassicalArchitecture.tsx` and applied as the real formulas;
 * and every seat, engagement and clearance is then DERIVED from those parsed
 * values. A control replays the pre-fix 10.4 through the identical predicate —
 * so that height is shown to fail the shipped geometry's own assertion rather
 * than merely to differ from it.
 *
 * SCOPE: this pins source-derived geometry, not rendered appearance. The
 * rendered junction on Android is a device question this suite cannot answer.
 *
 * Run with: bun test src/utils/phaseC8_55.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
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
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const gateSrc = load('../components/3d/city/IshtarGatehouse.tsx');
const colSrc = load('../components/3d/city/ClassicalArchitecture.tsx');

type Vec3 = [number, number, number];

/** The project's seating tolerance — the architrave, the C-8.52 canopy, C-8.53 and here. */
const TOL = 0.02;

// ── Tiny parsers (the style of the C-8.18 … C-8.53 suites) ────────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
/** Every match of a single-capture regex, in source order. */
function allNums(src: string, re: RegExp): number[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(src)) !== null) out.push(Number(m[1]));
  return out;
}
function str(src: string, re: RegExp): string {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m[1];
}
function triple(src: string, re: RegExp): Vec3 {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
}

// ── The gatehouse's own frame (parsed from its source) ────────────────────

/** The four facade-column X offsets, read from the component's own map array. */
const COLUMN_X = nums(gateSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cx, ci\)/);
/** `position={[cx, 0, 2.4]}` — the column's own local Y and Z. */
const COLUMN_Y = num(gateSrc, /<ClassicalColumn[\s\S]*?position=\{\[cx,\s*([\d.]+),/);
const COLUMN_Z = num(gateSrc, /<ClassicalColumn[\s\S]*?position=\{\[cx,\s*[\d.]+,\s*(-?[\d.]+)\s*\]\}/);
const COLUMN_H = num(gateSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/);
const COLUMN_R = num(gateSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/);
const COLUMN_ORDER = str(gateSrc, /<ClassicalColumn[\s\S]*?order="(\w+)"/);
const COLUMN_STONE = str(gateSrc, /<ClassicalColumn[\s\S]*?stoneColor=\{ROMAN_PALETTE\.(\w+)\.color\}/);
const COLUMN_CAPITAL_COLOR = str(gateSrc, /<ClassicalColumn[\s\S]*?capitalColor=\{ROMAN_PALETTE\.(\w+)\.color\}/);

/** The gatehouse root (`<group position={[0, 0, 24]}>`) — its own world frame. */
const GATE_ROOT = triple(gateSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED/);

const ATTIC_N = nums(
  gateSrc,
  /2\. ATTIC STORY[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const ATTIC_POS: Vec3 = [ATTIC_N[0], ATTIC_N[1], ATTIC_N[2]];
const ATTIC_BOX: Vec3 = [ATTIC_N[3], ATTIC_N[4], ATTIC_N[5]];

const CENTRAL_N = nums(
  gateSrc,
  /Central Keystone Triumphal Structure[\s\S]*?<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const CENTRAL_POS: Vec3 = [CENTRAL_N[0], CENTRAL_N[1], CENTRAL_N[2]];
const CENTRAL_BOX: Vec3 = [CENTRAL_N[3], CENTRAL_N[4], CENTRAL_N[5]];

/** The two flanking towers: their X offsets and their shaft box. */
const TOWER_X = nums(gateSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(tx, ti\)/);
const TOWER_N = nums(
  gateSrc,
  /<group key=\{`gate-tower-\$\{ti\}`\}[\s\S]*?<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const TOWER_MESH_Y = TOWER_N[1];
const TOWER_BOX: Vec3 = [TOWER_N[3], TOWER_N[4], TOWER_N[5]];

/** The stepped foundation under the central block and under each tower. */
const FOUNDATION = {
  size: nums(gateSrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\} height=\{0\.3\}/),
  projection: num(gateSrc, /<BuildingFoundation size=\{\[[\d.]+, [\d.]+\]\} height=\{0\.3\} projection=\{([\d.]+)\}/),
  towerSize: nums(gateSrc, /<BuildingFoundation key=\{`tower-found-\$\{ti\}`\} size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
};

// ── The shared primitive's own formulas (parsed, then applied) ────────────

const [PLINTH_CAP, PLINTH_RATIO] = nums(colSrc, /const plinthHeight = Math\.min\(([\d.]+), height \* ([\d.]+)\)/);
const [CAPITAL_CAP, CAPITAL_RATIO] = nums(colSrc, /const capitalHeight = Math\.min\(([\d.]+), height \* ([\d.]+)\)/);
const SHAFT_TOP_RATIO = num(colSrc, /const shaftRadiusTop = radius \* ([\d.]+)/);
/** Torus base ring: `position={[0, plinthHeight + drop, 0]}`, cylinder height. */
const BASE_DROP = num(colSrc, /<mesh position=\{\[0, plinthHeight \+ ([\d.]+), 0\]\}>/);
const BASE_H = num(colSrc, /<cylinderGeometry args=\{\[radius \* [\d.]+, radius \* [\d.]+, ([\d.]+), 12\]\}/);
/** Shaft starts at `plinthHeight + drop`. */
const SHAFT_DROP = num(colSrc, /position=\{\[0, plinthHeight \+ ([\d.]+) \+ shaftHeight \/ 2, 0\]\}/);
/** Astragal / necking ring: `height − capitalHeight − drop`, its own thickness. */
const NECK_DROP = num(colSrc, /<mesh position=\{\[0, height - capitalHeight - ([\d.]+), 0\]\}>/);
const NECK_H = num(colSrc, /<cylinderGeometry args=\{\[shaftRadiusTop \* [\d.]+, shaftRadiusTop \* [\d.]+, ([\d.]+), 12\]\}/);
/** Capital drum top radius = `radius * scale`; abacus = `radius * w` × `h` × same. */
const CAPITAL_TOP_SCALE = num(colSrc, /<cylinderGeometry args=\{\[radius \* ([\d.]+), shaftRadiusTop, capitalHeight, 12\]\}/);
const ABACUS_N = nums(
  colSrc,
  /<mesh castShadow position=\{\[0, height - ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[radius \* ([\d.]+), ([\d.]+), radius \* ([\d.]+)\]\} \/>/,
);
const ABACUS_DROP = ABACUS_N[0];
const ABACUS_W_SCALE = ABACUS_N[1];
const ABACUS_H = ABACUS_N[2];

const plinthHeight = (h: number) => Math.min(PLINTH_CAP, h * PLINTH_RATIO);
const capitalHeight = (h: number) => Math.min(CAPITAL_CAP, h * CAPITAL_RATIO);
const shaftHeight = (h: number) => h - plinthHeight(h) - capitalHeight(h);

/** Capital drum: centred `height − capitalHeight / 2`, half-extent `capitalHeight / 2`. */
const capitalSpan = (h: number): [number, number] => [h - capitalHeight(h), h];
/** Necking ring: centred `height − capitalHeight − drop`, half-extent `thickness / 2`. */
const neckingSpan = (h: number): [number, number] => {
  const c = h - capitalHeight(h) - NECK_DROP;
  return [c - NECK_H / 2, c + NECK_H / 2];
};
/** Shaft: from `plinthHeight + drop` up by its own height. */
const shaftSpan = (h: number): [number, number] => {
  const s = plinthHeight(h) + SHAFT_DROP;
  return [s, s + shaftHeight(h)];
};
/** Square abacus: centred `height − drop`, half-extent `thickness / 2`. */
const abacusSpan = (h: number): [number, number] => {
  const c = h - ABACUS_DROP;
  return [c - ABACUS_H / 2, c + ABACUS_H / 2];
};
/** Topmost point of the whole order in the column's own frame (base at Y 0). */
const orderTop = (h: number) =>
  Math.max(capitalSpan(h)[1], abacusSpan(h)[1], neckingSpan(h)[1], shaftSpan(h)[1], plinthHeight(h));

/** Plan half-extents — functions of the radius only, never of the height. */
const shaftHalfZ = (r: number) => r;
const capitalHalfZ = (r: number) => r * CAPITAL_TOP_SCALE;
const abacusHalfZ = (r: number) => (r * ABACUS_W_SCALE) / 2;

// ── The derived frames ────────────────────────────────────────────────────

/** The attic storey's underside and its own +Z (facade-side) face. */
const ATTIC_SOFFIT = ATTIC_POS[1] - ATTIC_BOX[1] / 2;
const ATTIC_FRONT_Z = ATTIC_POS[2] + ATTIC_BOX[2] / 2;
const ATTIC_HALF_X = ATTIC_BOX[0] / 2;

/** The central block's facade face and plan, and the towers' inner faces. */
const CENTRAL_FRONT_Z = CENTRAL_POS[2] + CENTRAL_BOX[2] / 2;
const CENTRAL_HALF_X = CENTRAL_BOX[0] / 2;
const TOWER_INNER_X = TOWER_X.map((tx) => Math.abs(tx) - TOWER_BOX[0] / 2);
const TOWER_HALF_Z = TOWER_BOX[2] / 2;

/** How far the order's top reaches past the attic soffit (a gap is negative). */
const beyondSoffit = (h: number) => orderTop(h) - ATTIC_SOFFIT;

/**
 * The shipped seating rule, as one predicate: the order's top engages the attic
 * soffit — inside the project's 0.02 tolerance, and without a gap.
 */
const seatsUnderAttic = (h: number) => beyondSoffit(h) > 0 && beyondSoffit(h) <= TOL + 1e-9;

/** The height the seat derives to: the soffit plus the stated tolerance. */
const DERIVED_H = ATTIC_SOFFIT + TOL;

/** The pre-fix literal, kept only as the control. */
const PRE_FIX_H = 10.4;

// ── §A · The column run: layout unchanged, height corrected ───────────────

describe('C-8.55 §A — the four facade columns', () => {
  test('four columns at the audited X offsets', () => {
    expect(COLUMN_X).toEqual([-6.2, -2.8, 2.8, 6.2]);
  });

  test('every column still stands on the ground at its own Z', () => {
    expect(COLUMN_Y).toBe(0);
    expect(COLUMN_Z).toBe(2.4);
  });

  test('radius 0.36 and the Corinthian order are unchanged', () => {
    expect(COLUMN_R).toBe(0.36);
    expect(COLUMN_ORDER).toBe('corinthian');
  });

  test('the marble shaft and gold capital materials are unchanged', () => {
    expect(COLUMN_STONE).toBe('marbleWhite');
    expect(COLUMN_CAPITAL_COLOR).toBe('goldAccent');
  });

  test('the height literal is the corrected 9.62', () => {
    expect(COLUMN_H).toBe(9.62);
  });
});

// ── §B · The attic datum, derived from source ─────────────────────────────

describe('C-8.55 §B — the attic storey the order seats under', () => {
  test('the attic transform and box are what they were', () => {
    expect(ATTIC_POS).toEqual([0, 10.6, 0]);
    expect(ATTIC_BOX).toEqual([15.2, 2.0, 5.0]);
  });

  test('its underside derives to 9.60 and its facade face to 2.50', () => {
    expect(ATTIC_SOFFIT).toBeCloseTo(9.6, 10);
    expect(ATTIC_FRONT_Z).toBeCloseTo(2.5, 10);
  });

  test('all four columns stand under the attic in plan', () => {
    for (const cx of COLUMN_X) {
      expect(Math.abs(cx) + capitalHalfZ(COLUMN_R)).toBeLessThan(ATTIC_HALF_X);
    }
  });
});

// ── §C · The order's own extents, from the primitive's formulas ───────────

describe('C-8.55 §C — the shipped primitive, applied', () => {
  test('the coefficients are the primitive\u2019s own', () => {
    expect([PLINTH_CAP, PLINTH_RATIO]).toEqual([0.25, 0.07]);
    expect([CAPITAL_CAP, CAPITAL_RATIO]).toEqual([0.32, 0.09]);
    expect(ABACUS_DROP).toBe(0.04);
    expect(ABACUS_H).toBe(0.08);
    expect(ABACUS_W_SCALE).toBe(2.5);
    expect(CAPITAL_TOP_SCALE).toBe(1.5);
    expect(SHAFT_TOP_RATIO).toBe(0.92);
  });

  test('both coefficients are capped, so the capital is the same size at either height', () => {
    expect(plinthHeight(COLUMN_H)).toBeCloseTo(0.25, 10);
    expect(capitalHeight(COLUMN_H)).toBeCloseTo(0.32, 10);
    expect(capitalHeight(PRE_FIX_H)).toBeCloseTo(capitalHeight(COLUMN_H), 10);
    expect(plinthHeight(PRE_FIX_H)).toBeCloseTo(plinthHeight(COLUMN_H), 10);
  });

  test('the shaft carries the whole correction: 0.33 to 9.38', () => {
    expect(shaftSpan(COLUMN_H)[0]).toBeCloseTo(0.33, 10);
    expect(shaftSpan(COLUMN_H)[1]).toBeCloseTo(9.38, 10);
    expect(shaftSpan(PRE_FIX_H)[1] - shaftSpan(COLUMN_H)[1]).toBeCloseTo(0.78, 10);
  });

  test('the capital drum spans 9.30 to 9.62 and the abacus 9.54 to 9.62', () => {
    expect(capitalSpan(COLUMN_H)[0]).toBeCloseTo(9.3, 10);
    expect(capitalSpan(COLUMN_H)[1]).toBeCloseTo(9.62, 10);
    expect(abacusSpan(COLUMN_H)[0]).toBeCloseTo(9.54, 10);
    expect(abacusSpan(COLUMN_H)[1]).toBeCloseTo(9.62, 10);
  });

  test('the capital and the abacus both end on `height` — the property the fix works from', () => {
    expect(capitalSpan(COLUMN_H)[1]).toBeCloseTo(COLUMN_H, 10);
    expect(abacusSpan(COLUMN_H)[1]).toBeCloseTo(COLUMN_H, 10);
    expect(orderTop(COLUMN_H)).toBeCloseTo(COLUMN_H, 10);
  });

  test('the necking ring rides just below the capital, clear of the soffit', () => {
    expect(neckingSpan(COLUMN_H)[0]).toBeCloseTo(9.25, 10);
    expect(neckingSpan(COLUMN_H)[1]).toBeCloseTo(9.31, 10);
    expect(neckingSpan(COLUMN_H)[1]).toBeLessThan(ATTIC_SOFFIT);
  });
});

// ── §D · The seat ─────────────────────────────────────────────────────────

describe('C-8.55 §D — the order seated beneath the attic', () => {
  test('the order\u2019s top engages the soffit by exactly the 0.02 tolerance', () => {
    expect(beyondSoffit(COLUMN_H)).toBeCloseTo(TOL, 10);
  });

  test('the seat is a contact, not a gap', () => {
    expect(beyondSoffit(COLUMN_H)).toBeGreaterThan(0);
  });

  test('only the capital\u2019s top 0.02 crosses the soffit — the drum is not swallowed', () => {
    const drum = capitalHeight(COLUMN_H);
    const engagement = capitalSpan(COLUMN_H)[1] - ATTIC_SOFFIT;
    expect(engagement).toBeCloseTo(TOL, 10);
    expect(engagement).toBeLessThan(drum);
    // and the rest of the drum — 0.30 of its 0.32 — stands below the attic.
    expect(ATTIC_SOFFIT - capitalSpan(COLUMN_H)[0]).toBeCloseTo(drum - TOL, 10);
  });

  test('every element below the capital stays clear of the soffit', () => {
    const lower = Math.max(shaftSpan(COLUMN_H)[1], neckingSpan(COLUMN_H)[1], plinthHeight(COLUMN_H));
    expect(lower).toBeCloseTo(9.38, 10);
    expect(lower).toBeLessThan(ATTIC_SOFFIT);
  });

  test('the order reads in front of the attic\u2019s facade face', () => {
    const capitalFront = COLUMN_Z + capitalHalfZ(COLUMN_R);
    const abacusFront = COLUMN_Z + abacusHalfZ(COLUMN_R);
    const shaftFront = COLUMN_Z + shaftHalfZ(COLUMN_R);
    expect(capitalFront).toBeCloseTo(2.94, 10);
    expect(abacusFront).toBeCloseTo(2.85, 10);
    expect(shaftFront).toBeCloseTo(2.76, 10);
    expect(capitalFront - ATTIC_FRONT_Z).toBeCloseTo(0.44, 10);
    expect(abacusFront - ATTIC_FRONT_Z).toBeCloseTo(0.35, 10);
    expect(shaftFront - ATTIC_FRONT_Z).toBeCloseTo(0.26, 10);
  });

  test('the height is the value the seat derives to, not a rounded guess', () => {
    expect(DERIVED_H).toBeCloseTo(9.62, 10);
    expect(COLUMN_H).toBeCloseTo(DERIVED_H, 10);
  });

  test('the shipped predicate accepts the shipped height', () => {
    expect(seatsUnderAttic(COLUMN_H)).toBe(true);
  });
});

// ── §E · The control — the original height fails the same assertion ───────

describe('C-8.55 §E — control: the pre-fix 10.4', () => {
  test('at 10.4 the capital and the abacus sat wholly inside the attic\u2019s volume', () => {
    expect(capitalSpan(PRE_FIX_H)[0]).toBeCloseTo(10.08, 10);
    expect(capitalSpan(PRE_FIX_H)[1]).toBeCloseTo(10.4, 10);
    expect(abacusSpan(PRE_FIX_H)[0]).toBeCloseTo(10.32, 10);
    expect(capitalSpan(PRE_FIX_H)[0]).toBeGreaterThan(ATTIC_SOFFIT);
  });

  test('the former interpenetration measures 0.80 — 40\u00d7 the tolerance', () => {
    expect(beyondSoffit(PRE_FIX_H)).toBeCloseTo(0.8, 10);
    expect(beyondSoffit(PRE_FIX_H)).toBeCloseTo(beyondSoffit(COLUMN_H) + 0.78, 10);
  });

  test('the identical predicate rejects 10.4 and accepts 9.62', () => {
    expect(seatsUnderAttic(PRE_FIX_H)).toBe(false);
    expect(seatsUnderAttic(COLUMN_H)).toBe(true);
  });

  test('the pre-fix capital had already passed under the soffit — the order was submerged', () => {
    // The attic began at 9.60; the capital began at 10.08. Nothing of the order
    // was visible between the shaft's top (10.16) and the storey at 10.4.
    expect(capitalSpan(PRE_FIX_H)[0] - ATTIC_SOFFIT).toBeCloseTo(0.48, 10);
  });
});

// ── §F · The intentional composite engagements are unchanged ──────────────

describe('C-8.55 §F — central-block and tower engagements', () => {
  test('the central block and the towers are unchanged', () => {
    expect(CENTRAL_POS).toEqual([0, 5.0, 0]);
    expect(CENTRAL_BOX).toEqual([14, 10, 4.5]);
    expect(CENTRAL_FRONT_Z).toBeCloseTo(2.25, 10);
    expect(CENTRAL_HALF_X).toBe(7);
    expect(TOWER_X).toEqual([-8.5, 8.5]);
    expect(TOWER_MESH_Y).toBe(6.0);
    expect(TOWER_BOX).toEqual([4.2, 12, 5.2]);
    expect(TOWER_INNER_X).toEqual([6.4, 6.4]);
  });

  test('all four shafts still engage the central block\u2019s facade by 0.21', () => {
    const engagement = CENTRAL_FRONT_Z - (COLUMN_Z - shaftHalfZ(COLUMN_R));
    expect(engagement).toBeCloseTo(0.21, 10);
    for (const cx of COLUMN_X) {
      expect(Math.abs(cx) + shaftHalfZ(COLUMN_R)).toBeLessThan(CENTRAL_HALF_X);
    }
  });

  test('the capitals engage the central block by 0.39', () => {
    expect(CENTRAL_FRONT_Z - (COLUMN_Z - capitalHalfZ(COLUMN_R))).toBeCloseTo(0.39, 10);
  });

  test('the outer columns still engage the flanking towers by 0.16 in X and in Z', () => {
    const outerX = COLUMN_X.filter((cx) => Math.abs(cx) > CENTRAL_HALF_X / 2);
    expect(outerX.length).toBeGreaterThan(0);
    for (let i = 0; i < TOWER_X.length; i++) {
      const colX = 6.2;
      expect(colX + shaftHalfZ(COLUMN_R) - TOWER_INNER_X[i]).toBeCloseTo(0.16, 10);
      expect(shaftHalfZ(COLUMN_R) + COLUMN_Z - TOWER_HALF_Z).toBeCloseTo(0.16, 10);
    }
  });

  test('both engagements are plan-only, so the height change cannot have moved them', () => {
    // Each engagement is a function of X/Z alone; the column's plan spans are
    // identical in the pre-fix and shipped frames, so the relationship with the
    // central block and the towers is bit-for-bit the same.
    expect(capitalHalfZ(COLUMN_R)).toBeCloseTo(capitalHalfZ(COLUMN_R), 10);
    for (const h of [COLUMN_H, PRE_FIX_H]) {
      expect(shaftHalfZ(COLUMN_R)).toBe(0.36);
      expect(capitalHalfZ(COLUMN_R)).toBeCloseTo(0.54, 10);
      expect(abacusHalfZ(COLUMN_R)).toBeCloseTo(0.45, 10);
      expect(beyondSoffit(h)).toBeDefined();
    }
  });

  test('the towers rise past the order\u2019s new top, as before', () => {
    const towerTop = TOWER_MESH_Y + TOWER_BOX[1] / 2;
    expect(towerTop).toBeCloseTo(12, 10);
    expect(towerTop).toBeGreaterThan(orderTop(COLUMN_H));
  });
});

// ── §G · Collision, hub, navigation and fast travel are untouched ─────────

describe('C-8.55 §G — no gameplay data changed', () => {
  const ishtar = CITY_COLLIDERS.filter((c) => c.id.startsWith('ishtar'));

  test('the gatehouse registers exactly its three colliders and nothing for the columns', () => {
    expect(ishtar.map((c) => c.id)).toEqual(['ishtar-central', 'ishtar-tower-l', 'ishtar-tower-r']);
    expect(CITY_COLLIDERS.some((c) => /gate-col|column/.test(c.id))).toBe(false);
  });

  test('the registry keeps its 31 rectangles and unique ids, plus C-8.64A\'s segments', () => {
    // 110 colliders before Phase C-8.64A, which appended its 31 `circus-*`
    // perimeter segments; the 31 rectangles are unchanged.
    expect(CITY_COLLIDERS.length).toBe(141);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(CITY_COLLIDERS.length);
  });

  test('the three rectangles still equal the gatehouse\u2019s rendered plinths', () => {
    // BuildingFoundation's lower step = size + 2 · projection, centred on the root.
    const centralW = FOUNDATION.size[0] + 2 * FOUNDATION.projection;
    const centralD = FOUNDATION.size[1] + 2 * FOUNDATION.projection;
    const towerW = FOUNDATION.towerSize[0] + 2 * FOUNDATION.projection;
    const towerD = FOUNDATION.towerSize[1] + 2 * FOUNDATION.projection;
    expect(GATE_ROOT).toEqual([0, 0, 24]);
    expect([centralW, centralD]).toEqual([14.7, 5.3]);
    expect([towerW, towerD]).toEqual([4.9, 5.9]);

    const byId = new Map(CITY_COLLIDERS.map((c) => [c.id, c]));
    const expectRect = (id: string, cx: number, cz: number, w: number, d: number) => {
      const c = byId.get(id) as RectCollider;
      expect(c.type).toBe('rect');
      expect(c.cx).toBeCloseTo(cx, 10);
      expect(c.cz).toBeCloseTo(cz, 10);
      expect(c.hw).toBeCloseTo(w / 2, 10);
      expect(c.hd).toBeCloseTo(d / 2, 10);
    };
    expectRect('ishtar-central', 0, 24, centralW, centralD);
    expectRect('ishtar-tower-l', TOWER_X[0], 24, towerW, towerD);
    expectRect('ishtar-tower-r', TOWER_X[1], 24, towerW, towerD);
  });

  test('the town-gate hub and its fast-travel arrival are unchanged', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'town_gate');
    expect(hub).toBeDefined();
    expect(hub!.position).toEqual([0, 0, 24]);
    expect(hub!.radius).toBe(4.5);
    expect(FAST_TRAVEL_ARRIVALS.town_gate).toEqual([0, 20]);
    expect(getNearbyHubLocation([0, 0, 20])?.id).toBe('town_gate');
  });

  test('the arrival is still clear of the gatehouse by more than the player radius', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.town_gate;
    const face = 24 - (FOUNDATION.size[1] + 2 * FOUNDATION.projection) / 2;
    expect(face).toBeCloseTo(21.35, 10);
    expect(face - az).toBeCloseTo(1.35, 10);
    expect(face - az).toBeGreaterThan(PLAYER_RADIUS);
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('the driven walk north from the arrival still stops at the gatehouse', () => {
    const speed = 3.8;
    const delta = 0.1;
    const limit = 24 - (FOUNDATION.size[1] + 2 * FOUNDATION.projection) / 2 - PLAYER_RADIUS; // 20.95
    let pos = [FAST_TRAVEL_ARRIVALS.town_gate[0], 0, FAST_TRAVEL_ARRIVALS.town_gate[1]] as [number, number, number];
    const trail: number[][] = [];
    for (let i = 0; i < 40; i++) {
      pos = resolveCityMovement(pos, 0, 1, speed, delta);
      trail.push([pos[0], pos[2]]);
    }
    const endZ = pos[2];
    // The walk moves in 0.38 steps, so it stops on the last step that is still
    // clear: inside the 0.38 the resolver refuses, and short of the façade.
    expect(limit - endZ).toBeGreaterThanOrEqual(0);
    expect(limit - endZ).toBeLessThan(speed * delta);
    expect(endZ).toBeGreaterThan(FAST_TRAVEL_ARRIVALS.town_gate[1]);
    expect(Math.min(...trail.map((t) => t[1]))).toBeGreaterThanOrEqual(FAST_TRAVEL_ARRIVALS.town_gate[1]);
    // No step of the walk ever entered the façade, and the wall is reversible.
    for (const [, z] of trail) expect(z).toBeLessThanOrEqual(limit);
    let back = pos;
    for (let i = 0; i < 4; i++) back = resolveCityMovement(back, 0, -1, speed, delta);
    expect(back[2]).toBeLessThan(endZ);
  });

  test('the facade corridor south of the gatehouse is still open in X', () => {
    let pos = [0, 0, FAST_TRAVEL_ARRIVALS.town_gate[1]] as [number, number, number];
    for (let i = 0; i < 20; i++) pos = resolveCityMovement(pos, 1, 0, 3.8, 0.1);
    expect(pos[0]).toBeGreaterThan(1);
    expect(collidesWith(pos[0], pos[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });
});

// ── §H · Scope: only the height changed ───────────────────────────────────

describe('C-8.55 §H — the rest of the gatehouse is the composition it was', () => {
  test('the central arch rhythm, keystone, side arches and torches are unchanged', () => {
    expect(num(gateSrc, /<mesh position=\{\[0, ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[5\.2, 6\.4, 4\.8\]\}/)).toBe(3.2);
    expect(num(gateSrc, /<mesh position=\{\[0, ([\d.]+), 2\.3\]\}>\s*<boxGeometry args=\{\[0\.7, 0\.9, 0\.4\]\}/)).toBe(6.35);
    expect(nums(gateSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(bx, bi\)/)).toEqual([-3.2, 3.2]);
    expect(num(gateSrc, /<mesh position=\{\[0, ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[16\.0, 0\.6, 5\.4\]\}/)).toBe(11.8);
  });

  test('the tower cornices, crenellations and lanterns are unchanged', () => {
    expect(allNums(gateSrc, /<WallCornice size=\{\[4\.2, 5\.2\]\} y=\{([\d.]+)\}/)).toEqual([6.2, 11.8]);
    expect(nums(gateSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cx, ci\)/)).toEqual([-1.5, 0, 1.5]);
    expect(nums(gateSrc, /<mesh key=\{`cren-\$\{ti\}-\$\{ci\}`\} castShadow position=\{\[cx,\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/)).toEqual([12.5, 2.2]);
    expect(num(gateSrc, /<group position=\{\[0, ([\d.]+), 2\.8\]\}>/)).toBe(8.0);
  });

  test('the gatehouse source carries exactly one ClassicalColumn usage', () => {
    expect(gateSrc.match(/<ClassicalColumn/g)?.length).toBe(1);
  });

  test('the shared primitive was not edited by this phase', () => {
    // The formulas this suite applied are still the ones the primitive declares.
    expect(colSrc.includes('const plinthHeight = Math.min(0.25, height * 0.07);')).toBe(true);
    expect(colSrc.includes('const capitalHeight = Math.min(0.32, height * 0.09);')).toBe(true);
    expect(colSrc.includes('<boxGeometry args={[radius * 2.5, 0.08, radius * 2.5]} />')).toBe(true);
  });
});
