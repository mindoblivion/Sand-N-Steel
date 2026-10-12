import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { ClassicalPediment, ClassicalColumn } from './ClassicalArchitecture';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';
import { Banner } from './EnvironmentalMotion';

// ---------------------------------------------------------------------------
// Phase 25.7 — Unified angular convention
//
// ALL Colosseum geometry uses the Three.js cylinder convention:
//   X = R · sin(θ),  Z = R · cos(θ)
//   θ = 0   → local +Z  (front entrance, player approach)
//   θ = π   → local −Z  (rear, 54° facade gap)
//
// The Colosseum exterior is a 306° partial cylinder (thetaStart = −0.85π,
// thetaLength = 1.7π).  The 54° rear gap is centered on θ = π (−Z), invisible
// from the player's normal viewing position.  The monumental portal sits at
// θ = 0 (+Z) and spans roughly ±25°; we skip arch bays whose centre falls
// inside [ENTRANCE_MIN, ENTRANCE_MAX] so the entrance stays unobstructed.
//
// Facade construction (not flat stickers):
//   • Outer facade ring  (piers, sill, spandrel, arch tops)  at R_FACADE  = 19.3
//   • Wall depth = 1.3 units  → genuine recessed depth.
//   • Tier 1 liner was removed (Phase 25.4) — arch openings are genuine
//     through-apertures revealing the interior seating bowl behind the
//     facade framing.  Natural shadow from the WALL_DEPTH recess replaces
//     the former dark liner panel.
// ---------------------------------------------------------------------------

const ARC_THETA_START = -Math.PI * 0.85;
const ARC_THETA_LENGTH = Math.PI * 1.7;
const ARC_END = ARC_THETA_START + ARC_THETA_LENGTH; // 0.85π ≈ 2.670

// Entrance skip zone — centered on θ = 0 (+Z, player approach).
// Width ≈ 49° matches the original; now aligned with the portal at +Z.
const ENTRANCE_MIN = -0.43; // ≈ −24.6°
const ENTRANCE_MAX = 0.43;  // ≈ +24.6°

// Tier 1 — Lower arched arcade
const R_FACADE = 19.3;
const R_LINER = 18.0;
const WALL_DEPTH = R_FACADE - R_LINER; // 1.3 — radial depth of facade wall
const SILL_TOP = 2.5; // top of solid sill band = bottom of opening
const ARCH_SPRING = 6.0; // arch spring line
const ARCH_R = 1.35; // arch radius = half opening width
const SPANDREL_TOP = 8.0; // top of spandrel band = tier top
const JAMB_W = 1.8;
const JAMB_H = ARCH_SPRING - SILL_TOP; // 3.5
const JAMB_OFFSET = (ARCH_R + JAMB_W / 2) / R_FACADE; // angular offset for jambs

// Tier 2 — Upper pilaster arcade
const R_FACADE_T2 = 17.8;
const R_LINER_T2 = 17.0;
const T2_BOTTOM = 8.5;
const T2_SILL_TOP = 9.5;
const T2_TOP = 14.5;
const PILASTER_H = T2_TOP - T2_SILL_TOP; // 5.0

// Interior seating
const R_ARENA_WALL = 15.3;
const SEATING_T1_R_OUT = 16.8;
const SEATING_T2_R_OUT = 17.8; // 0.2 inside R_LINER — no z-fight

export const GrandColosseum = React.memo(() => {
  // Phase 2B.12: Dedicated bump-map for Colosseum wall surfaces.
  const colosseumWallBumpMap = useMemo(() => {
    if (!NOISE_TEXTURE) return undefined;
    const tex = NOISE_TEXTURE.clone();
    tex.repeat.set(22, 3);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Phase 25.1: Local warm recess tone — replaces near-black #131110.
  const colosseumRecessColor = '#3d352a';

  // Phase 25.2: Shared material instances (created once, reused across meshes).
  const facadeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.travertineDark.color,
    roughness: 0.82,
    bumpMap: colosseumWallBumpMap || undefined,
    bumpScale: 0.015,
    side: THREE.DoubleSide,
  }), [colosseumWallBumpMap]);

  const recessMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: colosseumRecessColor,
    roughness: 0.92,
    side: THREE.DoubleSide,
  }), []);

  // Phase 25.2: Lighter travertine for interior so seating is visible through
  // the entrance and facade openings against the darker liner.
  const interiorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.travertine.color,
    roughness: 0.80,
    side: THREE.DoubleSide,
  }), []);

  // Phase 25.2: Bright cornice material — marbleWhite for clear tier separation.
  const corniceMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.marbleWhite.color,
    roughness: 0.62,
    metalness: 0.06,
    side: THREE.DoubleSide,
  }), []);

  // Phase 25.2: Shared geometries for repeated facade elements.
  const jambGeo = useMemo(() => new THREE.BoxGeometry(JAMB_W, JAMB_H, WALL_DEPTH), []);
  const archTopGeo = useMemo(
    () => new THREE.CylinderGeometry(ARCH_R, ARCH_R, WALL_DEPTH, 16, 1, false, 0, Math.PI),
    [],
  );
  const pilasterGeo = useMemo(
    () => new THREE.BoxGeometry(JAMB_W, PILASTER_H, 0.8),
    [],
  );

  // Phase 25.4: Portal stone material (travertine, matching original portal finish).
  const portalStoneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.travertine.color,
    roughness: 0.78,
    bumpMap: colosseumWallBumpMap || undefined,
    bumpScale: 0.012,
    side: THREE.DoubleSide,
  }), [colosseumWallBumpMap]);

  // Phase 25.4: Open-bar portcullis — lightweight iron grille replacing the
  // opaque panel.  Shared material and bar geometries keep draw calls minimal.
  const portcullisMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.darkIron.color,
    metalness: 0.82,
    roughness: 0.48,
  }), []);
  const portcullisBarVGeo = useMemo(() => new THREE.BoxGeometry(0.12, 6.0, 0.08), []);
  const portcullisBarHGeo = useMemo(() => new THREE.BoxGeometry(4.8, 0.12, 0.08), []);

  // Phase 25.2: Regularly spaced arch positions around the 306° arc.
  // 18° spacing → ~16 bays (2 skipped at the entrance).
  const archAngles = useMemo(() => {
    const angles: number[] = [];
    const spacing = 18 * Math.PI / 180;
    for (let a = ARC_THETA_START; a <= ARC_END + 0.001; a += spacing) {
      if (a < ENTRANCE_MIN || a > ENTRANCE_MAX) {
        angles.push(a);
      }
    }
    return angles;
  }, []);

  // Phase 25.4: Pilaster angles — positioned at the midpoints between adjacent
  // arch bays, aligning each pilaster above the structural pier between arches
  // rather than above the arch centre.  The entrance-adjacent midpoint falls
  // inside the skip zone and is excluded so no pilaster sits in the entrance gap.
  const pilasterAngles = useMemo(() => {
    const angles: number[] = [];
    for (let i = 0; i < archAngles.length - 1; i++) {
      const pierAngle = (archAngles[i] + archAngles[i + 1]) / 2;
      if (pierAngle < ENTRANCE_MIN || pierAngle > ENTRANCE_MAX) {
        angles.push(pierAngle);
      }
    }
    return angles;
  }, [archAngles]);

  // Cleanup all shared GPU resources.
  useEffect(() => {
    return () => {
      colosseumWallBumpMap?.dispose();
      facadeMat.dispose();
      recessMat.dispose();
      interiorMat.dispose();
      corniceMat.dispose();
      portalStoneMat.dispose();
      portcullisMat.dispose();
      jambGeo.dispose();
      archTopGeo.dispose();
      pilasterGeo.dispose();
      portcullisBarVGeo.dispose();
      portcullisBarHGeo.dispose();
    };
  }, [colosseumWallBumpMap, facadeMat, recessMat, interiorMat, corniceMat, portalStoneMat, portcullisMat, jambGeo, archTopGeo, pilasterGeo, portcullisBarVGeo, portcullisBarHGeo]);

  // Helper: angular length of the left arc segment (arc start → entrance).
  const seg1Len = ENTRANCE_MIN - ARC_THETA_START;
  // Helper: angular start and length of the right arc segment (entrance → arc end).
  const seg2Start = ENTRANCE_MAX;
  const seg2Len = ARC_END - ENTRANCE_MAX;

  return (
    <group position={[0, 0, -20]}>
      {/* ===================================================================
          0. STEPPED TRAVERTINE FOUNDATION PODIUM PLINTH
          =================================================================== */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[19.3, 19.5, 0.16, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[19.0, 19.2, 0.16, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ===================================================================
          1. TIER 1 — LOWER ARCHED ARCADE
          =================================================================== */}

      {/* 1a. Phase 25.4: Tier 1 liner removed — arch openings are now genuine
            through-apertures revealing the interior seating bowl (sections 4a–4c)
            behind the facade framing.  The sill band (1b), spandrel band (1c),
            jambs (1d), and arch tops (1d) provide the solid wall surfaces; the
            WALL_DEPTH (1.3) recess creates natural shadow without a sealing
            dark panel. */}

      {/* 1b. Sill band — solid wall below the arches. */}
      <mesh material={facadeMat} receiveShadow position={[0, (0.3 + SILL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE, R_FACADE, SILL_TOP - 0.3, 36, 1, true, ARC_THETA_START, seg1Len]} />
      </mesh>
      <mesh material={facadeMat} receiveShadow position={[0, (0.3 + SILL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE, R_FACADE, SILL_TOP - 0.3, 36, 1, true, seg2Start, seg2Len]} />
      </mesh>

      {/* 1c. Spandrel band — solid wall above the arches. */}
      <mesh material={facadeMat} receiveShadow position={[0, (ARCH_SPRING + ARCH_R + SPANDREL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE, R_FACADE, SPANDREL_TOP - (ARCH_SPRING + ARCH_R), 36, 1, true, ARC_THETA_START, seg1Len]} />
      </mesh>
      <mesh material={facadeMat} receiveShadow position={[0, (ARCH_SPRING + ARCH_R + SPANDREL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE, R_FACADE, SPANDREL_TOP - (ARCH_SPRING + ARCH_R), 36, 1, true, seg2Start, seg2Len]} />
      </mesh>

      {/* 1d. Arch bays — jambs (piers) and arch tops at each position.
            All positions use the cylinder convention: X = R·sin(θ), Z = R·cos(θ).
            Jambs: shared BoxGeometry, Y-rotation = θ orients width tangentially
            and depth radially.
            Arch tops: shared half-cylinder.  Rotation [0, π/2+θ, π/2]: the Z
            rotation maps the bulge from +X to +Y (upward); the Y rotation
            orients the flat side tangentially and the wall-depth axis radially. */}
      {archAngles.map((angle, i) => {
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const lA = angle - JAMB_OFFSET;
        const rA = angle + JAMB_OFFSET;
        const jY = (SILL_TOP + ARCH_SPRING) / 2;
        return (
          <group key={`t1-bay-${i}`}>
            {/* Left jamb */}
            <mesh geometry={jambGeo} material={facadeMat} castShadow
              position={[Math.sin(lA) * R_FACADE, jY, Math.cos(lA) * R_FACADE]}
              rotation={[0, lA, 0]}
            />
            {/* Right jamb */}
            <mesh geometry={jambGeo} material={facadeMat} castShadow
              position={[Math.sin(rA) * R_FACADE, jY, Math.cos(rA) * R_FACADE]}
              rotation={[0, rA, 0]}
            />
            {/* Arch top — half-cylinder, flat side at spring line, curve rising
                ARCH_R above.  The Z rotation puts the semicircle bulge on top
                (+Y); the Y rotation (π/2+θ) orients it radially. */}
            <mesh geometry={archTopGeo} material={facadeMat} castShadow
              position={[sin * R_FACADE, ARCH_SPRING, cos * R_FACADE]}
              rotation={[0, Math.PI / 2 + angle, Math.PI / 2]}
            />
          </group>
        );
      })}

      {/* 1e. Tier 1 cornice — bright stone band separating tiers.
            Radius protrudes beyond the facade (19.5) for a shadow-casting lip. */}
      <mesh material={corniceMat} position={[0, 8.2, 0]}>
        <cylinderGeometry args={[19.5, 19.5, 0.8, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* ===================================================================
          2. TIER 2 — UPPER PILASTER ARCADE
          =================================================================== */}

      {/* 2a. Inner dark liner — window-depth backdrop (2 segments). */}
      <mesh material={recessMat} position={[0, (T2_SILL_TOP + T2_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_LINER_T2, R_LINER_T2, T2_TOP - T2_SILL_TOP, 36, 1, true, ARC_THETA_START, seg1Len]} />
      </mesh>
      <mesh material={recessMat} position={[0, (T2_SILL_TOP + T2_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_LINER_T2, R_LINER_T2, T2_TOP - T2_SILL_TOP, 36, 1, true, seg2Start, seg2Len]} />
      </mesh>

      {/* 2b. Sill band between cornice and pilasters (2 segments). */}
      <mesh material={facadeMat} receiveShadow position={[0, (T2_BOTTOM + T2_SILL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE_T2, R_FACADE_T2, T2_SILL_TOP - T2_BOTTOM, 36, 1, true, ARC_THETA_START, seg1Len]} />
      </mesh>
      <mesh material={facadeMat} receiveShadow position={[0, (T2_BOTTOM + T2_SILL_TOP) / 2, 0]}>
        <cylinderGeometry args={[R_FACADE_T2, R_FACADE_T2, T2_SILL_TOP - T2_BOTTOM, 36, 1, true, seg2Start, seg2Len]} />
      </mesh>

      {/* 2c. Pilasters — vertical stone strips aligned above the Tier 1 piers
            (between adjacent arches), not above arch centres.  Gaps between
            pilasters reveal the dark liner, reading as windows. */}
      {pilasterAngles.map((angle, i) => {
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const rotY = angle;
        return (
          <mesh key={`t2-pilaster-${i}`} geometry={pilasterGeo} material={facadeMat} castShadow
            position={[sin * R_FACADE_T2, (T2_SILL_TOP + T2_TOP) / 2, cos * R_FACADE_T2]}
            rotation={[0, rotY, 0]}
          />
        );
      })}

      {/* 2d. Tier 2 cornice — golden attic cornice (radius adjusted to 18.1). */}
      <mesh position={[0, 15.0, 0]}>
        <cylinderGeometry args={[18.1, 18.1, 0.8, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.goldAccent.color}
          metalness={0.75}
          roughness={0.34}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2e. Attic wall — solid upper wall above the golden cornice.
            Gives the building a finished top, matching the real Colosseum's
            tall attic storey.  R=17.5 tapers inward from the tier-2 facade
            (17.8); height 1.6 brings the crest to y=17.0. */}
      <mesh material={facadeMat} receiveShadow position={[0, 16.2, 0]}>
        <cylinderGeometry args={[17.5, 17.8, 1.6, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* 2f. Attic crest cornice — bright stone cap on the attic wall. */}
      <mesh material={corniceMat} position={[0, 17.1, 0]}>
        <cylinderGeometry args={[17.8, 17.8, 0.5, 36, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* ===================================================================
          3. MONUMENTAL ARENA PORTAL ENTRANCE (PORTA LIBITINENSIS)
          =================================================================== */}
      <group position={[0, 0, 15.2]}>
        {/* Broader Marble Ceremonial Entrance Steps */}
        <group position={[0, 0, 2.2]}>
          <mesh castShadow receiveShadow position={[0, 0.1, 1.0]}>
            <boxGeometry args={[14.0, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.8} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.3, 0.2]}>
            <boxGeometry args={[12.0, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.5, -0.6]}>
            <boxGeometry args={[10.2, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.65} />
          </mesh>
          {/* Phase 25: Subtle arena sand drift at entrance step corners */}
          <mesh receiveShadow position={[-7.2, 0.015, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
            <meshStandardMaterial color={ROMAN_PALETTE.arenaSand.color} roughness={0.94} />
          </mesh>
          <mesh receiveShadow position={[7.2, 0.015, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
            <meshStandardMaterial color={ROMAN_PALETTE.arenaSand.color} roughness={0.94} />
          </mesh>
        </group>

        {/* Phase 25.4: Portal side piers — structural stone at the passage
            edges, leaving the centre physically open.  Replaces the former
            solid box that filled the entire aperture.  Pier width 2.65 =
            (10.5 − 5.2) / 2, height 8.8, depth 3.4 — same envelope as the
            original archway block, but the passage is now void. */}
        <mesh material={portalStoneMat} castShadow receiveShadow position={[-3.925, 4.4, 0]}>
          <boxGeometry args={[2.65, 8.8, 3.4]} />
        </mesh>
        <mesh material={portalStoneMat} castShadow receiveShadow position={[3.925, 4.4, 0]}>
          <boxGeometry args={[2.65, 8.8, 3.4]} />
        </mesh>

        {/* Phase 25.4: Lintel — stone beam spanning the passage above the
            6.4-unit-high opening, resting on the side piers. */}
        <mesh material={portalStoneMat} castShadow receiveShadow position={[0, 7.6, 0]}>
          <boxGeometry args={[5.2, 2.4, 3.4]} />
        </mesh>

        {/* Phase 25.4: Open-bar portcullis — vertical and horizontal iron bars
            forming a grille, not an opaque panel.  The passage behind remains
            visible through the bar gaps. */}
        {[-1.92, -0.96, 0, 0.96, 1.92].map((bx, bi) => (
          <mesh key={`pcv-${bi}`} geometry={portcullisBarVGeo} material={portcullisMat}
            position={[bx, 3.4, 0.6]} />
        ))}
        {[1.9, 4.9].map((by, bi) => (
          <mesh key={`pch-${bi}`} geometry={portcullisBarHGeo} material={portcullisMat}
            position={[0, by, 0.6]} />
        ))}

        {/* Classical Roman Triumphal Pediment Roof */}
        <ClassicalPediment
          width={11.0}
          depth={3.8}
          height={2.2}
          position={[0, 8.8, 0]}
          stoneColor={ROMAN_PALETTE.travertine.color}
          trimColor={ROMAN_PALETTE.terracottaTileDark.color}
        />

        {/* Golden Roman Inscription Arch Frieze: "COLOSSEVM ROMANVM" */}
        <mesh position={[0, 7.8, 1.75]}>
          <boxGeometry args={[8.8, 1.2, 0.2]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>

        {/* Gilded Roman Eagle Medallion Relief over Portal */}
        <mesh position={[0, 6.5, 1.78]}>
          <cylinderGeometry args={[0.75, 0.75, 0.1, 16]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>

        {/* Flanking Corinthian Columns with Stepped Bases & Capitals */}
        {[-4.2, 4.2].map((cx, ci) => (
          <ClassicalColumn
            key={`col-portal-${ci}`}
            position={[cx, 0, 1.8]}
            height={8.8}
            radius={0.42}
            stoneColor={ROMAN_PALETTE.marbleWhite.color}
            capitalColor={ROMAN_PALETTE.goldAccent.color}
            metalness={ROMAN_PALETTE.goldAccent.metalness}
            order="corinthian"
          />
        ))}

        {/* Dynamic Imperial Banners */}
        {[-4.6, 4.6].map((bx, bi) => (
           <Banner key={`banner-${bi}`} position={[bx, 7.0, 1.9]} size={[1.4, 2.8]} color="#991b1b" />
        ))}

        {/* Colossal Entrance Braziers with Fire Light */}
        {[-3.0, 3.0].map((tx, ti) => (
          <group key={`col-torch-${ti}`} position={[tx, 1.2, 2.4]}>
            <mesh castShadow position={[0, 0.6, 0]}>
              <cylinderGeometry args={[0.65, 0.5, 1.2, 12]} />
              <meshStandardMaterial color="#78350f" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
              <sphereGeometry args={[0.35, 12, 12]} />
              <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
            </mesh>
            <pointLight color="#f97316" intensity={4} distance={12} position={[0, 1.8, 0]} />
          </group>
        ))}

        {/* Flanking Spectator Travertine Benches outside monumental steps */}
        <RomanBench position={[-6.8, 0, 2.2]} rotationY={0} />
        <RomanBench position={[6.8, 0, 2.2]} rotationY={0} />

        {/* Ceremonial / Arena Oil Amphorae flanking column plinths */}
        <RomanAmphora position={[-4.8, 0, 2.8]} scale={0.9} tone="terracotta" />
        <RomanAmphora position={[4.8, 0, 2.8]} scale={0.9} tone="terracotta" />
      </group>

      {/* ===================================================================
          4. INTERIOR SEATING BOWL
          Lightweight amphitheatre interior: low arena boundary wall, two
          sloped seating frustums (truncated-cone ring segments).  All use the
          same 306° arc as the exterior.  No new lights — relies on existing
          scene lighting and DoubleSide rendering.
          =================================================================== */}

      {/* 4a. Arena boundary wall (podium) — separates sand from seating.
            Uses facadeMat (travertine + bump) so it reads as solid exterior-
            quality stone, visually distinct from the lighter seating surfaces. */}
      <mesh material={facadeMat} receiveShadow position={[0, (0.05 + 1.25) / 2, 0]}>
        <cylinderGeometry args={[R_ARENA_WALL, R_ARENA_WALL, 1.2, 32, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* 4b. Seating tier 1 (ima cavea) — slopes from r=15.3 at y=1.25
            to r=16.8 at y=3.75.  radiusTop > radiusBottom creates the
            outward-and-upward slope of amphitheatre seating. */}
      <mesh material={interiorMat} receiveShadow position={[0, (1.25 + 3.75) / 2, 0]}>
        <cylinderGeometry args={[SEATING_T1_R_OUT, R_ARENA_WALL, 2.5, 32, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* 4c. Seating tier 2 (media cavea) — slopes from r=16.8 at y=3.75
            to r=17.8 at y=6.25.  Outer edge (17.8) is 0.2 inside the
            Tier 1 dark liner (18.0) — no z-fighting. */}
      <mesh material={interiorMat} receiveShadow position={[0, (3.75 + 6.25) / 2, 0]}>
        <cylinderGeometry args={[SEATING_T2_R_OUT, SEATING_T1_R_OUT, 2.5, 32, 1, true, ARC_THETA_START, ARC_THETA_LENGTH]} />
      </mesh>

      {/* ===================================================================
          5. ARENA FLOOR
          Phase 25.1: Raised to y=0.05 for ground-plane clearance.
          =================================================================== */}
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[15, 32]} />
        <meshStandardMaterial color={ROMAN_PALETTE.arenaSand.color} roughness={ROMAN_PALETTE.arenaSand.roughness} />
      </mesh>
    </group>
  );
});
