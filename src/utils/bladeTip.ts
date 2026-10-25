/**
 * ===========================================================================
 * SAND & STEEL — TRUE BLADE-TIP SAMPLER (Phase C-8.81D)
 * ===========================================================================
 *
 * C-8.80G measured each attack clip's contact frame against a point that was
 * NOT the blade tip. It built a `Box3` around the whole `gladius.glb` scene and
 * then took `(0, box.max.y, 0)` in the ATTACHMENT group's space:
 *
 *   1. `box.max.y` is a length read in the gladius SCENE's space (the blade runs
 *      +Y there, 1.000 unit from pommel to point), but the point was handed to
 *      `attachment.localToWorld`, i.e. it was interpreted in the ATTACHMENT
 *      group's space instead.
 *   2. The attachment group is not aligned with the gladius: `GladiatorMesh`
 *      puts the blade inside an orientation group rotated +90° about X (C-8.80E),
 *      so the blade leaves the grip along the attachment's +Z, not its +Y.
 *
 * The two errors compound: at the fighting idle the sampled point sat 1.41 world
 * units away from the real tip — a different part of space entirely, which is
 * why the derived contact frames drifted toward the end of each swing.
 *
 * THE CONTRACT HERE — explicit coordinate spaces, no proxies:
 *
 *   geometry space  the blade mesh's own vertices. The gladius model's blade runs
 *                   along +Y: the point of the sword is the vertex with the
 *                   greatest Y, the pommel the vertex with the least. This is a
 *                   property of the ASSET, recorded in {@link BLADE_AXIS_LOCAL}.
 *   world space     `mesh.localToWorld(...)` after the animated hierarchy is up
 *                   to date. That single call applies the whole chain the
 *                   renderer uses: geometry → mesh node → orientation group →
 *                   attachment scale → animated hand bone → the attacker's root
 *                   transform (position, yaw, the `meshScale × correction` scale).
 *
 * So the tip is always sampled as a GEOMETRY-space vertex pushed through the live
 * world matrix, never as a point guessed in an intermediate group's space.
 */

import * as THREE from 'three';

/**
 * The gladius geometry's blade axis, in the mesh's OWN space, pointing at the
 * point of the sword.
 *
 * Measured from `public/models/weapons/gladius.glb`: the single blade mesh spans
 * Y −1.000 … +1.000 (its node carries the 0.4998 scale and 0.4998 offset that
 * turn that into a 0 … 1.000 blade in the GLB's scene space), the cross-section
 * is ±0.236 in X and ±0.099 in Z, and the vertex with the greatest Y is the
 * blade's point (X −0.006, Z −0.004 — on the centreline, to within 7 mm).
 */
export const BLADE_AXIS_LOCAL: Readonly<THREE.Vector3> = Object.freeze(
  new THREE.Vector3(0, 1, 0),
);

/** The blade extremity along its own axis: `+1` = point, `-1` = pommel. */
type BladeExtremity = 1 | -1;

function extremeLocal(
  mesh: THREE.Mesh,
  extremity: BladeExtremity,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const position = mesh.geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
  if (!position || position.count === 0) {
    throw new Error('blade mesh has no position attribute to sample');
  }
  const axis = BLADE_AXIS_LOCAL;
  let best = -Infinity;
  let bestIndex = 0;
  for (let i = 0; i < position.count; i++) {
    const along = position.getX(i) * axis.x + position.getY(i) * axis.y + position.getZ(i) * axis.z;
    // `extremity` flips the comparison so one walk serves both ends.
    const score = along * extremity;
    if (score > best) {
      best = score;
      bestIndex = i;
    }
  }
  return target.fromBufferAttribute(position, bestIndex);
}

/**
 * The blade tip in the mesh's GEOMETRY space (no parent transforms applied).
 *
 * This is the correct input to `mesh.localToWorld`; passing any other point, or
 * passing this one to a different node, is the C-8.80G defect.
 */
export function bladeTipLocal(mesh: THREE.Mesh, target = new THREE.Vector3()): THREE.Vector3 {
  return extremeLocal(mesh, 1, target);
}

/** The pommel end in the mesh's GEOMETRY space — the opposite end of the blade. */
export function bladeHiltLocal(mesh: THREE.Mesh, target = new THREE.Vector3()): THREE.Vector3 {
  return extremeLocal(mesh, -1, target);
}

/**
 * The blade tip in WORLD space, through the complete animated transform chain.
 *
 * `updateWorldMatrix(true, false)` refreshes the ancestors first, so the tip is
 * read against the pose the mixer last applied — the animated hand bone and the
 * attacker's root included, not a bind-pose or unattached approximation.
 * (The skeleton itself is posed by the caller's `AnimationMixer`; this function
 * does not advance time or re-pose anything.)
 */
export function bladeTipWorld(mesh: THREE.Mesh, target = new THREE.Vector3()): THREE.Vector3 {
  mesh.updateWorldMatrix(true, false);
  return mesh.localToWorld(bladeTipLocal(mesh, target));
}

/** The pommel end in WORLD space, through the same transform chain. */
export function bladeHiltWorld(mesh: THREE.Mesh, target = new THREE.Vector3()): THREE.Vector3 {
  mesh.updateWorldMatrix(true, false);
  return mesh.localToWorld(bladeHiltLocal(mesh, target));
}

/**
 * The blade's rendered length in world units (point to pommel), for asserting
 * that the attachment scale still cancels the body correction (C-8.80E / C-8.81C).
 */
export function bladeLengthWorld(mesh: THREE.Mesh): number {
  return bladeTipWorld(mesh).distanceTo(bladeHiltWorld(mesh));
}
