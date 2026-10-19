/**
 * Phase C-8.68C — the DISPOSABLE horse↔chariot fit prototype's pure numbers.
 *
 * This module exists so a reviewer can *see* whether the C-8.68B proportion
 * decision (Alternative A: scale the horse down to the shipping chariot) reads
 * acceptably in the real renderer.  It carries numbers only — no mesh, no
 * material, no loader, no asset fetch, no renderer, no storage, no save — and it
 * changes no formation constant: every chariot anchor and every lane comes from
 * `chariotTeamFormation.ts`, which is the shipped plan and stays untouched.
 *
 * It is consumed by EXACTLY ONE file, the development-only harness
 * `src/components/dev/HorseChariotFitPrototype.tsx`, which `src/main.tsx` mounts
 * only in a Vite dev build (`import.meta.env.DEV`) behind the exact
 * `?devHarness=horsefit` query parameter.  Nothing in the shipping game imports
 * this module, and nothing about it is integrated into the city, the arena or
 * racing gameplay.
 *
 * ── WHAT IS MEASURED, AND WHAT IS DERIVED ────────────────────────────────
 * MEASURED — `HORSE_FIT_MEASURED` below, re-read from
 * `public/_workspace_dist_horse_weak.glb` (15,248,136 bytes, sha256
 * 0a00300e…) in the rest pose, in the frame GLTFLoader hands back (the file's
 * single parentless node carries the identity matrix, so its own +X/+Y/Z frame
 * IS the rendered frame).  The C-8.68A audit recorded the same figures; this
 * phase re-derived them from the file rather than copying them, and the focused
 * suite re-derives them again.
 *
 * DERIVED — `HORSE_FIT_SCALE` (the yoke underside over the measured withers
 * height), the placement, the readouts and the guide geometry.  Each says where
 * its number comes from; none is eyeballed.
 *
 * ── THE ORIENTATION CONVERSION ────────────────────────────────────────────
 * The horse is authored facing **+X** (nose +1.9946, rump −1.0443, tail tip
 * −1.2439 — the head is at +X).  The chariot faces **−Z**
 * (`CHARIOT_FORWARD_AXIS`), and a draught horse faces the direction of travel,
 * so the horse must be yawed.  One rotation about Y does it exactly:
 *
 *     Ry(θ)·(1, 0, 0) = (cos θ, 0, −sin θ) = (0, 0, −1)  ⇒  θ = +π/2
 *
 * `HORSE_FIT_ROTATION_Y = Math.PI / 2`, i.e. **+90° about Y** (not −90°: that
 * would face the horse +Z, backwards up the pole).  The horse's own up (+Y) and
 * its lateral axis (Z → ±X) need no further conversion, and because the root
 * node's matrix is the identity there is no Z-up→Y-up term hidden in the file.
 *
 * ── THE PLACEMENT ─────────────────────────────────────────────────────────
 * A horse's station is the yoke line, and its reference point is the withers —
 * the place the yoke bar rests on.  Scaling is uniform from the hooves (the
 * measured ground plane is y = 0, the hoof plane), so with the scale applied the
 * horse's anchor is its own ground point directly beneath the withers, at model
 * (withersX, 0, 0).  After the yaw that anchor sits at world (0, 0, −withersX·s)
 * relative to the group, so the group's position is
 *
 *     [ laneX, CHARIOT_GROUND_Y, stationZ + HORSE_FIT_MEASURED.withersX · s ]
 *
 * which puts the withers on the station line at the lane's centre and the hooves
 * on the chariot's own ground plane.  `HORSE_FIT_SCALE` is exactly the scale at
 * which the withers lands on the yoke's underside — the C-8.68B *Alternative A*
 * hypothesis this prototype exists to judge.
 */

import {
  CHARIOT_FORWARD_AXIS,
  CHARIOT_GROUND_Y,
  CHARIOT_POLE_HALF_WIDTH,
  CHARIOT_POLE_TIP_Z,
  CHARIOT_TYRE_BOTTOM_Y,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_LEADING_Z,
  CHARIOT_WHEEL_RIM_INNER_X,
  CHARIOT_WIDEST_X,
  CHARIOT_YOKE_HALF_WIDTH,
  CHARIOT_YOKE_LINE_Z,
  CHARIOT_YOKE_PEG_TOP_Y,
  CHARIOT_YOKE_PEG_X,
  CHARIOT_YOKE_TOP_Y,
  CHARIOT_YOKE_UNDERSIDE_Y,
  HORSE_ENVELOPE,
  HORSE_REAR_CLEARANCE,
  HORSE_STATION_Z,
  INNER_LANE_X,
  LANE_PITCH,
  getTeamWidth,
} from './chariotTeamFormation';

export type Vec3 = [number, number, number];

// ───────────────────────────────────────────────────────────────────────────
// The prototype's one asset
// ───────────────────────────────────────────────────────────────────────────

/**
 * The candidate C-8.68B recommended: the untacked, lightest, narrowest of the
 * three uploads.  It is loaded ON DEMAND by the dev harness only — it is
 * deliberately absent from `utils/preloadAssets.ts`, so its 15.2 MB never joins
 * any production payload — and it is never written to, renamed or modified.
 */
export const HORSE_FIT_ASSET_URL = '/_workspace_dist_horse_weak.glb';

/** Byte size and hash, so a re-export of the asset fails loudly rather than silently. */
export const HORSE_FIT_ASSET_BYTES = 15_248_136;
export const HORSE_FIT_ASSET_SHA256 =
  '0a00300e57892e30a6b5a186a37b1c1a6ec1aeb8b21cd952036d38250e3c9d58';

// ───────────────────────────────────────────────────────────────────────────
// Measured horse (rest pose, from the file above)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The weak horse as measured from its own buffer.  Forward is +X, up +Y, lateral
 * Z; the coat mesh's lowest vertex is its hoof plane at y = 0 (measured
 * −1.3e-7, i.e. zero to float32 precision).
 */
export const HORSE_FIT_MEASURED = {
  /** The body's own axes. */
  forwardAxis: '+X',
  upAxis: '+Y',
  /** Hoof plane — the same plane the chariot is authored on. */
  groundY: 0,
  /** Coat mesh: nose-to-rump length 3.0389, nose +1.9946, rump −1.0443. */
  noseX: 1.9946,
  rumpX: -1.0443,
  /** The tail's own rearmost tip (the tail is the only geometry below the hoof plane). */
  tailTipX: -1.2439,
  /** Withers: the highest point over x 0.15…0.45, at x 0.42598 — the yoke's own bearing. */
  withersX: 0.42598,
  withersY: 1.6907,
  /** Croup (rump height) and the ear tip. */
  croupY: 1.6841,
  earTipY: 2.2447,
  /** Widest half-widths: the barrel (the lane rule) and the mane (the binding case). */
  barrelHalfWidth: 0.34965,
  maneHalfWidth: 0.45048,
  /** The rig the harness loads: 31 joints, three clips, none of which is a gait. */
  joints: 31,
  clips: ['Gallop', 'Idle', 'Walk'],
} as const;

/** The horse's own forward and the chariot's, so the yaw below can be checked against both. */
export const HORSE_FORWARD_AXIS = '+X';
export const CHARIOT_FORWARD = CHARIOT_FORWARD_AXIS;

/** Lengths relative to the withers — the two the plan's envelope is compared against. */
export const HORSE_NOSE_AHEAD_OF_WITHERS = HORSE_FIT_MEASURED.noseX - HORSE_FIT_MEASURED.withersX;
export const HORSE_RUMP_BEHIND_WITHERS = HORSE_FIT_MEASURED.withersX - HORSE_FIT_MEASURED.rumpX;
export const HORSE_TAIL_TIP_BEHIND_WITHERS =
  HORSE_FIT_MEASURED.withersX - HORSE_FIT_MEASURED.tailTipX;

// ───────────────────────────────────────────────────────────────────────────
// The two chariot measurements the formation module does not publish
// ───────────────────────────────────────────────────────────────────────────

/**
 * The draught pole's own extent, measured node by node in the C-8.68B report
 * (`DraughtPole` X ±0.0495, Y 0.671…1.029, Z −0.293…−2.107) and used here for
 * the pole guide only.  The two ends that matter as anchors —
 * `CHARIOT_POLE_HALF_WIDTH` and `CHARIOT_POLE_TIP_Z` — come from the formation
 * module, and the suite cross-checks them against these.
 */
export const POLE_BASE_Y = 0.671;
export const POLE_BASE_Z = -0.293;

/** The fitted wheel's own radius, derived from two published anchors, not restated. */
export const WHEEL_RADIUS = CHARIOT_WHEEL_HUB_Y - CHARIOT_TYRE_BOTTOM_Y;

// ───────────────────────────────────────────────────────────────────────────
// Orientation, scale and placement
// ───────────────────────────────────────────────────────────────────────────

/**
 * The verified conversion: horse forward +X → chariot forward −Z, one +90° yaw
 * about Y.  See this file's header for the derivation.
 */
export const HORSE_FIT_ROTATION_Y = Math.PI / 2;

/**
 * The C-8.68B *Alternative A* scale: the yoke bar's underside over the horse's
 * measured withers height, 0.935 / 1.6907 = 0.5530.  It is the one scale at
 * which the yoke rests on the withers and the hooves stay on the chariot's own
 * ground plane at the same time.
 */
export const HORSE_FIT_SCALE = CHARIOT_YOKE_UNDERSIDE_Y / HORSE_FIT_MEASURED.withersY;

/** What the slider may be set to — a diagnostic range around the hypothesis, not a shipped value. */
export const HORSE_FIT_SCALE_MIN = 0.4;
export const HORSE_FIT_SCALE_MAX = 1.2;

/** The three scales worth comparing: the hypothesis, the C-8.68B split, and an unscaled horse. */
export const HORSE_FIT_SCALE_PRESETS = [
  { id: 'A', label: 'A — fit the chariot', scale: HORSE_FIT_SCALE },
  { id: 'C', label: 'C — split (0.80)', scale: 0.8 },
  { id: 'B', label: 'B — unscaled horse (1.00)', scale: 1 },
] as const;

/**
 * The staging lane the "beside the chariot" horse stands in: clear of the
 * chariot's own widest point (0.768) by 0.98, so nothing overlaps laterally.
 * It is a diagnostic position, NOT a formation lane — the plan's outer trace
 * lane is ±1.220 and its yoked lanes are ±0.500.
 */
export const BESIDE_STAGING_X = CHARIOT_WIDEST_X + 0.98;

/**
 * …and its own station line, behind the chariot's rear-most point (+0.685) so
 * the two silhouettes can be compared side by side in the fixed side view
 * without one hiding the other.  Also diagnostic, not a formation value.
 */
export const BESIDE_STAGING_Z = 1.85;

/** Clamp a scale to the diagnostic range; a non-finite value falls back to the hypothesis. */
export function clampFitScale(scale: number): number {
  if (!Number.isFinite(scale)) return HORSE_FIT_SCALE;
  return Math.min(Math.max(scale, HORSE_FIT_SCALE_MIN), HORSE_FIT_SCALE_MAX);
}

export interface HorseFitPlacement {
  position: Vec3;
  rotationY: number;
  scale: number;
  /** Where the withers ends up — on the station line, at the lane's centre. */
  withers: Vec3;
}

/**
 * One horse's group transform in the chariot's own frame, at `scale`, with its
 * withers on the station line of lane `laneX` and its hooves on the ground.
 */
export function getHorseFitPlacement(
  scale: number,
  laneX: number = INNER_LANE_X,
  stationZ: number = HORSE_STATION_Z
): HorseFitPlacement {
  const s = clampFitScale(scale);
  return {
    position: [laneX, CHARIOT_GROUND_Y, stationZ + HORSE_FIT_MEASURED.withersX * s],
    rotationY: HORSE_FIT_ROTATION_Y,
    scale: s,
    withers: [laneX, HORSE_FIT_MEASURED.withersY * s, stationZ],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// The live readout — what the scale slider moves, and what each rule says
// ───────────────────────────────────────────────────────────────────────────

/** One derived figure, and the rule it is checked against where there is one. */
export interface FitRule {
  id: string;
  description: string;
  value: number;
  limit: number;
  ok: boolean;
}

export interface HorseFitReadout {
  scale: number;
  /** Scaled horse figures. */
  withersY: number;
  earTipY: number;
  bodyLength: number;
  barrelHalfWidth: number;
  maneHalfWidth: number;
  noseZ: number;
  rumpZ: number;
  tailTipZ: number;
  /** How far the withers miss the yoke bar's underside.  0 at `HORSE_FIT_SCALE`. */
  yokeSeat: number;
  /** Does the horse's barrel reach into the wheel disc's own X band at this lane? */
  wheelBandOverlap: boolean;
  /** The lane's inner edge against the pole's face — the two horses straddle the pole. */
  poleClearance: number;
  /** Air between adjacent horses, barrels and (the binding case) manes. */
  laneAirBarrels: number;
  laneAirManes: number;
  /** How far the horse's rearmost point (its tail tip) stays forward of the wheel's leading edge. */
  rearClearance: number;
  /** The team's own width with this horse, and the plan's envelope-based width for the same team. */
  teamWidth: number;
  planTeamWidth: number;
  rules: FitRule[];
  ok: boolean;
}

/**
 * Every number the prototype displays, derived from the measured horse at
 * `scale` in lane `laneX`, with the C-8.67D rules applied to the MEASURED animal
 * rather than to the envelope's 0.500-wide placeholder.
 */
export function getHorseFitReadout(
  scale: number,
  laneX: number = INNER_LANE_X,
  stationZ: number = HORSE_STATION_Z
): HorseFitReadout {
  const s = clampFitScale(scale);
  const m = HORSE_FIT_MEASURED;
  const barrelHalf = m.barrelHalfWidth * s;
  const tailTipBehind = HORSE_TAIL_TIP_BEHIND_WITHERS * s;
  const tailTipZ = stationZ + tailTipBehind;
  const rumpZ = stationZ + HORSE_RUMP_BEHIND_WITHERS * s;
  const noseZ = stationZ - HORSE_NOSE_AHEAD_OF_WITHERS * s;
  const withersY = m.withersY * s;
  const barrelOuterX = laneX + barrelHalf;

  // The wheel-Z rule is load-bearing rather than decorative: an inner lane's
  // barrel genuinely reaches inside the disc's own X band, so the horse must pass
  // BESIDE the wheel, never through it.
  const wheelBandOverlap = barrelOuterX > CHARIOT_WHEEL_RIM_INNER_X;
  const rearClearance = CHARIOT_WHEEL_LEADING_Z - tailTipZ;
  const poleClearance = laneX - barrelHalf - CHARIOT_POLE_HALF_WIDTH;
  const laneAirBarrels = LANE_PITCH - 2 * barrelHalf;
  const laneAirManes = LANE_PITCH - 2 * m.maneHalfWidth * s;

  const check = (id: string, description: string, value: number, limit: number): FitRule => ({
    id,
    description,
    value,
    limit,
    ok: value >= limit,
  });

  const rules: FitRule[] = [
    check(
      'yoke-seat',
      'Withers against the yoke bar’s underside (a seat, not a gap or an overlap)',
      -Math.abs(withersY - CHARIOT_YOKE_UNDERSIDE_Y),
      -0.02
    ),
    check(
      'pole',
      'Lane’s inner edge clear of the draught pole’s face (the pair straddles the pole)',
      poleClearance,
      0.1
    ),
    check(
      'adjacent-lanes-manes',
      'Air between two adjacent horses at their WIDEST — the mane, not the barrel',
      laneAirManes,
      0.15
    ),
    check(
      'wheel-z-leading-edge',
      'Rearmost point forward of the wheel disc’s leading edge (the horse passes beside the wheel)',
      rearClearance,
      HORSE_REAR_CLEARANCE
    ),
    check(
      'ground',
      'Hoof plane on the chariot’s own ground plane, above the tyres’ low point',
      CHARIOT_GROUND_Y - CHARIOT_TYRE_BOTTOM_Y,
      0
    ),
  ];

  return {
    scale: s,
    withersY,
    earTipY: m.earTipY * s,
    bodyLength: (m.noseX - m.rumpX) * s,
    barrelHalfWidth: barrelHalf,
    maneHalfWidth: m.maneHalfWidth * s,
    noseZ,
    rumpZ,
    tailTipZ,
    yokeSeat: withersY - CHARIOT_YOKE_UNDERSIDE_Y,
    wheelBandOverlap,
    poleClearance,
    laneAirBarrels,
    laneAirManes,
    rearClearance,
    teamWidth: 2 * (laneX + barrelHalf),
    planTeamWidth: getTeamWidth(2),
    rules,
    ok: rules.every((r) => r.ok),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Diagnostic guides — lines and circles, never fake harness geometry
// ───────────────────────────────────────────────────────────────────────────

/**
 * A straight guide.  These are the "temporary alignment markers" the phase asks
 * for: thin coloured LINES drawn over the model, with no thickness, no material
 * of their own and no resemblance to a yoke pad, a girth or a trace.  Nothing
 * here is a fitting and nothing here claims the model is race-ready.
 */
export interface GuideSegment {
  id: string;
  label: string;
  colour: string;
  kind: 'chariot' | 'rule' | 'horse';
  from: Vec3;
  to: Vec3;
}

/** A circle guide — the wheel's own disc edge, drawn in the plane it really lies in. */
export interface GuideCircle {
  id: string;
  label: string;
  colour: string;
  centre: Vec3;
  radius: number;
  /** `yz` is a disc whose axis is X (both of this chariot's wheels). */
  plane: 'yz';
}

export const GUIDE_COLOURS = {
  ground: '#e5e7eb',
  wheel: '#fbbf24',
  yoke: '#4ade80',
  pole: '#fb923c',
  rule: '#f87171',
  horse: '#22d3ee',
} as const;

/** The chariot's own reference guides: wheel radius, yoke height, draught pole, ground plane. */
export function getChariotGuideSegments(): GuideSegment[] {
  const half = CHARIOT_YOKE_HALF_WIDTH;
  return [
    {
      id: 'ground-plane-x',
      label: 'Ground plane (Y = 0)',
      colour: GUIDE_COLOURS.ground,
      kind: 'chariot',
      from: [-2.2, CHARIOT_GROUND_Y, 0],
      to: [2.2, CHARIOT_GROUND_Y, 0],
    },
    {
      id: 'ground-plane-z',
      label: 'Ground plane (Y = 0)',
      colour: GUIDE_COLOURS.ground,
      kind: 'chariot',
      from: [0, CHARIOT_GROUND_Y, 0.9],
      to: [0, CHARIOT_GROUND_Y, -3.2],
    },
    {
      id: 'tyre-bottom',
      label: `Tyre low point (Y = ${CHARIOT_TYRE_BOTTOM_Y})`,
      colour: GUIDE_COLOURS.wheel,
      kind: 'chariot',
      from: [-1.0, CHARIOT_TYRE_BOTTOM_Y, 0],
      to: [1.0, CHARIOT_TYRE_BOTTOM_Y, 0],
    },
    {
      id: 'yoke-underside',
      label: `Yoke underside (Y = ${CHARIOT_YOKE_UNDERSIDE_Y})`,
      colour: GUIDE_COLOURS.yoke,
      kind: 'chariot',
      from: [-half, CHARIOT_YOKE_UNDERSIDE_Y, CHARIOT_YOKE_LINE_Z],
      to: [half, CHARIOT_YOKE_UNDERSIDE_Y, CHARIOT_YOKE_LINE_Z],
    },
    {
      id: 'yoke-top',
      label: `Yoke top (Y = ${CHARIOT_YOKE_TOP_Y})`,
      colour: GUIDE_COLOURS.yoke,
      kind: 'chariot',
      from: [-half, CHARIOT_YOKE_TOP_Y, CHARIOT_YOKE_LINE_Z],
      to: [half, CHARIOT_YOKE_TOP_Y, CHARIOT_YOKE_LINE_Z],
    },
    {
      id: 'yoke-peg-right',
      label: `Yoke peg (X = +${CHARIOT_YOKE_PEG_X}, to Y = ${CHARIOT_YOKE_PEG_TOP_Y})`,
      colour: GUIDE_COLOURS.yoke,
      kind: 'chariot',
      from: [CHARIOT_YOKE_PEG_X, CHARIOT_YOKE_UNDERSIDE_Y, CHARIOT_YOKE_LINE_Z],
      to: [CHARIOT_YOKE_PEG_X, CHARIOT_YOKE_PEG_TOP_Y, CHARIOT_YOKE_LINE_Z],
    },
    {
      id: 'yoke-peg-left',
      label: `Yoke peg (X = −${CHARIOT_YOKE_PEG_X})`,
      colour: GUIDE_COLOURS.yoke,
      kind: 'chariot',
      from: [-CHARIOT_YOKE_PEG_X, CHARIOT_YOKE_UNDERSIDE_Y, CHARIOT_YOKE_LINE_Z],
      to: [-CHARIOT_YOKE_PEG_X, CHARIOT_YOKE_PEG_TOP_Y, CHARIOT_YOKE_LINE_Z],
    },
    {
      id: 'draught-pole',
      label: 'Draught pole (X = 0)',
      colour: GUIDE_COLOURS.pole,
      kind: 'chariot',
      from: [0, POLE_BASE_Y, POLE_BASE_Z],
      to: [0, CHARIOT_YOKE_UNDERSIDE_Y + 0.094, CHARIOT_POLE_TIP_Z],
    },
    {
      id: 'station-line',
      label: `Station line — the yoke line (Z = ${CHARIOT_YOKE_LINE_Z})`,
      colour: GUIDE_COLOURS.rule,
      kind: 'rule',
      from: [-1.7, CHARIOT_GROUND_Y, CHARIOT_YOKE_LINE_Z],
      to: [1.7, CHARIOT_GROUND_Y, CHARIOT_YOKE_LINE_Z],
    },
    {
      id: 'wheel-leading-edge',
      label: `Wheel disc leading edge (Z = ${CHARIOT_WHEEL_LEADING_Z})`,
      colour: GUIDE_COLOURS.rule,
      kind: 'rule',
      from: [-1.0, CHARIOT_GROUND_Y, CHARIOT_WHEEL_LEADING_Z],
      to: [1.0, CHARIOT_GROUND_Y, CHARIOT_WHEEL_LEADING_Z],
    },
    {
      id: 'rear-limit',
      label: `Rear limit (Z = ${HORSE_ENVELOPE.maxRearZ}, the plan’s clearance)`,
      colour: GUIDE_COLOURS.rule,
      kind: 'rule',
      from: [-1.0, CHARIOT_GROUND_Y, HORSE_ENVELOPE.maxRearZ],
      to: [1.0, CHARIOT_GROUND_Y, HORSE_ENVELOPE.maxRearZ],
    },
  ];
}

/** The wheel's own disc edge, at both hubs — the reference the horse is scaled against. */
export function getGuideCircles(): GuideCircle[] {
  return [
    {
      id: 'wheel-radius-left',
      label: `Wheel radius ${WHEEL_RADIUS.toFixed(3)} at hub (−${CHARIOT_WHEEL_HUB_X}, ${CHARIOT_WHEEL_HUB_Y})`,
      colour: GUIDE_COLOURS.wheel,
      centre: [-CHARIOT_WHEEL_HUB_X, CHARIOT_WHEEL_HUB_Y, 0],
      radius: WHEEL_RADIUS,
      plane: 'yz',
    },
    {
      id: 'wheel-radius-right',
      label: `Wheel radius ${WHEEL_RADIUS.toFixed(3)} at hub (+${CHARIOT_WHEEL_HUB_X}, ${CHARIOT_WHEEL_HUB_Y})`,
      colour: GUIDE_COLOURS.wheel,
      centre: [CHARIOT_WHEEL_HUB_X, CHARIOT_WHEEL_HUB_Y, 0],
      radius: WHEEL_RADIUS,
      plane: 'yz',
    },
  ];
}

/**
 * The horse's own guides at `scale`: the withers plane (which should lie ON the
 * yoke's underside at `HORSE_FIT_SCALE`), the withers' own ground post, and the
 * rearmost plane the wheel rule is measured from.
 */
export function getHorseGuideSegments(
  scale: number,
  laneX: number = INNER_LANE_X,
  stationZ: number = HORSE_STATION_Z
): GuideSegment[] {
  const r = getHorseFitReadout(scale, laneX, stationZ);
  return [
    {
      id: 'horse-withers-plane',
      label: 'Horse withers plane (the yoke bar rests here)',
      colour: GUIDE_COLOURS.horse,
      kind: 'horse',
      from: [laneX, r.withersY, r.tailTipZ],
      to: [laneX, r.withersY, r.noseZ],
    },
    {
      id: 'horse-withers-post',
      label: 'Withers height from the ground plane',
      colour: GUIDE_COLOURS.horse,
      kind: 'horse',
      from: [laneX, CHARIOT_GROUND_Y, stationZ],
      to: [laneX, r.withersY, stationZ],
    },
    {
      id: 'horse-rear-plane',
      label: 'Horse rearmost point (the tail tip)',
      colour: GUIDE_COLOURS.horse,
      kind: 'horse',
      from: [laneX - r.barrelHalfWidth, CHARIOT_GROUND_Y, r.tailTipZ],
      to: [laneX + r.barrelHalfWidth, CHARIOT_GROUND_Y, r.tailTipZ],
    },
  ];
}
