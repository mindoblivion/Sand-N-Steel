import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCrowdBounce, stepCrowdBounce, type CrowdBounce } from '../../utils/crowdHype';

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
      {/* 1. ARENA CIRCULAR SAND PIT (WARM GOLDEN BLOOD-STAINED ARENA SAND) */}
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20, 36]} />
        <meshStandardMaterial color="#c29b62" roughness={0.92} />
      </mesh>

      {/* Center Combat Ring Marking */}
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.8, 8.2, 36]} />
        <meshStandardMaterial color="#991b1b" roughness={0.8} />
      </mesh>

      {/* 2. MASSIVE STONE PODIUM WALL (ARENA PARAPET) */}
      <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
        <cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]} />
        <meshStandardMaterial color="#d4a373" roughness={0.7} side={THREE.DoubleSide} />
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
        <meshStandardMaterial color="#b47b48" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Tier 2 - Plebeians & Upper Spectators */}
      <mesh position={[0, 10.4, 0]}>
        <cylinderGeometry args={[28, 24.2, 4.0, 36, 1, true]} />
        <meshStandardMaterial color="#854d0e" roughness={0.85} side={THREE.DoubleSide} />
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

      {/* 6. GLADIATOR ENTRANCE GATES (PORTA TRIUMPHALIS) */}
      {[Math.PI / 2, -Math.PI / 2].map((angle, gi) => (
        <group key={`arena-gate-${gi}`} position={[Math.cos(angle) * 20.0, 2.2, Math.sin(angle) * 20.0]} rotation={[0, -angle + Math.PI / 2, 0]}>
          {/* Iron Grate Portcullis */}
          <mesh castShadow position={[0, 0, 0]}>
            <boxGeometry args={[5.2, 4.4, 0.2]} />
            <meshStandardMaterial color="#292524" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Stone Arch surround */}
          <mesh position={[0, 2.4, 0]}>
            <boxGeometry args={[6.2, 0.8, 0.6]} />
            <meshStandardMaterial color="#d4a373" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
};
