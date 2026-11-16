/**
 * Phase C-8.34 — east-market decorative-prop clearance.
 *
 * The east-market pedestrian route and the General Store's west-facing customer
 * counter were being obstructed by unregistered decorative objects. This suite
 * pins the relocated source transforms and checks conservative horizontal
 * envelopes against building colliders, each other, and the surveyed 2-unit
 * pedestrian corridors. It deliberately does not change building geometry,
 * collision registration, door triggers or fast-travel arrivals.
 *
 * The cart envelope uses the audited 2.28-unit rotated footprint (circumscribed
 * radius 1.62); the bench uses its 2.0 × 0.65 seat envelope (radius 1.06);
 * the remaining radii conservatively cover their rendered primitive bounds.
 *
 * Run with: bun test src/utils/cityMarketPropClearance.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CITY_COLLIDERS, collidesWith } from './collisionShapes';

const streets = readFileSync(
  new URL('../components/3d/city/CityStreets.tsx', import.meta.url),
  'utf8',
);

interface PropEnvelope {
  id: string;
  x: number;
  z: number;
  radius: number;
}

const EAST_MARKET_PROPS: PropEnvelope[] = [
  { id: 'market-cart', x: 32.0, z: -5.2, radius: 1.62 },
  { id: 'forge-side-bench', x: 27.0, z: -7.5, radius: 1.06 },
  { id: 'store-display-cluster', x: 31.0, z: -8.4, radius: 0.95 },
  { id: 'store-crate', x: 33.0, z: -8.4, radius: 0.60 },
  { id: 'store-amphora', x: 28.5, z: -8.4, radius: 0.30 },
];

interface Point {
  x: number;
  z: number;
}
interface Segment {
  a: Point;
  b: Point;
}

/** Surveyed route centreline segments; width clearance is checked around them. */
const EAST_MARKET_ROUTE: Segment[] = [
  { a: { x: 5.8, z: 2.6 }, b: { x: 12.75, z: 2.6 } },
  { a: { x: 12.75, z: 2.6 }, b: { x: 12.75, z: -2.9 } },
  { a: { x: 12.75, z: -2.9 }, b: { x: 16.2, z: -2.9 } },
  { a: { x: 16.2, z: -2.9 }, b: { x: 16.2, z: -9.8 } },
  { a: { x: 16.2, z: -9.8 }, b: { x: 20.6, z: -9.8 } },
  // Customer approach to the General Store's west-facing counter.
  { a: { x: 16.2, z: -5.0 }, b: { x: 17.3, z: -5.0 } },
  // North-facing Armor Workshop frontage and its measured standoff.
  { a: { x: 28.2, z: -0.5 }, b: { x: 28.2, z: -2.2 } },
];

function distanceToSegment(point: Point, segment: Segment): number {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 1e-12
    ? Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz) / lengthSq))
    : 0;
  const nearestX = segment.a.x + t * dx;
  const nearestZ = segment.a.z + t * dz;
  return Math.hypot(point.x - nearestX, point.z - nearestZ);
}

describe('Phase C-8.34 — east-market prop clearance', () => {
  test('the cart, bench and Store display props use the surveyed storage-yard positions', () => {
    expect(streets).toContain('<RomanBench position={[27.0, 0, -7.5]} rotationY={-Math.PI / 2} />');
    expect(streets).toContain('<RomanAmphora position={[28.5, 0, -8.4]} scale={0.8} tone="sand" />');
    expect(streets).toContain('<MerchantPropsCluster position={[31.0, 0, -8.4]} />');
    expect(streets).toContain('<MerchantCart position={[32.0, 0, -5.2]} rotationY={Math.PI / 4} />');
    expect(streets).toContain('<TimberCrate position={[33.0, 0, -8.4]} size={[0.8, 0.7, 0.8]} />');

    // Guard against the exact placements that blocked the route / counter apron.
    expect(streets).not.toContain('<RomanBench position={[12.5, 0, -3.8]}');
    expect(streets).not.toContain('<MerchantCart position={[10.8, 0, -1.7]}');
    expect(streets).not.toContain('<MerchantPropsCluster position={[17, 0, -4]}');
    expect(streets).not.toContain('<TimberCrate position={[17.5, 0, -6]}');
    expect(streets).not.toContain('<RomanAmphora position={[18, 0, -3.5]}');
  });

  test('no relocated prop envelope intersects a registered building or wall collider', () => {
    for (const prop of EAST_MARKET_PROPS) {
      expect(
        collidesWith(prop.x, prop.z, prop.radius, CITY_COLLIDERS),
        `${prop.id} overlaps a registered city collider at (${prop.x}, ${prop.z})`,
      ).toBe(false);
    }
  });

  test('each prop leaves at least a 2-unit clear pedestrian envelope around surveyed routes', () => {
    for (const prop of EAST_MARKET_PROPS) {
      for (const segment of EAST_MARKET_ROUTE) {
        const clearance = distanceToSegment(
          { x: prop.x, z: prop.z },
          segment,
        ) - prop.radius;
        expect(
          clearance,
          `${prop.id} pinches route segment ${JSON.stringify(segment)}; clearance=${clearance.toFixed(3)}`,
        ).toBeGreaterThanOrEqual(1.0);
      }
    }
  });

  test('the relocated props do not overlap one another', () => {
    for (let i = 0; i < EAST_MARKET_PROPS.length; i++) {
      for (let j = i + 1; j < EAST_MARKET_PROPS.length; j++) {
        const a = EAST_MARKET_PROPS[i];
        const b = EAST_MARKET_PROPS[j];
        const clearance = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
        expect(
          clearance,
          `${a.id} overlaps ${b.id}; clearance=${clearance.toFixed(3)}`,
        ).toBeGreaterThan(0.1);
      }
    }
  });
});
