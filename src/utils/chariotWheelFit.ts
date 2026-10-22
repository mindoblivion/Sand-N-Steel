/**
 * S8 — spiked & bladed wheels: the measured fit pass (DEVELOPMENT-ONLY).
 *
 * ── WHAT THIS MODULE IS ───────────────────────────────────────────────────
 * The two wheel variants the workshop withholds (`data/chariotParts.ts`), put
 * through the SHIPPING mounting transform and measured, so the gate this slice
 * was written against can be read as numbers instead of adjectives:
 *
 *   1. tyre-to-ground penetration at ride height,
 *   2. hub/axle alignment against the shipping variants' standard,
 *   3. the `chariotTeamFormation` clearances re-run at each variant's own radius.
 *
 * **No catalogue entry is added here and none can be**: the keys below are this
 * module's own (`WheelFitVariantKey`), `ChariotWheelVariantKey` in
 * `data/chariotParts.ts` is untouched, and nothing in `src/` outside
 * `components/dev/HorseChariotFitPrototype.tsx` and the suite imports this file.
 * It exists because the measurement FAILED — see `.base44/wheel-fit-s8.md`.
 *
 * ── HOW A WHEEL VARIANT'S RADIUS IS CONSUMED IN PRODUCTION TODAY ──────────
 * Traced so an admission could not silently change the ride of the variants that
 * already ship.  There are exactly two consumers, and neither is variant-aware:
 *
 *   • **The ride.**  Nothing derives ride height from a wheel.  `RaceScene`
 *     mounts `CHARIOT_MODEL_URL` on the carceres line with the model's own
 *     authored ground plane at y = 0 and never mounts the kit at all, so an
 *     equipped kit variant has **no effect on the race ride** today; and
 *     `ChariotPreview` mounts a kit wheel hub-centred at (±0.70, 0.650, 0) with
 *     no lift, so its tyre bottom is simply `kitBottomY − 0.10`.  That is why the
 *     standard set reproduces the model's authored −0.035 sink and why the
 *     reinforced set reaches 0.0175 lower (the recorded fit discrepancy).
 *   • **The wheel-rotation mechanics.**  `chariotMovement.ts` owns ONE radius,
 *     `CHARIOT_WHEEL_RADIUS = 0.685` (the stock wheel), and `advanceWheelRoll`
 *     divides distance by it.  `RaceScene` spins the GLB's own `Wheel_L` /
 *     `Wheel_R` about their measured hubs.  No equipped variant's radius reaches
 *     this rule, so a larger rim admitted without touching it would turn at the
 *     stock rate (r/0.685 of the true roll) — a data-only admission would not
 *     change the ride, but it would visibly under-roll the day the race scene
 *     learns to mount the kit.
 *
 * ── THE MEASURED NUMBERS (re-measured from the shipping GLB by the suite) ──
 * `public/_workspace_chariot_model_RomanChariot_WheelKit.glb`, every vertex
 * through the shipped `Ry(−π/2)` mount, hub-centred:
 *
 *   | variant    | kit hub X | rim radius | kit bottom | mounted bottom | deeper than stock |
 *   |------------|-----------|------------|------------|----------------|-------------------|
 *   | standard   | −3.75     | 0.6850     | +0.0650    | −0.0350        | 0.0000 (the authored sink) |
 *   | reinforced | −1.25     | 0.7025     | +0.0475    | −0.0525        | 0.0175 (recorded)           |
 *   | spiked     | +1.25     | 0.7940     | −0.0440    | **−0.1440**    | **0.1090**    |
 *   | bladed     | +3.75     | 1.0947     | −0.1429    | **−0.2429**    | **0.2079**    |
 *
 * The withheld notes in `chariotGeometry.ts` carried 0.8025 / 0.8429 in
 * parentheses as unmeasured guesses; the asset says 0.7940 / **1.0947** — the
 * bladed wheel is 2.19 across, 60 % larger than the stock 1.37.
 */

import {
  ChariotWheelSide,
  CHARIOT_STOCK_WHEEL_BOTTOM_Y,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_KIT_HUB_Y,
  CHARIOT_WHEEL_YAW,
} from './chariotGeometry';
import {
  CHARIOT_GROUND_Y,
  HORSE_ENVELOPE,
  HORSE_REAR_CLEARANCE,
  getTeamClearanceReport,
  type TeamClearance,
} from './chariotTeamFormation';
import type { ChariotTeamSize } from '../types/game';

/** The two variants this slice measures.  Neither is in the catalogue. */
export type WithheldWheelVariantKey = 'spiked' | 'bladed';

/** Every variant measured here — the two that ship (for the control readings) plus the two withheld. */
export type WheelFitVariantKey = 'standard' | 'reinforced' | WithheldWheelVariantKey;

export interface WheelFitVariant {
  /** Kit node to mount. */
  node: string;
  /** The variant's hub X in the kit's own row layout (measured bounds centre = its bronze hub). */
  kitHubX: number;
  /** Outermost measured radius from the hub — spikes and blades count, not just the wooden rim. */
  radius: number;
  /** The variant's lowest Y in the kit's own frame. */
  kitBottomY: number;
  /**
   * The side whose mount is mirrored through the wheel's own mid-plane, or null
   * when both sides are identical instances.  The bladed wheel's raked blades are
   * chirally asymmetric (2302 of its 2486 vertices have no mirror twin about that
   * plane), so one side must be mirrored for the pair to read as a pair.
   */
  mirroredSide: ChariotWheelSide | null;
}

export const WHEEL_FIT_VARIANTS: Record<WheelFitVariantKey, WheelFitVariant> = {
  standard: { node: 'Wheel_Standard', kitHubX: -3.75, radius: 0.685, kitBottomY: 0.065, mirroredSide: null },
  reinforced: { node: 'Wheel_Reinforced', kitHubX: -1.25, radius: 0.7025, kitBottomY: 0.0475, mirroredSide: null },
  spiked: { node: 'Wheel_Spiked', kitHubX: 1.25, radius: 0.794, kitBottomY: -0.044, mirroredSide: null },
  bladed: { node: 'Wheel_Bladed', kitHubX: 3.75, radius: 1.0946984, kitBottomY: -0.1428748, mirroredSide: 'right' },
};

/** The variants this slice is about. */
export const WITHHELD_WHEEL_VARIANTS: readonly WithheldWheelVariantKey[] = ['spiked', 'bladed'];

export interface WheelFitPlacement {
  /** The wrapper group's position (the per-variant, per-side offset). */
  position: [number, number, number];
  /** The wrapper group's Y rotation. */
  rotationY: number;
  /**
   * The wrapper group's scale — **the mirroring seam**: `[1, 1, −1]`, the wheel
   * mirrored through its own mid-plane, which flips the blades' rake without
   * moving the hub, the radius or the tyre's bottom.
   *
   * It is the Z component, not X, because three composes `T · R · S`: the scale is
   * applied in the CHILD's (kit) frame, before the yaw.  The kit wheel's disc lies
   * in its own XY plane, so its Z IS the disc's normal (the axle direction after
   * the yaw) — the axis a left/right mirror has to flip.  A `scale.x = −1` there
   * would mirror the wheel across a vertical diameter instead: still chiral, but
   * it would put the pair's blades in the same rake rather than opposite ones.
   *
   * three.js flips the front-face winding for a negative-determinant matrix
   * itself, so the mirror needs no geometry work.
   */
  scale: [number, number, number];
  mirrored: boolean;
  /** Where the hub ends up — the chariot's axle hub, for every variant. */
  hub: [number, number, number];
  /** Where the tyre's lowest point ends up. */
  bottomY: number;
  /** `bottomY` against the standard wheel's own bottom; negative means it sinks deeper. */
  bottomDelta: number;
  /** Depth below the chariot's authored ground plane.  Positive = the tyre is buried in it. */
  penetration: number;
}

/**
 * The shipping transform, generalised by one bit: the per-side mirror.
 *
 * The arithmetic is `getChariotWheelPlacement`'s — `position = hub − Ry(yaw)·hub_kit`
 * with the kit hub mirrored on the mirrored side first — so the two functions
 * cannot disagree about the standard and reinforced variants, which is what the
 * suite's control readings prove.
 */
export function getWheelFitPlacement(
  variant: WheelFitVariantKey,
  side: ChariotWheelSide
): WheelFitPlacement {
  const spec = WHEEL_FIT_VARIANTS[variant];
  const mirrored = spec.mirroredSide === side;
  const scale: [number, number, number] = mirrored ? [1, 1, -1] : [1, 1, 1];
  const hubX = side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X;

  const cosYaw = Math.cos(CHARIOT_WHEEL_YAW);
  const sinYaw = Math.sin(CHARIOT_WHEEL_YAW);
  // Only the scale's radial X component can move the hub; the mirror is axial and
  // the kit hub lies at Z 0, so a mirrored mount and an unmirrored one share the
  // same offset — which is what keeps the hub on the axle either way.
  const hx = scale[0] * spec.kitHubX;
  const rotatedHubX = hx * cosYaw;
  const rotatedHubZ = -hx * sinYaw;

  const position: [number, number, number] = [
    hubX - rotatedHubX,
    CHARIOT_WHEEL_HUB_Y - CHARIOT_WHEEL_KIT_HUB_Y,
    0 - rotatedHubZ,
  ];
  const bottomY = position[1] + spec.kitBottomY;

  return {
    position,
    rotationY: CHARIOT_WHEEL_YAW,
    scale,
    mirrored,
    hub: [
      position[0] + rotatedHubX,
      position[1] + CHARIOT_WHEEL_KIT_HUB_Y,
      position[2] + rotatedHubZ,
    ],
    bottomY,
    bottomDelta: bottomY - CHARIOT_STOCK_WHEEL_BOTTOM_Y,
    penetration: -bottomY,
  };
}

/** One measurable fit gate: what it is, the value read, the rule, and the verdict. */
export interface WheelFitRule {
  id: string;
  description: string;
  value: number;
  limit: number;
  ok: boolean;
}

export interface WheelFitReport {
  variant: WheelFitVariantKey;
  radius: number;
  /** Both sides' placements — identical except for the mirror on one. */
  sides: Record<ChariotWheelSide, WheelFitPlacement>;
  /** Every team size's clearances, re-run at this variant's own radius. */
  formation: Array<{
    teamSize: ChariotTeamSize;
    clearances: TeamClearance[];
    ok: boolean;
  }>;
  rules: WheelFitRule[];
  ok: boolean;
}

/** The 1e-9 tolerance `getTeamClearanceReport` uses for a rule satisfied exactly. */
const EPSILON = 1e-9;

/**
 * `chariotTeamFormation`'s clearance rows re-run at a given wheel radius.
 *
 * The row set is the module's own — read, not restated — with the two rows that
 * depend on the wheel substituted: `wheel-z-leading-edge` gains the variant's own
 * leading edge (`−radius`: the disc is centred on the hub at Z 0 and the yaw
 * leaves Z as the disc's own radial axis) and `ground` gains the variant's own
 * tyre bottom.  Every other row is radius-independent and passes through as-is.
 */
export function getFormationClearancesAtWheel(
  teamSize: ChariotTeamSize,
  radius: number,
  tyreBottomY: number
): { teamSize: ChariotTeamSize; clearances: TeamClearance[]; ok: boolean } {
  const leadingZ = -radius;
  const base = getTeamClearanceReport(teamSize);

  const clearances = base.clearances.map((row) => {
    if (row.id === 'wheel-z-leading-edge') {
      const value = leadingZ - HORSE_ENVELOPE.maxRearZ;
      return {
        ...row,
        description: `Inner horse's rearmost point forward of the wheel disc's leading edge (at this variant's own leading edge Z ${leadingZ.toFixed(4)})`,
        value,
        ok: value >= HORSE_REAR_CLEARANCE - EPSILON,
      };
    }
    if (row.id === 'ground') {
      const value = CHARIOT_GROUND_Y - tyreBottomY;
      return { ...row, value, ok: value >= -EPSILON };
    }
    return row;
  });

  return { teamSize, clearances, ok: clearances.every((row) => row.ok) };
}

/**
 * The whole fit pass for one variant, as numbers.
 *
 * The three gates are the slice's own: penetration must be ≤ 0 ("no
 * penetration"), the hub must land on the axle's own anchor exactly, and every
 * `chariotTeamFormation` row must stay green at the variant's radius.  Both
 * readings of the penetration gate are carried, because the literal one is
 * already failed by the geometry that ships (−0.035): `tyre-ground` is the
 * literal gate, `tyre-ground-vs-standard` is the same reading against the
 * shipping standard set's own sink.
 */
export function getWheelFitReport(variant: WheelFitVariantKey): WheelFitReport {
  const spec = WHEEL_FIT_VARIANTS[variant];
  const left = getWheelFitPlacement(variant, 'left');
  const right = getWheelFitPlacement(variant, 'right');
  const side = right;

  const hubError = Math.max(
    Math.abs(side.hub[0] - CHARIOT_WHEEL_HUB_X),
    Math.abs(side.hub[1] - CHARIOT_WHEEL_HUB_Y),
    Math.abs(side.hub[2])
  );

  const formation = ([2, 3, 4] as ChariotTeamSize[]).map((teamSize) =>
    getFormationClearancesAtWheel(teamSize, spec.radius, side.bottomY)
  );

  const rules: WheelFitRule[] = [
    {
      id: 'tyre-ground',
      description: 'Tyre’s lowest point against the chariot’s authored ground plane (≤ 0 = no penetration)',
      value: side.bottomY,
      limit: 0,
      ok: side.bottomY >= -EPSILON,
    },
    {
      id: 'tyre-ground-vs-standard',
      description: 'Tyre’s lowest point against the shipping standard set’s own bottom (≥ 0 = no deeper)',
      value: side.bottomY - CHARIOT_STOCK_WHEEL_BOTTOM_Y,
      limit: 0,
      ok: side.bottomY - CHARIOT_STOCK_WHEEL_BOTTOM_Y >= -EPSILON,
    },
    {
      id: 'hub-axle',
      description: 'Hub on the axle’s own anchor (±0.70, 0.65, 0) — the shipping variants’ standard',
      value: -hubError,
      limit: 0,
      ok: hubError <= EPSILON,
    },
    ...formation[0].clearances
      .filter((row) => row.id === 'wheel-z-leading-edge' || row.id === 'ground')
      .map((row) => ({
        id: `formation-${row.id}`,
        description: row.description,
        value: row.value,
        limit: row.limit,
        ok: row.ok,
      })),
  ];

  return {
    variant,
    radius: spec.radius,
    sides: { left, right },
    formation,
    rules,
    ok: rules.every((rule) => rule.ok) && formation.every((report) => report.ok),
  };
}

/** Every gate this variant fails, by id — the report line a stopped slice quotes. */
export function getFailingWheelFitRules(variant: WheelFitVariantKey): string[] {
  const report = getWheelFitReport(variant);
  const failed = report.rules.filter((rule) => !rule.ok).map((rule) => rule.id);
  const clearanceRows = report.formation
    .flatMap((entry) => entry.clearances.filter((row) => !row.ok).map((row) => `${entry.teamSize}:${row.id}`));
  return [...new Set([...failed, ...clearanceRows])];
}
