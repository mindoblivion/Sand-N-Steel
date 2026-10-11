import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { CornerSandDrift } from './GroundWearSystem';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';
import { RomanPavedStreet } from './RomanStreetPavement';

/**
 * Mediterranean Cypress Tree Component
 * Replaces crude geometric cone-hat poles with authentic, elegant Italian cypresses.
 */
const ItalianCypress: React.FC<{ position: [number, number, number]; scale?: number }> = ({
  position,
  scale = 1.0,
}) => {
  return (
    <group position={position} scale={[scale, scale, scale]}>
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

      {/* Textured Mediterranean Cypress Foliage Tiers */}
      <mesh castShadow position={[0, 2.6, 0]}>
        <coneGeometry args={[0.95, 2.4, 10]} />
        <meshStandardMaterial color="#14532d" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 4.0, 0]}>
        <coneGeometry args={[0.8, 2.6, 10]} />
        <meshStandardMaterial color="#166534" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 5.4, 0]}>
        <coneGeometry args={[0.55, 2.4, 10]} />
        <meshStandardMaterial color="#15803d" roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 6.6, 0]}>
        <coneGeometry args={[0.3, 1.8, 8]} />
        <meshStandardMaterial color="#16a34a" roughness={0.6} />
      </mesh>
    </group>
  );
};

/**
 * Roman Carved Stone Fire Brazier
 */
const StreetBrazier: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Carved Marble Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[0.8, 1.0, 0.8]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.012}
        />
      </mesh>
      {/* Bronze Fire Basin Bowl */}
      <mesh castShadow position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.55, 0.3, 0.35, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.agedBronze.color}
          metalness={0.76}
          roughness={0.42}
        />
      </mesh>
      {/* Glowing Coals & Fire Embers */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.32, 10, 10]} />
        <meshStandardMaterial
          color="#ff5722"
          emissive="#f97316"
          emissiveIntensity={2.5}
          roughness={0.2}
        />
      </mesh>
      <pointLight color="#f97316" intensity={2.8} distance={9} position={[0, 1.6, 0]} />
    </group>
  );
};

export const ProcessionAvenue: React.FC = () => {
  // Phase 2B.8: Dedicated bump-map for the central forum plaza circle.
  // NOISE_TEXTURE has a global repeat of (3, 3) calibrated for ~1m surfaces.
  // On the 33m-diameter circle that yields only ~11px/m — functionally flat.
  // Cloning shares the canvas image (zero memory cost) with an independent
  // repeat of (16, 16) → ~2m per tile, ~62px/m — visible micro-relief.
  const plazaBumpMap = useMemo(() => {
    if (!NOISE_TEXTURE) return undefined;
    const tex = NOISE_TEXTURE.clone();
    tex.repeat.set(16, 16);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Phase 2B.10: Dedicated bump-map for the 140×140 m ground plane.
  // NOISE_TEXTURE has a global repeat of (3, 3) calibrated for ~1m surfaces.
  // On the 140 m plane that yields only ~0.02 tiles/m — functionally flat.
  // Cloning shares the canvas image (zero memory cost) with an independent
  // repeat of (32, 32) → ~4.4 m per tile, giving visible micro-relief.
  const groundBumpMap = useMemo(() => {
    if (!NOISE_TEXTURE) return undefined;
    const tex = NOISE_TEXTURE.clone();
    tex.repeat.set(32, 32);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      plazaBumpMap?.dispose();
      groundBumpMap?.dispose();
    };
  }, [plazaBumpMap, groundBumpMap]);

  return (
    <group>
      {/* 1. VAST MEDITERRANEAN SANDSTONE & TERRACOTTA PLAZA FLOOR (FLAT ON GROUND) */}
      <mesh receiveShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.arenaSand.color}
          roughness={0.92}
          bumpMap={groundBumpMap}
          bumpScale={0.015}
        />
      </mesh>

      {/* 2. MAIN ROMAN BOULEVARD (VIA TRIUMPHALIS) & CENTRAL HUB PLAZA */}
      {/* Central Circular Marble Forum Plaza Hub Floor */}
      {/* Phase 2B.8: Uses plazaBumpMap (cloned NOISE_TEXTURE, repeat 16×16) for
          appropriate texel density on this 33m-diameter surface. */}
      <mesh receiveShadow position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[16.5, 36]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.forumPaving.color}
          roughness={0.68}
          bumpMap={plazaBumpMap}
          bumpScale={0.012}
        />
      </mesh>
      {/* Outer Gilded Mosaic Ring for Central Forum Hub */}
      <mesh receiveShadow position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[15.8, 16.5, 36]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.goldAccent.color}
          metalness={0.75}
          roughness={0.34}
        />
      </mesh>

      {/* CARDINAL DISTRICT EXIT THRESHOLDS & ORIENTATION SLABS */}
      {/* NORTH EXIT (Toward Colosseum) */}
      <group position={[0, 0.015, -16.0]}>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 2.5]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
        </mesh>
        {/* Low Travertine Threshold Step */}
        <mesh castShadow receiveShadow position={[0, 0.06, -1.25]}>
          <boxGeometry args={[10.4, 0.12, 0.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.78} />
        </mesh>
        {/* Subtle arena sand drift at Colosseum north threshold edge */}
        <CornerSandDrift position={[-5.0, 0, -1.25]} size={[0.8, 0.8]} tone="sand" />
        <CornerSandDrift position={[5.0, 0, -1.25]} size={[0.8, 0.8]} tone="sand" />
      </group>

      {/* SOUTH EXIT (Toward Tavern & Town Gate) */}
      <group position={[0, 0.015, 16.0]}>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 2.5]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.06, 1.25]}>
          <boxGeometry args={[10.4, 0.12, 0.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.78} />
        </mesh>
        {/* Subtle street dust at south threshold edge */}
        <CornerSandDrift position={[-5.0, 0, 1.25]} size={[0.8, 0.8]} tone="dust" />
        <CornerSandDrift position={[5.0, 0, 1.25]} size={[0.8, 0.8]} tone="dust" />
      </group>

      {/* EAST EXIT (Toward Forge, Bazaar & Inn) */}
      <group position={[16.0, 0.015, 0]}>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.5, 8]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
        </mesh>
        <mesh castShadow receiveShadow position={[1.25, 0.06, 0]}>
          <boxGeometry args={[0.4, 0.12, 8.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.78} />
        </mesh>
        {/* Subtle street dust at east threshold edge */}
        <CornerSandDrift position={[1.25, 0, -4.0]} size={[0.8, 0.8]} tone="dust" />
        <CornerSandDrift position={[1.25, 0, 4.0]} size={[0.8, 0.8]} tone="dust" />
      </group>

      {/* WEST EXIT (Toward Training Yard) */}
      <group position={[-16.0, 0.015, 0]}>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.5, 8]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
        </mesh>
        <mesh castShadow receiveShadow position={[-1.25, 0.06, 0]}>
          <boxGeometry args={[0.4, 0.12, 8.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.78} />
        </mesh>
        {/* Subtle arena sand drift at west threshold edge */}
        <CornerSandDrift position={[-1.25, 0, -4.0]} size={[0.8, 0.8]} tone="sand" />
        <CornerSandDrift position={[-1.25, 0, 4.0]} size={[0.8, 0.8]} tone="sand" />
      </group>

      {/* Basalt Travertine Stone Road Bed (Statumen Sub-Layer) */}
      <mesh receiveShadow position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 72]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>

      {/* PHASE 27 — AUTHENTIC ROMAN TRIUMPHAL FLAGSTONE CARRIAGEWAYS */}
      {/* Continuous Triumphal Carriageways (Colosseum approach → Gatehouse approach, z = -0.5 to 20.5) */}
      {/* Phase 1A.2: span reduced from z=-1..21 (length 22) to z=-0.5..20.5 (length 21) to clear
          the Colosseum foundation step (outer radius 19.5: at x=±2.5 reaches z≈-0.66, at x=±4.7
          z≈-1.08) and to leave adequate Gatehouse clearance (tower foundation north face z=21.05,
          main foundation z=21.35). Min clearance: 0.16m north inner edge, 0.55m south end. */}
      <RomanPavedStreet
        position={[-4.7, 0, 10.0]}
        length={21.0}
        width={4.4}
        district="triumphal"
        hasGutters={true}
        gutterWidth={0.32}
        stonePitch={1.1}
      />
      <RomanPavedStreet
        position={[4.7, 0, 10.0]}
        length={21.0}
        width={4.4}
        district="triumphal"
        hasGutters={true}
        gutterWidth={0.32}
        stonePitch={1.1}
      />

      {/* Imperial Crimson & Gold Mosaic Central Runner */}
      <mesh receiveShadow position={[0, 0.01, 10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 21]} />
        <meshStandardMaterial color={ROMAN_PALETTE.imperialRunner.color} roughness={0.7} />
      </mesh>

      {/* Gold Trim Road Curbs */}
      {[-2.55, 2.55].map((rx, ri) => (
        <mesh key={`gold-trim-${ri}`} position={[rx, 0.02, 10]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.25, 21]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>
      ))}

      {/* Raised Travertine Sidewalk Curbs */}
      {[-7.2, 7.2].map((cx, ci) => (
        <mesh key={`curb-${ci}`} receiveShadow castShadow position={[cx, 0.1, 10]}>
          <boxGeometry args={[0.6, 0.2, 21]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.roadKerb.color}
            roughness={0.76}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.012}
          />
        </mesh>
      ))}

      {/* 3. COLOSSAL FLUTED ROMAN COLONNADE ALONG BOULEVARD */}
      {/* North-side column at z=-1 frames the Colosseum approach (wall at z≈-3.0 for x=±8.5;
          plinth 1.2×1.2 sits at distance 19.97 from Colosseum center — outside the wall). */}
      {[-8.5, 8.5].map((cx, ci) =>
        [-1, 8, 16].map((cz, zi) => (
          <group key={`col-${ci}-${zi}`} position={[cx, 0, cz]}>
            {/* Square Plinth Base */}
            <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
              <boxGeometry args={[1.2, 0.5, 1.2]} />
              <meshStandardMaterial
                color={ROMAN_PALETTE.travertineDark.color}
                roughness={0.82}
                bumpMap={NOISE_TEXTURE || undefined}
                bumpScale={0.012}
              />
            </mesh>
            {/* Fluted Marble Column Shaft */}
            <mesh castShadow position={[0, 3.0, 0]}>
              <cylinderGeometry args={[0.42, 0.46, 5.0, 16]} />
              <meshStandardMaterial
                color={ROMAN_PALETTE.marbleWhite.color}
                roughness={0.52}
                bumpMap={NOISE_TEXTURE || undefined}
                bumpScale={0.008}
              />
            </mesh>
            {/* Corinthian Sculpted Capital */}
            <mesh castShadow position={[0, 5.75, 0]}>
              <boxGeometry args={[1.1, 0.6, 1.1]} />
              <meshStandardMaterial
                color={ROMAN_PALETTE.goldAccent.color}
                metalness={0.75}
                roughness={0.34}
              />
            </mesh>
          </group>
        ))
      )}

      {/* 4. MEDITERRANEAN CYPRESS TREES (NATURAL ITALIAN FLORA) */}
      {/* Phase 1A.3: north-side cypress moved from z=-3 to z=-2.5. The planter is a cylinder
          (ground radius 0.85 x scale 1.05 = 0.8925). At z=-3 circle-to-circle clearance
          vs Colosseum foundation (r=19.5, center [0,-20]) was 0.132m, below 0.30m target.
          No actual intersection; prior 0.154m was a bounding-box artifact. At z=-2.5:
          d=20.94, clearance=0.548m. Crowns clear all columns/braziers by >1.4m. */}
      {[-11.5, 11.5].map((px, pi) =>
        [-2.5, 10, 20].map((pz, zi) => (
          <ItalianCypress key={`cypress-${pi}-${zi}`} position={[px, 0, pz]} scale={1.05} />
        ))
      )}

      {/* 5. ROMAN STREET BRAZIERS WITH WARM AMBER FLAMES */}
      {/* North-side brazier at z=0 lights the Colosseum approach. Phase 1A.2: moved from
          z=-1 (pedestal north edge clipped Colosseum foundation step by ~17mm at inner
          edge x=±5.8) to z=0. Min clearance from foundation: 0.98m at inner pedestal edge. */}
      {[-6.2, 6.2].map((bx, bi) =>
        [0, 2, 12, 18].map((bz, zi) => (
          <StreetBrazier key={`brazier-${bi}-${zi}`} position={[bx, 0, bz]} />
        ))
      )}

      {/* 6. CENTRAL PLAZA MONUMENTAL NAVE FOUNTAIN */}
      <group position={[0, 0, 0]}>
        {/* Tier 1 - Outer Marble Water Basin */}
        <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
          <cylinderGeometry args={[3.2, 3.6, 0.7, 24]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.travertine.color}
            roughness={0.72}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.012}
          />
        </mesh>
        {/* Shimmering Aqueduct Water Pool */}
        <mesh position={[0, 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.9, 24]} />
          <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.8} />
        </mesh>
        {/* Tier 2 - Central Marble Shaft */}
        <mesh castShadow position={[0, 1.4, 0]}>
          <cylinderGeometry args={[1.0, 1.3, 1.6, 16]} />
          <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.55} />
        </mesh>
        {/* Tier 3 - Upper Cascade Basin */}
        <mesh castShadow position={[0, 2.3, 0]}>
          <cylinderGeometry args={[1.6, 1.2, 0.4, 16]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.65} />
        </mesh>
        {/* Gilded Roman Bronze Eagle (Aquila) on Spire - Authentically Patinated Bronze */}
        <mesh castShadow position={[0, 3.1, 0]}>
          <sphereGeometry args={[0.55, 12, 12]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={0.76}
            roughness={0.42}
          />
        </mesh>
        <mesh castShadow position={[0, 3.8, 0]}>
          <cylinderGeometry args={[0.08, 0.16, 1.2, 8]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={0.76}
            roughness={0.42}
          />
        </mesh>
      </group>

      {/* 7. CIVIC FORUM SEATING & PUBLIC GATHERING BENCHES (PHASE 26) */}
      {/* Placed at comfortable radial distances (r ~ 6.5m) facing the central fountain without blocking 4 cardinal avenues.
          Phase 1A.2: north pair moved from z=-1 to z=1. At z=-1 the 45°-rotated bench
          (2.0×0.65m) clipped the Colosseum foundation by ~0.71m (north corner at z≈-1.94
          vs foundation z≈-1.23 at that x). At z=1 the min clearance is 1.29m. */}
      <RomanBench position={[-4.8, 0, 1.0]} rotationY={Math.PI / 4} />
      <RomanBench position={[4.8, 0, 1.0]} rotationY={-Math.PI / 4} />
      <RomanBench position={[-4.8, 0, 4.8]} rotationY={(3 * Math.PI) / 4} />
      <RomanBench position={[4.8, 0, 4.8]} rotationY={(-3 * Math.PI) / 4} />

      {/* Colonnade Resting Benches tucked between column bays */}
      {/* North-side pair at z=4 (bay between z=-1 and z=8 columns; original z=-12 was inside
          the Colosseum — z=4 is the closest safe bay midpoint) */}
      <RomanBench position={[-8.8, 0, 4]} rotationY={Math.PI / 2} />
      <RomanBench position={[8.8, 0, 4]} rotationY={-Math.PI / 2} />
      <RomanBench position={[-8.8, 0, 12]} rotationY={Math.PI / 2} />
      <RomanBench position={[8.8, 0, 12]} rotationY={-Math.PI / 2} />

      {/* Restrained decorative amphorae nestled near column plinths */}
      {/* North-side pair at z=-2 (near the z=-1 column; amphora edge at distance 19.48
          from Colosseum center — safely outside the wall) */}
      <RomanAmphora position={[-8.2, 0, -2.0]} scale={0.85} tone="terracotta" />
      <RomanAmphora position={[8.2, 0, -2.0]} scale={0.85} tone="sand" />
      <RomanAmphora position={[-8.2, 0, 15.2]} scale={0.85} tone="dark" />
      <RomanAmphora position={[8.2, 0, 15.2]} scale={0.85} tone="terracotta" />
    </group>
  );
};
