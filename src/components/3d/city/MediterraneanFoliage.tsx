import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

// ─── Deterministic hash ──────────────────────────────────────────────
function detHash(seed: number, salt: number): number {
  const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ─── Cypress foliage gradient (dark base → lighter tip) ───────────────
const CYPRESS_COLOR_BASE = new THREE.Color('#1a4d2e');
const CYPRESS_COLOR_TIP = new THREE.Color('#2d7a44');

// ─── Cypress column profile ───────────────────────────────────────────
// 12 control points: normalized height (0 = base, 1 = tip) → radius.
// Narrow base → quick widening → gentle mid-body bulge → long taper →
// rounded tip.  Max radius ≈ 0.94 to match the old tier-0 cone.
const CYPRESS_PROFILE: readonly number[] = [
  0.32, 0.58, 0.78, 0.90, 0.94, 0.92, 0.84, 0.72, 0.56, 0.38, 0.19, 0.03,
];

// ─── Reusable foliage geometry builder ────────────────────────────────
/**
 * Creates a smooth, continuous foliage body from a lathe profile.
 * Deterministic per-vertex radial displacement breaks rotational symmetry
 * for organic, non-geometric silhouette edges.  Vertex colors provide a
 * dark-base → lighter-tip gradient with a single mesh and single material.
 *
 * Created once per component instance (useMemo) — never per-frame.
 *
 * Reusable: pass a different profile array for stone pines (wide canopy)
 * or shrubs (short, round) in future phases.
 */
function buildFoliageGeometry(
  profile: readonly number[],
  height: number,
  widthScale: number,
  radialSegments: number,
  seed: number,
  displacement: number,
): THREE.LatheGeometry {
  // Build lathe profile points from the radius array
  const points: THREE.Vector2[] = profile.map((r, i) => {
    const t = i / (profile.length - 1);
    return new THREE.Vector2(Math.max(0.02, r * widthScale), t * height);
  });

  const geo = new THREE.LatheGeometry(points, radialSegments);

  // Break rotational symmetry: deterministic radial displacement per vertex.
  // Each vertex is pushed in/out by up to `displacement` fraction of its
  // radius, producing irregular, natural foliage edges.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    if (r > 0.02) {
      const h = detHash(seed, i);
      const scale = 1 + (h - 0.5) * 2 * displacement;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Vertex-color gradient: dark green base → lighter green tip
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, y / height));
    tmp.copy(CYPRESS_COLOR_BASE).lerp(CYPRESS_COLOR_TIP, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return geo;
}

// ─── Italian Cypress component ────────────────────────────────────────
/**
 * Mediterranean Cypress (Cupressus sempervirens)
 *
 * Phase 20.8: Replaces four stacked cone meshes with a single continuous
 * lathe-based foliage body.  The profile produces a tall, narrow columnar
 * silhouette with a gentle mid-body bulge and rounded tip.  Deterministic
 * per-vertex displacement creates organic, uneven foliage edges — no visible
 * tier breaks.
 *
 * Per-tree variation (height, width, tilt, profile shape) is preserved from
 * Phase 20.2–20.3 and applied to the continuous profile via per-height-band
 * multipliers.
 *
 * Mesh count: 4 per tree (2 planter + 1 trunk + 1 foliage), down from 7.
 * Foliage triangles: ~176 (12 profile steps × 8 radial × 2), vs ~114
 * across 4 cones — a modest increase for a much better silhouette.
 *
 * The buildFoliageGeometry utility is reusable for future stone pines and
 * shrubs by passing a different profile array.
 */
export const ItalianCypress: React.FC<{
  position: [number, number, number];
  scale?: number;
  seed?: number;
}> = ({ position, scale = 1.0, seed = 0 }) => {
  // Deterministic per-instance variation (preserved from Phase 20.2–20.3)
  const variation = useMemo(() => {
    const v1 = Math.sin(seed * 12.9898) * 43758.5453;
    const v2 = Math.sin(seed * 78.233) * 43758.5453;
    const v3 = Math.sin(seed * 37.719) * 43758.5453;
    // Per-height-band radius variation (from Phase 20.3 tier multipliers)
    const r1 = Math.sin(seed * 53.121 + 1.7) * 43758.5453;
    const r2 = Math.sin(seed * 97.837 + 3.3) * 43758.5453;
    const r3 = Math.sin(seed * 61.451 + 5.1) * 43758.5453;
    const r4 = Math.sin(seed * 83.693 + 7.7) * 43758.5453;
    return {
      heightMul: 0.94 + (v1 - Math.floor(v1)) * 0.12, // 0.94–1.06
      widthMul: 0.95 + (v2 - Math.floor(v2)) * 0.10,  // 0.95–1.05
      tilt: ((v3 - Math.floor(v3)) - 0.5) * 0.05,     // ±0.025 rad (~1.4°)
      bandMuls: [
        0.92 + (r1 - Math.floor(r1)) * 0.16,
        0.92 + (r2 - Math.floor(r2)) * 0.16,
        0.92 + (r3 - Math.floor(r3)) * 0.16,
        0.92 + (r4 - Math.floor(r4)) * 0.16,
      ] as [number, number, number, number],
    };
  }, [seed]);

  const { heightMul: h, widthMul: w, tilt, bandMuls } = variation;

  // Build the cypress foliage geometry: continuous lathe profile with
  // per-vertex displacement and vertex-color gradient.  Created once per tree.
  const foliageGeo = useMemo(() => {
    const foliageHeight = 5.8 * h;

    // Apply per-height-band multipliers to the base profile radii.
    // Each band covers ~25% of the height, smoothly interpolated so the
    // profile remains continuous (no tier breaks).
    const profile = CYPRESS_PROFILE.map((baseR, i) => {
      const t = i / (CYPRESS_PROFILE.length - 1);
      let bandMul: number;
      if (t < 0.25) {
        bandMul = bandMuls[0] + (bandMuls[1] - bandMuls[0]) * (t / 0.25);
      } else if (t < 0.50) {
        bandMul = bandMuls[1] + (bandMuls[2] - bandMuls[1]) * ((t - 0.25) / 0.25);
      } else if (t < 0.75) {
        bandMul = bandMuls[2] + (bandMuls[3] - bandMuls[2]) * ((t - 0.50) / 0.25);
      } else {
        bandMul = bandMuls[3];
      }
      return baseR * bandMul;
    });

    // Enforce monotonic taper: no upper point wider than the max below it.
    let maxR = 0;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > maxR) maxR = profile[i];
      else profile[i] = Math.min(profile[i], maxR);
    }

    return buildFoliageGeometry(profile, foliageHeight, w, 8, seed, 0.07);
  }, [h, w, bandMuls, seed]);

  // Dispose geometry on unmount (R3F does not auto-dispose prop geometries)
  useEffect(() => {
    return () => { foliageGeo.dispose(); };
  }, [foliageGeo]);

  return (
    <group position={position} scale={[scale, scale, scale]} rotation={[0, 0, tilt]}>
      {/* Stone Planter Base */}
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.7, 0.85, 0.5, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
      <mesh position={[0, 0.51, 0]}>
        <cylinderGeometry args={[0.62, 0.62, 0.05, 12]} />
        <meshStandardMaterial color="#452e1e" roughness={0.9} />
      </mesh>

      {/* Trunk */}
      <mesh castShadow position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 2.2, 8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
      </mesh>

      {/* Continuous Mediterranean Cypress Foliage
          Single lathe mesh with vertex-color gradient and organic displacement. */}
      <mesh castShadow geometry={foliageGeo} position={[0, 1.8, 0]}>
        <meshStandardMaterial vertexColors roughness={0.78} />
      </mesh>
    </group>
  );
};
