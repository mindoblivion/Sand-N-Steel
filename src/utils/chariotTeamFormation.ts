/**
 * Phase C-8.67D — pure chariot team-formation geometry (audit constants and the
 * Biga / Triga / Quadra assembly plan).
 *
 * This module is the *plan*, not the implementation.  It carries the numbers a
 * future phase needs to place horses on the shipping chariot, and nothing that
 * renders: no mesh, no material, no `<group>`, no asset URL, no animation.  It
 * is consumed by nothing yet, exactly as `racingProgression.ts` was after
 * C-8.67B, and the focused suite pins that.
 *
 * ── WHAT IS MEASURED, AND WHAT IS DESIGNED ────────────────────────────────
 * MEASURED — every number in the "Measured chariot anchors" block below was read
 * off the shipping asset node by node, in the rendered Y-up frame, through the
 * same GLTFLoader convention the game uses:
 *
 *   public/_workspace_chariot_model_RomanChariot.glb — 26 nodes, 23 meshes,
 *   9,768 triangles, materials DarkWood/Bronze/Wood/Leather, no textures, no
 *   skin, no animations, 202,280 bytes, sha256 49e132e658e72d89… (the hash
 *   C-8.66B/C-8.66C already pin).  `src/utils/phaseC8_67d.test.ts` re-derives
 *   every one of them from the file, so a re-export that moves the yoke, the
 *   pole or a wheel fails the suite instead of silently invalidating the layout.
 *
 * DESIGNED — the lane pitch, the horse envelope, the trace-staple station and
 * the rear clearance.  Each is derived from a measured anchor (and says so
 * below); none is eyeballed.  The suite checks every derived clearance.
 *
 * ── THE ONE ARRANGEMENT THIS MODEL CANNOT SUPPORT ─────────────────────────
 * The draught pole lies ON the centre line: X ±0.049, from Y 0.671 at the body
 * up to Y 1.029 at its tip — a horse's barrel height exactly.  **A three-horse
 * team therefore cannot be three abreast with a horse on the centre line**: the
 * middle horse's chest and belly would be inside the pole, and moving the pole
 * off-centre would break the chariot's own X symmetry (axle, tub and both
 * handles are all symmetric about X = 0).
 *
 * The pole does not obstruct an EVEN team, because a pair straddles it: that is
 * what the two-peg yoke is for.  So:
 *
 *   • Biga (2) — the two inner lanes, one horse either side of the pole, each
 *     held by one of the yoke's own pegs.  The arrangement the asset already
 *     describes; it needs no chariot change at all.
 *   • Quadra (4) — the same two inner lanes plus one outer lane on each side:
 *     symmetric, four abreast, the pole still between the inner pair.  This is
 *     the historical quadriga's own construction (an inner yoked pair and two
 *     outer horses attached by traces).
 *   • Triga (3) — the inner pair plus ONE outer lane.  A three-horse team is
 *     odd, so with a single central pole it cannot be symmetric; it fields the
 *     same inner pair as every other team and one outer trace horse on the
 *     right (+X, the side the asset itself labels R for a −Z forward).  The left
 *     lane is geometrically equivalent; the choice is one constant.
 *
 * ── HOW TEAM SIZE WILL DRIVE THE ASSEMBLY ─────────────────────────────────
 * `resolveRacingState(profile).horses` (see `racingProgression.ts` — the single
 * source for progression, prices and selection) yields a `ChariotTeamSize`; that
 * number is passed to `getHorseStations()`, which returns one station per horse,
 * and a future renderer instances one horse per station.  This module takes the
 * team size as plain data and reads no profile, no storage and no catalogue, so
 * it can never become a second source of progression truth — and it imports
 * nothing from `chariotParts.ts`, so a wheel or finish purchase cannot affect a
 * team's shape (the C-8.66B/C-8.67B independence rule, kept).
 */

import { ChariotTeamSize } from '../types/game';

// ───────────────────────────────────────────────────────────────────────────
// Measured chariot anchors — public/_workspace_chariot_model_RomanChariot.glb
// ───────────────────────────────────────────────────────────────────────────

/**
 * The asset's own forward axis: the draught pole and the yoke are ahead of the
 * axle, the footboard and the tub's open end are behind it.  Matches the asset
 * README's "Forward faces −Z", and the model's own L/R naming (forward −Z,
 * up +Y ⇒ right +X), which is why the right-hand lanes below are +X.
 */
export const CHARIOT_FORWARD_AXIS = '-Z' as const;

/** The asset's authored ground plane.  Its own tyres reach 0.035 BELOW it. */
export const CHARIOT_GROUND_Y = 0;

/** The assembled chariot's lowest point (its own fitted wheels). */
export const CHARIOT_TYRE_BOTTOM_Y = -0.035;

/** The chariot's widest point: X ±0.768, the wheel hub caps.  Nothing on the model is wider. */
export const CHARIOT_WIDEST_X = 0.768;

/** Wheel hub centres — X ±0.70 on the axle's own axis at Y 0.65. */
export const CHARIOT_WHEEL_HUB_X = 0.7;
export const CHARIOT_WHEEL_HUB_Y = 0.65;

/** The wheel disc's INNER face: X ±0.665 (the disc is 0.070 thick, out to ±0.735). */
export const CHARIOT_WHEEL_RIM_INNER_X = 0.665;

/** The wheel disc's leading edge in Z — the front of the tyre, and the band a horse must stay clear of. */
export const CHARIOT_WHEEL_LEADING_Z = -0.685;

/** The axle bar: X ±0.750, Y 0.605…0.695. */
export const CHARIOT_AXLE_X = 0.75;

/** The draught pole: X ±0.049, Y 0.671 (at the body) … 1.029 (at the tip), Z −0.293 … −2.107. */
export const CHARIOT_POLE_HALF_WIDTH = 0.049;
export const CHARIOT_POLE_TIP_Z = -2.107;

/** The yoke bar: centre line Z −2.020, faces Y 0.935 (underside) and 1.025 (top). */
export const CHARIOT_YOKE_LINE_Z = -2.02;
export const CHARIOT_YOKE_UNDERSIDE_Y = 0.935;
export const CHARIOT_YOKE_TOP_Y = 1.025;

/** The yoke bar's span: X ±0.650. */
export const CHARIOT_YOKE_HALF_WIDTH = 0.65;

/** The two existing pegs: centres X ±0.500, 0.060 square, base Y 0.970, top Y 1.190. */
export const CHARIOT_YOKE_PEG_X = 0.5;
export const CHARIOT_YOKE_PEG_BASE_Y = 0.97;
export const CHARIOT_YOKE_PEG_TOP_Y = 1.19;
export const CHARIOT_YOKE_PEG_SIZE = 0.06;

/** The bronze front rail of the tub: X ±0.480, front face Z −0.482. */
export const CHARIOT_TUB_FRONT_Z = -0.482;

// ───────────────────────────────────────────────────────────────────────────
// Designed lanes, envelope and stations
// ───────────────────────────────────────────────────────────────────────────

/**
 * The inner lane station is the yoke's OWN peg station (±0.500) — measured, not
 * chosen: a yoked horse stands under the peg that holds its yoke strap, so the
 * peg is the lane.
 */
export const INNER_LANE_X = CHARIOT_YOKE_PEG_X;

/**
 * Distance between adjacent lane centre lines.
 *
 * DESIGNED, and derived: two horses two lanes apart must never be able to touch,
 * so the pitch has to exceed one full barrel width.  0.720 leaves 0.220 of air
 * between two 0.500-wide horses (a 44 % gap), and it puts the outer lane's INNER
 * edge at 0.970 — 0.202 outside the chariot's widest point (0.768) and 0.205
 * outside the outer wheel hub cap (0.765) — so an outer trace horse can run
 * right alongside the chariot without ever entering the wheel's X band.
 */
export const LANE_PITCH = 0.72;

/** Outer lane station: X ±1.220. */
export const OUTER_LANE_X = INNER_LANE_X + LANE_PITCH;

/**
 * Where the outer horses are made fast.  DESIGNED: a trace staple on the yoke
 * bar's top face, 0.050 in from its end (the bar reaches ±0.650), so the staple
 * sits ON the yoke with an end margin and the trace runs out-and-forward to the
 * outer horse's hame.
 *
 * This is the whole of the yoke change: the bar, both pegs and the pole are
 * untouched for every team size — the two outer horses are trace horses and are
 * never yoked (which is how a quadriga was actually put together).  The Biga
 * assembly therefore stays exactly what the asset already describes.
 */
export const TRACE_STAPLE_X = CHARIOT_YOKE_HALF_WIDTH - 0.05;

/** The two horses the yoke's own pegs hold, for every team size. */
export const YOKED_LANES = ['inner-left', 'inner-right'] as const;

export type HorseLane = 'inner-left' | 'inner-right' | 'outer-left' | 'outer-right';

/** A horse's lane centre line in the chariot's own frame. */
export const LANE_X: Readonly<Record<HorseLane, number>> = {
  'outer-left': -OUTER_LANE_X,
  'inner-left': -INNER_LANE_X,
  'inner-right': INNER_LANE_X,
  'outer-right': OUTER_LANE_X,
};

/**
 * Which lanes each team size fields.
 *
 * Biga is the yoked pair.  Quadra adds BOTH outer lanes (symmetric).  Triga adds
 * ONE — the right-hand lane, because a single central pole leaves an odd team no
 * symmetric option (see this file's header).
 */
export const TEAM_LANES: Readonly<Record<ChariotTeamSize, readonly HorseLane[]>> = {
  2: ['inner-left', 'inner-right'],
  3: ['inner-left', 'inner-right', 'outer-right'],
  4: ['outer-left', 'inner-left', 'inner-right', 'outer-right'],
};

/** Where a horse's harness is made fast — the yoke peg, or the outer trace staple. */
export interface HorseAttachment {
  kind: 'yoke-peg' | 'trace-staple';
  x: number;
  y: number;
  z: number;
}

/** One horse's place in the team. */
export interface HorseStation {
  lane: HorseLane;
  /** Lane centre line, X, in the chariot's own frame (forward −Z, right +X). */
  x: number;
  /** The station line: every horse in a team stands abreast, on the yoke line. */
  z: number;
  /** Hoof plane — the asset's own ground plane, so the team stands with the chariot. */
  groundY: number;
  /** True for the two horses the yoke's own pegs hold. */
  yoked: boolean;
  /** The fitting this horse's harness goes to. */
  attachment: HorseAttachment;
}

/** The station line every lane shares — the yoke's own centre line, measured. */
export const HORSE_STATION_Z = CHARIOT_YOKE_LINE_Z;

/** The rear clearance the wheel band demands of an inner-lane horse. */
export const HORSE_REAR_CLEARANCE = 0.1;

/**
 * The envelope a horse asset must satisfy to be usable on this chariot.
 *
 * The numbers come straight off the measured anchors:
 *   • `withersY` 0.935 — the yoke bar's underside.  The bar rests on the
 *     withers and the peg rises to 1.190, i.e. 0.255 above the withers, so the
 *     yoke strap passes over the horse's neck between the peg and the withers.
 *   • `barrelHalfWidth` 0.250 — the width the pole and the lane pitch allow; see
 *     `getTeamClearanceReport`, which checks it from both sides.
 *   • `maxRearZ` −0.785 — the wheel disc's leading edge (−0.685) less
 *     `HORSE_REAR_CLEARANCE`.  This one is load-bearing: a 0.500-wide inner-lane
 *     horse reaches X 0.750, which is INSIDE the wheel disc's X band
 *     (0.665…0.735), so its rearmost point must stay forward of the wheel
 *     entirely — the horse passes beside the wheel, never through it.
 */
export const HORSE_ENVELOPE = {
  /** Withers height: meets the yoke bar's underside. */
  withersY: CHARIOT_YOKE_UNDERSIDE_Y,
  /** Maximum half-width across the barrel. */
  barrelHalfWidth: 0.25,
  /** The rearmost point of a horse in an INNER lane, in Z. */
  maxRearZ: CHARIOT_WHEEL_LEADING_Z - HORSE_REAR_CLEARANCE,
  /** The hoof plane. */
  hoofY: CHARIOT_GROUND_Y,
} as const;

/**
 * How far a horse's body may extend BEHIND its withers.  With the withers on the
 * yoke line at −2.020 and the rearmost point limited to −0.785, that is 1.235 —
 * the torso budget a candidate asset has to fit inside.
 */
export const HORSE_MAX_WITHERS_TO_REAR = HORSE_ENVELOPE.maxRearZ - HORSE_STATION_Z;

/** The stations one team size fields, in ascending X. */
export function getHorseStations(teamSize: ChariotTeamSize): HorseStation[] {
  const lanes = TEAM_LANES[teamSize] ?? TEAM_LANES[2];
  return lanes.map((lane) => {
    const x = LANE_X[lane];
    const side = x < 0 ? -1 : 1;
    const yoked = (YOKED_LANES as readonly string[]).includes(lane);
    return {
      lane,
      x,
      z: HORSE_STATION_Z,
      groundY: CHARIOT_GROUND_Y,
      yoked,
      attachment: yoked
        ? { kind: 'yoke-peg', x: side * CHARIOT_YOKE_PEG_X, y: CHARIOT_YOKE_PEG_TOP_Y, z: CHARIOT_YOKE_LINE_Z }
        : { kind: 'trace-staple', x: side * TRACE_STAPLE_X, y: CHARIOT_YOKE_TOP_Y, z: CHARIOT_YOKE_LINE_Z },
    };
  });
}

/** The team's full width, outside edge to outside edge. */
export function getTeamWidth(teamSize: ChariotTeamSize): number {
  const outermost = Math.max(...getHorseStations(teamSize).map((s) => Math.abs(s.x)));
  return 2 * (outermost + HORSE_ENVELOPE.barrelHalfWidth);
}

/** Is the team centred on the chariot?  Quadra and Biga are; Triga is not, by construction. */
export function isTeamSymmetric(teamSize: ChariotTeamSize): boolean {
  const stations = getHorseStations(teamSize);
  return stations.every((s) => stations.some((other) => Math.abs(other.x + s.x) < 1e-9));
}

/** One measurable clearance: what it is, what it measures, and the rule it has to satisfy. */
export interface TeamClearance {
  id: string;
  description: string;
  /** The measured value, in the chariot's own frame. */
  value: number;
  /** The smallest acceptable value. */
  limit: number;
  ok: boolean;
}

/**
 * Every clearance the arrangement depends on, read out as plain numbers.
 *
 * These are the checks the audit owed: wheel clearance, horse-to-horse air,
 * chariot-body interference and ground contact.  A future renderer can assert
 * `report.ok` before it draws anything; the suite asserts every row.
 */
export function getTeamClearanceReport(teamSize: ChariotTeamSize): {
  teamSize: ChariotTeamSize;
  stations: HorseStation[];
  width: number;
  symmetric: boolean;
  clearances: TeamClearance[];
  ok: boolean;
} {
  const stations = getHorseStations(teamSize);
  const half = HORSE_ENVELOPE.barrelHalfWidth;
  const innerMost = INNER_LANE_X - half;
  const outerMost = Math.max(...stations.map((s) => Math.abs(s.x))) - half;

  // The 1e-9 tolerance is for a rule that is satisfied EXACTLY by construction: the rear
  // limit is defined as `wheel leading edge − clearance`, so its own difference rounds to
  // 0.09999999999999998 in binary floating point and would otherwise read as a failure.
  const EPSILON = 1e-9;
  const check = (id: string, description: string, value: number, limit: number): TeamClearance => ({
    id,
    description,
    value,
    limit,
    ok: value >= limit - EPSILON,
  });

  const clearances: TeamClearance[] = [
    check(
      'pole',
      'Inner lane’s barrel to the draught pole’s face (the pole is between the yoked pair)',
      innerMost - CHARIOT_POLE_HALF_WIDTH,
      0.1
    ),
    check(
      'adjacent-lanes',
      'Air between two adjacent horses (lane pitch less both half-barrels)',
      LANE_PITCH - 2 * half,
      0.15
    ),
    check(
      'chariot-body',
      'Outermost lane’s inner edge clear of the chariot’s widest point (hub cap)',
      outerMost - CHARIOT_WIDEST_X,
      0.15
    ),
    check(
      'wheel-z-leading-edge',
      'Inner horse’s rearmost point forward of the wheel disc’s leading edge',
      CHARIOT_WHEEL_LEADING_Z - HORSE_ENVELOPE.maxRearZ,
      HORSE_REAR_CLEARANCE
    ),
    check(
      'wheel-band',
      'Torso budget behind the withers before the wheel’s leading edge takes it',
      HORSE_MAX_WITHERS_TO_REAR,
      1.0
    ),
    check(
      'ground',
      'Hoof plane above the tyres’ lowest point (the tyres sink below it)',
      CHARIOT_GROUND_Y - CHARIOT_TYRE_BOTTOM_Y,
      0
    ),
  ];

  return {
    teamSize,
    stations,
    width: getTeamWidth(teamSize),
    symmetric: isTeamSymmetric(teamSize),
    clearances,
    ok: clearances.every((c) => c.ok),
  };
}

/** A one-line, player-facing description of a team's arrangement. */
export function describeTeamArrangement(teamSize: ChariotTeamSize): string {
  switch (teamSize) {
    case 2:
      return 'Biga — two horses abreast, one each side of the pole, both on the yoke.';
    case 3:
      return 'Triga — the yoked pair plus one outer trace horse on the right, made fast to the yoke by a trace.';
    case 4:
      return 'Quadra — the yoked pair with an outer trace horse each side, four abreast.';
  }
}
