import React, { useMemo, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { ClassicalPediment, ClassicalColumn } from './ClassicalArchitecture';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';
import { Banner } from './EnvironmentalMotion';
import { ColosseumSignPrototype } from './ColosseumSignPrototype';

// ---------------------------------------------------------------------------
// Phase 25.7 — Unified angular convention
//
// ALL Colosseum geometry uses the Three.js cylinder convention:
//   X = R · sin(θ),  Z = R · cos(θ)
//   θ = 0   → local +Z  (front entrance, player approach)
//   θ = π   → local −Z  (rear axial gate, the bridge axis)
//
// Phase C-8.31: the drum runs the FULL circle (it was a 306° partial cylinder,
// thetaStart −0.85π, thetaLength 1.7π) and is cut at exactly two axial
// openings — the monumental portal at θ = 0 (+Z, ±24.6°) and the rear gate at
// θ = π (−Z, ±8.03°).  Both lie on the seam between the drum's two arcs, so
// every band still draws as two meshes and the draw-call count is unchanged.
// Arch bays tile each arc exactly, ending flush with each opening's jamb face.
//
// Facade construction (not flat stickers):
//   • Tier 1 wall occupies R_LINER (18.0) → R_FACADE (19.3), depth 1.3.
//     Sill band, spandrel band, piers and arch heads share ONE outer plane
//     at R_FACADE; piers and arch heads fill the wall thickness behind it
//     (Phase 25.8 — they were previously centred on R_FACADE and poked 0.65
//     through both faces of the bands).
//   • 9 bays tile each drum arc exactly (opening edge → opening edge), so no
//     pier or arch head ever hangs over the entrance gap or the rear gate.
//   • Arch heads are open (semicircular intrados with solid corner
//     spandrels), and the piers rise to the spandrel band — no see-through
//     slots between the arches.
//   • Tier 1 liner was removed (Phase 25.4) — arch openings are genuine
//     through-apertures revealing the interior seating bowl.
// ---------------------------------------------------------------------------

// Entrance skip zone — centered on θ = 0 (+Z, player approach).
// Width ≈ 49° matches the original; now aligned with the portal at +Z.
const ENTRANCE_MIN = -0.43; // ≈ −24.6°
const ENTRANCE_MAX = 0.43;  // ≈ +24.6°

// Tier 1 — Lower arched arcade
const R_FACADE = 19.3; // outer face of the tier-1 wall
const R_LINER = 18.0; // inner face of the tier-1 wall
const WALL_DEPTH = R_FACADE - R_LINER; // 1.3 — radial depth of facade wall
const R_WALL_MID = (R_FACADE + R_LINER) / 2; // 18.65 — centre of the wall thickness
const SILL_TOP = 2.5; // top of solid sill band = bottom of opening
const ARCH_SPRING = 6.0; // arch spring line
const ARCH_R = 1.35; // arch radius = half opening width
const SPANDREL_BOTTOM = ARCH_SPRING + ARCH_R; // 7.35 — arch crown = spandrel band bottom
const SPANDREL_TOP = 8.0; // top of spandrel band = tier top
const T1_CORNICE_R = 19.5;
const T1_CORNICE_Y = 8.2;
const T1_CORNICE_H = 0.8;
const T1_CORNICE_TOP = T1_CORNICE_Y + T1_CORNICE_H / 2; // 8.6

// Phase C-8.31 — rear axial gate.  Half-width 2.7 at the facade radius, i.e.
// ±8.03°: a 16.08° opening, 5.40 units wide.  The drawbridge deck (X ±2.0,
// ±2.22 across its side beams) passes through it with ~0.5 clear either side.
// It spans tier 1 only (0.16 … 7.35): the spandrel band closes its head and
// the tier-1 cornice forms its lintel, so the drum above stays continuous —
// the real building's outer ring has no rear notch in its attic.
const GATE_HALF_W = 2.7;
const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE); // ≈ 0.1402 rad (8.03°)

// The drum's two arcs.  Both openings sit on the seam between them — the
// entrance between the west arc's end and the east arc's start, the gate
// between the east arc's end and the west arc's start — so one two-entry array
// drives every band and the mesh count is exactly what it was before.
const DRUM_E_START = ENTRANCE_MAX;             //  0.43    ≈ 24.63°
const DRUM_E_END = Math.PI - GATE_HALF;        //  π − 8.03° ≈ 171.97°
const DRUM_W_START = Math.PI + GATE_HALF;      //  π + 8.03° ≈ 188.03°
const DRUM_W_END = 2 * Math.PI + ENTRANCE_MIN; //  2π − 0.43 ≈ 335.37°
const DRUM_ARCS: Array<[number, number]> = [
  [DRUM_E_START, DRUM_E_END - DRUM_E_START],
  [DRUM_W_START, DRUM_W_END - DRUM_W_START],
];

// Bands that stop at the front entrance only: they run straight over the rear
// gate, whose head and lintel they are (or which they sit above).
const FRONT_ARC_START = DRUM_E_START;
const FRONT_ARC_LEN = DRUM_W_END - DRUM_E_START;
const FRONT_CUT_ARCS: Array<[number, number]> = [[FRONT_ARC_START, FRONT_ARC_LEN]];

// Bands that stop at the rear gate only.  The flared base ring still runs
// under the front entrance steps as it always has, but the gate is a
// walk-through opening, so the ring is cut there.
const GATE_ARC_START = DRUM_W_START;
const GATE_ARC_LEN = 2 * Math.PI - 2 * GATE_HALF;

// Above the gate's lintel (the tier-1 cornice, 7.8 … 8.6) the drum is a
// complete ring again, so these bands run the whole turn — still one mesh
// each, exactly as they were when the drum was a 306° partial cylinder.
const FULL_TURN = 2 * Math.PI;

// Bays tile each drum arc exactly; each bay = arch opening + two half-piers,
// so neighbouring jambs meet at the pier centre without overlap and the bays
// flanking each opening end flush with it — the opening's own jamb face.
const BAYS_PER_SIDE = 9;
const BAY_PITCH = (DRUM_E_END - DRUM_E_START) / BAYS_PER_SIDE; // ≈ 16.37°
const JAMB_W = (BAY_PITCH * R_WALL_MID - 2 * ARCH_R) / 2; // ≈ 1.31 (half-pier)
const JAMB_H = SPANDREL_BOTTOM - SILL_TOP; // 4.85 — pier rises to the spandrel band
const JAMB_OFFSET = (ARCH_R + JAMB_W / 2) / R_WALL_MID; // angular offset for jambs

// Tier 2 — Upper pilaster arcade
const R_FACADE_T2 = 17.8;
const R_LINER_T2 = 17.0;
const T2_BOTTOM = 8.5;
const T2_SILL_TOP = 9.5;
const T2_TOP = 14.5;
const PILASTER_H = T2_TOP - T2_SILL_TOP; // 5.0
const T2_CORNICE_R = 18.1;
const T2_CORNICE_TOP = 15.4; // = attic base

// Interior seating
const R_ARENA_WALL = 15.3;
const SEATING_T1_R_OUT = 16.8;
const SEATING_T2_R_OUT = 17.8; // 0.2 inside R_LINER — no z-fight

// Phase C-8.28 — entrance passage through the interior bowl.
//
// The monumental portal's passage is 5.2 wide: the lintel spans [−2.6, +2.6]
// and the piers' inner faces land on that same line (|X| = 3.925 − 2.65/2
// = 2.6).  The podium ring and both seating frustums, however, ran over the
// FULL 306° arc, so they crossed the doorway: a 1.2-high travertine wall
// stood at Z = −9.7 in the middle of the entrance, with the cavea slope
// rising directly behind it.  The walk-in path went straight through both
// (collision only reached the facade at R_FACADE, nothing modelled the bowl).
//
// Like every other entrance band in this file — plinth, sill, spandrel, tier
// cornices, tier ledge, window-recess ceiling — the bowl now stops at the
// entrance instead of spanning it, so the doorway opens straight through onto
// the sand.  The gap is cut on the portal's own passage width (a radial cut
// at the podium radius), which also lines its edge up with the piers' inner
// faces: the vestibule side wall runs unbroken from the pier into the podium.
const PORTAL_PASSAGE_HALF_W = 2.6; // lintel half-width = pier inner face |X|
const BOWL_GAP_HALF = Math.asin(PORTAL_PASSAGE_HALF_W / R_ARENA_WALL); // ≈ 0.1716 rad (9.83°)

// Phase C-8.31: the rear gate cuts the bowl on that same 5.2-unit passage
// line, so both openings open straight through onto the sand and the ring's
// two cuts are congruent.  The gate's own clear width (5.40 at the facade)
// facade) does not set it: the passage is set by the structure the player
// walks through, just as the monumental doorway — 8.6 wide between its piers —
// is cut to this same 5.2 line.  The cavea's cut is therefore a little wider
// than the gate's jamb faces, so nothing of the seating projects into the
// opening.
const BOWL_E_END = Math.PI - BOWL_GAP_HALF;
const BOWL_W_START = Math.PI + BOWL_GAP_HALF;
const BOWL_W_END = 2 * Math.PI - BOWL_GAP_HALF;
const BOWL_ARCS: Array<[number, number]> = [
  [BOWL_GAP_HALF, BOWL_E_END - BOWL_GAP_HALF],
  [BOWL_W_START, BOWL_W_END - BOWL_W_START],
];

// Phase 25.8: Flat horizontal annulus over [thetaStart, thetaStart + thetaLength]
// in the cylinder convention.  RingGeometry measures φ from +X in its XY
// plane; after the −π/2 X-rotation a ring point lands at (r·cos φ, 0, −r·sin φ),
// which equals (r·sin θ, 0, r·cos θ) for φ = θ − π/2.
const FlatArcRing: React.FC<{
  y: number;
  innerRadius: number;
  outerRadius: number;
  thetaStart: number;
  thetaLength: number;
  material: THREE.Material;
}> = ({ y, innerRadius, outerRadius, thetaStart, thetaLength, material }) => (
  <mesh material={material} receiveShadow position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[innerRadius, outerRadius, 36, 1, thetaStart - Math.PI / 2, thetaLength]} />
  </mesh>
);

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
  // Phase 25.8: Open arch head — the two corner spandrels between the
  // semicircular intrados and the square bay head, extruded through the wall
  // depth.  Their curved side walls form the arch soffit, so the opening reads
  // as a true arch (the former closed half-cylinder filled the arch head with
  // solid stone and left the spandrels open).  Local X = tangential,
  // Y = up from the spring line, Z = radial (centred on the wall thickness).
  const archHeadGeo = useMemo(() => {
    const left = new THREE.Shape();
    left.moveTo(-ARCH_R, 0);
    left.lineTo(-ARCH_R, ARCH_R);
    left.lineTo(0, ARCH_R);
    left.absarc(0, 0, ARCH_R, Math.PI / 2, Math.PI, false);
    const right = new THREE.Shape();
    right.moveTo(ARCH_R, 0);
    right.absarc(0, 0, ARCH_R, 0, Math.PI / 2, false);
    right.lineTo(ARCH_R, ARCH_R);
    right.lineTo(ARCH_R, 0);
    const geo = new THREE.ExtrudeGeometry([left, right], {
      depth: WALL_DEPTH,
      bevelEnabled: false,
      curveSegments: 8,
    });
    geo.translate(0, 0, -WALL_DEPTH / 2);
    return geo;
  }, []);
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

  // Phase 29.5D: Frieze inscription — "COLOSSEVM" rendered as a canvas texture
  // (gold background, dark bronze engraved lettering) using the existing
  // CanvasTexture pattern from RomanMaterials.tsx.  No new dependencies,
  // external fonts, or network requests.  System serif font only.
  const friezeInscriptionTex = useMemo(() => {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Gold background matching ROMAN_PALETTE.goldAccent (#b89547)
    ctx.fillStyle = '#b89547';
    ctx.fillRect(0, 0, 1024, 140);

    // Subtle vertical gradient for metallic depth
    const grad = ctx.createLinearGradient(0, 0, 0, 140);
    grad.addColorStop(0, 'rgba(0,0,0,0.10)');
    grad.addColorStop(0.5, 'rgba(255,220,150,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 140);

    // Engraved inscription — dark bronze lettering
    ctx.fillStyle = '#3a2e1a';
    ctx.font = 'bold 76px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COLOSSEVM', 512, 70);

    // Thin highlight along top edge of letters (engraved depth illusion)
    ctx.fillStyle = 'rgba(200,175,120,0.35)';
    ctx.fillText('COLOSSEVM', 512, 68);

    return new THREE.CanvasTexture(canvas);
  }, []);

  // Phase 25.8: 16 bays, 8 per facade segment, each centred in its own
  // BAY_PITCH slot.  The first and last slot edges coincide with the band
  // ends (entrance gap edge and rear arc end), so every jamb and arch head
  // sits on the sill band and under the spandrel band.  The former 18° grid
  // started on the arc end, which left half a bay hanging past each rear arc
  // end and put the inner jamb of each entrance-adjacent bay in the gap.
  const archAngles = useMemo(() => {
    const angles: number[] = [];
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_E_START + (i + 0.5) * BAY_PITCH);
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_W_START + (i + 0.5) * BAY_PITCH);
    return angles;
  }, []);

  // Phase 25.4: Pilaster angles — positioned at the midpoints between adjacent
  // arch bays, aligning each pilaster above the structural pier between arches
  // rather than above the arch centre.  The entrance-adjacent midpoint falls
  // inside the skip zone and is excluded so no pilaster sits in the entrance
  // gap, and Phase C-8.31 excludes the one that falls across the rear gate —
  // there is no pier under it either.
  const pilasterAngles = useMemo(() => {
    const angles: number[] = [];
    for (let i = 0; i < archAngles.length - 1; i++) {
      const pierAngle = (archAngles[i] + archAngles[i + 1]) / 2;
      if (pierAngle < ENTRANCE_MIN || pierAngle > ENTRANCE_MAX) {
        if (pierAngle <= Math.PI - GATE_HALF || pierAngle >= Math.PI + GATE_HALF) {
          angles.push(pierAngle);
        }
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
      archHeadGeo.dispose();
      pilasterGeo.dispose();
      portcullisBarVGeo.dispose();
      portcullisBarHGeo.dispose();
      friezeInscriptionTex?.dispose();
    };
  }, [colosseumWallBumpMap, facadeMat, recessMat, interiorMat, corniceMat, portalStoneMat, portcullisMat, jambGeo, archHeadGeo, pilasterGeo, portcullisBarVGeo, portcullisBarHGeo, friezeInscriptionTex]);

  return (
    <group position={[0, 0, -25]}>
      {/* ===================================================================
          0. STEPPED TRAVERTINE FOUNDATION PODIUM PLINTH
          =================================================================== */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[19.3, 19.5, 0.16, 36, 1, true, GATE_ARC_START, GATE_ARC_LEN]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Phase 25.8: Upper plinth stops at the entrance gap like the sill band;
          running across it, its 0.14–0.30 shell rose 0.1 through the tread of
          the bottom entrance step (y 0–0.2).  Phase C-8.31: it stops at the
          rear gate too — the gate's floor is the ground, not a step. */}
      {DRUM_ARCS.map(([start, len], i) => (
        <mesh key={`plinth-upper-${i}`} castShadow receiveShadow position={[0, 0.22, 0]}>
          <cylinderGeometry args={[19.0, 19.2, 0.16, 36, 1, true, start, len]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.travertine.color}
            roughness={0.78}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* ===================================================================
          1. TIER 1 — LOWER ARCHED ARCADE
          =================================================================== */}

      {/* 1a. Phase 25.4: Tier 1 liner removed — arch openings are now genuine
            through-apertures revealing the interior seating bowl (sections 4a–4c)
            behind the facade framing.  The sill band (1b), spandrel band (1c),
            jambs (1d), and arch tops (1d) provide the solid wall surfaces; the
            WALL_DEPTH (1.3) recess creates natural shadow without a sealing
            dark panel. */}

      {/* 1b. Sill band — solid wall below the arches, cut at both openings:
            the sill's cut end is the jamb face of each opening's flanking bay. */}
      {DRUM_ARCS.map(([start, len], i) => (
        <mesh key={`sill-${i}`} material={facadeMat} receiveShadow position={[0, (0.3 + SILL_TOP) / 2, 0]}>
          <cylinderGeometry args={[R_FACADE, R_FACADE, SILL_TOP - 0.3, 36, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 1c. Spandrel band — solid wall above the arches.  Phase C-8.31: it
            runs straight over the rear gate, closing the head of the opening
            at 7.35; the tier-1 cornice above it is the gate's lintel. */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <mesh key={`spandrel-${i}`} material={facadeMat} receiveShadow position={[0, (SPANDREL_BOTTOM + SPANDREL_TOP) / 2, 0]}>
          <cylinderGeometry args={[R_FACADE, R_FACADE, SPANDREL_TOP - SPANDREL_BOTTOM, 36, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 1d. Arch bays — jambs (half-piers) and open arch heads.
            All positions use the cylinder convention: X = R·sin(θ), Z = R·cos(θ),
            with Y-rotation = θ (local X tangential, local Z radial).
            Phase 25.8: both are centred on R_WALL_MID so their outer faces sit
            flush with the sill/spandrel bands at R_FACADE and their inner faces
            at R_LINER.  Jambs rise from the sill to the spandrel band, closing
            the former open slot above each pier (y 6.0–7.35). */}
      {archAngles.map((angle, i) => {
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const lA = angle - JAMB_OFFSET;
        const rA = angle + JAMB_OFFSET;
        const jY = (SILL_TOP + SPANDREL_BOTTOM) / 2;
        return (
          <group key={`t1-bay-${i}`}>
            {/* Left jamb */}
            <mesh geometry={jambGeo} material={facadeMat} castShadow
              position={[Math.sin(lA) * R_WALL_MID, jY, Math.cos(lA) * R_WALL_MID]}
              rotation={[0, lA, 0]}
            />
            {/* Right jamb */}
            <mesh geometry={jambGeo} material={facadeMat} castShadow
              position={[Math.sin(rA) * R_WALL_MID, jY, Math.cos(rA) * R_WALL_MID]}
              rotation={[0, rA, 0]}
            />
            {/* Arch head — corner spandrels from the spring line to the crown. */}
            <mesh geometry={archHeadGeo} material={facadeMat} castShadow
              position={[sin * R_WALL_MID, ARCH_SPRING, cos * R_WALL_MID]}
              rotation={[0, angle, 0]}
            />
          </group>
        );
      })}

      {/* 1e. Tier 1 cornice — bright stone band separating tiers.
            Radius protrudes beyond the facade (19.5) for a shadow-casting lip.
            Phase 25.8: split at the entrance gap like the bands below it; the
            full-arc ribbon floated unsupported 2.6 units in front of the portal
            and crossed its lintel/pediment line from the approach.  Phase
            C-8.31: it runs over the rear gate, spanning it as its lintel. */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <mesh key={`t1-cornice-${i}`} material={corniceMat} position={[0, T1_CORNICE_Y, 0]}>
          <cylinderGeometry args={[T1_CORNICE_R, T1_CORNICE_R, T1_CORNICE_H, 36, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 1f. Phase 25.8: Tier-transition ledge — the cornice's top surface,
            closing the open 17.8–19.5 annulus between the tier-1 wall and the
            set-back tier-2 wall so tier 2 reads as resting on tier 1 rather
            than as a separate inner drum (and no sky shows through from the
            arena). */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <FlatArcRing key={`t1-ledge-${i}`} y={T1_CORNICE_TOP} innerRadius={R_FACADE_T2} outerRadius={T1_CORNICE_R}
          thetaStart={start} thetaLength={len} material={corniceMat} />
      ))}

      {/* ===================================================================
          2. TIER 2 — UPPER PILASTER ARCADE
          =================================================================== */}

      {/* 2a. Inner dark liner — window-depth backdrop, cut at the entrance and
            continuous across the rear gate (tier 2 sits above it). */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <mesh key={`t2-liner-${i}`} material={recessMat} position={[0, (T2_SILL_TOP + T2_TOP) / 2, 0]}>
          <cylinderGeometry args={[R_LINER_T2, R_LINER_T2, T2_TOP - T2_SILL_TOP, 36, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 2b. Sill band between cornice and pilasters. */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <mesh key={`t2-sill-${i}`} material={facadeMat} receiveShadow position={[0, (T2_BOTTOM + T2_SILL_TOP) / 2, 0]}>
          <cylinderGeometry args={[R_FACADE_T2, R_FACADE_T2, T2_SILL_TOP - T2_BOTTOM, 36, 1, true, start, len]} />
        </mesh>
      ))}

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

      {/* 2c-bis. Phase 25.8: Window-recess ceiling at the pilaster/liner top.
            Without it the 17.0–18.1 recess was open above y 14.5, showing a
            band of sky between the pilasters just under the golden cornice. */}
      {FRONT_CUT_ARCS.map(([start, len], i) => (
        <FlatArcRing key={`t2-window-ceiling-${i}`} y={T2_TOP} innerRadius={R_LINER_T2} outerRadius={T2_CORNICE_R}
          thetaStart={start} thetaLength={len} material={recessMat} />
      ))}

      {/* 2d. Tier 2 cornice — golden attic cornice (radius adjusted to 18.1).
            Phase 25.8: spans T2_TOP → attic base (was 14.6–15.4, leaving a
            0.1 gap above the pilasters).  Phase C-8.31: complete ring. */}
      <mesh position={[0, (T2_TOP + T2_CORNICE_TOP) / 2, 0]}>
        <cylinderGeometry args={[T2_CORNICE_R, T2_CORNICE_R, T2_CORNICE_TOP - T2_TOP, 36, 1, true, 0, FULL_TURN]} />
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
        <cylinderGeometry args={[17.5, 17.8, 1.6, 36, 1, true, 0, FULL_TURN]} />
      </mesh>

      {/* 2f. Attic crest cornice — bright stone cap on the attic wall. */}
      <mesh material={corniceMat} position={[0, 17.1, 0]}>
        <cylinderGeometry args={[17.8, 17.8, 0.5, 36, 1, true, 0, FULL_TURN]} />
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

        {/* Golden Roman Inscription Frieze: "COLOSSEVM"
            Phase 29.5D: Canvas-texture inscription on the existing gold frieze
            mesh.  Dark bronze lettering (#3a2e1a) on gold background (#b89547),
            rendered via CanvasTexture — no new dependencies, fonts, or network
            requests.  Material color set to white so the texture's baked-in gold
            background and dark text show through; metalness/roughness preserved. */}
        <mesh position={[0, 7.8, 1.75]}>
          <boxGeometry args={[8.8, 1.2, 0.2]} />
          <meshStandardMaterial
            map={friezeInscriptionTex || undefined}
            color={friezeInscriptionTex ? '#ffffff' : ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>

        {/* Gilded Roman Eagle Medallion Relief over Portal
            Phase 29.5B: rotation [π/2, 0, 0] turns the cylinder axis from Y to Z
            so the gold circular face points toward the approaching player (+Z)
            instead of lying flat and showing only its thin edge. */}
        <mesh position={[0, 6.5, 1.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.75, 0.75, 0.1, 16]} />
          <meshStandardMaterial
            color="#493522"
            metalness={0.85}
            roughness={0.42}
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

        {/* Phase 29.3D — Grand Colosseum sign prototype with wooden backing.
            Placed to the right of the entrance steps, facing approaching
            players (sign face toward local +Z = world +Z).  Wrapped in
            Suspense because useGLTF suspends until the GLB is parsed. */}
        <Suspense fallback={null}>
          <group position={[6.5, 0, 1.0]} scale={1.35}>
            <ColosseumSignPrototype />
          </group>
        </Suspense>
      </group>

      {/* ===================================================================
          4. INTERIOR SEATING BOWL
          Lightweight amphitheatre interior: low arena boundary wall, two
          sloped seating frustums (truncated-cone ring segments).  All stop at
          the two axial passages (BOWL_ARCS) the way the exterior bands stop at
          the same openings.  No new lights — relies on existing scene lighting
          and DoubleSide rendering.
          =================================================================== */}

      {/* 4a. Arena boundary wall (podium) — separates sand from seating.
            Uses facadeMat (travertine + bump) so it reads as solid exterior-
            quality stone, visually distinct from the lighter seating surfaces.
            Phase C-8.28: stops at the entrance passage (BOWL_GAP_HALF) so the
            monumental doorway is not walled off at the arena edge.  Phase
            C-8.31: it stops at the rear gate's passage too, so the bridge axis
            is the arena's second way in and out. */}
      {BOWL_ARCS.map(([start, len], i) => (
        <mesh key={`podium-${i}`} material={facadeMat} receiveShadow position={[0, (0.05 + 1.25) / 2, 0]}>
          <cylinderGeometry args={[R_ARENA_WALL, R_ARENA_WALL, 1.2, 32, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 4b. Seating tier 1 (ima cavea) — slopes from r=15.3 at y=1.25
            to r=16.8 at y=3.75.  radiusTop > radiusBottom creates the
            outward-and-upward slope of amphitheatre seating.
            Phase C-8.28: same entrance passage as the podium, so the cavea
            does not slope across the doorway.  Phase C-8.31: the rear gate's
            passage is cut the same way. */}
      {BOWL_ARCS.map(([start, len], i) => (
        <mesh key={`seating-t1-${i}`} material={interiorMat} receiveShadow position={[0, (1.25 + 3.75) / 2, 0]}>
          <cylinderGeometry args={[SEATING_T1_R_OUT, R_ARENA_WALL, 2.5, 32, 1, true, start, len]} />
        </mesh>
      ))}

      {/* 4c. Seating tier 2 (media cavea) — slopes from r=16.8 at y=3.75
            to r=17.8 at y=6.25.  Outer edge (17.8) is 0.2 inside the
            Tier 1 dark liner (18.0) — no z-fighting. */}
      {BOWL_ARCS.map(([start, len], i) => (
        <mesh key={`seating-t2-${i}`} material={interiorMat} receiveShadow position={[0, (3.75 + 6.25) / 2, 0]}>
          <cylinderGeometry args={[SEATING_T2_R_OUT, SEATING_T1_R_OUT, 2.5, 32, 1, true, start, len]} />
        </mesh>
      ))}

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
