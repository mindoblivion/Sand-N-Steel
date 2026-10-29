import React, { useMemo, useEffect } from 'react';
import { assetUrl } from '../../../utils/assetUrl';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { buryMotteFlange } from '../../../utils/motteSurface';
import { MOTTE_CENTER_Z, MOTTE_SCALE } from '../../../utils/terrainHeight';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

/**
 * NorthernMotte.tsx — Motte-and-bailey earth mound north of the Colosseum.
 *
 * Loads the corrected GLB asset (public/_workspace_motte_normals.glb)
 * through the existing useGLTF pipeline.
 *
 * Asset correction history:
 *   1. The original GLB (trimesh-generated) had no NORMAL attributes on any
 *      mesh, causing invisible rendering on SwiftShader.
 *   2. The corrected asset was produced with TWO modifications:
 *      a. Smooth per-vertex normals computed from the indexed geometry,
 *         preserving all vertex counts, indices, materials, and bounds.
 *      b. Node-level Z-up→Y-up rotation baked into the GLB node hierarchy,
 *         so the model renders correctly in Three.js (Y-up) without any
 *         component-level rotation.
 *
 * IMPORTANT: Because the GLB nodes already carry the Z-up→Y-up rotation,
 * this component must NOT apply a duplicate rotation.  The outer group
 * uses rotation [0, 0, 0].  (NorthernFortress works the same way: its GLB
 * nodes also bake in the Z-up→Y-up rotation, so its group applies no
 * rotation either.)  Applying a duplicate rotation would misalign the
 * motte and break the terrain height calculations in terrainHeight.ts.
 *
 * Approved configuration (Phase 34G, C2 south-facing; Z from Phase C-8.38):
 *   Position: [0, 0, MOTTE_CENTER_Z] = [0, 0, -81.5]
 *   Scale:    0.3145 (MOTTE_SCALE)
 *   Rotation: [0, 0, 0]  (the GLB nodes already carry the Z-up→Y-up rotation)
 *
 * Phases C-8.37 / C-8.38 — the mountain, its moat and the fortress moved 5.0
 * units north twice as one group (see terrainHeight.ts), the second move to
 * open the gate → apron → moat composition of the northern approach.  The
 * position and scale here come from terrainHeight's constants, so the mound,
 * the moat ring and the collision perimeter can never drift apart again.
 *
 * The GLB has three meshes:
 *   Motte_Grass  — the mound surface (grass), rendered with shadows.
 *   Ramp_Dirt    — the dirt ramp, rendered with shadows.
 *   Moat_Water   — a flat ring at model Z=-1.9 (world Y≈-0.60), entirely
 *                  below the city ground plane at Y=0.  Omitted from
 *                  rendering because it is always hidden underground.
 *
 * Phase C-8.35 — the outer flange.  `Motte_Grass` does not stop at the mound's
 * foot: the superellipse family continues as an outer flange whose crest rings
 * sit at exactly world Y = 0, i.e. 0.05 ABOVE the city ground plane, while its
 * troughs sink below it and are hidden.  The flat sage-green material therefore
 * rendered as concentric ground-level bands up to 63.4 units wide (the
 * "oversized flat green surface" of the northern approach).  At mount time the
 * flange is sunk below the ground plane by utils/motteSurface.ts; the mound,
 * the summit, the traversable slope, the collision registry and getTerrainY()
 * are untouched.
 *
 * World-space bounds after transform (scale 0.3145, center [0, -81.5]):
 *   Motte: X[-25.16, 25.16], Z[-106.66, -56.34], Y[-0.88, 4.72]
 *   Ramp:  X[-2.83, 2.83],   Z[-68.92, -58.23], Y[0, 4.72]
 *   Summit (flat top at Y=4.72): radius ≈15.73 from [0, -81.5]
 *
 * Phase C-8.36 — water beneath the drawbridge.  The water ring's south wedge
 * (MOAT_GAP_HALF_ANGLE either side of the +Z axis) removed the moat exactly
 * where the drawbridge crosses it, leaving a dry terrain channel ~9.8 wide
 * under a 4.2-wide bridge, and its inner edge (25.8) stopped 0.8 short of the
 * bridge's north end (radius 25.0).  The ring is now complete and reaches
 * inward to 25.0, so the water runs continuously beneath the whole bridge
 * footprint; see the ring's own block below for the measured clearances.
 * Nothing but the water mesh changed.
 *
 * Phase C-8.41 — the travertine shoreline kerb.  The water ring is transparent
 * and lies flat on the sand, so its outer edge was a pure colour transition
 * with no form (sand -0.05 → water 0.06 → deck underside 0.09 → deck top 0.16:
 * a 0.21 spread over 12 units).  A restrained travertine revetment now stands
 * on that shoreline — the C-8.40 audit's option B, the only one of the three
 * treatments that buys the moat a visible boundary without spending the
 * six-metre apron C-8.38 opened.  It is a new mesh with no collider, cut for
 * the bridge on the rear gate's own clear width; see its own block below for
 * the measured clearances.  Nothing else moved.
 *
 * The motte is mounted once in CityHubScene via this component.
 */

const MOTTE_URL = assetUrl('/_workspace_motte_normals.glb');

// Preload at module import time (same pattern as NorthernFortress / GladiatorMesh).
try {
  useGLTF.preload(MOTTE_URL);
} catch {
  // Silent fallback — useGLTF will load on demand if preload fails.
}

const MotteModel: React.FC = () => {
  const gltf = useGLTF(MOTTE_URL);

  // Clone so the cached scene is never mutated across instances.
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name || mesh.userData?.gltfAsset?.name;
        // Omit the buried moat mesh — it is entirely below the ground
        // plane at Y=0 (world Y ≈ -0.60) and would z-fight with the
        // city ground.  Skip rendering by making it invisible.
        if (name === 'Moat_Water') {
          mesh.visible = false;
          return;
        }
        // Phase 35E: Hide the dirt ramp — replaced by the wooden drawbridge.
        // The mesh is set invisible (not removed) so the GLB asset is
        // preserved byte-for-byte; only runtime visibility changes.
        if (name === 'Ramp_Dirt') {
          mesh.visible = false;
          return;
        }
        // Phase C-8.35: the trimesh conversion left an outer flange around the
        // mound's foot.  Its crest rings sit at exactly world Y = 0 — 0.05 ABOVE
        // the city ground plane at Y = -0.05 — so the flat sage-green material
        // rendered as concentric ground-level bands out to a 63-unit width,
        // with the sand showing through between them.  Sinking the flange under
        // the ground plane removes those flat bands; the mound, the summit, the
        // traversable slope and every gameplay number stay exactly as they were
        // (see utils/motteSurface.ts).
        if (name === 'Motte_Grass') {
          // POSITION is interleaved with NORMAL in one 24-byte-strided buffer
          // view, so its array is shared with the normals and must not be edited
          // in place.  Read through the accessor API into a buffer this
          // component owns — correct for an interleaved attribute and a plain
          // one alike — then sink the flange.
          const position = mesh.geometry.getAttribute('position');
          if (position) {
            const positions = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i++) {
              positions[i * 3] = position.getX(i);
              positions[i * 3 + 1] = position.getY(i);
              positions[i * 3 + 2] = position.getZ(i);
            }
            buryMotteFlange(positions);
            mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            mesh.geometry.computeBoundingSphere();
          }
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [cloned]);

  return <primitive object={cloned} />;
};

// ── Moat water ring (Phase 35C) ─────────────────────────────────────────────
//
// The GLB's own Moat_Water mesh sits at world Y≈-0.60 (model Z=-1.9 × scale
// 0.3145), entirely below the city ground plane at Y=0, and is hidden.  This
// lightweight ring restores visible water at ground level.
//
// Verified dimensions (from GLB accessor bounds):
//   Motte_Grass base: model X/Y ±80 → world radius 25.16
//   Original GLB moat: model radius ~69.93 → world radius ~21.99 (buried)
//   Perimeter collision: world radius 22.0
//   Ramp: south-facing, world X ±2.83, Z[-55.42, -44.73]
//   Ramp opening half-angle (collision): atan((2.83+0.4)/22) ≈ 0.146 rad
//
// Water ring placement (Phase C-8.36 — see the measured clearances below):
//   Inner radius: 25.0 — reaches under the drawbridge's north end.  The bridge
//                 footprint's inner corners sit at radius 25.089, so the water
//                 now runs beneath the whole deck and both side beams.  The
//                 mound still clears it: measured on the shipping asset after
//                 the C-8.35 flange burial, the motte's surface is above the
//                 water plane only out to radius 24.456 and its visible
//                 silhouette (where the buried skirt crosses the ground plane)
//                 reaches 24.666, so the water never touches the motte.
//   Outer radius: 31.0 — unchanged.  The moat's outer shoreline is exactly the
//                 drawbridge's south end (radius 31.0); the bridge lands on the
//                 outer bank there, so no water is pushed onto the approach.
//   Elevation: Y=0.06 — above the city ground plane (-0.05) to avoid z-fighting,
//                 below the bridge's underside (0.09) so it cannot clip the deck.
//   Gap half-angle: 0 — the ring is complete since C-8.36.  The former 0.18 rad
//                 south wedge removed the water exactly where the drawbridge
//                 crosses the moat, which is the dry channel this phase sealed.

export const MOAT_INNER_RADIUS = 25.0;
export const MOAT_OUTER_RADIUS = 31.0;
export const MOAT_WATER_Y = 0.06;
export const MOAT_GAP_HALF_ANGLE = 0; // radians — complete ring (Phase C-8.36)

const MOTTE_MOAT_CENTER: [number, number, number] = [0, 0, MOTTE_CENTER_Z];

const MoatWater: React.FC = () => {
  // RingGeometry is in the XY plane. After rotation [-π/2, 0, 0]:
  //   θ_ring=0 → +X (east), θ_ring=3π/2 → +Z (south from motte center).
  // Any gap would be centred at south: thetaStart = 3π/2 + GAP_HALF,
  // thetaLength = 2π - 2*GAP_HALF.  Since Phase C-8.36 GAP_HALF is 0, so this
  // is a complete ring — the water passes under the drawbridge.
  const thetaStart = (3 * Math.PI) / 2 + MOAT_GAP_HALF_ANGLE;
  const thetaLength = 2 * Math.PI - 2 * MOAT_GAP_HALF_ANGLE;

  return (
    <mesh
      position={[MOTTE_MOAT_CENTER[0], MOAT_WATER_Y, MOTTE_MOAT_CENTER[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={false}
    >
      <ringGeometry
        args={[MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, 48, 1, thetaStart, thetaLength]}
      />
      <meshStandardMaterial
        color="#4a7a8a"
        roughness={0.35}
        metalness={0.1}
        transparent
        opacity={0.82}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// ── Moat shoreline kerb (Phase C-8.41) ──────────────────────────────────────
//
// The audit that authorizes this geometry is AGENTS.md's "Moat shoreline
// definition (Phase C-8.40)".  Every number below is the audited one, except
// the gap angle's derivation point — see "the one measured correction" below.
//
// The band is a single arc cut for the bridge, in the cylinder convention used
// everywhere in the city (X = r·sinθ, Z = r·cosθ, θ = 0 → +Z, the bridge axis),
// so the gap is θ ∈ (−g, g) and the stone runs g → 2π − g, symmetric about
// X = 0:
//
//   radial   30.90 → 31.35 — the inner face stands 0.10 inside the water ring's
//                            outer edge (31.0), 0.034 more than the ring's own
//                            48-gon chord sagitta (0.0664 at r = 31).  The
//                            water's hard edge is therefore always hidden under
//                            the stone and no sand sliver can appear between
//                            water and kerb at any segment alignment.
//   vertical −0.10 → 0.14  — 0.05 buried below the sand plane (−0.05), so no gap
//                            and no z-fight is possible; 0.19 exposed above the
//                            sand; 0.08 of freeboard above the water (0.06);
//                            0.02 below the deck top (0.16), so the bridge stays
//                            the highest walking plane.  No face is coplanar
//                            with the sand, the water or the deck.
//   gap      |X| ≤ 2.70    — the rear gate's own clear width (GrandColosseum.tsx
//                            GATE_HALF_W, restated here exactly as
//                            collisionShapes.ts already restates it, to avoid
//                            coupling the motte module to the Colosseum module).
//                            The gap is mandatory: the deck's outer corners sit
//                            0.072 *outside* the 31.0 arc, so any band on the
//                            waterline would otherwise run through the bridge's
//                            landing.  Clearance from the widest rendered bridge
//                            footprint (the side beams' outer faces, X ±2.11) to
//                            the kerb's end face is 0.613, against the 0.598 the
//                            audit measured.
//
// The one measured correction.  The audit stated the gap as ±4.997° — that is
// asin(GATE_HALF_W / 31.0), i.e. derived at the shoreline, which pinches the
// opening to 2.6913 at the band's inner face: 0.009 *narrower* than the gate it
// copies.  Deriving it at the band's tightest inner radius instead — the chord
// midpoint of the inner face's 48-gon, 30.8338 — guarantees the property the
// audit intended: **no point of the kerb has |X| < GATE_HALF_W**, so the opening
// is at least the gate's own 5.40 clear width everywhere (5.4009 at that
// tightest point, 2.7567 at the outer face's corner).  The clearance to the
// widest rendered bridge footprint grows from the audited 0.598 to 0.613.
// Radius, Y band, gap and material are otherwise unchanged from the audit.
//
// Cost: 5 meshes (top slab + outer face + inner face + two end caps), 312
// triangles, one shared double-sided travertine material, no new asset, no new
// dependency, no collider, and no change to getTerrainY, MOAT_*, DECK_* or
// BRIDGE_*.
export const KERB_INNER_RADIUS = 30.9;
export const KERB_OUTER_RADIUS = 31.35;
export const KERB_BASE_Y = -0.1;
export const KERB_TOP_Y = 0.14;
export const KERB_HEIGHT = KERB_TOP_Y - KERB_BASE_Y; // 0.24
/** The rear gate's clear half-width — GrandColosseum.tsx GATE_HALF_W. */
export const KERB_GATE_HALF_W = 2.7;
/** The water ring's own segment module. */
export const KERB_SEGMENTS = 48;
/** The shoreline module's half-step: the chord midpoint sits this far in. */
export const KERB_ARC_HALF_STEP = Math.PI / KERB_SEGMENTS;
/**
 * The tightest radius any point of the inner face can reach — its chord
 * midpoint.  Every stone point lies at radius ≥ this, so deriving the gap here
 * makes |X| ≥ KERB_GATE_HALF_W a property of the whole revetment rather than of
 * its vertices alone (the chords would otherwise dip 0.0055 inside ±2.70).
 */
export const KERB_INNER_RADIUS_TIGHT = KERB_INNER_RADIUS * Math.cos(KERB_ARC_HALF_STEP);
/** The gap: no stone closer to the bridge axis than the gate's own clear width. */
export const KERB_GAP_HALF_ANGLE = Math.asin(KERB_GATE_HALF_W / KERB_INNER_RADIUS_TIGHT);
export const KERB_CAP_THICKNESS = 0.1;

// Cylinder convention (above): the band runs g → 2π − g.
const KERB_THETA_START = KERB_GAP_HALF_ANGLE;
const KERB_THETA_LENGTH = 2 * Math.PI - 2 * KERB_GAP_HALF_ANGLE;

// RingGeometry measures φ from +X in its own XY plane; after the −π/2
// X-rotation a ring point lands at (r·cos φ, 0, −r·sin φ), which equals
// (r·sin θ, 0, r·cos θ) for φ = θ + 3π/2 — the same convention the water ring
// above uses.  Both geometries divide their arc into KERB_SEGMENTS equal parts
// from the same edge, so the slab's rim and both faces share their vertices
// exactly and join with no seam.
const KERB_RING_START = (3 * Math.PI) / 2 + KERB_GAP_HALF_ANGLE;

/** Kerb centre height — the vertical mid-point of the band. */
export const KERB_MID_Y = (KERB_BASE_Y + KERB_TOP_Y) / 2;
/** Kerb centre radius — the radial mid-point of the band. */
export const KERB_MID_RADIUS = (KERB_INNER_RADIUS + KERB_OUTER_RADIUS) / 2;
/** Where each end cap's outer face sits: on the gap plane, mid-band. */
export const KERB_CAP_CENTER_RADIUS = KERB_MID_RADIUS;

// The five geometry argument tuples, exported so the regression suite builds
// exactly the shipped mesh instead of a re-typed copy of it.
export const KERB_SLAB_ARGS: [number, number, number, number, number, number] = [
  KERB_INNER_RADIUS, KERB_OUTER_RADIUS, KERB_SEGMENTS, 1, KERB_RING_START, KERB_THETA_LENGTH,
];
export const KERB_OUTER_FACE_ARGS: [number, number, number, number, number, boolean, number, number] = [
  KERB_OUTER_RADIUS, KERB_OUTER_RADIUS, KERB_HEIGHT, KERB_SEGMENTS, 1, true, KERB_THETA_START, KERB_THETA_LENGTH,
];
export const KERB_INNER_FACE_ARGS: [number, number, number, number, number, boolean, number, number] = [
  KERB_INNER_RADIUS, KERB_INNER_RADIUS, KERB_HEIGHT, KERB_SEGMENTS, 1, true, KERB_THETA_START, KERB_THETA_LENGTH,
];
export const KERB_CAP_ARGS: [number, number, number] = [
  KERB_CAP_THICKNESS, KERB_HEIGHT, KERB_OUTER_RADIUS - KERB_INNER_RADIUS,
];

/** An end cap's centre and yaw, on `side` (+1 east / −1 west). */
export const kerbCapTransform = (side: 1 | -1): { theta: number; cx: number; cz: number } => {
  const theta = side * KERB_GAP_HALF_ANGLE;
  return {
    theta,
    // The cap's own face lies ON the band's end — a radial plane through the
    // motte centre — and the box then runs back into the band by its own
    // thickness, so the two cannot part at any segment alignment and no sliver
    // opens at the gap edge.
    cx: KERB_CAP_CENTER_RADIUS * Math.sin(theta) + side * (KERB_CAP_THICKNESS / 2) * Math.cos(theta),
    cz: KERB_CAP_CENTER_RADIUS * Math.cos(theta) - side * (KERB_CAP_THICKNESS / 2) * Math.sin(theta),
  };
};

// One shared material instance for all five meshes (Phase 25.2's pattern in
// GrandColosseum — created once, reused).  Double-sided because the revetment
// is an open shell: the outer face's normals point away from the moat, the
// inner face's point into it.
const kerbMaterial = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.travertineDark.color,
  roughness: 0.82,
  metalness: 0.04,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.012,
  side: THREE.DoubleSide,
});

const MoatShorelineKerb: React.FC = () => {
  const endCap = (side: 1 | -1) => {
    const { theta, cx, cz } = kerbCapTransform(side);
    return (
      <mesh
        key={`kerb-cap-${side < 0 ? 'w' : 'e'}`}
        position={[cx, KERB_MID_Y, cz]}
        rotation={[0, theta, 0]}
        material={kerbMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={KERB_CAP_ARGS} />
      </mesh>
    );
  };

  return (
    <group position={[MOTTE_MOAT_CENTER[0], MOTTE_MOAT_CENTER[1], MOTTE_MOAT_CENTER[2]]}>
      {/* Top slab — the kerb's visible cap, 0.19 above the sand. */}
      <mesh
        position={[0, KERB_TOP_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={kerbMaterial}
        castShadow
        receiveShadow
      >
        <ringGeometry args={KERB_SLAB_ARGS} />
      </mesh>

      {/* Outer face — the city-side revetment, 0.35 outside the water's edge. */}
      <mesh position={[0, KERB_MID_Y, 0]} material={kerbMaterial} castShadow receiveShadow>
        <cylinderGeometry args={KERB_OUTER_FACE_ARGS} />
      </mesh>

      {/* Inner face — stands 0.10 inside the water's edge, hiding it. */}
      <mesh position={[0, KERB_MID_Y, 0]} material={kerbMaterial} castShadow receiveShadow>
        <cylinderGeometry args={KERB_INNER_FACE_ARGS} />
      </mesh>

      {endCap(1)}
      {endCap(-1)}
    </group>
  );
};

/**
 * Error boundary wrapper — a load failure renders nothing rather than
 * crashing the city hub, consistent with ThreeComponentErrorBoundary usage
 * in CityHubScene.
 */
class MotteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[NorthernMotte] GLB failed to load:', err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export const NorthernMotte: React.FC = () => {
  return (
    <MotteErrorBoundary>
      <React.Suspense fallback={null}>
        <group position={[0, 0, MOTTE_CENTER_Z]} scale={MOTTE_SCALE}>
          <MotteModel />
        </group>
        <MoatWater />
        <MoatShorelineKerb />
      </React.Suspense>
    </MotteErrorBoundary>
  );
};
