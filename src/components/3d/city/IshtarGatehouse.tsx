import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import { ClassicalColumn, WallCornice } from './ClassicalArchitecture';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { Banner } from './EnvironmentalMotion';

export const IshtarGatehouse = React.memo(() => {
  // Phase 2B.22: Dedicated bump-map for the central arch facade.
  // NOISE_TEXTURE has a global repeat of (3, 3) calibrated for ~1 m surfaces.
  // The central arch is 14 m × 10 m, so repeat 3 stretches each noise tile across
  // ~4.7 m horizontally — functionally flat. Cloning shares the canvas image
  // (zero memory cost) with an independent repeat of (12, 4) → ~1.17 m per
  // horizontal tile (~110 px/m), ~2.5 m per vertical tile (~51 px/m).
  const gatehouseBumpMap = useMemo(() => {
    if (!NOISE_TEXTURE) return undefined;
    const tex = NOISE_TEXTURE.clone();
    tex.repeat.set(12, 4);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      gatehouseBumpMap?.dispose();
    };
  }, [gatehouseBumpMap]);

  return (
    <group position={[0, 0, 24]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[14.2, 4.8]} height={0.3} projection={0.25} color="#dfcfb7" capColor="#ebdcb9" />
      {[-8.5, 8.5].map((tx, ti) => (
        <BuildingFoundation key={`tower-found-${ti}`} size={[4.4, 5.4]} height={0.3} projection={0.25} position={[tx, 0, 0]} color="#dfcfb7" capColor="#ebdcb9" />
      ))}

      {/* 1. MONUMENTAL ROMAN TRIUMPHAL GATE ARCHWAY */}
      {/* Central Keystone Triumphal Structure (Glazed Cobalt Lapis Ceramic) */}
      <mesh castShadow receiveShadow position={[0, 5.0, 0]}>
        <boxGeometry args={[14, 10, 4.5]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.glazedLapis.color}
          roughness={0.44}
          metalness={0.16}
          bumpMap={gatehouseBumpMap || NOISE_TEXTURE || undefined}
          bumpScale={0.008}
        />
      </mesh>

      {/* Central Grand Archway Opening with Classical Keystone Arch Molding */}
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[5.2, 6.4, 4.8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.recessDark.color} roughness={0.94} />
      </mesh>
      {/* Central Archway Keystone & Reveal Molding */}
      <mesh position={[0, 6.35, 2.3]}>
        <boxGeometry args={[0.7, 0.9, 0.4]} />
        <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
      </mesh>

      {/* Side Pedestrian Arches with Framing */}
      {[-4.6, 4.6].map((sx, si) => (
        <group key={`side-arch-${si}`}>
          <mesh position={[sx, 2.5, 0]}>
            <boxGeometry args={[2.4, 5.0, 4.8]} />
            <meshStandardMaterial color={ROMAN_PALETTE.recessDark.color} roughness={0.94} />
          </mesh>
          <mesh position={[sx, 5.0, 2.3]}>
            <boxGeometry args={[0.5, 0.6, 0.3]} />
            <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
          </mesh>
        </group>
      ))}

      {/* 2. ATTIC STORY & GOLD FRIEZE ("SENATVS POPVLVSQVE ROMANVS") */}
      <mesh castShadow position={[0, 10.6, 0]}>
        <boxGeometry args={[15.2, 2.0, 5.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
      </mesh>
      {/* Upper Cornice Rim */}
      <mesh position={[0, 11.8, 0]}>
        <boxGeometry args={[16.0, 0.6, 5.4]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
      </mesh>

      {/* 3. FLANKING GUARDIAN TOWERS WITH BATTLEMENTS & CORNICES */}
      {[-8.5, 8.5].map((tx, ti) => (
        <group key={`gate-tower-${ti}`} position={[tx, 0, 0]}>
          {/* Main Stone Tower Shaft */}
          <mesh castShadow receiveShadow position={[0, 6.0, 0]}>
            <boxGeometry args={[4.2, 12, 5.2]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.glazedLapisTower.color}
              roughness={0.46}
              metalness={0.16}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.008}
            />
          </mesh>
          {/* Mid-level String Course Belt */}
          <WallCornice size={[4.2, 5.2]} y={6.2} color={ROMAN_PALETTE.travertine.color} height={0.25} projection={0.15} />
          {/* Upper Tower Cornice below battlements */}
          <WallCornice size={[4.2, 5.2]} y={11.8} color={ROMAN_PALETTE.goldAccent.color} metalness={ROMAN_PALETTE.goldAccent.metalness} height={0.3} projection={0.2} />
          {/* Tower Crenellations (Merlons) */}
          {[-1.5, 0, 1.5].map((cx, ci) => (
            <mesh key={`cren-${ti}-${ci}`} castShadow position={[cx, 12.5, 2.2]}>
              <boxGeometry args={[0.8, 1.2, 0.8]} />
              <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
            </mesh>
          ))}
          {/* Tower Hanging Bronze Lanterns */}
          <group position={[0, 8.0, 2.8]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.25, 0.35, 0.7, 8]} />
              <meshStandardMaterial color={ROMAN_PALETTE.agedBronze.color} metalness={0.76} roughness={0.42} />
            </mesh>
            <pointLight color="#f97316" intensity={3.5} distance={10} position={[0, -0.2, 0]} />
          </group>
        </group>
      ))}

      {/* 4. FLUTED GOLD MARBLE CLASSICAL COLUMNS ON FACADE */}
      {/* Phase C-8.55: 9.62 — not 10.4 — carries the order's top (capital drum and abacus
          both end at `height`) to 9.62, i.e. 0.02 into the attic soffit (9.60) as its seat,
          instead of burying the whole 0.80 of the capital inside the attic. */}
      {[-6.2, -2.8, 2.8, 6.2].map((cx, ci) => (
        <ClassicalColumn
          key={`gate-col-${ci}`}
          position={[cx, 0, 2.4]}
          height={9.62}
          radius={0.36}
          stoneColor={ROMAN_PALETTE.marbleWhite.color}
          capitalColor={ROMAN_PALETTE.goldAccent.color}
          metalness={ROMAN_PALETTE.goldAccent.metalness}
          order="corinthian"
        />
      ))}

      {/* 5. GARRISON ENTRANCE TORCHES */}
      {[-3.2, 3.2].map((bx, bi) => (
        <group key={`gate-torch-${bi}`} position={[bx, 2.8, 2.6]}>
          <mesh castShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.12, 0.8, 8]} />
            <meshStandardMaterial color="#78350f" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <sphereGeometry args={[0.25, 8, 8]} />
            <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
          </mesh>
          <pointLight color="#f97316" intensity={3} distance={8} position={[0, 0.6, 0]} />
        </group>
      ))}
    </group>
  );
});
