import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCrowdBounce, stepCrowdBounce, type CrowdBounce } from '../../utils/crowdHype';
import {
  ARENA_INTERIOR_COLORS,
  applyArenaTextureAnisotropy,
  getArenaLinenTexture,
  getArenaRingPaintTexture,
  getArenaSandTexture,
  getArenaTierTexture,
  getPodiumInscriptionTexture,
  getPodiumWallTexture,
  seeded,
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


/* ══════════════════════════════════════════════════════════════════════════
   AI-2 — THE LIVING CAVEA
   ══════════════════════════════════════════════════════════════════════════
   The crowd, the velarium, the podium's inscription band, the baltei walls,
   the brazier stands and the pulvinar's dressing. Everything is procedural —
   canvas maps and primitives — and everything is merged, so the slice is a
   draw-call NEGATIVE against AI-1's ground.
   ────────────────────────────────────────────────────────────────────────── */

/** The crowd's one seed: the same 480 people arrive on every mount. */
export const CROWD_SEED = 7;
/** Spectators in each seating ring. */
export const CROWD_PER_RING = 80;
/** Bodies drawn per ring stack, i.e. one per spectator. */
export const CROWD_COUNT = CROWD_PER_RING * 6;

/** The two cavea cones the crowd sits on — the same slopes the tier meshes draw. */
export const CROWD_TIERS = [
  { innerRadius: 20.6, baseY: 5.2, rise: 3.2, run: 3.4 },
  { innerRadius: 24.2, baseY: 8.4, rise: 4.0, run: 3.8 },
] as const;

/**
 * The six seating rings. `y` is the shipped ring-centre convention — the tier
 * slope at that radius plus 1.1 — kept verbatim (the two shipped rings are
 * still exactly 7.8 and 11.2). A5 seats each body ON its step, i.e. on the
 * slope surface under that centre, rather than on the centre the shipped boxes
 * floated on.
 */
export const CROWD_RINGS = [
  { tier: 0, radius: 21.4, y: 7.05 },
  { tier: 0, radius: 22.2, y: 7.8 },
  { tier: 0, radius: 23.0, y: 8.56 },
  { tier: 1, radius: 25.0, y: 10.34 },
  { tier: 1, radius: 25.8, y: 11.2 },
  { tier: 1, radius: 26.6, y: 12.03 },
] as const;

/** The body box's height — the shipped geometry, 1.2 x 1.4 x 0.8. */
export const CROWD_BODY_HEIGHT = 1.4;
/** The head sphere's radius, and how far its centre sits above the body's. */
export const CROWD_HEAD_RADIUS = 0.28;
export const CROWD_HEAD_LIFT = 0.95;
/** A spectator's seed-jitter envelope and its scale range. */
export const CROWD_RADIUS_JITTER = 0.25;
export const CROWD_Y_JITTER = 0.15;
export const CROWD_SCALE_MIN = 0.92;
export const CROWD_SCALE_MAX = 1.08;

/** Per-instance tunic colours: AI-1's five shipped tones plus three more. */
export const CROWD_TUNIC_COLORS = [
  '#991b1b',
  '#f5f5f4',
  '#78350f',
  '#b45309',
  '#e5e5e5',
  '#3f3a34',
  '#8a6f4d',
  '#5b6b7a',
] as const;
/** The two shipped head tones, alternating by seeded coin. */
export const CROWD_HEAD_COLORS = ['#b45309', '#e5e5e5'] as const;

export interface CrowdSpectator {
  x: number;
  /** The step surface the spectator's feet stand on, jitter included. */
  seatY: number;
  z: number;
  /** The seated radius, after the radial jitter. */
  radius: number;
  scale: number;
  /** Yaw that turns the body's +Z face toward the arena's centre. */
  yaw: number;
  tunic: string;
  head: string;
}

/** The tier cone's surface height at `radius` — the step a spectator sits on. */
export function crowdStepY(tier: 0 | 1, radius: number): number {
  const { innerRadius, baseY, rise, run } = CROWD_TIERS[tier];
  return baseY + (radius - innerRadius) * (rise / run);
}

/**
 * A5 — seat every spectator ON its step. The feet ride the tier's own surface
 * at the spectator's SEATED radius, so the ±0.25 radial jitter cannot unseat
 * anyone; the body is drawn from that foot upward. The ±0.15 y jitter is a
 * seated-height variance on top of it and stays well inside the ~0.27 tread the
 * smooth cone stands in for — where the shipped boxes floated 0.4 above it.
 */
export function buildCrowdPlacement(): CrowdSpectator[] {
  const rand = seeded(CROWD_SEED);
  const spectators: CrowdSpectator[] = [];
  for (const ring of CROWD_RINGS) {
    for (let i = 0; i < CROWD_PER_RING; i += 1) {
      const angle = (i / CROWD_PER_RING) * Math.PI * 2;
      const radius = ring.radius + (rand() * 2 - 1) * CROWD_RADIUS_JITTER;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const seatY = crowdStepY(ring.tier, radius) + (rand() * 2 - 1) * CROWD_Y_JITTER;
      const scale = CROWD_SCALE_MIN + rand() * (CROWD_SCALE_MAX - CROWD_SCALE_MIN);
      const tunic = CROWD_TUNIC_COLORS[Math.floor(rand() * CROWD_TUNIC_COLORS.length)];
      const head = CROWD_HEAD_COLORS[rand() < 0.5 ? 0 : 1];
      spectators.push({ x, seatY, z, radius, scale, yaw: Math.atan2(-x, -z), tunic, head });
    }
  }
  return spectators;
}

/* ── THE VELARIUM ─────────────────────────────────────────────────────────
   24 masts for performance (the real awning had ~240), the tension ring they
   are roped to, and the linen awning itself. The inner opening stays open to
   the sky: the awning covers the cavea, never the sand. */
export const VELARIUM_MAST_COUNT = 24;
export const VELARIUM_MAST_RADIUS = 29.2;
export const VELARIUM_MAST_BOTTOM_Y = 12.2;
export const VELARIUM_MAST_TOP_Y = 17.0;
export const VELARIUM_RING_RADIUS = 13;
export const VELARIUM_RING_TUBE = 0.06;
export const VELARIUM_RING_Y = 14.3;
export const VELARIUM_AWNING_Y = 15.5;
export const VELARIUM_ROPE_SEGMENTS = 24;
export const VELARIUM_ROPE_MAST_Y = 16.9;
export const VELARIUM_WOOD = '#6b4a2f';
export const VELARIUM_ROPE = '#8a6f4d';

/**
 * The 24 masts and the inner tension ring, merged into ONE vertex-coloured
 * geometry (+1 draw call; the ring rides along for free). Exported so the suite
 * builds the real merge rather than grepping for it.
 */
export function buildVelariumMastGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const height = VELARIUM_MAST_TOP_Y - VELARIUM_MAST_BOTTOM_Y;
  const midY = (VELARIUM_MAST_TOP_Y + VELARIUM_MAST_BOTTOM_Y) / 2;
  for (let i = 0; i < VELARIUM_MAST_COUNT; i += 1) {
    const angle = (i / VELARIUM_MAST_COUNT) * Math.PI * 2;
    const mast = new THREE.CylinderGeometry(0.09, 0.09, height, 6);
    mast.translate(
      Math.cos(angle) * VELARIUM_MAST_RADIUS,
      midY,
      Math.sin(angle) * VELARIUM_MAST_RADIUS,
    );
    parts.push(colorizeGeometry(mast, VELARIUM_WOOD));
  }

  // The inner tension ring the masts are roped to — same mesh, so +0 calls.
  const ring = new THREE.TorusGeometry(VELARIUM_RING_RADIUS, VELARIUM_RING_TUBE, 6, 48);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, VELARIUM_RING_Y, 0);
  parts.push(colorizeGeometry(ring, VELARIUM_ROPE));

  return mergeParts(parts);
}

/**
 * One rope per mast, mast top to the inner ring, as ONE LineSegments buffer
 * (+1 draw call for all 24).
 */
export function buildVelariumRopeGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(VELARIUM_ROPE_SEGMENTS * 2 * 3);
  for (let i = 0; i < VELARIUM_ROPE_SEGMENTS; i += 1) {
    const angle = (i / VELARIUM_ROPE_SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.set(
      [
        cos * VELARIUM_MAST_RADIUS,
        VELARIUM_ROPE_MAST_Y,
        sin * VELARIUM_MAST_RADIUS,
        cos * VELARIUM_RING_RADIUS,
        VELARIUM_RING_Y,
        sin * VELARIUM_RING_RADIUS,
      ],
      i * 6,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/* ── THE PULVINAR'S DRESSING ──────────────────────────────────────────────
   A throne on the loge's own podium top (local y 3.6), its two steps toward
   the sand, and two flanking banners — all ONE vertex-coloured geometry, so
   the whole dressing is +1 draw call. The marble podium, the D-3 canopy and
   the columns are untouched. */
export const PULVINAR_DRESSING = {
  /** D-3's shipped house crimson, as the throne's cushion. */
  cushion: '#881337',
  /** The loge's own marble. */
  marble: '#ecd9be',
  /** The loge columns' bone, for the banners. */
  bone: '#f5ede0',
  /** The shipped gold trim. */
  goldTrim: '#C9A227',
} as const;

export function buildPulvinarDressingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c = PULVINAR_DRESSING;

  // The throne: a crimson cushion on the podium's top face (y 3.6).
  const seat = new THREE.BoxGeometry(1.6, 0.5, 1.4);
  seat.translate(0, 3.85, 0);
  parts.push(colorizeGeometry(seat, c.cushion));

  // The backrest rises out of the cushion and stops exactly at the D-3
  // canopy's own top plane (4.65), so it can never pierce the cloth.
  const back = new THREE.BoxGeometry(1.6, 1.6, 0.3);
  back.translate(0, 3.85, -0.85);
  parts.push(colorizeGeometry(back, c.marble));

  // Two marble steps in front of the throne, descending toward the sand.
  for (const step of [
    { y: 3.475, z: 1.0 },
    { y: 3.225, z: 1.8 },
  ]) {
    const box = new THREE.BoxGeometry(2.4, 0.25, 0.9);
    box.translate(0, step.y, step.z);
    parts.push(colorizeGeometry(box, c.marble));
  }

  // Two flanking banners: a bone cloth with a gold rod above and hem below.
  for (const side of [-1, 1]) {
    const cloth = new THREE.PlaneGeometry(1.2, 2.4);
    cloth.translate(side * 5.5, 4.8, 0);
    parts.push(colorizeGeometry(cloth, c.bone));

    const rod = new THREE.BoxGeometry(1.4, 0.08, 0.08);
    rod.translate(side * 5.5, 6.04, 0);
    parts.push(colorizeGeometry(rod, c.goldTrim));

    const hem = new THREE.BoxGeometry(1.2, 0.12, 0.04);
    hem.translate(side * 5.5, 3.66, 0);
    parts.push(colorizeGeometry(hem, c.goldTrim));
  }

  return mergeParts(parts);
}

/* ── THE BALTEI ───────────────────────────────────────────────────────────
   Two thin open cylinders dividing the cavea's levels, merged into ONE mesh
   (+1 draw call). Flat travertine — a wall, not a band. */
export const BALTEI_RADII = [24.15, 28.15] as const;
export const BALTEI_Y = [8.75, 12.75] as const;

export function buildBalteiGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  BALTEI_RADII.forEach((radius, i) => {
    const wall = new THREE.CylinderGeometry(radius, radius, 0.7, 36, 1, true);
    wall.translate(0, BALTEI_Y[i], 0);
    parts.push(wall);
  });
  return mergeParts(parts);
}

/* ── A1 — THE BRAZIERS' STANDS ────────────────────────────────────────────
   The eight braziers hung in mid-air (their bowls sit at y 4.8). Each gets a
   dark-iron tripod from the sand to a small cradle bowl, all eight merged into
   ONE mesh (+1 draw call). brazierIntensity / emberEmissive are untouched. */
export const BRAZIER_STAND_COUNT = 8;
/** The brazier ring's own radius — the braziers' own placement. */
export const BRAZIER_STAND_RADIUS = 19.8;
/** The bronze bowl's underside, which the cradle meets. */
export const BRAZIER_STAND_TOP_Y = 4.8;

export function buildBrazierStandGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legSpread = 0.55;
  const legTop = BRAZIER_STAND_TOP_Y;

  for (let idx = 0; idx < BRAZIER_STAND_COUNT; idx += 1) {
    const angle = (idx / BRAZIER_STAND_COUNT) * Math.PI * 2;
    const cx = Math.cos(angle) * BRAZIER_STAND_RADIUS;
    const cz = Math.sin(angle) * BRAZIER_STAND_RADIUS;

    for (let leg = 0; leg < 3; leg += 1) {
      const lean = angle + (leg / 3) * Math.PI * 2;
      const foot = new THREE.Vector3(
        cx + Math.cos(lean) * legSpread,
        0,
        cz + Math.sin(lean) * legSpread,
      );
      const head = new THREE.Vector3(
        cx + Math.cos(lean) * 0.08,
        legTop,
        cz + Math.sin(lean) * 0.08,
      );
      const direction = new THREE.Vector3().subVectors(head, foot);
      const length = direction.length();
      const cylinder = new THREE.CylinderGeometry(0.05, 0.05, length, 5);
      cylinder.translate(0, length / 2, 0);
      cylinder.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        ),
      );
      cylinder.translate(foot.x, foot.y, foot.z);
      parts.push(cylinder);
    }

    // The cradle bowl the tripod carries the brazier in, meeting its underside.
    const cradle = new THREE.CylinderGeometry(0.42, 0.26, 0.3, 8);
    cradle.translate(cx, legTop - 0.15, cz);
    parts.push(cradle);
  }

  return mergeParts(parts);
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

  // AI-1 — the four interior textures, and AI-2's two (one shared factory,
  // cached in the module). `undefined` when there is no canvas, which simply
  // leaves the material on its flat colour.
  const arenaTextures = useMemo(
    () => ({
      sand: getArenaSandTexture() ?? undefined,
      ringPaint: getArenaRingPaintTexture() ?? undefined,
      wall: getPodiumWallTexture() ?? undefined,
      tiers: getArenaTierTexture() ?? undefined,
      linen: getArenaLinenTexture() ?? undefined,
      inscription: getPodiumInscriptionTexture() ?? undefined,
    }),
    [],
  );

  // A6 — anisotropy is a renderer property, so it is applied here rather than
  // in the (import-safe) texture module. One call covers all six textures.
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    applyArenaTextureAnisotropy(gl);
  }, [gl]);

  // AI-2 — the crowd's 480 seats, deterministic and built once per mount, and
  // the four merged AI-2/A1 geometries (velarium, baltei, stands, dressing).
  const crowd = useMemo(() => buildCrowdPlacement(), []);
  const crowdBodiesRef = useRef<THREE.InstancedMesh>(null);
  const crowdHeadsRef = useRef<THREE.InstancedMesh>(null);
  const arenaGeometry = useMemo(
    () => ({
      masts: buildVelariumMastGeometry(),
      ropes: buildVelariumRopeGeometry(),
      baltei: buildBalteiGeometry(),
      brazierStands: buildBrazierStandGeometry(),
      pulvinar: buildPulvinarDressingGeometry(),
    }),
    [],
  );

  // Fill both instanced meshes once: body at the seat with its feet on the
  // step, head 0.95 above the body's centre, per-spectator tunic and head tone
  // through instance colours (so the emissive stays a MATERIAL property).
  useLayoutEffect(() => {
    const bodies = crowdBodiesRef.current;
    const heads = crowdHeadsRef.current;
    if (!bodies || !heads) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    crowd.forEach((spectator, i) => {
      const { scale } = spectator;
      dummy.position.set(spectator.x, spectator.seatY + (CROWD_BODY_HEIGHT / 2) * scale, spectator.z);
      dummy.rotation.set(0, spectator.yaw, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      bodies.setColorAt(i, tint.set(spectator.tunic));

      dummy.position.y += CROWD_HEAD_LIFT * scale;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      heads.setColorAt(i, tint.set(spectator.head));
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  }, [crowd]);

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
          so the concentric rings are centred on the sand and nothing tiles.
          A2: a 72-segment rim, extended to the podium wall's own radius, so
          the disc meets the wall with no dark gap from the default camera. */}
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20.2, 72]} />
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

      {/* AI-2 — THE BALTEI: the tier-divider walls between the cavea's levels
          and the wall crowning it. One merged mesh, flat travertine. */}
      <mesh geometry={arenaGeometry.baltei}>
        <meshStandardMaterial
          color={ARENA_INTERIOR_COLORS.travertine}
          roughness={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* CF-3 + AI-2 — THE LIVING CROWD. Both spectator layers live in ONE
          group so a hype celebration still bounces the crowd alone (the podium
          wall, the cavea, the braziers and the loge stay outside it). AI-2
          replaces the 112 per-spectator box meshes with exactly TWO
          InstancedMeshes — bodies, then heads — 6 rings x 80 spectators,
          deterministic from CROWD_SEED, seated on their steps (A5). Dress
          emissive stays a MATERIAL property of these two materials, and
          castShadow is off on both: 480 shadow casters buy nothing here. */}
      <group ref={crowdGroupRef}>
        {/* The 480 bodies — the shipped 1.2 x 1.4 x 0.8 box, instanced. */}
        <instancedMesh
          ref={crowdBodiesRef}
          args={[undefined, undefined, CROWD_COUNT]}
          castShadow={false}
          frustumCulled={false}
        >
          <boxGeometry args={[1.2, 1.4, 0.8]} />
          <meshStandardMaterial
            roughness={0.9}
            emissive="#f59e0b"
            emissiveIntensity={crowdDress ?? 0}
          />
        </instancedMesh>
        {/* …and the 480 heads, +0.95 above each body's centre. */}
        <instancedMesh
          ref={crowdHeadsRef}
          args={[undefined, undefined, CROWD_COUNT]}
          castShadow={false}
          frustumCulled={false}
        >
          <sphereGeometry args={[CROWD_HEAD_RADIUS, 8, 6]} />
          <meshStandardMaterial
            roughness={0.9}
            emissive="#f59e0b"
            emissiveIntensity={crowdDress ?? 0}
          />
        </instancedMesh>
      </group>

      {/* A1 — THE BRAZIERS' STANDS: eight dark-iron tripods on the sand,
          merged into ONE mesh. The braziers, their embers and their point
          lights are untouched. */}
      <mesh geometry={arenaGeometry.brazierStands} receiveShadow>
        <meshStandardMaterial
          color={ARENA_INTERIOR_COLORS.iron}
          metalness={0.8}
          roughness={0.4}
        />
      </mesh>

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
        {/* AI-2 — THE IMPERIAL BOX, DRESSED: a throne on the podium's own top,
            its two steps toward the sand, and two flanking banners. ONE merged
            vertex-coloured mesh (+1 draw call); the podium, the D-3 canopy and
            the columns above are untouched. */}
        <mesh geometry={arenaGeometry.pulvinar} castShadow receiveShadow>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.6} />
        </mesh>
      </group>

      {/* AI-2 — THE PODIUM'S INSCRIPTION BAND. A thin open cylinder on the
          upper wall (the wall spans y 0-5.0) wearing the travertine panel map:
          a row of recessed panels carrying abstract chisel strokes, never
          legible text. +1 draw call. */}
      <mesh position={[0, 4.45, 0]}>
        <cylinderGeometry args={[20.25, 20.25, 0.9, 36, 1, true]} />
        <meshStandardMaterial
          map={arenaTextures.inscription}
          side={THREE.DoubleSide}
          roughness={0.85}
        />
      </mesh>

      {/* AI-2 — THE VELARIUM. 24 wooden masts on the rim and the tension ring
          they are roped to (ONE merged mesh), the linen awning over the cavea,
          and the 24 ropes as ONE LineSegments — +3 draw calls in total. The
          inner opening stays open to the sky, exactly as the real awning left
          the arena, and everything here sits above y = 14, outside the duel
          camera's framing band. The awning is a standard material, so it
          catches the braziers and the crowd dress like every other surface. */}
      <mesh geometry={arenaGeometry.masts}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      <mesh position={[0, VELARIUM_AWNING_Y, 0]}>
        <cylinderGeometry args={[13, 29.2, 2.6, 48, 1, true]} />
        <meshStandardMaterial
          map={arenaTextures.linen}
          side={THREE.DoubleSide}
          roughness={0.9}
        />
      </mesh>
      <lineSegments geometry={arenaGeometry.ropes}>
        <lineBasicMaterial color={VELARIUM_ROPE} />
      </lineSegments>

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
