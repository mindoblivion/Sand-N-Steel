// Shared rig-vs-rig separation for the circus races.
//
// LADDER-1B2 — the minimal resolver the brief's §4 asks for: when two rigs
// overlap, push them apart along the line between their centres, split
// equally, and let each slide along the other. No fault, no steering, no
// speed scrub beyond the separation itself — wheel contact and fault stay
// 1C's. The player calls it too: the same function resolves a player-vs-
// rival pair, so the physics cannot favour one side.
//
// A rig is two circles in the movement module (body r 1.05 at the body
// centre, nose r 0.7 at noseForward 2.02 ahead of the body). The resolver
// tests the rig's OUTLINE — the four circles of both rigs (body/body,
// body/nose, nose/body, nose/nose) — because a nose-first contact is how a
// rig actually touches another rig, and a body-only test would let noses
// interpenetrate. The push is applied to the BODY centres only (the nose
// follows the body in the movement module), split equally between the two
// rigs. A pair already apart returns null and touches nothing.

export interface RigOutline {
  /** Body-centre x in metres. */
  x: number;
  /** Body-centre z in metres. */
  z: number;
  /** Heading in radians, 0 = north (−Z), the movement module's convention. */
  heading: number;
}

/** The movement module's body circle (r 1.05) and nose circle (r 0.7, 2.02 ahead). */
export const RIG_BODY_RADIUS = 1.05;
export const RIG_NOSE_RADIUS = 0.7;
export const RIG_NOSE_FORWARD = 2.02;

/** The four circle pairs of two rig outlines, in resolution order. */
export interface RigCirclePair {
  a: { x: number; z: number; r: number };
  b: { x: number; z: number; r: number };
}

/** The two circles of one rig outline. */
export function rigCircles(rig: RigOutline): readonly [{ x: number; z: number; r: number }, { x: number; z: number; r: number }] {
  const sin = Math.sin(rig.heading);
  const cos = Math.cos(rig.heading);
  return [
    { x: rig.x, z: rig.z, r: RIG_BODY_RADIUS },
    { x: rig.x - sin * RIG_NOSE_FORWARD, z: rig.z - cos * RIG_NOSE_FORWARD, r: RIG_NOSE_RADIUS },
  ];
}

/** Every circle pair of two rigs, in the order the resolver checks them. */
export function rigCirclePairs(a: RigOutline, b: RigOutline): RigCirclePair[] {
  const [aBody, aNose] = rigCircles(a);
  const [bBody, bNose] = rigCircles(b);
  return [
    { a: aBody, b: bBody },
    { a: aBody, b: bNose },
    { a: aNose, b: bBody },
    { a: aNose, b: bNose },
  ];
}

/**
 * The separation for one overlapping pair of circles, or null when they are
 * apart. The push is along the line between the centres (from b to a);
 * coincident centres push along +X so the separation is never undefined.
 */
export function resolveCirclePair(a: { x: number; z: number; r: number }, b: { x: number; z: number; r: number }): { pushX: number; pushZ: number; overlap: number } | null {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const distance = Math.hypot(dx, dz);
  const overlap = a.r + b.r - distance;
  if (overlap <= 0) return null;
  if (distance < 1e-9) return { pushX: overlap, pushZ: 0, overlap };
  return { pushX: (dx / distance) * overlap, pushZ: (dz / distance) * overlap, overlap };
}

/**
 * LADDER-1B2 — the shared rig-vs-rig resolver. Returns the body-centre
 * pushes for both rigs, split equally, or null when the outlines are apart.
 * The pushes are applied to the body centres (the nose follows the body);
 * a rig's heading and speed are untouched, so the separation itself is the
 * only speed effect — the rigs slide past each other along the push.
 *
 * The deepest overlapping circle pair decides the push, because the
 * shallowest pair would leave the deepest pair interpenetrating. A pair
 * whose centres are exactly coincident pushes along +X.
 */
export function resolveRigSeparation(a: RigOutline, b: RigOutline): {
  /** The body-centre push for rig a, in metres. */
  pushA: { x: number; z: number };
  /** The body-centre push for rig b, in metres. */
  pushB: { x: number; z: number };
  /** The deepest overlap found, in metres. */
  overlap: number;
} | null {
  let deepest: { pushX: number; pushZ: number; overlap: number } | null = null;
  for (const pair of rigCirclePairs(a, b)) {
    const resolved = resolveCirclePair(pair.a, pair.b);
    if (resolved !== null && (deepest === null || resolved.overlap > deepest.overlap)) {
      deepest = resolved;
    }
  }
  if (deepest === null) return null;
  const halfX = deepest.pushX / 2;
  const halfZ = deepest.pushZ / 2;
  return {
    pushA: { x: halfX, z: halfZ },
    pushB: { x: -halfX, z: -halfZ },
    overlap: deepest.overlap,
  };
}

/**
 * LADDER-1B2 — resolve one pair AND apply the pushes to the two motions.
 * The scene's resolver calls this (it never does arithmetic on a motion
 * itself — the movement module owns the motion, and this module owns the
 * separation). Returns true when the pair overlapped and was separated.
 */
export function applyRigSeparation(
  a: { x: number; z: number; heading: number },
  b: { x: number; z: number; heading: number },
): boolean {
  const result = resolveRigSeparation(a, b);
  if (result === null) return false;
  a.x += result.pushA.x;
  a.z += result.pushA.z;
  b.x += result.pushB.x;
  b.z += result.pushB.z;
  return true;
}

/**
 * LADDER-1B2 — the amount two rig outlines overlap, or 0 when they are
 * apart. The deepest of the four circle pairs. The soak and the scene use
 * it as the contact detector: a race in which it never exceeds 0 has no
 * rig-vs-rig contact at all.
 */
export function rigOverlap(a: RigOutline, b: RigOutline): number {
  let deepest = 0;
  for (const pair of rigCirclePairs(a, b)) {
    const resolved = resolveCirclePair(pair.a, pair.b);
    if (resolved !== null && resolved.overlap > deepest) deepest = resolved.overlap;
  }
  return deepest;
}
