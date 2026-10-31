import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARENA_INTERIOR_COLORS,
  getArenaRingPaintTexture,
  getArenaSandTexture,
  getArenaTierTexture,
  getPodiumWallTexture,
} from '../../utils/arenaInteriorTextures';

const GATE_GRILLE_WIDTH = 5.2;
const GATE_GRILLE_HEIGHT = 4.4;
const GATE_BAR_THICKNESS = 0.16;
const GATE_VERTICAL_BARS = 7;
const GATE_HORIZONTAL_BARS = 4;

/** Bake one flat colour into a geometry's vertex colours (dressings are one
 * material, so the palette reaches them per-vertex — still one draw call). */
function colorizeGeometry(
  geometry: THREE.BufferGeometry,
  color: string,
): THREE.BufferGeometry {
  const tint = new THREE.Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Merge the parts into one geometry and release the pieces. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged ?? new THREE.BoxGeometry(GATE_GRILLE_WIDTH, GATE_GRILLE_HEIGHT, 0.2);
}

/** The merged bar grille: bars standing proud of the dark inset plane.
 * Exported so the suite can build the real geometry (the merge is executed,
 * not grepped) — the component is still the only thing that renders it. */
export function buildPortcullisGrilleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // The dark inset plane, recessed 0.14 behind the bars. It is merged into the
  // grille's own geometry so the whole gate stays ONE mesh: the bars
  // self-shadow onto it, which is what makes the grille read as barred rather
  // than as a slab.
  const inset = new THREE.BoxGeometry(GATE_GRILLE_WIDTH, GATE_GRILLE_HEIGHT, 0.08);
  inset.translate(0, 0, -0.1);
  parts.push(inset);

  const pitchX = GATE_GRILLE_WIDTH / (GATE_VERTICAL_BARS - 1);
  for (let i = 0; i < GATE_VERTICAL_BARS; i += 1) {
    const bar = new THREE.BoxGeometry(
      GATE_BAR_THICKNESS,
      GATE_GRILLE_HEIGHT,
      GATE_BAR_THICKNESS,
    );
    bar.translate(-GATE_GRILLE_WIDTH / 2 + pitchX * i, 0, 0);
    parts.push(bar);
  }

  const pitchY = GATE_GRILLE_HEIGHT / (GATE_HORIZONTAL_BARS - 1);
  for (let i = 0; i < GATE_HORIZONTAL_BARS; i += 1) {
    const bar = new THREE.BoxGeometry(
      GATE_GRILLE_WIDTH,
      GATE_BAR_THICKNESS,
      GATE_BAR_THICKNESS,
    );
    bar.translate(0, -GATE_GRILLE_HEIGHT / 2 + pitchY * i, 0);
    parts.push(bar);
  }

  return mergeParts(parts);
}

/**
 * Porta Triumphalis (−Z): a laurel swag over the lintel (one torus arc plus its
 * leaf cones, CypressGreen), one GoldTrim boss disc at its centre, and two
 * BronzeAged chain runs hanging from the lintel — all merged into ONE mesh.
 */
export function buildTriumphalisDressingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const swag = ARENA_INTERIOR_COLORS.cypressGreen;

  // The swag: a shallow arc of a very large circle, hung just over the lintel
  // (its ends at y≈2.80, its centre dipping to y≈2.50).
  const SWAG_RADIUS = 16.2;
  const SWAG_START = 4.519;
  const SWAG_SPAN = 0.386;
  const SWAG_CENTER_Y = 18.7;
  const SWAG_Z = -0.34;

  const arc = new THREE.TorusGeometry(SWAG_RADIUS, 0.05, 4, 12, SWAG_SPAN);
  arc.rotateZ(SWAG_START);
  arc.translate(0, SWAG_CENTER_Y, SWAG_Z);
  parts.push(colorizeGeometry(arc, swag));

  // Its leaves, following the same arc.
  const LEAVES = 13;
  for (let i = 0; i < LEAVES; i += 1) {
    const angle = SWAG_START + (SWAG_SPAN * i) / (LEAVES - 1);
    const leaf = new THREE.ConeGeometry(0.11, 0.34, 5);
    leaf.rotateZ(angle + Math.PI / 2);
    leaf.translate(
      Math.cos(angle) * SWAG_RADIUS,
      SWAG_CENTER_Y + Math.sin(angle) * SWAG_RADIUS,
      SWAG_Z,
    );
    parts.push(colorizeGeometry(leaf, swag));
  }

  // One GoldTrim boss disc at the swag's middle.
  const boss = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, 2.42, -0.42);
  parts.push(colorizeGeometry(boss, ARENA_INTERIOR_COLORS.goldTrim));

  // Two BronzeAged chain runs hanging either side of the opening.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      const link = new THREE.TorusGeometry(0.075, 0.022, 4, 8);
      if (i % 2 === 0) link.rotateX(Math.PI / 2);
      link.translate(side * 2.6, 2.0 - i * 0.22, -0.36);
      parts.push(colorizeGeometry(link, ARENA_INTERIOR_COLORS.bronzeAged));
    }
  }

  return mergeParts(parts);
}

/**
 * Porta Libitinaria (+Z): one small BronzeAged plaque, and nothing else — no
 * laurel and no gold. Merged into ONE mesh, exactly like its opposite.
 */
export function buildLibitinariaDressingGeometry(): THREE.BufferGeometry {
  const plaque = new THREE.BoxGeometry(0.9, 0.5, 0.06);
  plaque.translate(0, 2.42, -0.36);
  return mergeParts([colorizeGeometry(plaque, ARENA_INTERIOR_COLORS.bronzeAged)]);
}

export const ARENA_CROWD_SILHOUETTE_COUNT = 56;

export interface ArenaCrowdSilhouette {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
}

/** Preserve the shipped 28-per-tier crowd positions, sizes and tunic colours. */
export function buildArenaCrowdSilhouettePlacement(): ArenaCrowdSilhouette[] {
  const spectators: ArenaCrowdSilhouette[] = [];
  for (let ci = 0; ci < 28; ci += 1) {
    const angle = (ci / 28) * Math.PI * 2;
    const rad1 = 22.2;
    const rad2 = 25.8;
    spectators.push({
      position: [Math.cos(angle) * rad1, 7.8, Math.sin(angle) * rad1],
      size: [1.2, 1.4, 0.8],
      color: ci % 3 === 0 ? '#991b1b' : ci % 2 === 0 ? '#f5f5f4' : '#78350f',
    });
    spectators.push({
      position: [Math.cos(angle) * rad2, 11.2, Math.sin(angle) * rad2],
      size: [1.4, 1.5, 0.8],
      color: ci % 2 === 0 ? '#b45309' : '#e5e5e5',
    });
  }
  return spectators;
}

/** Fill one instanced mesh: same silhouettes, one draw call instead of 56. */
export function fillArenaCrowdInstances(
  mesh: THREE.InstancedMesh,
  spectators: readonly ArenaCrowdSilhouette[],
): void {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  spectators.forEach((spectator, index) => {
    dummy.position.set(...spectator.position);
    dummy.scale.set(...spectator.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, tint.set(spectator.color));
  });
  mesh.count = spectators.length;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** The old 56 separate crowd boxes, consolidated into one managed R3F draw call. */
const ArenaCrowd: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spectators = useMemo(() => buildArenaCrowdSilhouettePlacement(), []);
  useLayoutEffect(() => {
    if (meshRef.current) fillArenaCrowdInstances(meshRef.current, spectators);
  }, [spectators]);
  return (
    <instancedMesh
      ref={meshRef}
      args={[null!, null!, ARENA_CROWD_SILHOUETTE_COUNT]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
};

export const DuelArena: React.FC = () => {
  const arenaTextures = useMemo(
    () => ({
      sand: getArenaSandTexture() ?? undefined,
      ringPaint: getArenaRingPaintTexture() ?? undefined,
      wall: getPodiumWallTexture() ?? undefined,
      tiers: getArenaTierTexture() ?? undefined,
    }),
    [],
  );
  const gateGeometry = useMemo(
    () => ({
      grille: buildPortcullisGrilleGeometry(),
      triumphalis: buildTriumphalisDressingGeometry(),
      libitinaria: buildLibitinariaDressingGeometry(),
    }),
    [],
  );

  return (
    <group>
      {/* 1. ARENA CIRCULAR SAND PIT (WARM GOLDEN BLOOD-STAINED ARENA SAND) */}
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20, 36]} />
        <meshStandardMaterial map={arenaTextures.sand} color={arenaTextures.sand ? '#ffffff' : '#c29b62'} roughness={0.92} />
      </mesh>

      {/* Center Combat Ring Marking */}
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.8, 8.2, 36]} />
        <meshStandardMaterial color="#991b1b" roughness={0.8} alphaMap={arenaTextures.ringPaint} alphaTest={0.4} />
      </mesh>

      {/* 2. MASSIVE STONE PODIUM WALL (ARENA PARAPET) */}
      <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
        <cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]} />
        <meshStandardMaterial map={arenaTextures.wall} color={arenaTextures.wall ? '#ffffff' : '#d4a373'} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Marble Wall Cornice Balustrade */}
      <mesh position={[0, 5.1, 0]}>
        <cylinderGeometry args={[20.5, 20.5, 0.4, 36, 1, true]} />
        <meshStandardMaterial color="#ecd9be" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* 3. TIERED AMPHITHEATER SEATING (CAVEA / SPECTATOR TIERS) */}
      {/* Tier 1 - Lower Senators & Patricians */}
      <mesh position={[0, 6.8, 0]}>
        <cylinderGeometry args={[24, 20.6, 3.2, 36, 1, true]} />
        <meshStandardMaterial map={arenaTextures.tiers} color={arenaTextures.tiers ? '#ffffff' : '#b47b48'} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Tier 2 - Plebeians & Upper Spectators */}
      <mesh position={[0, 10.4, 0]}>
        <cylinderGeometry args={[28, 24.2, 4.0, 36, 1, true]} />
        <meshStandardMaterial map={arenaTextures.tiers} color={arenaTextures.tiers ? ARENA_INTERIOR_COLORS.limestone : '#854d0e'} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* Spectator Crowd Silhouettes — exact positions, sizes and colours,
          now instanced into one draw call instead of 56 individual meshes. */}
      <ArenaCrowd />

      {/* 4. ROARING BRONZE ARENA FIRE BRAZIERS */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
        const angle = (idx / 8) * Math.PI * 2;
        const tx = Math.cos(angle) * 19.8;
        const tz = Math.sin(angle) * 19.8;
        return (
          <group key={`arena-torch-${idx}`} position={[tx, 5.2, tz]}>
            {/* Bronze Bowl */}
            <mesh castShadow>
              <cylinderGeometry args={[0.55, 0.35, 0.8, 10]} />
              <meshStandardMaterial color="#78350f" metalness={0.7} />
            </mesh>
            {/* Glowing Embers */}
            <mesh position={[0, 0.45, 0]}>
              <sphereGeometry args={[0.3, 10, 10]} />
              <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
            </mesh>
            <pointLight color="#f97316" intensity={3.5} distance={12} position={[0, 0.6, 0]} />
          </group>
        );
      })}

      {/* 5. IMPERIAL EMPEROR'S ROYAL LOGE (PULVINAR) */}
      <group position={[0, 5.0, -20.2]}>
        {/* Raised Marble Podium */}
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[10, 3.6, 4.5]} />
          <meshStandardMaterial color="#ecd9be" roughness={0.4} />
        </mesh>
        {/* Imperial Velvet Canopy (Velarium) */}
        <mesh position={[0, 4.4, 0]}>
          <boxGeometry args={[10.8, 0.5, 5.2]} />
          <meshStandardMaterial color="#881337" roughness={0.5} />
        </mesh>
        {/* Gold Trim & Imperial Eagle */}
        <mesh position={[0, 4.8, 2.5]}>
          <boxGeometry args={[11.2, 0.3, 0.2]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Flanking Corinthian Columns */}
        {[-4.6, 4.6].map((cx, ci) => (
          <mesh key={`imp-col-${ci}`} position={[cx, 2.8, 2.2]}>
            <cylinderGeometry args={[0.26, 0.3, 3.2, 12]} />
            <meshStandardMaterial color="#f5ede0" roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* 6. GLADIATOR ENTRANCE GATES — the triumphal entrance receives
          a laurel swag and bronze chains; the opposite Libitinaria gate gets
          only its small plaque. Each gate gains one merged dressing mesh. */}
      {[Math.PI / 2, -Math.PI / 2].map((angle, gi) => {
        const isTriumphalis = Math.sin(angle) < 0;
        return (
          <group key={`arena-gate-${gi}`} position={[Math.cos(angle) * 20.0, 2.2, Math.sin(angle) * 20.0]} rotation={[0, -angle + Math.PI / 2, 0]}>
            <mesh castShadow position={[0, 0, 0]} geometry={gateGeometry.grille}>
              <meshStandardMaterial color="#292524" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 2.4, 0]}>
              <boxGeometry args={[6.2, 0.8, 0.6]} />
              <meshStandardMaterial color="#d4a373" roughness={0.6} />
            </mesh>
            <mesh geometry={isTriumphalis ? gateGeometry.triumphalis : gateGeometry.libitinaria} castShadow>
              <meshStandardMaterial vertexColors metalness={0.65} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
