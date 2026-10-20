/**
 * raceState.ts — Phase C-8.70B Stage 1, Slice 1: the race state machine.
 *
 * A PURE module: no React, no three.js, no timer, no storage, no imports at all.
 * It owns the race's five states and which transitions between them are legal,
 * so the scene that renders the race and the suite that pins it share one source
 * of truth for "what can happen next" instead of each driving its own booleans.
 *
 * ── The states ────────────────────────────────────────────────────────────
 *   idle       at the start position, before the countdown — the state the
 *              "Start Race" hand-off puts the scene in;
 *   countdown  the 3 · 2 · 1 overlay is running;
 *   racing     the countdown has elapsed; the race clock is running;
 *   finished   the race ended through its own `finish` event.  Nothing calls it
 *              yet: `finishRace` below is the API Stage 2's finish line will
 *              call, and until then only the suite exercises it;
 *   aborted    the race was abandoned (the Abort race button, or Esc).
 *
 * ── The transitions ───────────────────────────────────────────────────────
 *   idle      → countdown   on `start`
 *   countdown → racing      on `countdown-elapsed`
 *   racing    → finished    on `finish`   — from `racing` ONLY
 *   any       → aborted     on `abort`
 *
 * Every other pair is ILLEGAL and is a NO-OP: `raceTransition` returns the state
 * it was handed unchanged, so an out-of-order event — a stray second `start`, a
 * `finish` arriving before the countdown even ended — can never move the
 * machine.  `abort` is defined from every state so a teardown can be requested
 * from anywhere; from `aborted` it is the identity, so a repeated abort (a tap
 * landing on the Esc handler's frame) cannot move the machine twice.
 *
 * ── Presentation timing is derived here, never stored in the machine ──────
 * The machine holds no clock.  The scene measures elapsed time and asks this
 * module what it means:
 *   • `COUNTDOWN_MS` is how long `countdown` lasts, and `getCountdownStep(elapsed)`
 *     answers which of `COUNTDOWN_STEPS` ("3", "2", "1") a moment belongs to, or
 *     `null` once the countdown has elapsed — the moment the scene dispatches
 *     `countdown-elapsed`.  `GO_LABEL` is shown for `GO_DISPLAY_MS` at the start
 *     of `racing`: a presentation beat, not a sixth state, which is why the race
 *     clock's origin is exactly the moment the countdown elapsed;
 *   • `formatRaceElapsed(elapsed)` renders that clock as mm:ss.t.
 * Keeping the timing out of the machine is what lets the machine be tested with
 * no clock at all.
 *
 * ── Nothing here reads or writes a save ───────────────────────────────────
 * The module imports nothing, so entering the race, aborting it or (in a later
 * slice) finishing it cannot move gold, unlocks or progression.
 */

/** The race's five states. */
export type RaceState = 'idle' | 'countdown' | 'racing' | 'finished' | 'aborted';

/** Everything that can move the machine. */
export type RaceEvent = 'start' | 'countdown-elapsed' | 'finish' | 'abort';

/** Every state, in lifecycle order — the suite sweeps this list. */
export const RACE_STATES: readonly RaceState[] = [
  'idle',
  'countdown',
  'racing',
  'finished',
  'aborted',
];

/** Where a fresh race begins: at the start position, before the countdown. */
export const RACE_INITIAL_STATE: RaceState = 'idle';

/** The countdown's steps, one per second, in order. */
export const COUNTDOWN_STEPS = ['3', '2', '1'] as const;

export type CountdownStep = (typeof COUNTDOWN_STEPS)[number];

/** How long each countdown step is shown. */
export const COUNTDOWN_STEP_MS = 1000;

/** The whole countdown: three steps of one second. */
export const COUNTDOWN_MS = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS;

/** The green light shown at the start of `racing`. */
export const GO_LABEL = 'GO';

/** How long the green light is shown, inside `racing`. */
export const GO_DISPLAY_MS = 700;

/**
 * The transition table.  A state's row lists only its legal events; anything
 * absent from the row is an illegal transition and a no-op.
 */
const RACE_TRANSITIONS: Record<RaceState, Partial<Record<RaceEvent, RaceState>>> = {
  idle: { start: 'countdown', abort: 'aborted' },
  countdown: { 'countdown-elapsed': 'racing', abort: 'aborted' },
  racing: { finish: 'finished', abort: 'aborted' },
  finished: { abort: 'aborted' },
  aborted: { abort: 'aborted' },
};

/**
 * The machine.  Total and pure: every (state, event) pair answers with a state —
 * the next one for a legal transition, and the SAME one for an illegal one.
 */
export function raceTransition(state: RaceState, event: RaceEvent): RaceState {
  return RACE_TRANSITIONS[state]?.[event] ?? state;
}

/** `idle` → `countdown`.  Any other state is unchanged. */
export function startRace(state: RaceState): RaceState {
  return raceTransition(state, 'start');
}

/** `countdown` → `racing`.  Any other state is unchanged. */
export function markCountdownElapsed(state: RaceState): RaceState {
  return raceTransition(state, 'countdown-elapsed');
}

/**
 * The finish API: `racing` → `finished`, and from any other state a no-op — a
 * race can only be finished while it is actually running.  Nothing calls this
 * yet; Stage 2's finish line will.
 */
export function finishRace(state: RaceState): RaceState {
  return raceTransition(state, 'finish');
}

/** Any state → `aborted` (the identity from `aborted` itself). */
export function abortRace(state: RaceState): RaceState {
  return raceTransition(state, 'abort');
}

/** Is the race on screen with its Abort control live?  (`countdown` or `racing`.) */
export function isRaceRunning(state: RaceState): boolean {
  return state === 'countdown' || state === 'racing';
}

/**
 * Which countdown step `elapsedMs` belongs to, or `null` when there is none:
 * before the countdown starts (a negative or nonsense reading) and from
 * `COUNTDOWN_MS` onward, i.e. the moment `countdown-elapsed` is due.
 */
export function getCountdownStep(elapsedMs: number): CountdownStep | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return COUNTDOWN_STEPS[Math.floor(elapsedMs / COUNTDOWN_STEP_MS)] ?? null;
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/**
 * The race clock, as mm:ss.t.  A negative or nonsense reading renders as 00:00.0
 * rather than as a broken string; minutes never wrap (a 100-minute race reads
 * 100:00.0).
 */
export function formatRaceElapsed(elapsedMs: number): string {
  const safeMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const totalTenths = Math.floor(safeMs / 100);
  const totalSeconds = Math.floor(totalTenths / 10);
  return `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}.${totalTenths % 10}`;
}
