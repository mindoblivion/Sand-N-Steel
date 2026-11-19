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
 */
export function resolveStartGrid(
  fieldSize: unknown,
  firstRivalStartSide: -1 | 1 = 1,
): StartGrid {
  const slots = resolveGridSlots(fieldSize);
  const size = slots.length;
  const playerSlot = size - 1;
  const side: -1 | 1 = firstRivalStartSide === -1 ? -1 : 1;
  const flankSlot = slots.find((slot) => slot.row === 0 && slot.side === side && slot.slot !== playerSlot);
  const rivalSlots: number[] = [];
  if (flankSlot) rivalSlots.push(flankSlot.slot);
  for (const slot of slots) {
    if (slot.slot === playerSlot) continue;
    if (rivalSlots.includes(slot.slot)) continue;
    rivalSlots.push(slot.slot);
  }
  for (const slot of slots) {
    slot.occupant = slot.slot === playerSlot ? 'player' : 'rival';
  }
  return {
    fieldSize: size,
    slots,
    playerSlot,
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
 * in a District race — read from the per-rung results write 1E adds
 * (`racing.districtBestFinish`, the best finish at the rung; absent on every
 * save today, so the League stays locked until 1E's write exists). 1E owns the
 * results write and may rename the field — if it does, this read and its test
 * move with it. Never throws on a missing or malformed profile.
 */
export function resolveRungLockState(
  profile: PlayerProfile | null | undefined,
): RungLockState {
  const districtBestFinish = (
    profile?.racing as { districtBestFinish?: unknown } | undefined
  )?.districtBestFinish;
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
