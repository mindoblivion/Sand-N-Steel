/** Bounty Hall paving connector: swept player clearance and prop envelopes. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith, collidesRect, collidesCircle, type RectCollider, type CircleCollider } from './collisionShapes';
import { FORUM_TO_BOUNTY_HALL_PATH, FORUM_TO_BOUNTY_HALL_WEST_BYPASS, BOUNTY_HALL_FRONTAGE_APPROACH } from './streetGeometry';

const route = [
  { x: -20.2, z: 23.5 },
  { x: -20.2, z: 30.1 },
  { x: -16.2, z: 30.1 },
] as const;

const displayProps: Array<RectCollider | CircleCollider> = [
  // BountyHall.tsx: TimberCrate at world [-16.8, 28.7], 0.9 × 0.9.
  { type: 'rect', id: 'bounty-display-crate', cx: -16.8, cz: 28.7, hw: 0.45, hd: 0.45 },
  // WineBarrel at world [-17.8, 28.5]; conservative 0.4 m radial envelope.
  { type: 'circle', id: 'bounty-display-barrel', cx: -17.8, cz: 28.5, r: 0.4 },
  // Standing spear shaft at world [-17.1, 29.3].
  { type: 'circle', id: 'bounty-display-spear', cx: -17.1, cz: 29.3, r: 0.05 },
  // Notice-board panel and its two posts at the east side of the entrance.
  { type: 'rect', id: 'bounty-notice-board', cx: -13.2, cz: 28.64, hw: 0.9, hd: 0.08 },
  { type: 'circle', id: 'bounty-notice-post-west', cx: -14.0, cz: 28.6, r: 0.06 },
  { type: 'circle', id: 'bounty-notice-post-east', cx: -12.4, cz: 28.6, r: 0.06 },
];

function sampleSegment(a: {x:number;z:number}, b: {x:number;z:number}, visit: (x:number,z:number)=>void) {
  const length = Math.hypot(b.x-a.x, b.z-a.z);
  const steps = Math.ceil(length / 0.05);
  for (let i=0;i<=steps;i++) {
    const t=i/steps;
    visit(a.x+(b.x-a.x)*t, a.z+(b.z-a.z)*t);
  }
}

describe('Bounty Hall paving clearance', () => {
  test('the west bypass begins inside the existing diagonal paving', () => {
    const dx = route[0].x - FORUM_TO_BOUNTY_HALL_PATH.cx;
    const dz = route[0].z - FORUM_TO_BOUNTY_HALL_PATH.cz;
    const c = Math.cos(FORUM_TO_BOUNTY_HALL_PATH.yaw);
    const s = Math.sin(FORUM_TO_BOUNTY_HALL_PATH.yaw);
    const localX = c*dx - s*dz;
    const localZ = s*dx + c*dz;
    expect(Math.abs(localX)).toBeLessThan(FORUM_TO_BOUNTY_HALL_PATH.w/2);
    expect(Math.abs(localZ)).toBeLessThan(FORUM_TO_BOUNTY_HALL_PATH.d/2);
    expect(FORUM_TO_BOUNTY_HALL_WEST_BYPASS.w).toBe(1);
    expect(BOUNTY_HALL_FRONTAGE_APPROACH.d).toBe(1);
  });

  test('the complete player-radius route clears every registered city collider', () => {
    for (let i=0;i<route.length-1;i++) {
      sampleSegment(route[i], route[i+1], (x,z) => {
        expect(collidesWith(x,z,PLAYER_RADIUS,CITY_COLLIDERS), `route point (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
      });
    }
  });

  test('the complete route clears Bounty Hall display props and notice board', () => {
    for (let i=0;i<route.length-1;i++) {
      sampleSegment(route[i], route[i+1], (x,z) => {
        for (const prop of displayProps) {
          const hit = prop.type === 'rect'
            ? collidesRect(x,z,PLAYER_RADIUS,prop)
            : collidesCircle(x,z,PLAYER_RADIUS,prop);
          expect(hit, `${prop.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
        }
      });
    }
  });

  test('the frontage stays north of the Bounty Hall foundation', () => {
    expect(BOUNTY_HALL_FRONTAGE_APPROACH.cz - BOUNTY_HALL_FRONTAGE_APPROACH.d/2).toBeGreaterThan(29.0);
    expect(Math.hypot(route[2].x + 15, route[2].z - 26)).toBeLessThan(4.5);
  });
});
