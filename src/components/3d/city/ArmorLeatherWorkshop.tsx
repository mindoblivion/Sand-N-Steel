import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

export const ArmorLeatherWorkshop = React.memo(() => {
  return (
    <group position={[28.2, 0, 1]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[8.4, 5.2]} height={0.3} projection={0.25} position={[0, 0, 0.15]} />

      {/* 1. BRICK ARCHES & OPEN CRAFT WORKSHOP WALLS */}
      {/* Stone foundation & rear solid brick wall.
          Phase C-8.53: this wall carries the lean-to's HIGH edge, so its top is
          raised 4.0 → 4.5034 — the height of the roof's underside plane at the
          wall's front face (Z 1.2).  It was 4.0 while the architrave's top sat
          at 4.02, i.e. 0.02 ABOVE it, so no pitched roof could seat on both; the
          0.5 the wall was short of that plane is what left the roof floating
          0.41 over the architrave and driven through the wall's own top. */}
      <mesh castShadow receiveShadow position={[0, 2.2517, 1.8]}>
        <boxGeometry args={[8.0, 4.5034, 1.2]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.romanBrick.color}
          roughness={ROMAN_PALETTE.romanBrick.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>

      {/* Side arch support masonry piers with stepped bases & impost caps */}
      {[-3.6, 3.6].map((x, i) => (
        <group key={`arch-post-${i}`} position={[x, 0, -1.5]}>
          {/* Stepped stone pier base */}
          <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
            <boxGeometry args={[0.95, 0.4, 0.95]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.ashlarStone.color}
              roughness={ROMAN_PALETTE.ashlarStone.roughness}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.018}
            />
          </mesh>
          {/* Main brick shaft */}
          <mesh castShadow receiveShadow position={[0, 2.0, 0]}>
            <boxGeometry args={[0.8, 3.2, 0.8]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.romanBrick.color}
              roughness={ROMAN_PALETTE.romanBrick.roughness}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.015}
            />
          </mesh>
          {/* Stone impost block cap */}
          <mesh castShadow position={[0, 3.7, 0]}>
            <boxGeometry args={[0.95, 0.2, 0.95]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.travertine.color}
              roughness={ROMAN_PALETTE.travertine.roughness}
            />
          </mesh>
        </group>
      ))}

      {/* Heavy Timber Architrave Tie-Beam */}
      <mesh castShadow position={[0, 3.9, -1.5]}>
        <boxGeometry args={[8.2, 0.24, 0.45]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.darkStructuralTimber.color}
          roughness={ROMAN_PALETTE.darkStructuralTimber.roughness}
        />
      </mesh>

      {/* 2. AUTHENTIC LEAN-TO TERRACOTTA SHIELD ROOF WITH FASCIA BEAM
          -----------------------------------------------------------------
          Phase C-8.53 bearing arrangement (see AGENTS.md).  The lean-to leans
          against the rear wall — HIGH at the wall, LOW at the open front — so it
          drains to the street instead of down the building's own back wall:

            • the roof's underside plane falls to the open front at the author's
              own pitch, 0.16 rad (9.2°, still right for terracotta);
            • FRONT bearing: the heavy timber architrave's top face, seated along
              its down-slope (front) edge at world (Z -1.725, Y 4.02) — gap 0.000.
              The roof's underside rises 0.073 over the beam's 0.45 depth, so the
              wedge behind that contact line is enclosed by the beam itself and
              opens only inward — no gap faces the street;
            • HIGH bearing: the rear brick wall's top, therefore raised to 4.5034
              (the plane's height at the wall's front face, Z 1.2), where the wall's
              top front strip beds 0.0113 into the slab — inside the project's
              0.02 seating tolerance and below the slab's top face;
            • the "top wall flashing beam" closes that wall-plate junction on the
              weather (rear) side: its bottom edge now rests on the wall's top at
              the wall's rear face (Z 2.4) and its top edge meets the roof's
              underside — both exact (0.000) — instead of overhanging the wall by
              0.48.  Its box, tilt and material are unchanged.
          The slab (8.6 × 0.18 × 5.4), the eave fascia, the piers, the architrave
          and the building's own position keep their dimensions and materials. */}
      <group position={[0, 4.4218, 0.2]} rotation={[-0.16, 0, 0]}>
        {/* Main terracotta roof plane */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[8.6, 0.18, 5.4]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.terracottaTile.color}
            roughness={ROMAN_PALETTE.terracottaTile.roughness}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.015}
          />
        </mesh>
        {/* Front eave fascia board */}
        <mesh castShadow position={[0, -0.06, -2.7]}>
          <boxGeometry args={[8.6, 0.16, 0.12]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.weatheredTimber.color}
            roughness={ROMAN_PALETTE.weatheredTimber.roughness}
          />
        </mesh>
        {/* Top wall flashing beam — Phase C-8.53: moved off the roof's rear edge
            (local Z 2.7, which hung 0.48 behind the wall) onto the wall's own top
            at its rear face, spanning that junction from the wall's top up to the
            roof's underside. */}
        <mesh castShadow position={[0, -0.18, 2.1149]}>
          <boxGeometry args={[8.6, 0.18, 0.14]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.ashlarStone.color}
            roughness={ROMAN_PALETTE.ashlarStone.roughness}
          />
        </mesh>
      </group>

      {/* 3. LEATHER WORKSHOP TANNING & DRYING RACK */}
      <group position={[-2.4, 0, -1.0]}>
        {/* Dark Timber Frames */}
        <mesh castShadow position={[-1.1, 1.5, 0]}>
          <boxGeometry args={[0.12, 3.0, 0.12]} />
          <meshStandardMaterial color="#2d1505" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[1.1, 1.5, 0]}>
          <boxGeometry args={[0.12, 3.0, 0.12]} />
          <meshStandardMaterial color="#2d1505" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 2.8, 0]}>
          <boxGeometry args={[2.2, 0.12, 0.12]} />
          <meshStandardMaterial color="#2d1505" roughness={0.9} />
        </mesh>
        {/* Stretched Leather Pelt (Brown polygon) */}
        <mesh castShadow position={[0, 1.5, 0.02]}>
          <boxGeometry args={[1.6, 2.0, 0.05]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
      </group>

      {/* 4. WEAPON & SHIELD SHACK / DISPLAY RACKS */}
      <group position={[2.6, 0, -1.2]}>
        {/* Display Rack Wooden Bench */}
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[1.5, 0.9, 1.0]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Rendered Shield (Scutum style display block) */}
        <mesh castShadow position={[-0.4, 1.2, 0]} rotation={[0.2, 0.1, -0.15]}>
          <boxGeometry args={[0.1, 1.1, 0.65]} />
          <meshStandardMaterial color="#dc2626" roughness={0.55} />
        </mesh>
        <mesh position={[-0.34, 1.2, 0]} rotation={[0.2, 0.1, -0.15]}>
          <boxGeometry args={[0.02, 0.9, 0.2]} />
          <meshStandardMaterial color="#eab308" roughness={0.3} />
        </mesh>
        {/* Rounded Bronze Target Shield */}
        <mesh castShadow position={[0.4, 1.1, 0.1]} rotation={[0.2, -0.2, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.06, 12]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* 5. CRAFTING TOOLS & WOODEN BUCKET */}
      <group position={[0, 0, -1.2]}>
        {/* Oak Workbench Table */}
        <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
          <boxGeometry args={[2.0, 1.3, 0.8]} />
          <meshStandardMaterial color="#5c3f1f" roughness={0.8} />
        </mesh>
        {/* Leatherworking Knife / Iron tool */}
        <mesh castShadow position={[0.3, 1.05, 0]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.4, 0.08, 0.12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Clay Water Jar */}
        <mesh position={[-0.5, 1.25, 0]}>
          <cylinderGeometry args={[0.15, 0.2, 0.4, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
});
