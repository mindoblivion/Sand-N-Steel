import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_TEXTURE } from './RomanMaterials';
import { FOUNTAIN_PBR, FOUNTAIN_SPEC } from '../../../utils/fountainSpec';

/**
 * CIVIC FOUNTAIN — the forum plaza's imperial Roman fountain, built to the
 * fountain brief:
 *
 *   A/B  modular game-ready parts, all parented to one `Fountain_Root`:
 *        `FountainBasePool` (tier 1), `FountainColumnTier` (tier 2),
 *        `FountainTopBasin` (tier 3), `FountainStatue` and `FountainWater`
 *        (shader planes). No part is one mega-mesh, so any tier can be
 *        hidden, LOD-ed or instanced on its own.
 *   C    PBR breakdown in `FOUNTAIN_PBR` — Carrara marble roughness 0.30,
 *        cracked/weathered marble 0.75, water 0.08, bronze patina 1.0
 *        metalness. All procedural: no texture download, bump canvases are
 *        clones that share the shared NOISE_TEXTURE image (zero memory).
 *   D    real-world scale from `FOUNTAIN_SPEC` — 6.5 m tall, 8 m base
 *        diameter, 2.2 m statue, pivot at the base centre on the ground.
 *        Collision is one analytic cylinder, never a mesh collider.
 *
 * Every repeated ornament (dentils, relief panels, shields, lion spouts,
 * columns, dolphin carvings, water streams) is a single InstancedMesh, so the
 * whole fountain stays around 45 draw calls and ~9k triangles — mobile-safe.
 */

// ── Shared transforms / geometry helpers ────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0);

/** Point on a horizontal ring, `angle` measured from +Z (matches three.js yaw). */
const polar = (angle: number, radius: number, y: number): [number, number, number] => [
  Math.sin(angle) * radius,
  y,
  Math.cos(angle) * radius,
];

const ringAngles = (count: number, offset = 0): number[] =>
  Array.from({ length: count }, (_, i) => offset + (i / count) * Math.PI * 2);

/** Quaternion that turns local +Y (an ornament's outward axis) onto the radius. */
const radial = (angle: number): THREE.Quaternion =>
  new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));

type Transform = {
  position: [number, number, number];
  quaternion?: THREE.Quaternion;
  scale?: [number, number, number];
};

/** One InstancedMesh for a family of identical ornaments: one draw call. */
const InstancedParts: React.FC<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  transforms: Transform[];
  castShadow?: boolean;
}> = ({ geometry, material, transforms, castShadow = true }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    transforms.forEach((transform, index) => {
      matrix.compose(
        position.set(...transform.position),
        transform.quaternion ?? identity,
        scale.set(...(transform.scale ?? [1, 1, 1])),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [transforms]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, transforms.length]}
      material={material}
      castShadow={castShadow}
      receiveShadow
    />
  );
};

/** Module-level geometries: created once, shared by every instance, never disposed. */
const GEOMETRY = {
  dentil: new THREE.BoxGeometry(0.14, 0.06, 0.14),
  reliefPanel: new THREE.BoxGeometry(0.52, 0.64, 0.07),
  shield: new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12),
  lionMane: new THREE.CylinderGeometry(0.2, 0.23, 0.11, 10),
  lionHead: new THREE.SphereGeometry(0.135, 10, 8),
  lionSnout: new THREE.ConeGeometry(0.075, 0.14, 8),
  swordBlade: new THREE.BoxGeometry(0.045, 0.44, 0.035),
  columnBase: new THREE.BoxGeometry(0.36, 0.12, 0.36),
  columnShaft: new THREE.CylinderGeometry(0.115, 0.135, 1.06, 10),
  columnCapital: new THREE.CylinderGeometry(0.2, 0.15, 0.12, 10),
  columnAbacus: new THREE.BoxGeometry(0.4, 0.06, 0.4),
  eagle: new THREE.BoxGeometry(0.26, 0.2, 0.07),
  dolphin: new THREE.SphereGeometry(0.14, 8, 6),
  waterStream: new THREE.CylinderGeometry(0.045, 0.03, 1, 8, 1, true),
};

// ── Materials (PBR sheet) ───────────────────────────────────────────────────

type FountainMaterials = {
  polished: THREE.MeshStandardMaterial;
  weathered: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
};

const createMarble = (color: string, roughness: number, bumpScale: number, tiling: number) => {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    // Lathe basins are revolved closed surfaces viewed from both faces.
    side: THREE.DoubleSide,
  });
  if (NOISE_TEXTURE) {
    const bump = NOISE_TEXTURE.clone();
    bump.repeat.set(tiling, tiling);
    bump.needsUpdate = true;
    material.bumpMap = bump;
    material.bumpScale = bumpScale;
  }
  return material;
};

const useFountainMaterials = (): FountainMaterials => {
  const materials = useMemo<FountainMaterials>(() => ({
    polished: createMarble(
      FOUNTAIN_PBR.polishedMarble.color,
      FOUNTAIN_PBR.polishedMarble.roughness,
      FOUNTAIN_PBR.polishedMarble.bumpScale,
      4,
    ),
    weathered: createMarble(
      FOUNTAIN_PBR.weatheredMarble.color,
      FOUNTAIN_PBR.weatheredMarble.roughness,
      FOUNTAIN_PBR.weatheredMarble.bumpScale,
      6,
    ),
    bronze: new THREE.MeshStandardMaterial({ ...FOUNTAIN_PBR.bronzePatina, side: THREE.DoubleSide }),
  }), []);

  useEffect(() => () => {
    const bumps = [materials.polished.bumpMap, materials.weathered.bumpMap];
    materials.polished.dispose();
    materials.weathered.dispose();
    materials.bronze.dispose();
    bumps.forEach((bump) => bump?.dispose());
  }, [materials]);

  return materials;
};

// ── Water shader (Step B.5 / material 05) ───────────────────────────────────

const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 displaced = position;
    // The basin planes are rotated -90° about X, so local +Z is world up.
    displaced.z += sin(position.x * 3.4 + uTime * 1.6) * cos(position.y * 3.1 - uTime * 1.2) * 0.02;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  varying vec2 vUv;
  void main() {
    float radial = length(vUv - 0.5) * 2.0;
    float rings = sin(radial * 26.0 - uTime * 2.4) * 0.5 + 0.5;
    float shimmer = sin(vUv.x * 34.0 + uTime * 1.9) * sin(vUv.y * 28.0 - uTime * 1.4);
    float sheen = smoothstep(0.55, 1.0, radial) * 0.5;
    vec3 colour = mix(uDeep, uShallow, clamp(0.34 + rings * 0.36 + shimmer * 0.2 + sheen, 0.0, 1.0));
    gl_FragColor = vec4(colour, 0.86);
  }
`;

const useWaterMaterial = () => {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#1d5875') },
      uShallow: { value: new THREE.Color(FOUNTAIN_PBR.water.color) },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => material.dispose(), [material]);
  return material;
};

// ── Reusable ornaments ──────────────────────────────────────────────────────

/** Carved lion-head spout ring: mane + head + snout, three instanced meshes. */
const LionSpouts: React.FC<{
  count: number;
  radius: number;
  y: number;
  scale?: number;
  material: THREE.Material;
}> = ({ count, radius, y, scale = 1, material }) => {
  const parts = useMemo(() => {
    const angles = ringAngles(count);
    return {
      mane: angles.map<Transform>((angle) => ({
        position: polar(angle, radius, y),
        quaternion: radial(angle),
        scale: [scale, scale, scale],
      })),
      head: angles.map<Transform>((angle) => ({
        position: polar(angle, radius + 0.08 * scale, y),
        quaternion: radial(angle),
        scale: [scale, scale * 1.35, scale],
      })),
      snout: angles.map<Transform>((angle) => ({
        position: polar(angle, radius + 0.2 * scale, y - 0.02 * scale),
        quaternion: radial(angle),
        scale: [scale, scale, scale],
      })),
    };
  }, [count, radius, y, scale]);

  return (
    <group name="Fountain_LionSpouts">
      <InstancedParts geometry={GEOMETRY.lionMane} material={material} transforms={parts.mane} />
      <InstancedParts geometry={GEOMETRY.lionHead} material={material} transforms={parts.head} />
      <InstancedParts geometry={GEOMETRY.lionSnout} material={material} transforms={parts.snout} />
    </group>
  );
};

/** A statue limb: a capsule spanning two local points. */
const Limb: React.FC<{
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  material: THREE.Material;
}> = ({ from, to, radius, material }) => {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = new THREE.Vector3().subVectors(end, start);
    const span = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: rotation,
      length: span,
    };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow receiveShadow>
      <capsuleGeometry args={[radius, Math.max(length - radius * 2, 0.02), 3, 8]} />
    </mesh>
  );
};

// ── Tier 1: base pool ───────────────────────────────────────────────────────

export const FountainBasePool = React.memo(() => {
  const materials = useFountainMaterials();

  const basin = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(3.5, 0.3),
    new THREE.Vector2(3.52, 0.46),
    new THREE.Vector2(3.56, 1.06),
    new THREE.Vector2(3.62, 1.22),
    new THREE.Vector2(3.66, 1.32),
    new THREE.Vector2(3.86, 1.32),
    new THREE.Vector2(3.84, 1.1),
    new THREE.Vector2(3.76, 0.56),
    new THREE.Vector2(3.6, 0.36),
    new THREE.Vector2(3.5, 0.3),
  ], 56), []);
  useEffect(() => () => basin.dispose(), [basin]);

  // Greek-key / dentil band on the upper foundation step (instanced).
  const dentils = useMemo<Transform[]>(
    () => ringAngles(44).map((angle, index) => ({
      position: polar(angle, 3.93, 0.245),
      quaternion: radial(angle),
      scale: [1, 1, index % 2 === 0 ? 1 : 0.6] as [number, number, number],
    })),
    [],
  );

  // Figure reliefs and round shields around the outer wall.
  const reliefs = useMemo<Transform[]>(
    () => ringAngles(12, Math.PI / 12).map((angle) => ({
      position: polar(angle, 3.68, 0.7),
      quaternion: radial(angle),
    })),
    [],
  );
  const shields = useMemo<Transform[]>(
    () => ringAngles(12).map((angle) => ({
      position: polar(angle, 3.62, 0.94),
      quaternion: radial(angle),
    })),
    [],
  );

  return (
    <group name="Fountain_BasePool">
      {/* Stepped foundation — the 8 m cylinder collider stands on this edge. */}
      <mesh position={[0, 0.09, 0]} material={materials.weathered} castShadow receiveShadow>
        <cylinderGeometry args={[FOUNTAIN_SPEC.baseRadius - 0.02, FOUNTAIN_SPEC.baseRadius, 0.18, 56]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={materials.weathered} castShadow receiveShadow>
        <cylinderGeometry args={[3.9, 3.94, 0.14, 56]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.dentil} material={materials.weathered} transforms={dentils} />

      {/* Carved basin: revolved closed profile, wall top at 1.32 m. */}
      <mesh geometry={basin} material={materials.weathered} castShadow receiveShadow />
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.weathered} receiveShadow>
        <circleGeometry args={[3.5, 56]} />
      </mesh>

      {/* Relief sculpture band and bronze-bound votive shields. */}
      <InstancedParts geometry={GEOMETRY.reliefPanel} material={materials.weathered} transforms={reliefs} />
      <InstancedParts geometry={GEOMETRY.shield} material={materials.bronze} transforms={shields} />

      {/* Eight lion-head spouts along the rim. */}
      <LionSpouts count={8} radius={3.7} y={1.16} material={materials.weathered} />
    </group>
  );
});

// ── Tier 2: columned middle basin ───────────────────────────────────────────

export const FountainColumnTier = React.memo(() => {
  const materials = useFountainMaterials();

  const pedestal = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(1.34, 1.3),
    new THREE.Vector2(1.42, 1.38),
    new THREE.Vector2(1.36, 1.62),
    new THREE.Vector2(1.3, 1.9),
    new THREE.Vector2(1.38, 2.0),
    new THREE.Vector2(1.3, 2.05),
    new THREE.Vector2(0, 2.05),
  ], 32), []);
  useEffect(() => () => pedestal.dispose(), [pedestal]);

  const basin = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(1.55, 3.46),
    new THREE.Vector2(1.57, 3.6),
    new THREE.Vector2(1.62, 3.78),
    new THREE.Vector2(1.68, 3.9),
    new THREE.Vector2(1.72, 3.92),
    new THREE.Vector2(1.98, 3.92),
    new THREE.Vector2(1.96, 3.78),
    new THREE.Vector2(1.86, 3.6),
    new THREE.Vector2(1.7, 3.48),
    new THREE.Vector2(1.55, 3.46),
  ], 40), []);
  useEffect(() => () => basin.dispose(), [basin]);

  const columnAngles = useMemo(() => ringAngles(8), []);
  const columnBase = useMemo<Transform[]>(
    () => columnAngles.map((angle) => ({ position: polar(angle, 1.72, 2.2), quaternion: radial(angle) })),
    [columnAngles],
  );
  const columnShaft = useMemo<Transform[]>(
    () => columnAngles.map((angle) => ({ position: polar(angle, 1.72, 2.82) })),
    [columnAngles],
  );
  const columnCapital = useMemo<Transform[]>(
    () => columnAngles.map((angle) => ({ position: polar(angle, 1.72, 3.38) })),
    [columnAngles],
  );
  const columnAbacus = useMemo<Transform[]>(
    () => columnAngles.map((angle) => ({ position: polar(angle, 1.72, 3.45), quaternion: radial(angle) })),
    [columnAngles],
  );

  // Crossed swords and wreaths carved into the central pillar.
  const swords = useMemo<Transform[]>(
    () => ringAngles(4, Math.PI / 4).flatMap((angle) => [0.16, -0.16].map<Transform>((tilt) => ({
      position: polar(angle, 1.36, 1.6),
      quaternion: radial(angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)),
    }))),
    [],
  );

  // Eagle reliefs on the middle basin rim.
  const eagles = useMemo<Transform[]>(
    () => ringAngles(4).map((angle) => ({ position: polar(angle, 1.93, 3.74), quaternion: radial(angle) })),
    [],
  );

  return (
    <group name="Fountain_ColumnTier">
      {/* Central pedestal rising out of the base pool. */}
      <mesh geometry={pedestal} material={materials.polished} castShadow receiveShadow />
      <mesh position={[0, 1.55, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.weathered} castShadow>
        <torusGeometry args={[1.35, 0.055, 6, 32]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.swordBlade} material={materials.weathered} transforms={swords} />

      {/* Corinthian colonnade carrying the middle basin. */}
      <mesh position={[0, 2.1, 0]} material={materials.weathered} castShadow receiveShadow>
        <cylinderGeometry args={[1.98, 2.02, 0.1, 32]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.columnBase} material={materials.polished} transforms={columnBase} />
      <InstancedParts geometry={GEOMETRY.columnShaft} material={materials.polished} transforms={columnShaft} />
      <InstancedParts geometry={GEOMETRY.columnCapital} material={materials.polished} transforms={columnCapital} />
      <InstancedParts geometry={GEOMETRY.columnAbacus} material={materials.polished} transforms={columnAbacus} />

      {/* Middle basin with garland rim and lion-head spouts. */}
      <mesh geometry={basin} material={materials.weathered} castShadow receiveShadow />
      <mesh position={[0, 3.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.weathered} receiveShadow>
        <circleGeometry args={[1.55, 40]} />
      </mesh>
      <mesh position={[0, 3.86, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.polished} castShadow>
        <torusGeometry args={[1.85, 0.045, 6, 32]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.eagle} material={materials.polished} transforms={eagles} />
      <LionSpouts count={6} radius={1.9} y={3.82} scale={0.62} material={materials.weathered} />
    </group>
  );
});

// ── Tier 3: top basin ───────────────────────────────────────────────────────

export const FountainTopBasin = React.memo(() => {
  const materials = useFountainMaterials();

  const basin = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0.8, 4.22),
    new THREE.Vector2(0.83, 4.34),
    new THREE.Vector2(0.87, 4.46),
    new THREE.Vector2(0.9, 4.52),
    new THREE.Vector2(1.08, 4.52),
    new THREE.Vector2(1.06, 4.4),
    new THREE.Vector2(0.96, 4.26),
    new THREE.Vector2(0.8, 4.22),
  ], 32), []);
  useEffect(() => () => basin.dispose(), [basin]);

  // Dolphin carvings around the rim.
  const dolphins = useMemo<Transform[]>(
    () => ringAngles(6).map((angle) => ({
      position: polar(angle, 1.0, 4.49),
      quaternion: radial(angle),
      scale: [1.2, 0.55, 0.55],
    })),
    [],
  );

  return (
    <group name="Fountain_TopBasin">
      <mesh position={[0, 4.05, 0]} material={materials.polished} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.66, 0.3, 16]} />
      </mesh>
      <mesh position={[0, 3.95, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.weathered} castShadow>
        <torusGeometry args={[0.62, 0.04, 6, 24]} />
      </mesh>
      <mesh geometry={basin} material={materials.polished} castShadow receiveShadow />
      <mesh position={[0, 4.24, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.polished} receiveShadow>
        <circleGeometry args={[0.8, 32]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.dolphin} material={materials.polished} transforms={dolphins} />
    </group>
  );
});

// ── Statue: the emperor in the upper bowl (2.2 m) ───────────────────────────

export const FountainStatue: React.FC<{ tone?: 'marble' | 'bronze' }> = React.memo(({ tone = 'marble' }) => {
  const materials = useFountainMaterials();
  const material = tone === 'bronze' ? materials.bronze : materials.polished;

  const robe = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.08),
    new THREE.Vector2(0.3, 0.1),
    new THREE.Vector2(0.33, 0.16),
    new THREE.Vector2(0.29, 0.6),
    new THREE.Vector2(0.25, 1.0),
    new THREE.Vector2(0.235, 1.24),
    new THREE.Vector2(0.26, 1.44),
    new THREE.Vector2(0.255, 1.62),
    new THREE.Vector2(0.19, 1.74),
    new THREE.Vector2(0.11, 1.82),
    new THREE.Vector2(0, 1.88),
  ], 24), []);
  useEffect(() => () => robe.dispose(), [robe]);

  return (
    <group name="Fountain_Statue" position={[0, FOUNTAIN_SPEC.statueBaseY, 0]}>
      <mesh position={[0, 0.05, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.1, 16]} />
      </mesh>

      {/* Toga: revolved robe silhouette. */}
      <mesh geometry={robe} material={material} castShadow receiveShadow />

      {/* Draped folds over the left shoulder and down the body. */}
      <mesh position={[0, 0.72, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.35, 1.16, 14, 1, true, Math.PI * 0.55, Math.PI * 0.95]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.34, 14, 1, true, Math.PI * 0.75, Math.PI * 1.1]} />
      </mesh>

      {/* Neck and head; the top of the head is exactly 6.50 m in world space. */}
      <mesh position={[0, 1.92, 0]} material={material} castShadow>
        <cylinderGeometry args={[0.075, 0.085, 0.12, 10]} />
      </mesh>
      <mesh position={[0, 2.045, 0]} material={material} castShadow>
        <sphereGeometry args={[0.155, 14, 12]} />
      </mesh>
      <mesh position={[0, 2.02, 0.15]} rotation={[Math.PI / 2, 0, 0]} material={material} castShadow>
        <coneGeometry args={[0.03, 0.07, 8]} />
      </mesh>
      {/* Laurel wreath. */}
      <mesh position={[0, 2.06, 0]} rotation={[Math.PI / 2, 0, 0]} material={material} castShadow>
        <torusGeometry args={[0.15, 0.028, 6, 18]} />
      </mesh>

      {/* Right arm raised in the imperial adlocutio gesture, left holding a scroll. */}
      <Limb from={[0.23, 1.7, 0.02]} to={[0.38, 1.84, 0.16]} radius={0.055} material={material} />
      <Limb from={[0.38, 1.84, 0.16]} to={[0.42, 2.0, 0.36]} radius={0.05} material={material} />
      <mesh position={[0.42, 2.0, 0.36]} material={material} castShadow>
        <sphereGeometry args={[0.055, 8, 8]} />
      </mesh>
      <Limb from={[-0.23, 1.7, 0.02]} to={[-0.32, 1.5, 0.1]} radius={0.055} material={material} />
      <Limb from={[-0.32, 1.5, 0.1]} to={[-0.28, 1.34, 0.24]} radius={0.05} material={material} />
      <mesh position={[-0.28, 1.34, 0.26]} rotation={[0, 0, Math.PI / 2.6]} material={material} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.22, 8]} />
      </mesh>
    </group>
  );
});

// ── Water: shader planes plus the cascade streams ───────────────────────────

export const FountainWater = React.memo(() => {
  const material = useWaterMaterial();

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  // Middle basin overflowing into the base pool; top basin into the middle one.
  const cascades = useMemo<Transform[]>(() => ringAngles(6).map((angle) => ({
    position: polar(angle, 1.93, 2.46),
    scale: [1, 2.8, 1],
  })), []);
  const topCascades = useMemo<Transform[]>(() => ringAngles(6, Math.PI / 6).map((angle) => ({
    position: polar(angle, 1.0, 4.14),
    scale: [1, 0.66, 1],
  })), []);

  return (
    <group name="Fountain_Water">
      <mesh position={[0, FOUNTAIN_SPEC.water.base.y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <circleGeometry args={[FOUNTAIN_SPEC.water.base.radius, 48]} />
      </mesh>
      <mesh position={[0, FOUNTAIN_SPEC.water.middle.y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <circleGeometry args={[FOUNTAIN_SPEC.water.middle.radius, 40]} />
      </mesh>
      <mesh position={[0, FOUNTAIN_SPEC.water.top.y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <circleGeometry args={[FOUNTAIN_SPEC.water.top.radius, 32]} />
      </mesh>
      <InstancedParts geometry={GEOMETRY.waterStream} material={material} transforms={cascades} castShadow={false} />
      <InstancedParts geometry={GEOMETRY.waterStream} material={material} transforms={topCascades} castShadow={false} />
    </group>
  );
});

// ── Assembly: the single root the tiers hang from ───────────────────────────

export const CivicFountain: React.FC<{ statueTone?: 'marble' | 'bronze' }> = ({ statueTone }) => (
  <group name="Fountain_Root" position={[0, 0, 0]}>
    <FountainBasePool />
    <FountainColumnTier />
    <FountainTopBasin />
    <FountainStatue tone={statueTone} />
    <FountainWater />
  </group>
);
