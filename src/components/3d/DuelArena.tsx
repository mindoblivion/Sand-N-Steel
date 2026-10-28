import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCrowdBounce, stepCrowdBounce, type CrowdBounce } from '../../utils/crowdHype';
import {
  ARENA_INTERIOR_COLORS,
  getArenaRingPaintTexture,
  getArenaSandTexture,
  getArenaTierTexture,
  getPodiumWallTexture,
} from '../../utils/arenaInteriorTextures';

export interface DuelArenaProps {
  /**
   * CF-3 — the duel's crowd-pulse counter. DuelScene bumps it when the hype
   * crosses a tier upward, and the crowd answers with one bounce per change.
   * It is a ref rather than state on purpose: a celebration must not cost a
   * React render of the whole scene. Optional — an arena rendered without it
   * simply never celebrates.
   */
  crowdPulseRef?: React.RefObject<number>;
  /**
   * D-3 — the heraldic cloth over the imperial loge. `'gilded'` flies Gnaeus's
   * own gold while his panoply shines; `'player'` is the house crimson the arena
   * has always worn, and it is what flies once the third piece breaks (the
   * allegiance swap). A MATERIAL PROPERTY change on the existing canopy mesh —
   * no new mesh, no new draw call. Absent = the shipped crimson.
   * D-5 — `'dusk'` is Hermas's: a deep wine cloth under a tarnished bronze trim,
   * the same two material properties on the same two meshes (+0 draw calls).
   * D-4 — `'brothers'` is the Cotta pair's: oxblood cloth under a brighter
   * crimson trim, again the same two properties on the same two meshes.
   */
  bannerAllegiance?: 'gilded' | 'player' | 'brothers' | 'dusk';
  /**
   * D-5 — the eight bronze braziers' ember emissive intensity. A MATERIAL
   * PROPERTY on the ember spheres the arena already draws (the shipped value is
   * 3), so it costs no mesh and no draw call; absent leaves them exactly as they
   * have always been.
   */
  emberEmissive?: number;
  /**
   * Day/Night T1 — the braziers' POINT-LIGHT intensity, scaled by the phase row's
   * `lampGlow` (brighter at night, dimmer by day). A property on the eight point
   * lights the arena already draws, so still +0 lights and +0 draw calls; absent
   * leaves them at the shipped 3.5.
   */
  brazierIntensity?: number;
  /**
   * Day/Night T3 — the bronze bowls' own warm emissive at night (0 by day, hotter for
   * the Night Spectacle). A MATERIAL PROPERTY on the eight bowls the arena already
   * draws, so still +0 meshes and +0 draw calls; absent leaves them exactly as shipped.
   */
  bowlEmissive?: number;
  /**
   * Day/Night T3 — the spectator RINGS' dress emissive, non-zero only for the Night
   * Spectacle. A material property on the 56 crowd silhouettes already drawn (CF-3's
   * group), so it costs no mesh; absent (or 0) leaves the crowd exactly as it was.
   */
  crowdDress?: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   AI-1 — THE GATES' MERGED GEOMETRY
   ══════════════════════════════════════════════════════════════════════════
   Each gate keeps exactly the meshes it had (one portcullis in place of the
   solid box, plus its stone arch) and gains exactly ONE merged dressing mesh,
   so the arena's draw-call delta is +2 — the two dressings, and nothing else.
   The bar grille is a merged geometry: seven vertical bars, four horizontal
   bars and the dark inset plane they are recessed over, in ONE mesh with one
   dark-iron material.
   ────────────────────────────────────────────────────────────────────────── */

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

export const DuelArena: React.FC<DuelArenaProps> = ({
  crowdPulseRef,
  bannerAllegiance,
  emberEmissive,
  brazierIntensity,
  bowlEmissive,
  crowdDress,
}) => {
  const crowdGroupRef = useRef<THREE.Group>(null);
  // Seeded from the counter's current value, so the first frame never mistakes
  // a pulse that happened before this arena existed for a fresh one.
  const crowdBounceRef = useRef<CrowdBounce>(createCrowdBounce(crowdPulseRef?.current ?? 0));

  // AI-1 — the four interior textures (one shared factory, cached in the
  // module). `undefined` when there is no canvas, which simply leaves the
  // material on its flat colour.
  const arenaTextures = useMemo(
    () => ({
      sand: getArenaSandTexture() ?? undefined,
      ringPaint: getArenaRingPaintTexture() ?? undefined,
      wall: getPodiumWallTexture() ?? undefined,
      tiers: getArenaTierTexture() ?? undefined,
    }),
    [],
  );

  // AI-1 — the gates' three merged geometries, built once per mount.
  const gateGeometry = useMemo(
    () => ({
      grille: buildPortcullisGrilleGeometry(),
      triumphalis: buildTriumphalisDressingGeometry(),
      libitinaria: buildLibitinariaDressingGeometry(),
    }),
    [],
  );

  // CF-3 — the celebration is the crowd group's `position.y` and nothing else.
  // It idles at exactly 0, so the walls, braziers and loge are not affected even
  // implicitly; `stepCrowdBounce` returns 0 unless a pulse is playing.
  useFrame((_, delta) => {
    const group = crowdGroupRef.current;
    if (!group) return;
    group.position.y = stepCrowdBounce(
      crowdBounceRef.current,
      crowdPulseRef?.current ?? 0,
      delta * 1000,
    );
  });

  return (
    <group>
      {/* 1. ARENA CIRCULAR SAND PIT (WARM GOLDEN BLOOD-STAINED ARENA SAND).
          AI-1: the pit carries its own pit-shaped rake map — repeat 1, clamped,
          so the concentric rings are centred on the sand and nothing tiles. */}
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20, 36]} />
        <meshStandardMaterial map={arenaTextures.sand} roughness={0.92} />
      </mesh>

      {/* Center Combat Ring Marking — AI-1: the same red paint, now chipped
          through a canvas alpha map (the ring's own inner/outer radii). */}
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.8, 8.2, 36]} />
        <meshStandardMaterial
          color="#991b1b"
          roughness={0.8}
          alphaMap={arenaTextures.ringPaint}
          alphaTest={0.4}
        />
      </mesh>

      {/* 2. MASSIVE STONE PODIUM WALL (ARENA PARAPET) — AI-1: travertine block
          courses with drawn joints and value jitter, the fresco band, the
          limestone plinth and the damp band at the foot all live in the map.
          Cornice unchanged. */}
      <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
        <cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]} />
        <meshStandardMaterial map={arenaTextures.wall} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Marble Wall Cornice Balustrade */}
      <mesh position={[0, 5.1, 0]}>
        <cylinderGeometry args={[20.5, 20.5, 0.4, 36, 1, true]} />
        <meshStandardMaterial color="#ecd9be" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* 3. TIERED AMPHITHEATER SEATING (CAVEA / SPECTATOR TIERS) — AI-1: one
          shared canvas map with step nosings and radial aisle shadows; tier 2
          wears a darker tint of the same texture through its material colour. */}
      {/* Tier 1 - Lower Senators & Patricians */}
      <mesh position={[0, 6.8, 0]}>
        <cylinderGeometry args={[24, 20.6, 3.2, 36, 1, true]} />
        <meshStandardMaterial map={arenaTextures.tiers} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Tier 2 - Plebeians & Upper Spectators */}
      <mesh position={[0, 10.4, 0]}>
        <cylinderGeometry args={[28, 24.2, 4.0, 36, 1, true]} />
        <meshStandardMaterial
          map={arenaTextures.tiers}
          color={ARENA_INTERIOR_COLORS.limestone}
          roughness={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* CF-3 — SPECTATOR CROWD SILHOUETTES. Both rings live in ONE group so a
          hype celebration can bounce the crowd alone: the podium wall, the
          cavea, the braziers and the imperial loge all stay outside it. The 28
          spectators per ring (56 meshes), their radii, sizes and materials are
          exactly what they were. */}
      <group ref={crowdGroupRef}>
        {Array.from({ length: 28 }).map((_, ci) => {
          const angle = (ci / 28) * Math.PI * 2;
          const rad1 = 22.2;
          const rad2 = 25.8;
          return (
            <group key={`crowd-${ci}`}>
              <mesh position={[Math.cos(angle) * rad1, 7.8, Math.sin(angle) * rad1]}>
                <boxGeometry args={[1.2, 1.4, 0.8]} />
                <meshStandardMaterial color={ci % 3 === 0 ? '#991b1b' : ci % 2 === 0 ? '#f5f5f4' : '#78350f'} roughness={0.9} emissive="#f59e0b" emissiveIntensity={crowdDress ?? 0} />
              </mesh>
              <mesh position={[Math.cos(angle) * rad2, 11.2, Math.sin(angle) * rad2]}>
                <boxGeometry args={[1.4, 1.5, 0.8]} />
                <meshStandardMaterial color={ci % 2 === 0 ? '#b45309' : '#e5e5e5'} roughness={0.9} emissive="#f59e0b" emissiveIntensity={crowdDress ?? 0} />
              </mesh>
            </group>
          );
        })}
      </group>

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
              <meshStandardMaterial
                color="#78350f"
                metalness={0.7}
                emissive="#f97316"
                emissiveIntensity={bowlEmissive ?? 0}
              />
            </mesh>
            {/* Glowing Embers */}
            <mesh position={[0, 0.45, 0]}>
              <sphereGeometry args={[0.3, 10, 10]} />
              <meshStandardMaterial
                color="#ff5722"
                emissive="#f97316"
                emissiveIntensity={emberEmissive ?? 3}
              />
            </mesh>
            <pointLight
              color="#f97316"
              intensity={brazierIntensity ?? 3.5}
              distance={12}
              position={[0, 0.6, 0]}
            />
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
        {/* Imperial Velvet Canopy (Velarium) — D-3: the arena's only heraldic
            cloth, so it is where an allegiance shows. The house crimson is what
            it has always been; Gnaeus's bout flies his gold until the panoply
            breaks, and the swap is this one material property. */}
        <mesh position={[0, 4.4, 0]}>
          <boxGeometry args={[10.8, 0.5, 5.2]} />
          <meshStandardMaterial
            color={
              bannerAllegiance === 'gilded'
                ? '#eab308'
                : bannerAllegiance === 'brothers'
                ? '#7f1d1d'
                : bannerAllegiance === 'dusk'
                ? '#4c0519'
                : '#881337'
            }
            roughness={0.5}
          />
        </mesh>
        {/* Gold Trim & Imperial Eagle */}
        <mesh position={[0, 4.8, 2.5]}>
          <boxGeometry args={[11.2, 0.3, 0.2]} />
          <meshStandardMaterial
            color={
              bannerAllegiance === 'brothers'
                ? '#dc2626'
                : bannerAllegiance === 'dusk'
                ? '#a16207'
                : '#f59e0b'
            }
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
        {/* Flanking Corinthian Columns */}
        {[-4.6, 4.6].map((cx, ci) => (
          <mesh key={`imp-col-${ci}`} position={[cx, 2.8, 2.2]}>
            <cylinderGeometry args={[0.26, 0.3, 3.2, 12]} />
            <meshStandardMaterial color="#f5ede0" roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* 6. GLADIATOR ENTRANCE GATES — AI-1: the two gates are told apart.
          The −Z gate is PORTA TRIUMPHALIS (dressed: laurel swag, one gold boss,
          two bronze chains); the +Z gate is PORTA LIBITINARIA (bare: one small
          bronze plaque). Each gate keeps its exact position and rotation, and
          the solid 'grate' box is now a merged bar grille recessed over a dark
          inset plane. Every gate is the same three meshes it always was plus
          ONE merged dressing, so the arena's draw-call delta is exactly +2.
          Fighters' spawn logic is untouched — these gates are scenery. */}
      {[Math.PI / 2, -Math.PI / 2].map((angle, gi) => {
        const isTriumphalis = Math.sin(angle) < 0;
        return (
          <group key={`arena-gate-${gi}`} position={[Math.cos(angle) * 20.0, 2.2, Math.sin(angle) * 20.0]} rotation={[0, -angle + Math.PI / 2, 0]}>
            {/* Merged Iron Portcullis — vertical + horizontal bars over their
                dark inset plane, one mesh, the shipped dark iron. */}
            <mesh castShadow position={[0, 0, 0]} geometry={gateGeometry.grille}>
              <meshStandardMaterial color="#292524" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Stone Arch surround */}
            <mesh position={[0, 2.4, 0]}>
              <boxGeometry args={[6.2, 0.8, 0.6]} />
              <meshStandardMaterial color="#d4a373" roughness={0.6} />
            </mesh>
            {/* The gate's ONE merged dressing mesh: dressed for Triumphalis,
                bare for Libitinaria. Vertex colours carry the three palette
                tones in a single material, so this is +1 draw call per gate. */}
            <mesh
              geometry={isTriumphalis ? gateGeometry.triumphalis : gateGeometry.libitinaria}
              castShadow
            >
              <meshStandardMaterial vertexColors metalness={0.65} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
