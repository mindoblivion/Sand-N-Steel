import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE, sharedMaterials } from './RomanMaterials';

/**
 * PHASE 27 — ROMAN STONE-PAVED STREETS & ANCIENT ROAD SURFACE REALISM
 *
 * Provides authentic ancient Roman urban road surfaces:
 * - Large irregular stone slabs (~0.8m - 1.4m)
 * - Restrained 0.015m - 0.025m mortar joints with visible dark bedding underneath
 * - Shallow surface relief (0.008m - 0.016m above mortar bed)
 * - District-specific stone character (Triumphal, Civic, Commercial, Military, Rustic)
 * - Parallel cart wheel grooves (sulci / orbitae) on heavy transit avenues (Via Decumanus)
 * - Shallow roadside drainage gutters along curbs
 * - Authentic Pompeian pedestrian stepping crossing stones (pondera)
 * - 100% Instanced single-draw-call geometry per street segment for extreme 60fps performance
 */

export type RoadDistrict = 'triumphal' | 'civic' | 'commercial' | 'military' | 'rustic';

// Deterministic hash for non-flickering procedural variation
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// District stone color palettes
const DISTRICT_PALETTES: Record<RoadDistrict, string[]> = {
  triumphal: ['#e2d5c1', '#dbcaaF', '#ecdcc6', '#dfcfb7', '#d5c3aa'],
  civic: ['#d6c4a8', '#caa478', '#dfceb5', '#c8b69b', '#bfa98d'],
  commercial: ['#b8a892', '#a89680', '#c2b29c', '#9c8b75', '#8c7d6b'],
  military: ['#73685e', '#635b54', '#80756a', '#5c544d', '#6e6358'],
  rustic: ['#b39c7f', '#a48c6f', '#8f7b60', '#bfa98b', '#9d876b'],
};

// Reusable unit box geometry for instanced stones
const UNIT_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const DUMMY = new THREE.Object3D();
const COLOR_HELPER = new THREE.Color();

export interface RomanPavedStreetProps {
  /** Length of the road along primary axis (meters) */
  length: number;
  /** Width of the road across secondary axis (meters) */
  width: number;
  /** Primary travel axis: 'z' (default, north-south) or 'x' (east-west) */
  axis?: 'x' | 'z';
  /** District architectural character */
  district?: RoadDistrict;
  /** Whether to render wheel-worn chariot/cart groove ruts */
  hasWheelRuts?: boolean;
  /** Whether to render marginal drainage gutters along edges */
  hasGutters?: boolean;
  /** Width of roadside gutter drain stone (default 0.35m) */
  gutterWidth?: number;
  /** Average stone pitch/dimension (default ~1.15m) */
  stonePitch?: number;
  /** World position [x, y, z] */
  position?: [number, number, number];
  /** Rotation in radians [rx, ry, rz] */
  rotation?: [number, number, number];
}

/**
 * RomanPavedStreet
 * Renders an authentic Roman paved street segment using instanced irregular stone slabs,
 * recessed mortar bedding, roadside drainage gutters, and optional cart wheel ruts.
 */
export const RomanPavedStreet: React.FC<RomanPavedStreetProps> = ({
  length,
  width,
  axis = 'z',
  district = 'civic',
  hasWheelRuts = false,
  hasGutters = true,
  gutterWidth = 0.35,
  stonePitch = 1.15,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Determine span along length and width based on axis
  // By convention, in local coordinates:
  // L = span along local Z, W = span along local X.
  // If axis === 'x', we rotate the inner group by Math.PI / 2 so internal math is identical.
  const spanL = length;
  const spanW = width;

  // Calculate stones data deterministically
  const stonesData = useMemo(() => {
    const palette = DISTRICT_PALETTES[district] || DISTRICT_PALETTES.civic;
    const items: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rotY: number;
      color: string;
    }> = [];

    const effectiveWidth = hasGutters ? spanW - gutterWidth * 2 : spanW;
    const cols = Math.max(2, Math.round(effectiveWidth / stonePitch));
    const rows = Math.max(3, Math.round(spanL / stonePitch));

    const colStep = effectiveWidth / cols;
    const rowStep = spanL / rows;

    let seedCounter = 1;

    for (let r = 0; r < rows; r++) {
      const isStaggered = r % 2 === 1;
      const zBase = -spanL / 2 + (r + 0.5) * rowStep;

      for (let c = 0; c < cols; c++) {
        seedCounter++;
        const rand1 = pseudoRandom(seedCounter * 3.17);
        const rand2 = pseudoRandom(seedCounter * 7.43);
        const rand3 = pseudoRandom(seedCounter * 11.89);
        const rand4 = pseudoRandom(seedCounter * 17.21);

        // Stagger every other row by half column step (typical Roman opus incertum)
        const staggerOffset = isStaggered ? colStep * 0.45 : 0;
        let xBase = -effectiveWidth / 2 + (c + 0.5) * colStep + staggerOffset;

        // Keep within bounds
        if (xBase < -effectiveWidth / 2) xBase += effectiveWidth;
        if (xBase > effectiveWidth / 2) xBase -= effectiveWidth;

        // Slab dimensions with subtle natural variations (0.8m to 1.4m)
        const sx = Math.max(0.65, colStep * (0.86 + (rand1 - 0.5) * 0.18));
        const sz = Math.max(0.65, rowStep * (0.86 + (rand2 - 0.5) * 0.2));
        const sy = 0.022; // Slab thickness

        // Subtle height jitter (0.008m to 0.015m above bedding)
        const yBase = 0.01 + (rand3 - 0.5) * 0.004;

        // Very restrained yaw rotation (max ±0.03 rad)
        const rotY = (rand4 - 0.5) * 0.04;

        // Color selection
        const colorIdx = Math.floor(rand1 * palette.length) % palette.length;
        const color = palette[colorIdx];

        items.push({
          x: xBase,
          y: yBase,
          z: zBase,
          sx,
          sy,
          sz,
          rotY,
          color,
        });
      }
    }

    return items;
  }, [spanL, spanW, district, hasGutters, gutterWidth, stonePitch]);

  // Apply transforms and colors to InstancedMesh instances
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || stonesData.length === 0) return;

    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(stonesData.length * 3),
        3
      );
    }

    stonesData.forEach((st, i) => {
      DUMMY.position.set(st.x, st.y, st.z);
      DUMMY.scale.set(st.sx, st.sy, st.sz);
      DUMMY.rotation.set(0, st.rotY, 0);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);

      COLOR_HELPER.set(st.color);
      mesh.setColorAt(i, COLOR_HELPER);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
  }, [stonesData]);

  // Orientation adjustment for 'x' axis
  const internalRotation: [number, number, number] =
    axis === 'x' ? [rotation[0], rotation[1] + Math.PI / 2, rotation[2]] : rotation;

  return (
    <group position={position} rotation={internalRotation}>
      {/* 1. MORTAR / BEDDING SUB-LAYER (Statumen / Nucleus) */}
      {/* Dark mortar bedding exposed through the 0.015m gaps between slabs */}
      <mesh receiveShadow position={[0, -0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spanW, spanL]} />
        <primitive object={sharedMaterials.roadMortarBed} attach="material" />
      </mesh>

      {/* 2. INSTANCED ROMAN STONE SLABS (Summum Dorsum) */}
      {stonesData.length > 0 && (
        <instancedMesh
          ref={meshRef}
          args={[UNIT_BOX_GEO, undefined, stonesData.length]}
          receiveShadow
          castShadow={false}
        >
          <meshStandardMaterial
            roughness={ROMAN_PALETTE.roadFlagstone.roughness}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.018}
          />
        </instancedMesh>
      )}

      {/* 3. ROADSIDE GUTTER DRAIN MARGINS (Cunetta / Drainage Stone) */}
      {hasGutters && (
        <>
          {/* Left curb gutter drain stone */}
          <mesh
            receiveShadow
            position={[-spanW / 2 + gutterWidth / 2, 0.004, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[gutterWidth, spanL]} />
            <primitive object={sharedMaterials.roadGutter} attach="material" />
          </mesh>
          {/* Right curb gutter drain stone */}
          <mesh
            receiveShadow
            position={[spanW / 2 - gutterWidth / 2, 0.004, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[gutterWidth, spanL]} />
            <primitive object={sharedMaterials.roadGutter} attach="material" />
          </mesh>
        </>
      )}

      {/* 4. CART WHEEL GROOVES (Sulci / Orbitae) */}
      {/* Polished twin parallel depressions matching ancient 1.4m Roman axle gauge */}
      {hasWheelRuts && (
        <>
          {[-0.7, 0.7].map((rx, ri) => (
            <mesh
              key={`rut-${ri}`}
              receiveShadow
              position={[rx, 0.012, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.24, spanL]} />
              <primitive object={sharedMaterials.wheelRut} attach="material" />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
};

/**
 * RomanPedestrianCrossing
 * Authentic Pompeian raised crossing stones (pondera):
 * Raised, rounded travertine blocks placed across the road so pedestrians could cross dry-shod,
 * spaced with gaps positioned exactly for chariot and cart wheel tracks.
 */
export const RomanPedestrianCrossing: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  width?: number;
}> = ({ position, rotationY = 0, width = 8 }) => {
  // Typical Pompeian crossing: 3 stones across the carriageway with 2 cart-wheel gaps
  const stonePositions = [-width * 0.28, 0, width * 0.28];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {stonePositions.map((sx, i) => (
        <group key={`pondus-${i}`} position={[sx, 0, 0]}>
          {/* Raised beveled stepping block */}
          <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
            <boxGeometry args={[0.85, 0.16, 0.55]} />
            <primitive object={sharedMaterials.crossingStone} attach="material" />
          </mesh>
          {/* Foot-worn crown on stepping stone */}
          <mesh position={[0, 0.172, 0]}>
            <boxGeometry args={[0.65, 0.005, 0.4]} />
            <meshStandardMaterial
              color="#ede0cc"
              roughness={0.65}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.01}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};
