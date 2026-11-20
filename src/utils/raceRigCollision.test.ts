// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  RIG_BODY_RADIUS,
  RIG_NOSE_FORWARD,
  RIG_NOSE_RADIUS,
  applyRigSeparation,
  resolveCirclePair,
  resolveRigSeparation,
  rigCircles,
  rigOverlap,
} from './raceRigCollision';

// LADDER-1B2 — the shared rig-vs-rig resolver: separation + slide only,
// shared equally, no fault, no speed scrub beyond the separation itself.

describe('raceRigCollision — the shared rig-vs-rig resolver (LADDER-1B2)', () => {
  test('a pair apart returns null and touches nothing', () => {
    const a = { x: 52.34, z: 0, heading: 0 };
    const b = { x: 52.34, z: 10, heading: 0 };
    expect(resolveRigSeparation(a, b)).toBeNull();
    expect(rigOverlap(a, b)).toBe(0);
  });

  test('an overlapping body pair pushes both rigs equally, apart, along the centre line', () => {
    // Two rigs head-on, body centres 1.0 apart (body radii sum 2.10): overlap 1.10.
    const a = { x: 52.34, z: 0, heading: 0 };
    const b = { x: 52.34, z: 1, heading: Math.PI };
    const resolved = resolveRigSeparation(a, b);
    expect(resolved).not.toBeNull();
    expect(resolved!.overlap).toBeCloseTo(1.1, 9);
    // The push is along the centre line (from b to a: −Z), split equally.
    expect(resolved!.pushA.x).toBeCloseTo(0, 9);
    expect(resolved!.pushA.z).toBeCloseTo(-0.55, 9);
    expect(resolved!.pushB.x).toBeCloseTo(0, 9);
    expect(resolved!.pushB.z).toBeCloseTo(0.55, 9);
    // Applied, the pair is exactly apart.
    const a2 = { x: a.x + resolved!.pushA.x, z: a.z + resolved!.pushA.z, heading: 0 };
    const b2 = { x: b.x + resolved!.pushB.x, z: b.z + resolved!.pushB.z, heading: Math.PI };
    expect(rigOverlap(a2, b2)).toBeCloseTo(0, 9);
  });

  test('the push is shared equally — neither rig takes the whole separation', () => {
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 1.5, z: 0, heading: 0 };
    const resolved = resolveRigSeparation(a, b);
    expect(resolved).not.toBeNull();
    expect(Math.abs(resolved!.pushA.x)).toBeCloseTo(Math.abs(resolved!.pushB.x), 9);
    expect(Math.abs(resolved!.pushA.z)).toBeCloseTo(Math.abs(resolved!.pushB.z), 9);
  });

  test('a nose-first contact is caught — the body-only test would miss it', () => {
    // Rig a's nose (2.02 ahead, r 0.7) touches rig b's body; the bodies are 2.5 apart.
    const a = { x: 52.34, z: 0, heading: 0 };
    const b = { x: 52.34, z: -4.5, heading: 0 };
    // a's nose centre is at z −2.02; b's body centre at −4.5: 2.48 apart, radii sum 1.75 — apart.
    // Move b to −3.5: nose-to-body 1.48 apart, overlap 0.27; bodies 3.5 apart (no body overlap).
    const b2 = { x: 52.34, z: -3.5, heading: 0 };
    expect(rigOverlap(a, b2)).toBeGreaterThan(0);
    const resolved = resolveRigSeparation(a, b2);
    expect(resolved).not.toBeNull();
    // The deepest pair is nose/body (0.27), so the push is 0.27 along the centre line.
    expect(resolved!.overlap).toBeCloseTo(0.27, 9);
    const a2 = { x: a.x + resolved!.pushA.x, z: a.z + resolved!.pushA.z, heading: 0 };
    const b3 = { x: b2.x + resolved!.pushB.x, z: b2.z + resolved!.pushB.z, heading: 0 };
    expect(rigOverlap(a2, b3)).toBeCloseTo(0, 9);
  });

  test('the deepest overlapping pair decides the push', () => {
    // Bodies overlap by 0.6; the noses overlap by more — the push must clear the noses.
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 0, z: 1.5, heading: Math.PI };
    // Bodies 1.5 apart (overlap 0.6). Noses: a's at z −2.02, b's at z 1.5+2.02=3.52 — far apart.
    // Side-by-side instead: noses overlap deeply while bodies overlap shallowly.
    const c = { x: 0, z: 0, heading: 0 };
    const d = { x: 1.2, z: -2.02, heading: 0 };
    // c's nose (0, −2.02) vs d's body (1.2, −2.02): 1.2 apart, radii 0.7+1.05=1.75 → overlap 0.55.
    // c's body (0,0) vs d's body (1.2,−2.02): 2.35 apart → no overlap.
    const resolved = resolveRigSeparation(c, d);
    expect(resolved).not.toBeNull();
    expect(resolved!.overlap).toBeCloseTo(0.55, 9);
    const c2 = { x: c.x + resolved!.pushA.x, z: c.z + resolved!.pushA.z, heading: 0 };
    const d2 = { x: d.x + resolved!.pushB.x, z: d.z + resolved!.pushB.z, heading: 0 };
    expect(rigOverlap(c2, d2)).toBeCloseTo(0, 9);
  });

  test('coincident centres push along +X instead of dividing by zero', () => {
    const a = { x: 10, z: 10, heading: 0 };
    const b = { x: 10, z: 10, heading: 0 };
    const resolved = resolveRigSeparation(a, b);
    expect(resolved).not.toBeNull();
    expect(resolved!.pushA.x).toBeGreaterThan(0);
    expect(resolved!.pushA.z).toBeCloseTo(0, 9);
    const a2 = { x: a.x + resolved!.pushA.x, z: a.z + resolved!.pushA.z, heading: 0 };
    const b2 = { x: b.x + resolved!.pushB.x, z: b.z + resolved!.pushB.z, heading: 0 };
    expect(rigOverlap(a2, b2)).toBeCloseTo(0, 9);
  });

  test('the resolver touches neither heading nor speed — separation is the only effect', () => {
    const a = { x: 0, z: 0, heading: 0.7 };
    const b = { x: 1, z: 0, heading: -1.2 };
    const resolved = resolveRigSeparation(a, b);
    expect(resolved).not.toBeNull();
    // The return carries only pushes and an overlap — no heading, no speed, no fault.
    expect(Object.keys(resolved!).sort()).toEqual(['overlap', 'pushA', 'pushB']);
    expect(Object.keys(resolved!.pushA).sort()).toEqual(['x', 'z']);
  });

  test('the rig circles match the movement module (body 1.05, nose 0.7 at 2.02 ahead)', () => {
    const [body, nose] = rigCircles({ x: 10, z: 20, heading: 0 });
    expect(body).toEqual({ x: 10, z: 20, r: RIG_BODY_RADIUS });
    expect(nose.x).toBeCloseTo(10, 9);
    expect(nose.z).toBeCloseTo(20 - RIG_NOSE_FORWARD, 9);
    expect(nose.r).toBe(RIG_NOSE_RADIUS);
    // Heading π/2 faces −X: the nose sits 2.02 toward −X.
    const [, noseWest] = rigCircles({ x: 10, z: 20, heading: Math.PI / 2 });
    expect(noseWest.x).toBeCloseTo(10 - RIG_NOSE_FORWARD, 9);
    expect(noseWest.z).toBeCloseTo(20, 9);
  });

  test('resolveCirclePair returns null when apart and the overlap when touching', () => {
    expect(resolveCirclePair({ x: 0, z: 0, r: 1 }, { x: 5, z: 0, r: 1 })).toBeNull();
    const touching = resolveCirclePair({ x: 0, z: 0, r: 1 }, { x: 1.5, z: 0, r: 1 });
    expect(touching).not.toBeNull();
    expect(touching!.overlap).toBeCloseTo(0.5, 9);
    expect(touching!.pushX).toBeCloseTo(-0.5, 9);
  });
});

describe('applyRigSeparation', () => {
  test('applies the shared push to both motions and reports whether it separated', () => {
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 1, z: 0, heading: 0 };
    expect(applyRigSeparation(a, b)).toBe(true);
    expect(a.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(1);
    expect(rigOverlap(a, b)).toBe(0);
    expect(applyRigSeparation(a, b)).toBe(false);
  });
});
