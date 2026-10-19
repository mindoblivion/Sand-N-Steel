import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { RomanPavedStreet } from './RomanStreetPavement';
import {
  DISTRICT_KERBS,
  DISTRICT_ROADS,
  CIRCUS_FORECOURT,
  CIRCUS_FORECOURT_PARAPET,
  CIRCUS_LINK_MOUTH_APRON,
  CIRCUS_LINK_MOUTH_APRON_RECT,
  CIRCUS_RACE_ENTRY,
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
 *   • three 0.16-high kerbs, the city's own curb convention;
 *   • the forum-link mouth apron (C-8.65) — one flat slab in the plaza's own
 *     stone, tucked under the forum plaza's edge and reaching east to the link's
 *     west face, so the bare sand wedge the round plaza leaves at the link's
 *     mouth is paved and the forum's paving runs unbroken into the link.
 *
 * ── Layout is single-sourced ─────────────────────────────────────────────
 * Every footprint comes from `src/utils/circusDistrictGeometry.ts`, which is
 * also what the phase's regression suite measures the routes and their
 * clearances against.  Nothing here hard-codes a world number, so the drawn
 * pavement and the asserted pavement cannot disagree.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 * 25 meshes in total, all static and all created once at mount: each road run
 * is a single instanced stone mesh plus its bedding plane (one draw call for
 * its stones), the forecourt is one plane and two trim strips, the link's mouth
 * carries the one apron plane (C-8.65), the parapet is a body plus a coping, the
 * kerbs are three boxes, and the race entry signpost (C-8.70B) is four meshes.
 * Nothing is added per
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

/**
 * Phase C-8.70B — the race entry signpost.
 *
 * A timber post carrying a gilded signboard on the carceres forecourt: the
 * district's own visible marker for the chariot-race entry point, whose
 * interaction trigger lives in `cityCollisions.ts` and whose world position both
 * read from `circusDistrictGeometry.ts` (single-sourced, so the drawn sign and
 * the trigger cannot drift).  It follows the city's existing signpost
 * construction — `MerchantHouse`'s and `GladiatorAcademy`'s post-plus-board, in
 * the same oak and Roman palette — rather than inventing a new one: four static
 * meshes, no texture, no light, no per-frame work, and no collider (the city's
 * signposts carry none either; a sign is walked past, not around).
 */
const RaceEntrySign: React.FC = () => (
  <group position={[CIRCUS_RACE_ENTRY.x, 0, CIRCUS_RACE_ENTRY.z]}>
    {/* Timber post */}
    <mesh castShadow position={[0, 1.1, 0]}>
      <cylinderGeometry args={[0.07, 0.09, 2.2, 8]} />
      <meshStandardMaterial color="#451a03" roughness={0.85} />
    </mesh>
    {/* Signboard, thin across X so it faces the approach from the Via Circensis */}
    <mesh castShadow position={[0, 1.95, 0]}>
      <boxGeometry args={[0.12, 0.7, 1.3]} />
      <meshStandardMaterial
        color="#78350f"
        roughness={0.8}
        bumpMap={NOISE_TEXTURE || undefined}
        bumpScale={0.012}
      />
    </mesh>
    {/* Gilded border, the district's own trim colour */}
    <mesh position={[0.075, 1.95, 0]}>
      <boxGeometry args={[0.03, 0.5, 1.06]} />
      <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
    </mesh>
    {/* Gilded finial */}
    <mesh castShadow position={[0, 2.45, 0]}>
      <sphereGeometry args={[0.09, 10, 8]} />
      <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
    </mesh>
  </group>
);

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

      {/* ── The forum-link mouth apron (C-8.65) ─────────────────────────────
          The forum's plaza is a disc and the link's west face is a straight
          line, so a bare wedge of sand (3.30 sq units, up to 2.06 of the link's
          3.00 width) stood between the two paved surfaces at the mouth of the
          only paved route into the district.  This one flat slab — the plaza's
          own `forumPaving` stone — reaches east to the link's own west face and
          tucks UNDER the plaza's edge at its west end, 2 mm below the plaza's
          plane, so the plaza's disc and its gilded ring cover the join: the
          wedge is paved, the ring is not notched, and no slab z-fights. */}
      <mesh
        receiveShadow
        position={[
          CIRCUS_LINK_MOUTH_APRON_RECT.cx,
          CIRCUS_LINK_MOUTH_APRON.y,
          CIRCUS_LINK_MOUTH_APRON_RECT.cz,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[CIRCUS_LINK_MOUTH_APRON_RECT.w, CIRCUS_LINK_MOUTH_APRON_RECT.d]} />
        <meshStandardMaterial color={ROMAN_PALETTE.forumPaving.color} roughness={0.68} />
      </mesh>

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

      {/* ── The race entry signpost (C-8.70B) ─────────────────────────────── */}
      <RaceEntrySign />
    </group>
  );
});
