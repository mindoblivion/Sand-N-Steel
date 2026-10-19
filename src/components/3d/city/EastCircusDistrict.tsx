import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { RomanPavedStreet } from './RomanStreetPavement';
import {
  DISTRICT_KERBS,
  DISTRICT_ROADS,
  CIRCUS_FORECOURT,
  CIRCUS_FORECOURT_PARAPET,
  KERB_DEPTH,
  KERB_HEIGHT,
} from '../../../utils/circusDistrictGeometry';

/**
 * EastCircusDistrict.tsx — the East Circus District's paved shell
 * (Phase C-8.64B).
 *
 * The district the arena was placed in (C-8.64A) is walkable ground but had no
 * street of its own: the arena stands on bare sand east of the city, and the
 * only way to it was across open ground.  This component lays the routes, the
 * forecourt and the one solid edge that make it a district:
 *
 *   • four paved runs (Via Circensis' two legs, the forum link, the service
 *     lane), every one of them built from the city's own `RomanPavedStreet`
 *     instanced primitive, so the district's stone matches the streets inside
 *     the walls — same slabs, same mortar bedding, same gutters and cart ruts;
 *   • the carceres forecourt, paved in the forum's own `forumPaving` stone with
 *     the same two gilded border trims the Forum Socialis uses;
 *   • the low travertine parapet closing the forecourt's south edge — the
 *     district's southern limit as a visible wall rather than an invisible one;
 *   • three 0.16-high kerbs, the city's own curb convention.
 *
 * ── Layout is single-sourced ─────────────────────────────────────────────
 * Every footprint comes from `src/utils/circusDistrictGeometry.ts`, which is
 * also what the phase's regression suite measures the routes and their
 * clearances against.  Nothing here hard-codes a world number, so the drawn
 * pavement and the asserted pavement cannot disagree.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 * 20 meshes in total, all static and all created once at mount: each road run
 * is a single instanced stone mesh plus its bedding plane (one draw call for
 * its stones), the forecourt is one plane and two trim strips, the parapet is a
 * body plus a coping, and the kerbs are three boxes.  Nothing is added per
 * frame, no material is cloned, no texture is loaded (the forecourt's bump map
 * is a clone of the shared `NOISE_TEXTURE`, which shares its canvas image and
 * costs no memory), and no light source is added — the city's own sun and
 * ambient lighting light the district exactly as they light every other
 * building.  The district's own ground is the city's existing ground plane,
 * which already spans it (see the phase record in AGENTS.md).
 *
 * The arena itself is NOT touched here: `EastCircusArena` mounts it, the GLB is
 * unchanged, and this component adds nothing inside the closed collision ring.
 * In particular the forecourt faces the carceres' front face but does not cover
 * it, and no path is laid through either closed entrance.
 */

/** RomanPavedStreet takes a district character; the layout module names it. */
type RoadSpec = (typeof DISTRICT_ROADS)[number];

const DistrictRoad: React.FC<{ spec: RoadSpec }> = ({ spec }) => (
  <RomanPavedStreet
    position={[spec.cx, 0, spec.cz]}
    axis={spec.axis}
    length={spec.axis === 'x' ? spec.w : spec.d}
    width={spec.axis === 'x' ? spec.d : spec.w}
    district={spec.character}
    hasGutters={spec.hasGutters}
    hasWheelRuts={spec.hasWheelRuts}
  />
);

/**
 * Low travertine parapet — the same construction as `CityStreets`' StreetWall
 * boundary walls: a body box with a slightly wider coping cap.  It stands on
 * the ground plane, and the registry rectangle registered for it in
 * `collisionShapes.ts` is the body's own footprint.
 */
const DistrictParapet: React.FC = () => {
  const { cx, cz, w, d, height, copingHeight, copingOverhang } = CIRCUS_FORECOURT_PARAPET;
  return (
    <group position={[cx, 0, cz]}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[w, height, d]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.014}
        />
      </mesh>
      <mesh castShadow position={[0, height + copingHeight / 2, 0]}>
        <boxGeometry args={[w + copingOverhang * 2, copingHeight, d + copingOverhang * 2]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.74} />
      </mesh>
    </group>
  );
};

export const EastCircusDistrict = React.memo(() => {
  // The forecourt is a plaza-sized surface (30.5 × 8.4), so the shared 3×3
  // NOISE_TEXTURE would be functionally flat on it — 0.19 tiles per metre.  The
  // Forum Socialis solves exactly this by cloning the texture with a repeat
  // calibrated to ~2 m per tile; the clone shares the canvas image with the
  // original (zero memory cost) and is disposed with the component.
  const forecourtBumpMap = useMemo(() => {
    if (!NOISE_TEXTURE) return undefined;
    const tex = NOISE_TEXTURE.clone();
    tex.repeat.set(Math.round(CIRCUS_FORECOURT.w / 2), Math.round(CIRCUS_FORECOURT.d / 2));
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      forecourtBumpMap?.dispose();
    };
  }, [forecourtBumpMap]);

  return (
    <group>
      {/* ── The four paved runs ─────────────────────────────────────────── */}
      {DISTRICT_ROADS.map((spec) => (
        <DistrictRoad key={spec.id} spec={spec} />
      ))}

      {/* ── The carceres forecourt (pedestrian gathering space) ─────────── */}
      <group position={[CIRCUS_FORECOURT.cx, 0, CIRCUS_FORECOURT.cz]}>
        <mesh receiveShadow position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CIRCUS_FORECOURT.w, CIRCUS_FORECOURT.d]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.forumPaving.color}
            roughness={0.68}
            bumpMap={forecourtBumpMap}
            bumpScale={0.012}
          />
        </mesh>
        {/* Gilded border trims, along the forecourt's long axis (the Forum
            Socialis pattern), inset from its north and south edges. */}
        {[-1, 1].map((sign, i) => (
          <mesh
            key={`forecourt-trim-${i}`}
            receiveShadow
            position={[0, 0.008, sign * (CIRCUS_FORECOURT.d / 2 - CIRCUS_FORECOURT.trimInset)]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[CIRCUS_FORECOURT.w, CIRCUS_FORECOURT.trimWidth]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.goldAccent.color}
              metalness={0.75}
              roughness={0.34}
            />
          </mesh>
        ))}
      </group>

      {/* ── The forecourt's south parapet (the district's only solid edge) ─ */}
      <DistrictParapet />

      {/* ── Roadside kerbs (city curb convention: 0.16 high, no collider) ── */}
      {DISTRICT_KERBS.map((kerb) => (
        <mesh
          key={kerb.id}
          receiveShadow
          castShadow
          position={[kerb.cx, KERB_HEIGHT / 2, kerb.cz]}
        >
          <boxGeometry args={[kerb.w, KERB_HEIGHT, kerb.d]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.76} />
        </mesh>
      ))}
    </group>
  );
});
