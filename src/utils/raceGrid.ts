/**
 * LADDER-1A — the staggered start grid, the ladder pools' field shape, and the
 * rung lock state. Pure data and derivation only: no rendering, no race card,
 * no tier config module, no Fortuna's Hand, no results write, no qualifying —
 * those are 1B / 1E. No save writes, no new save field (§J stays 29).
 *
 * The grid is derived from CIRCUS_RACE_START, exactly as the design (Slice 2A)
 * specifies: two-abreast slots behind the start/finish line on the east
 * straight, slot spacing sufficient for a Quadra-width rig plus margin, the
 * single-rival startSide lane becoming slot 1 of the grid.
 *
 * ── THE FIT FINDING (read before 1B renders anything) ─────────────────────
 * The shipped start line sits at the gates: CIRCUS_RACE_START.z is 42.5 and
 * the sand's southern edge (CIRCUS_SOUTH_Z, the carceres block's north face)
 * is 43.8 — 1.3 units of depth behind the line. A rig is 3.05 long (horse nose
 * −2.36 to tub rear +0.685, measured below), so one row gap is 4.0 and a
 * District field needs 4.0 of depth behind the line, a League field 8.0. Both
 * fail: the last row of a District field lands at z 46.5, a League field at
 * z 50.5 — past the sand edge and inside / past the carceres block
 * (Travertine_25, Z 43.8…46.0). Only a single-row field (the shipped 1v1)
 * fits. The grid module computes the slots anyway — the math is the design's
 * math — but every result carries its fit, and resolveGridFit pins the numbers
 * so 1B cannot place the field without deciding the south-end geometry first
 * (moving the line north means moving the south-turn checkpoint with it; see
 * raceLap.ts — the finish line must stay south of RACE_SOUTH_TURN_Z — and the
 * carceres is rendered asset geometry, so this is a geometry decision, not a
 * code slice). A single-row start would fit and is the fallback if the
 * two-abreast staggered grid is ever abandoned — but that is a design change,
 * not something this slice makes silently.
 */
import { CIRCUS_AXIS_X, CIRCUS_SOUTH_Z } from './collisionShapes';
import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import { getTeamWidth } from './chariotTeamFormation';
import { RACE_LANE_OFFSET } from './raceRival';
import { CHARIOT_DRIVEABLE_OUTLINE } from './chariotMovement';
import { RACE_NORTH_TURN_Z } from './raceLap';
import type { PlayerProfile } from '../types/game';

/** A Quadra rig's full width, outside edge to outside edge (chariotTeamFormation). */
export const GRID_QUADRA_WIDTH = getTeamWidth(4); // 2.94

/**
 * Lateral spacing between the two abreast slots in a row: the Quadra width
 * plus 0.56 of air, so two adjacent Quadra rigs never touch.
 */
export const GRID_SLOT_LATERAL_SPACING = GRID_QUADRA_WIDTH + 0.56; // 3.5

/** Half the lateral spacing: each slot sits this far off the axis. */
export const GRID_SLOT_HALF_OFFSET = GRID_SLOT_LATERAL_SPACING / 2; // 1.75

/**
 * A rig's length, nose to tub. Measured, not guessed: the horse's nose reaches
 * −2.36 ahead of the chariot origin (procedural horse: withers on the yoke line
 * at −2.02, head 1.04 local units forward at RACE_HORSE_FIT_SCALE 0.5530 —
 * RaceHorseTeam.tsx) and the tub reaches +0.685 behind it (chariotGeometry.ts,
 * restated in circusDistrictGeometry.ts's start-line comment). 2.36 + 0.685 =
 * 3.045, rounded up.
 */
export const GRID_RIG_LENGTH = 3.05;

/**
 * Depth between successive rows: the rig length plus 0.95 of air, so a
 * following rig's horses never reach the tub ahead.
 */
export const GRID_ROW_GAP = 4.0;

/** The start/finish line the grid is derived from. */
export const GRID_FRONT_ROW_Z = CIRCUS_RACE_START.z; // 42.5

/** The sand's southern edge — the carceres block's north face. Rows past it are outside the sand. */
export const GRID_SAND_SOUTH_EDGE_Z = CIRCUS_SOUTH_Z; // 43.8

/** One slot on the grid. Slots are 0-indexed, front to back, left to right within a row. */
export interface GridSlot {
  /** Slot index in race order: 0 is the front-left slot. */
  slot: number;
  /** Row index: 0 is the front row, at the line. */
  row: number;
  /** −1 is the west (left) slot of the row, +1 the east (right) slot. */
  side: -1 | 1;
  x: number;
  z: number;
  /** Who stands here once the field is assigned. */
  occupant: 'player' | 'rival';
}

/** Whether the grid for a field fits on the shipped sand behind the line. */
export interface GridFit {
  fieldSize: number;
  rows: number;
  /** Depth behind the line the last row needs. */
  requiredDepth: number;
  /** Depth behind the line the sand actually has. */
  availableDepth: number;
  /** True only when every row lands on the sand. */
  fits: boolean;
  /** Z of the last row's anchors. */
  lastRowZ: number;
  /** True only when the last row's anchors are on the sand (z ≤ the southern edge). */
  lastRowInsideSand: boolean;
}

/** A field placed on the grid: its slots, its assignment, and its fit. */
export interface StartGrid {
  fieldSize: number;
  slots: GridSlot[];
  /** The player's slot — last by default; qualifying (1E) earns a better one. */
  playerSlot: number;
  /** The rivals' slots, in field order. */
  rivalSlots: number[];
  fit: GridFit;
}

/**
 * The slot geometry for a field of `fieldSize` rigs (player + rivals),
 * without assignment: row 0 at the line, each later row one row gap further
 * south, two slots a row at the axis ± the half offset. A field of 1 is the
 * player alone on the front-left slot; a field of 0 or a malformed size fails
 * closed to a single front-row slot. Never throws.
 */
export function resolveGridSlots(fieldSize: unknown): GridSlot[] {
  const size = typeof fieldSize === 'number' && Number.isSafeInteger(fieldSize) && fieldSize > 0
    ? fieldSize
    : 1;
  const slots: GridSlot[] = [];
  for (let index = 0; index < size; index += 1) {
    const row = Math.floor(index / 2);
    const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
    slots.push({
      slot: index,
      row,
      side,
      x: CIRCUS_AXIS_X + side * GRID_SLOT_HALF_OFFSET,
      z: GRID_FRONT_ROW_Z + row * GRID_ROW_GAP,
      occupant: 'rival',
    });
  }
  return slots;
}

/**
 * Whether the grid for a field fits behind the line on the shipped sand.
 * The front row stands at the line, so a one-row field needs no depth at all
 * and always fits; every further row costs one row gap of depth.
 */
export function resolveGridFit(fieldSize: unknown): GridFit {
  const size = typeof fieldSize === 'number' && Number.isSafeInteger(fieldSize) && fieldSize > 0
    ? fieldSize
    : 1;
  const rows = Math.ceil(size / 2);
  const requiredDepth = (rows - 1) * GRID_ROW_GAP;
  const availableDepth = GRID_SAND_SOUTH_EDGE_Z - GRID_FRONT_ROW_Z;
  const lastRowZ = GRID_FRONT_ROW_Z + requiredDepth;
  return {
    fieldSize: size,
    rows,
    requiredDepth,
    availableDepth,
    fits: requiredDepth <= availableDepth,
    lastRowZ,
    lastRowInsideSand: lastRowZ <= GRID_SAND_SOUTH_EDGE_Z,
  };
}

/**
 * LADDER-1E Part 5 — qualifying: the player's grid slot from the per-rung
 * best finish. 1st earns the front row, 2nd the second row, and so on; no
 * best finish at the rung (or a malformed one) defaults to the LAST slot,
 * exactly as today.  The player takes the LEFT slot of the earned row
 * (side −1) — the flank the player stands on today in both shipped field
 * sizes (District 3 rigs, League 5 rigs: the last slot is the left slot of
 * the last row) — so qualifying moves the ROW, never the flank.  A finish
 * deeper than the field has rows clamps to the last row: in a 3-rig field
 * a 3rd-place finish and no finish both stand last.  Never throws.
 */
export function resolveQualifyingSlot(bestFinish: unknown, fieldSize: unknown): number {
  const size = typeof fieldSize === 'number' && Number.isSafeInteger(fieldSize) && fieldSize > 0
    ? fieldSize
    : 1;
  const lastSlot = size - 1;
  if (typeof bestFinish !== 'number' || !Number.isSafeInteger(bestFinish) || bestFinish < 1) {
    return lastSlot;
  }
  const rows = Math.ceil(size / 2);
  const row = Math.min(bestFinish - 1, rows - 1);
  // The left slot of the row (slot 2 × row); the last row of an odd field
  // has only that slot, so the min below is only reachable on an even
  // field, where it keeps the player inside the field.
  return Math.min(row * 2, lastSlot);
}

/**
 * A finish place as an ordinal for display: 1st, 2nd, 3rd, 4th, 5th — with
 * the 11/12/13 rule, so 11th, 12th, 13th read right.  A non-finite or
 * non-positive place reads '—': the card never prints a nonsense place.
 */
export function formatRacePlace(place: number): string {
  if (!Number.isFinite(place) || place < 1) return '—';
  const n = Math.trunc(place);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * A field placed on the grid, with assignment and fit.
 *
 * Assignment follows the design (Slice 2A): the player's slot is the earned
 * slot and defaults to LAST — qualifying (1E) is what earns a better one. The
 * rivals fill the remaining slots front to back, and the first rival takes the
 * front-row slot on its startSide flank when it is free — that is the
 * single-rival startSide lane becoming slot 1 of the grid (startSide +1 is
 * the front-right slot, −1 the front-left). In a 2-rig field the player's last
 * slot IS the front row, so a +1 first rival cannot take slot 1 and falls back
 * to the other front slot; the 1v1 race keeps its shipped start until 1B wires
 * the grid into the scene.
 *
 * LADDER-1E Part 5: `playerSlot` is the qualifying slot
 * (`resolveQualifyingSlot`) — an optional input, validated here (an integer
 * inside the field, else the default last slot).  The rivals' assignment is
 * unchanged: they fill the remaining slots front to back, and the first
 * rival still takes the front-row slot on its flank when it is free (and
 * falls back when the player earned that slot).
 */
export function resolveStartGrid(
  fieldSize: unknown,
  firstRivalStartSide: -1 | 1 = 1,
  playerSlot: unknown = undefined,
): StartGrid {
  const slots = resolveGridSlots(fieldSize);
  const size = slots.length;
  const earnedSlot = typeof playerSlot === 'number'
    && Number.isSafeInteger(playerSlot)
    && playerSlot >= 0
    && playerSlot < size
    ? playerSlot
    : size - 1;
  const side: -1 | 1 = firstRivalStartSide === -1 ? -1 : 1;
  const flankSlot = slots.find((slot) => slot.row === 0 && slot.side === side && slot.slot !== earnedSlot);
  const rivalSlots: number[] = [];
  if (flankSlot) rivalSlots.push(flankSlot.slot);
  for (const slot of slots) {
    if (slot.slot === earnedSlot) continue;
    if (rivalSlots.includes(slot.slot)) continue;
    rivalSlots.push(slot.slot);
  }
  for (const slot of slots) {
    slot.occupant = slot.slot === earnedSlot ? 'player' : 'rival';
  }
  return {
    fieldSize: size,
    slots,
    playerSlot: earnedSlot,
    rivalSlots,
    fit: resolveGridFit(size),
  };
}

/** Which ladder rungs a profile can race. District is always open; League needs a District top-2. */
export interface RungLockState {
  districtOpen: boolean;
  leagueOpen: boolean;
  /** The requirement, in plain language, for the locked League card (1E). */
  leagueRequirement: string;
}

/**
 * The rung lock state, pure: no UI, no save read beyond the profile handed in,
 * no new save field. District is always open. League opens on a top-2 finish
 * in a District race — read from the per-rung results write 1E lands
 * (`racing.districtBestFinish`, the best finish at the rung; absent on every
 * save that has never finished a District race, so the League stays locked
 * until the write exists). Never throws on a missing or malformed profile.
 */
export function resolveRungLockState(
  profile: PlayerProfile | null | undefined,
): RungLockState {
  const districtBestFinish = profile?.racing?.districtBestFinish;
  const leagueOpen = typeof districtBestFinish === 'number'
    && Number.isSafeInteger(districtBestFinish)
    && districtBestFinish >= 1
    && districtBestFinish <= 2;
  return {
    districtOpen: true,
    leagueOpen,
    leagueRequirement: 'Top-2 finish in a District race',
  };
}

// ══════════════════════════════════════════════════════════════════════════
// LADDER-1B — the rolling-start formation and its roll paths
// ══════════════════════════════════════════════════════════════════════════
//
// The south-end geometry recon (south-end-geometry-recon-2026-11-19.md,
// Walter's decision Nov 19 2026: ROLLING START) settled it: the staggered
// grid above does not fit behind the shipped line — only 1.3 units of depth
// behind it, a District field needs 4.0, a League field 8.0 — and neither
// moving the line north (the finish line must stay south of the south-turn
// checkpoint 40.8 or laps can never complete) nor moving the carceres (GLB
// asset geometry, no .blend source) fits both rungs. So the field forms up
// in staggered rows ON the long straight and the race starts when the leader
// crosses the line heading north.
//
// ── THE TURN DEVIATION (read before touching the roll paths) ─────────────
// The brief's literal roll — "south down its flank, a U-turn around the
// spina tip, north up the opposite flank, to the line" — is geometrically
// impossible as written. A rig that U-turns around the tip (spina tip Z
// 38.72) ends heading north NORTH of the line (42.5) and can never cross the
// line heading north; and a flank-swapping turn makes the two row-mates'
// paths cross, with no sequencing that avoids a head-on meeting in the
// flank. The design doc has no rolling-start spec — this start is entirely
// the recon's and the brief's invention — so there is no design-doc answer
// to fall back on. The resolution adopted here is a SAME-FLANK U-turn: each
// rig rolls south down its own flank, turns within its own flank at the
// south end (clear of the tip and the starting markers), and ends on its
// flank's racing lane at the line heading north. No flank swap, no crossing
// paths, no collision between row-mates. This deviates from the brief's
// "U-turn around the spina tip" wording; the geometric reason is this
// comment, and the build report states it.
//
// ── THE BOUNDED DIP (the brief's §6 "no path crosses the line" refined) ──
// Any path ending at the line heading north must approach from the south
// (z > 42.5), so the turn necessarily dips slightly past the line while the
// clock has not started. The turn is shaped so that dip is negligible:
// measured max z 42.510 (0.010 past the line — the turn's final approach,
// not a crossing), and the clock starts at the path's northbound end
// crossing. The brief's rule is therefore read as: the only southbound
// excursion is the turn's bounded dip, and the northbound crossing at the
// end of the path is the first (and only) northbound crossing — the clock
// start. The turn Bezier (from (slot.x, 40) to (endX, 42.5), controls near
// z 42 / 42.6) was chosen numerically: a turn starting further north lets
// the nose probe (2.02 ahead) swing past the south edge, and the
// (40, 42, 42.6) shape is the one that keeps both probes inside with
// margin (resolveRollPathClearance, pinned by test).

/**
 * The front row's Z in the formation (§7 Q8 default): z ≈ 24, on the long
 * straight, 18.5 south of the line and 46 clear of the north-turn
 * checkpoint — room for a three-row League formation (15.0 deep at the
 * formation row gap below) with the whole field still on the straight, and
 * room ahead for the roll south.
 */
export const FORMATION_FRONT_ROW_Z = 24;

/**
 * The formation's row gap — NOT the standing grid's 4.0, and the deviation
 * is forced by the roll, not chosen. The front rig crosses the line and
 * drops to its shipped race pace (2.39–2.72 u/s, raceRival.ts §1) while the
 * rig behind is still rolling at 5 u/s, so the gap at the back rig's
 * crossing is (front pace) × (row gap / roll speed). At the grid's 4.0 the
 * gap is 1.9–2.2 — inside the 3.05 rig length, the back rig's nose inside
 * the front rig's tub by ~0.9–1.1 — which violates §6's own "no two rigs
 * within collision distance during the roll". The slowest front rival
 * (Servius, 2.39 u/s) needs row gap ≥ 7.43 for the rig length + 0.5 of
 * margin; 7.5 gives a worst-case gap of 3.59 (0.54 clear). The formation
 * still fits the straight (League last row at z 9.0, 31 clear of the
 * north-turn checkpoint).
 */
export const FORMATION_ROW_GAP = 7.5;

/** The roll speed, units per second: a parade pace (Walk 3.6 – Trot 8.5). */
export const FORMATION_ROLL_SPEED = 5;

/**
 * The Z where the U-turn begins. A single cubic Bezier cannot keep the
 * nose probe inside the outline if the turn starts further north: the
 * heading is still south-west when the origin is far south and the nose
 * (2.02 ahead) swings past the south edge. Starting the turn at 40 — south
 * of the starting markers (39.05–39.83) and the spina tip (38.72), on the
 * flank columns clear of both — lets the Bezier below keep both probes
 * inside with margin (verified numerically by resolveRollPathClearance and
 * pinned by test). The leg south from the formation to here is straight.
 */
export const FORMATION_TURN_START_Z = 40;

/**
 * The two flank columns the formation stands in. The spina occupies the
 * axis north of its tip (38.72), so the formation cannot stand on
 * `raceGrid`'s axis ±1.75 slots — it stands in the two flank columns
 * either side of it. West flank: sand west edge 43.94 to spina west face
 * 51.50 (circusDistrictGeometry.ts's sand comment; collisionShapes.ts:803),
 * centre 47.72. East flank: spina east face 53.18 to sand east edge 60.74,
 * centre 56.96. Each column is 7.56 wide; the centres sit 3.78 clear of
 * the spina faces, so a rig in formation never touches the spina.
 */
export const FORMATION_WEST_FLANK_X = 47.72;
export const FORMATION_EAST_FLANK_X = 56.96;

/**
 * The spina tip exclusion box, for the roll-path clearance check. Spina X
 * 51.50…53.18 (circusDistrictGeometry.ts's Travertine_02 comment), Z −13.00
 * to the tip at 38.72 (the geometry recon's measured tip). No roll path may
 * enter it.
 */
export const SPINA_TIP_BOX = {
  xMin: 51.5,
  xMax: 53.18,
  zMin: -13,
  zMax: 38.72,
} as const;

/** The turn Bezier's control depths. P1 pulls the curve south from the leg; P2 sits just south of the line so the end heading is north. */
export const FORMATION_TURN_CONTROL_Z = 42;
export const FORMATION_TURN_END_CONTROL_Z = 42.6;

/** One slot in the rolling-start formation. */
export interface FormationSlot {
  /** Slot index in race order: 0 is the front-left slot (mirrors the standing grid). */
  slot: number;
  /** Row index: 0 is the front row, nearest the line. */
  row: number;
  /** −1 is the west flank, +1 the east flank. */
  side: -1 | 1;
  /** The formation position, on the flank column. */
  x: number;
  z: number;
  /** Who stands here once the field is assigned. */
  occupant: 'player' | 'rival';
  /** The flank this slot's roll ends on — always its own flank (same-flank U-turn). */
  endSide: -1 | 1;
  /** The racing lane the roll ends on: the axis ± RACE_LANE_OFFSET, the shipped route's start. */
  endX: number;
  /** The line: the roll ends at the line heading north. */
  endZ: number;
}

/** Whether the formation for a field fits on the long straight. */
export interface FormationFit {
  fieldSize: number;
  rows: number;
  /** Z of the front row, nearest the line. */
  frontRowZ: number;
  /** Z of the last row, furthest north. */
  lastRowZ: number;
  /** True when the whole formation stands on the straight, south of the north-turn checkpoint. */
  fits: boolean;
}

/**
 * The formation for a field of `fieldSize` rigs (player + rivals): the
 * standing grid's assignment (player last by default, or on the qualifying
 * slot — `resolveQualifyingSlot` — when one is passed; the first rival takes
 * the front-row slot on its startSide flank when it is free; the rest fill
 * front to back) mapped onto the flank columns of the long straight. Row 0
 * stands at FORMATION_FRONT_ROW_Z; each later row is one formation row gap
 * further NORTH (the formation extends up the straight, away from the line).
 * Never throws; a malformed size fails closed to a single front-row slot.
 * The roll paths are per-slot: the path for a slot is the same whoever
 * stands on it, so qualifying changes WHO rolls which path, never the
 * paths themselves.
 */
export function resolveFormationSlots(
  fieldSize: unknown,
  firstRivalStartSide: -1 | 1 = 1,
  playerSlot?: unknown,
): FormationSlot[] {
  return formationSlotsFromGrid(resolveStartGrid(fieldSize, firstRivalStartSide, playerSlot));
}

/** Map a standing grid's slots onto the formation's flank columns. */
function formationSlotsFromGrid(grid: StartGrid): FormationSlot[] {
  return grid.slots.map((slot) => {
    const x = slot.side === -1 ? FORMATION_WEST_FLANK_X : FORMATION_EAST_FLANK_X;
    return {
      slot: slot.slot,
      row: slot.row,
      side: slot.side,
      x,
      z: FORMATION_FRONT_ROW_Z - slot.row * FORMATION_ROW_GAP,
      occupant: slot.occupant,
      endSide: slot.side,
      endX: CIRCUS_AXIS_X + slot.side * RACE_LANE_OFFSET,
      endZ: GRID_FRONT_ROW_Z,
    };
  });
}

/** Whether the formation for a field fits on the long straight. */
export function resolveFormationFit(fieldSize: unknown): FormationFit {
  const slots = resolveFormationSlots(fieldSize);
  const rows = slots.length === 0 ? 1 : Math.max(...slots.map((slot) => slot.row)) + 1;
  const frontRowZ = FORMATION_FRONT_ROW_Z;
  const lastRowZ = FORMATION_FRONT_ROW_Z - (rows - 1) * FORMATION_ROW_GAP;
  return {
    fieldSize: slots.length,
    rows,
    frontRowZ,
    lastRowZ,
    fits: lastRowZ > RACE_NORTH_TURN_Z,
  };
}

/** One sampled point on a roll path, with its heading (radians; 0 is north, π is south). */
export interface RollPathPoint {
  x: number;
  z: number;
  heading: number;
}

/** A rig's precomputed roll path, from its formation slot to the line. */
export interface RollPath {
  slot: number;
  points: RollPathPoint[];
  cumulativeDistances: number[];
  length: number;
  /** ms from GO at the roll speed to the line crossing (the path's end). */
  crossingMs: number;
}

/** Sample a cubic Bezier in world space, t = 0..1 inclusive. */
function sampleRollTurn(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  steps = 256,
): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return points;
}

/**
 * The roll path for one formation slot: a straight leg south down its own
 * flank to the turn start, then the same-flank U-turn, ending on its flank's
 * racing lane at the line heading north. The end pose is the shipped rival
 * route's start pose by construction — `[CIRCUS_AXIS_X ± RACE_LANE_OFFSET,
 * 42.5]` heading north — so a rig hands over to the race phase without a
 * snap. Never throws; the path is precomputed once, the scene never rebuilds it.
 */
export function resolveRollPath(slot: FormationSlot): RollPath {
  const raw: Array<readonly [number, number]> = [];
  // The straight leg: south down the flank, sampled every half unit.
  const legLength = FORMATION_TURN_START_Z - slot.z;
  const legSteps = Math.max(1, Math.round(legLength / 0.5));
  for (let i = 0; i <= legSteps; i += 1) {
    raw.push([slot.x, slot.z + (legLength * i) / legSteps]);
  }
  // The same-flank U-turn: the turn's lateral span is the flank column to
  // the racing lane — at most the flank centre to the lane — and the curve
  // dips just past the line (the bounded dip) before ending on it.
  const turn = sampleRollTurn(
    [slot.x, FORMATION_TURN_START_Z],
    [slot.x, FORMATION_TURN_CONTROL_Z],
    [slot.endX, FORMATION_TURN_END_CONTROL_Z],
    [slot.endX, slot.endZ],
  );
  for (let i = 1; i < turn.length; i += 1) raw.push(turn[i]);

  const cumulativeDistances = [0];
  for (let i = 1; i < raw.length; i += 1) {
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]),
    );
  }
  const length = cumulativeDistances[cumulativeDistances.length - 1];
  const points: RollPathPoint[] = raw.map(([x, z], index) => {
    // Heading from the segment's own direction — the direction the rig is
    // actually rendered travelling (getRollPathPoseAtDistance reads the same
    // way), never from interpolating two stored headings, which would spin
    // the rig the wrong way across the atan2 wrap where the turn passes south.
    // The last point takes the final segment's direction, so the end heading
    // is the approach to the line, not a chord across the turn's exit.
    const from = raw[Math.max(0, index - 1)];
    const to = raw[Math.min(raw.length - 1, index + 1)];
    return {
      x,
      z,
      heading: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])),
    };
  });
  return {
    slot: slot.slot,
    points,
    cumulativeDistances,
    length,
    crossingMs: (length / FORMATION_ROLL_SPEED) * 1000,
  };
}

/**
 * Resolve a rig's pose on its roll path at a travelled distance. The
 * position is interpolated along the segment; the heading comes from that
 * segment's own direction (a single atan2) — never from interpolating two
 * stored headings, which would spin the rig the wrong way across the atan2
 * wrap where the turn passes south.
 */
export function getRollPathPoseAtDistance(
  path: RollPath,
  distance: number,
): RollPathPoint {
  const clamped = Math.max(0, Math.min(path.length, distance));
  const distances = path.cumulativeDistances;
  let low = 1;
  let high = distances.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (distances[middle] < clamped) low = middle + 1;
    else high = middle;
  }
  const from = path.points[low - 1];
  const to = path.points[low];
  const segmentLength = distances[low] - distances[low - 1];
  const t = segmentLength > 0 ? (clamped - distances[low - 1]) / segmentLength : 1;
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    heading: Math.atan2(-(to.x - from.x), -(to.z - from.z)),
  };
}

/** The whole field's roll: every slot's path, and the crossings the clock hangs on. */
export interface FormationRoll {
  slots: FormationSlot[];
  paths: RollPath[];
  /** The player's slot — last by default, or the qualifying slot when one was passed to the grid. */
  playerSlot: number;
  /** The rivals' slots, in field order. */
  rivalSlots: number[];
  /** ms from GO to the LEADER's crossing — the race clock's origin. */
  leaderCrossingMs: number;
  /** ms from GO to the player's crossing — the Clean Start boost/bog duration runs from here. */
  playerCrossingMs: number;
}

/**
 * The formation and every rig's roll path for a field. The leader is the
 * front-row rig whose path is shortest (the front row, the shortest leg);
 * the player's crossing is the last slot's. The clock starts at the leader's
 * crossing; the player's own race time runs from the player's crossing.
 * LADDER-1E Part 5: `playerSlot` is the qualifying slot — passed through to
 * the grid, so the player's roll path is the path at the earned slot.
 */
export function resolveFormationRoll(
  fieldSize: unknown,
  firstRivalStartSide: -1 | 1 = 1,
  playerSlot?: unknown,
): FormationRoll {
  const grid = resolveStartGrid(fieldSize, firstRivalStartSide, playerSlot);
  const slots = formationSlotsFromGrid(grid);
  const paths = slots.map((slot) => resolveRollPath(slot));
  // The assignment order is the grid's, not slot order: rivalSlots[i] is the
  // slot of the i-th rival in field (pool) order, so the scene can pair each
  // competitor with its slot without re-deriving the assignment. A slot-order
  // list here would silently pair the wrong rival with the wrong slot.
  const leaderCrossingMs = Math.min(...paths.map((path) => path.crossingMs));
  const playerCrossingMs = paths[grid.playerSlot]?.crossingMs ?? leaderCrossingMs;
  return {
    slots,
    paths,
    playerSlot: grid.playerSlot,
    rivalSlots: grid.rivalSlots,
    leaderCrossingMs,
    playerCrossingMs,
  };
}

/**
 * The race clock's origin: GO plus the leader's crossing. The countdown
 * elapses at GO; the clock does not start until the leader crosses the line.
 */
export function resolveRollClockOriginMs(rollStartedAtMs: number, leaderCrossingMs: number): number {
  return rollStartedAtMs + leaderCrossingMs;
}

/** Where one rig is on its roll: still rolling, or racing with time since its own crossing. */
export interface RollPhase {
  /** True while the rig is still rolling toward the line. */
  rolling: boolean;
  /** Distance travelled along the roll path, in units. */
  rollDistance: number;
  /** ms of race time since THIS rig crossed the line (0 while rolling). */
  raceElapsedMs: number;
}

/**
 * A rig's phase at `elapsedMs` after GO. The rig rolls at the formation
 * speed until its path ends; after that it is racing, and its race time is
 * measured from its own crossing — the player's Clean Start boost/bog
 * duration runs from the player's crossing, not the leader's.
 */
export function resolveRollPhase(path: RollPath, elapsedMs: number): RollPhase {
  const distance = (FORMATION_ROLL_SPEED * Math.max(0, elapsedMs)) / 1000;
  if (distance < path.length) {
    return { rolling: true, rollDistance: distance, raceElapsedMs: 0 };
  }
  return { rolling: false, rollDistance: path.length, raceElapsedMs: elapsedMs - path.crossingMs };
}

// ── Roll-path clearance: the probes and the spina tip ────────────────────

/** Ray-casting point-in-polygon, for the driveable outline (a closed ring). */
export function isPointInsideDriveableOutline(x: number, z: number): boolean {
  const ring = CHARIOT_DRIVEABLE_OUTLINE;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance from a point to one outline segment. */
function distanceToOutlineSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return Math.hypot(x - px, z - pz);
}

/**
 * The distance from a point to the driveable outline's boundary — positive
 * inside, negative outside. (The outline is a closed ring, so the sign comes
 * from the ray-casting test above.)
 */
export function distanceToDriveableOutline(x: number, z: number): number {
  const ring = CHARIOT_DRIVEABLE_OUTLINE;
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    min = Math.min(min, distanceToOutlineSegment(x, z, ax, az, bx, bz));
  }
  return isPointInsideDriveableOutline(x, z) ? min : -min;
}

/**
 * The distance from a point to the spina tip box — 0 inside it, positive
 * outside. The roll paths must stay clear of the box with margin.
 */
export function distanceToSpinaTipBox(x: number, z: number): number {
  const dx = Math.max(SPINA_TIP_BOX.xMin - x, 0, x - SPINA_TIP_BOX.xMax);
  const dz = Math.max(SPINA_TIP_BOX.zMin - z, 0, z - SPINA_TIP_BOX.zMax);
  return Math.hypot(dx, dz);
}

/** The clearance of one roll path: its deepest dip, its probe margins, its tip clearance. */
export interface RollPathClearance {
  /** The path's deepest z — the bounded dip past the line (≤ 42.9 by design). */
  maxZ: number;
  /** True when every sampled body and nose probe stays inside the driveable outline. */
  allProbesInside: boolean;
  /**
   * The smallest probe margin over the whole path: the distance from a probe
   * centre to the outline minus the probe radius (body 1.05, nose 0.7).
   * Positive means the probe circle stays inside the outline.
   */
  minProbeMargin: number;
  /** The smallest distance from any sampled point to the spina tip box. */
  minTipClearance: number;
}

/**
 * The clearance of a roll path, sampled at every path point. The two probes
 * are chariotMovement.ts's — the body circle (1.05 at the rig origin) and
 * the nose circle (0.7 at +2.02 forward along the heading) — so a path is
 * clear only when both circles stay inside the driveable outline at every
 * sampled pose.
 */
export function resolveRollPathClearance(path: RollPath): RollPathClearance {
  let maxZ = -Infinity;
  let allProbesInside = true;
  let minProbeMargin = Infinity;
  let minTipClearance = Infinity;
  for (const point of path.points) {
    maxZ = Math.max(maxZ, point.z);
    minTipClearance = Math.min(minTipClearance, distanceToSpinaTipBox(point.x, point.z));
    const forwardX = -Math.sin(point.heading);
    const forwardZ = -Math.cos(point.heading);
    const bodyMargin = distanceToDriveableOutline(point.x, point.z) - 1.05;
    const noseMargin = distanceToDriveableOutline(
      point.x + forwardX * 2.02,
      point.z + forwardZ * 2.02,
    ) - 0.7;
    if (bodyMargin < 0 || noseMargin < 0) allProbesInside = false;
    minProbeMargin = Math.min(minProbeMargin, bodyMargin, noseMargin);
  }
  return { maxZ, allProbesInside, minProbeMargin, minTipClearance };
}
