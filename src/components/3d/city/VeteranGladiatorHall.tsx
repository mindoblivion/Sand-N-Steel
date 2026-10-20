import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  RomanGabledRoof,
  ClassicalPediment,
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';
import { NOISE_TEXTURE } from './RomanMaterials';

export const VeteranGladiatorHall = React.memo(() => {
  const bannerLeftRef = useRef<THREE.Group>(null);
  const bannerRightRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (bannerLeftRef.current) {
      bannerLeftRef.current.rotation.y = Math.sin(time * 1.4) * 0.07;
      bannerLeftRef.current.rotation.z = Math.cos(time * 1.1) * 0.02;
    }
    if (bannerRightRef.current) {
      bannerRightRef.current.rotation.y = Math.sin(time * 1.6 + 0.5) * 0.07;
      bannerRightRef.current.rotation.z = Math.cos(time * 1.3 + 0.3) * 0.02;
    }
  });

  return (
    <group position={[-24, 0, -25]}>
      {/* 1. TRAVERTINE PLINTH BASE WITH STEPPED GROUND CONTACT */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[6.6, 0.16, 6.1]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} />
      </mesh>
      {/* Phase C-8.57: the order's own upper step follows the portico 0.12 forward — 5.6
          → 5.72 deep, centred Z 0.06 — so the columns keep stone under them. Its back
          edge stays at Z −2.80. The LOWER step (6.6 × 6.1), the one the collider stands
          for, is untouched. */}
      <mesh castShadow receiveShadow position={[0, 0.24, 0.06]}>
        <boxGeometry args={[6.1, 0.32, 5.72]} />
        <meshStandardMaterial color="#e5d0b1" roughness={0.5} />
      </mesh>

      {/* 2. STUCCO WALLS (SAND/CREAM COLORED STUCCO WITH BRONZE TRIM) */}
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[5.7, 2.4, 5.2]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>

      {/* Travertine Corner Quoins */}
      <CornerQuoins height={2.4} buildingSize={[5.7, 5.2]} color="#d4a373" blockHeight={0.4} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[5.7, 5.2]} y={2.75} color="#d4a373" height={0.16} projection={0.12} />

      {/* 3. TERRACOTTA GABLED ROOF WITH OVERHANGS & RIDGE CAP
          Phase C-8.57: the eave overhang comes in from 0.35 to 0.20. The roof's eave
          plate (the primitive's fascia) and its front slope were what cut through the
          order's capitals and the pediment's raking cornices; at 0.20 the fascia's front
          face stands at Z 2.72 and the slope's at 2.80, both clear of them. */}
      <RomanGabledRoof
        width={5.7}
        depth={5.2}
        height={1.3}
        eaveOverhang={0.2}
        ridgeAlong="z"
        position={[0, 2.8, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#ebdcb9"
      />

      {/* Veteran Hall Windows */}
      <ClassicalWindow
        position={[-2.86, 1.7, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#d4a373"
      />

      {/* Recessed Framed Hall Entrance Doorway
          Phase C-8.60: the group stands 0.08 further back, Z 2.58 → 2.50. `ClassicalDoorway`
          puts its projecting cornice cap at local Y 2.48 … 2.58, and the cap is `depth + 0.12`
          (0.47) deep about local Z 0.06 — so at 2.58 the cap's front face (2.875) reached 0.05
          into BOTH of the pediment's raking cornices, whose 1.15-deep band starts at Z 2.825.
          At 2.50 the cap's front face stands at 2.795, 0.03 clear of them; the lintel clears by
          0.055 and the jambs follow the group back, still proud of the wall's 2.60 face. The
          doorway's size, its own transforms and its threshold on the step are untouched. */}
      <ClassicalDoorway
        position={[0, 0.32, 2.50]}
        width={1.6}
        height={2.2}
        depth={0.35}
        stoneColor="#ebdcb9"
        recessColor="#1c1917"
        hasArchHeader={true}
      />

      {/* 4. ENTRANCE PORTICO FACADE (CRIMSON COLUMNS & CLASSICAL PEDIMENT)
          Phase C-8.57: the order moves 0.12 forward, 2.7 → 2.82, so its plinths land on
          the extended upper step and its plinth face 0.035 inside the lower step's front
          edge (Z 3.05) —
          the collider, which stands for that lower step, is unchanged. */}
      <group position={[0, 0.32, 2.82]}>
        {/* Support Classical Columns with Stepped Bases & Capitals
            Phase C-8.57: height 2.5 → 2.3. The order's top now sits at 2.62, i.e. 0.02
            (the project's own seating tolerance) below the eave fascia's underside at
            2.64, so neither the capital nor the abacus can reach the fascia plate. */}
        {[-1.8, 1.8].map((x, i) => (
          <ClassicalColumn
            key={`hall-col-${i}`}
            position={[x, 0, 0]}
            height={2.3}
            radius={0.15}
            stoneColor="#7f1d1d"
            capitalColor="#ebdcb9"
            order="doric"
          />
        ))}

        {/* Classical Monumental Pediment */}
        {/* Phase C-8.57: height 0.85 → 1.05 and [0, 2.45, 0] → [0, 2.25, 0.58]. The base
            drops to 2.57 so the architrave still seats the order's 2.62 top by exactly
            0.05; the taller gable holds the acroterion's top at 4.24, still 0.045 below
            the ridge cap; and the 0.58 shift puts the architrave's back face (2.90) and
            both raking cornices' (2.825) clear of the fascia (2.72) and the roof's front
            slope (2.80). */}
        <ClassicalPediment
          width={4.2}
          depth={0.8}
          height={1.05}
          position={[0, 2.25, 0.58]}
          stoneColor="#f5ede0"
          trimColor="#b45309"
        />
      </group>

      {/* 5. BRONZE & CRIMSON ACCENTS / VETERAN BANNERS */}
      {/* Veteran Banners hanging on left and right columns with separate wind oscillations
          Phase C-8.57: they ride with the columns (Z 2.85 → 2.97), keeping their 0.15
          stand-off from the shaft's front face instead of sinking into it. */}
      <group position={[-1.8, 1.0, 2.97]} ref={bannerLeftRef}>
        {/* Banner fabric */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 1.2, 0.02]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
        </mesh>
        {/* Bronze shield crest center */}
        <mesh position={[0, 0.2, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.02, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <group position={[1.8, 1.0, 2.97]} ref={bannerRightRef}>
        {/* Banner fabric */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 1.2, 0.02]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
        </mesh>
        {/* Bronze shield crest center */}
        <mesh position={[0, 0.2, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.02, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* 6. SIMPLE TROPHY SHIELDS & CROSSED WEAPONS (EAST/FRONT WALL) */}
      <group position={[0, 1.6, 2.62]}>
        {/* Golden Bronze Laurel Wreath, hung in the pediment's tympanum
            Phase C-8.60: the wreath was laid FLAT — `rotation={[Math.PI / 2, 0, 0]}` turns a
            torus's own XY plane into the ground plane, so it read edge-on — and its 0.35 ring,
            centred at Y 2.70 on the wall's face plane (Z 2.72), ran through the doorway's
            lintel, the wall cornice, the eave plate and the wall itself, and reached into the
            pediment's architrave and both of its raking cornices. It now hangs FACE-ON with no
            rotation, seated on the tympanum's own face: a torus lies in the plane it is drawn
            in, so the ring's back face lands on the tympanum panel at Z 3.75 (local Z 1.19 from
            this group, whose own origin is Z 2.62) with the ring's 0.06 tube in front. Its band
            keeps the weight it had — the tube is still 0.06, only the diameter comes in, 0.70 →
            0.56 — and 0.28 is the largest ring that still holds the project's 0.02 clearance
            from the V the two rakes describe on the axis (measured 0.033 at its nearest) while
            its silhouette stays
            0.0286 inside the tympanum triangle's raking edges, 0.20 above the architrave, 0.17
            below the acroterion and 0.03 below the gable's apex. */}
        <mesh position={[0, 1.81, 1.19]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.28, 0.06, 6, 12]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Left Side Trophy: Crossed Swords and Shield */}
        <group position={[-1.2, 0, 0]}>
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.04, 10]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} /> {/* Iron Shield */}
          </mesh>
          {/* Gold Trim Rim */}
          <mesh position={[0, 0, 0.02]}>
            <torusGeometry args={[0.39, 0.02, 6, 12]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Diagonal weapons behind */}
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>

        {/* Right Side Trophy: Crossed Axes and Shield */}
        <group position={[1.2, 0, 0]}>
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.04, 10]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <torusGeometry args={[0.39, 0.02, 6, 12]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  );
});
