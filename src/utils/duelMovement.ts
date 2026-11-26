/**
 * ===========================================================================
 * PHASE1-SMOOTH — Fighter translation smoothing. The duel fighters walk
 * instead of popping: a pure constant-speed step moves a fighter's RENDERED
 * position toward its STATE position each frame, and a per-fighter render
 * state tracks the last-seen fighter id so a mid-bout fighter swap snaps
 * instead of gliding across the sand.
 *
 * The state position is the single source of truth and is never touched here:
 * reach, distance bands, clamps and bounds are all computed from state. This
 * module only moves what the mesh shows.
 *
 * The arithmetic is the Cotta brothers' shipped `stepToward`
 * (`src/components/3d/BrothersPair.tsx`): a constant-speed step with exact
 * arrival, not an exponential lerp — feet need constant speed and a clean
 * moving/arrived signal for the idle-on-arrival clip switch. The brothers
 * keep their own copy untouched; the duplication is deliberate (no refactor
 * of a shipped boss fight inside a feel slice).
 * ===========================================================================
 */

/** A 3D position, as `FighterState.position` holds it. */
export type DuelVec3 = [number, number, number];

/**
 * PHASE1-SMOOTH — how fast a duel fighter walks to a new state position, in
 * world units per second. The Brothers' rate (`BROTHERS_TRAVERSE_SPEED`), not
 * an invented number: a 1.8 m advance/retreat/sidestep arrives in 0.30 s and
 * a 1.2 m knockback in 0.20 s — both inside their resolution beats.
 */
export const DUEL_FIGHTER_MOVE_SPEED = 6;

/**
 * PHASE1-SMOOTH — the frame clamp, in seconds. The Brothers' clamp: a
 * backgrounded tab resumes a traverse instead of snapping it across the
 * sand. A hitch frame steps at most `DUEL_FIGHTER_MOVE_SPEED * 0.1 = 0.6` m.
 */
export const DUEL_FIGHTER_FRAME_CLAMP = 0.1;

/** Anything at or below this distance counts as arrived. The Brothers' epsilon. */
const ARRIVED_EPSILON = 1e-4;

/**
 * Step `current` toward `target` by at most `step`, in place. Returns true
 * while the point is still moving (including the frame it arrives), false
 * when at rest. Pure arithmetic — exported so tests exercise this exact code.
 */
export function stepFighterToward(
  current: DuelVec3,
  target: DuelVec3,
  step: number,
): boolean {
  const dx = target[0] - current[0];
  const dy = target[1] - current[1];
  const dz = target[2] - current[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= ARRIVED_EPSILON) {
    current[0] = target[0];
    current[1] = target[1];
    current[2] = target[2];
    return false;
  }
  if (!Number.isFinite(step) || step <= 0) return true;
  if (distance <= step) {
    current[0] = target[0];
    current[1] = target[1];
    current[2] = target[2];
    return true;
  }
  const k = step / distance;
  current[0] += dx * k;
  current[1] += dy * k;
  current[2] += dz * k;
  return true;
}

/**
 * PHASE1-SMOOTH — the per-frame step for a render delta, in world units.
 * The speed times the clamped delta: a 1 s delta (a backgrounded tab) steps
 * at most 0.6 m, never a snap.
 */
export function fighterStepForDelta(delta: number): number {
  return DUEL_FIGHTER_MOVE_SPEED * Math.min(delta, DUEL_FIGHTER_FRAME_CLAMP);
}

/**
 * PHASE1-SMOOTH — one fighter's render state, held in a ref by the driver.
 * `rendered` is the position the mesh copies each frame (the same array the
 * mount's `positionRef` points at); `lastId` is the last fighter id seen, so
 * a fighter swap snaps instead of gliding.
 */
export interface FighterRenderState {
  rendered: DuelVec3;
  lastId: string | null;
}

/**
 * Advance one fighter's rendered position toward its state position for one
 * frame. If the fighter id changed since the last frame, snap the rendered
 * position to the target immediately (a new fighter appears where he stands,
 * he never glides in from the last fighter's spot) and report not-moving.
 * Otherwise step toward the target and report whether it is still moving.
 * Mutates only the passed-in state — no allocation, no React.
 */
export function stepFighterRender(
  state: FighterRenderState,
  target: DuelVec3,
  currentId: string,
  step: number,
): boolean {
  if (state.lastId !== currentId) {
    state.lastId = currentId;
    state.rendered[0] = target[0];
    state.rendered[1] = target[1];
    state.rendered[2] = target[2];
    return false;
  }
  return stepFighterToward(state.rendered, target, step);
}
