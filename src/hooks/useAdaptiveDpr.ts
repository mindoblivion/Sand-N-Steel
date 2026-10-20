/**
 * useAdaptiveDpr.ts — SF-1: the city Canvas's pixel-budget governor.
 *
 * The city is the app's heaviest scene and its only screen a phone can sit in for a
 * long time.  Its Canvas used to ask for `dpr={[1, 2]}` — whatever the device
 * reported, up to 2 — which on a cheap phone means far more pixels than the studio
 * budget allows.  This module replaces that constant with two things:
 *
 * ── 1. A tier (the player's choice, `settings.qualityPreset`) ──────────────
 *   `CITY_TIERS` is the whole tier table, one row per preset: the DPR band the
 *   Canvas may render in, and the dust particle count.  Swift's band is fixed at
 *   1.0 with 1.25 of headroom and draws no dust; Cinematic may use 2.0; Balanced —
 *   the default — tops out at 1.5, which is the budget fix this slice exists for.
 *   A later slice attaches its shadow tier to the same row (`shadows`), which is why
 *   the table is a record of named fields rather than loose constants.
 *
 * ── 2. An engine that steps inside the band, from measured frame time ──────
 *   `stepAdaptiveDpr` is PURE: hand it the current state, the tier and one frame's
 *   duration and it returns the next state, stepping the DPR by 0.25 only when the
 *   evidence says so.  The evidence is a trimmed EMA — a 30-frame window, its two
 *   worst samples dropped so one hitch or a garbage collection cannot move the
 *   picture — with a sustained hold on each side: over 17.5 ms for 1.5 s steps
 *   down, under 12 ms for 5 s steps up, and never twice inside 3 s.  Every one of
 *   those numbers is exported, so the suite pins the table rather than a copy.
 *
 * ── What the engine is NOT allowed to do ──────────────────────────────────
 *   It never touches React per frame: the EMA lives in a ref inside
 *   `useAdaptiveDpr`, and the scene hears about a change only when one actually
 *   happens (`onDprChange`) — at most once every 3 s.  It never applies a tier: the
 *   tier is applied at mount and on a preset change, by the scene's own state (see
 *   `CityHubScene`).  It never adapts during a transition: while the scene's
 *   `suspendedRef` is true (the mounting warm-up, a fast travel and the second after
 *   it) every frame is ignored and the timers are held at zero, so the hitches of a
 *   scene build can never be mistaken for a slow device.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { QualityPreset } from '../services/settings';

export type { QualityPreset };

// ─────────────────────────────────────────────────────────────────────────────
// The tier table
// ─────────────────────────────────────────────────────────────────────────────

/** The DPR band a tier may render in, and the DPR it starts at. */
export interface DprBand {
  readonly min: number;
  readonly max: number;
  /** Applied at mount and on a preset change — never by the engine mid-frame. */
  readonly start: number;
}

/** One tier's whole application in this slice: pixels, and the city's dust. */
export interface CityTier {
  /** The Canvas's DPR band. */
  readonly dpr: DprBand;
  /** Dust particles the city draws at this tier (0 = none at all). */
  readonly sparkles: number;
  /**
   * SF-1 reserves this row's next field: a later slice attaches its shadow tier
   * (shadow-map size, or whether the city casts them at all) here, so the scene
   * reads one table instead of a second set of constants.
   */
}

/**
 * The three tiers.
 *
 * `start` is the band's ceiling for the two tiers that ask for pixels — a device
 * that cannot hold them is stepped down by the engine, which is what the engine is
 * for — and Swift starts at its floor (1.0) with 1.25 of headroom, because Swift
 * means "this device is struggling" and must not open at a higher cost than the
 * tier below it.
 */
export const CITY_TIERS: Record<QualityPreset, CityTier> = {
  cinematic: { dpr: { min: 1.5, max: 2.0, start: 2.0 }, sparkles: 90 },
  balanced: { dpr: { min: 1.0, max: 1.5, start: 1.5 }, sparkles: 60 },
  swift: { dpr: { min: 1.0, max: 1.25, start: 1.0 }, sparkles: 0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// The engine's numbers
// ─────────────────────────────────────────────────────────────────────────────

/** Frames kept for the EMA. */
export const EMA_WINDOW = 30;
/** Worst samples dropped from that window before the EMA is taken. */
export const EMA_TRIM = 2;
/** The EMA's smoothing factor over the kept samples (`2 / (n + 1)`). */
export const EMA_ALPHA = 2 / (EMA_WINDOW - EMA_TRIM + 1);
/** A frame longer than this is treated as this long: one stall is not a verdict. */
export const SAMPLE_CLAMP_MS = 100;
/** Above this EMA the device is losing budget… */
export const STEP_DOWN_MS = 17.5;
/** …and below this one it has budget to spare. */
export const STEP_UP_MS = 12;
/** How long the EMA must stay over budget before the DPR is lowered. */
export const STEP_DOWN_SUSTAIN_MS = 1500;
/** How long it must stay under budget before the DPR is raised. */
export const STEP_UP_SUSTAIN_MS = 5000;
/** The shortest interval between two changes, in either direction. */
export const DWELL_MS = 3000;
/** One step.  Every band boundary sits on a multiple of this. */
export const DPR_STEP = 0.25;
/** How long adaptation is suspended for a transition, including after arrival. */
export const POST_TRANSITION_MS = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// The engine — pure
// ─────────────────────────────────────────────────────────────────────────────

export interface AdaptiveDprState {
  /** The DPR the Canvas should render at right now. */
  dpr: number;
  /** The last `EMA_WINDOW` frame times in ms, newest last. */
  samples: number[];
  /** The trimmed EMA of `samples`, or `null` before the first frame. */
  ema: number | null;
  /** Sustained ms over `STEP_DOWN_MS`. */
  overMs: number;
  /** Sustained ms under `STEP_UP_MS`. */
  underMs: number;
  /** ms since the last change (or since the engine started). */
  dwellMs: number;
  /** Whether the last frame handed to the engine was ignored as a transition. */
  suspended: boolean;
}

/** The EMA of a frame window, its `EMA_TRIM` worst samples dropped. */
export function trimmedEma(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  // The worst samples are FOUND by value but the survivors are averaged in the
  // order they arrived: an EMA is order-sensitive, and a hitch is a value, not a
  // position in the window.  At least one sample always survives the trim.
  const drop = new Set(
    samples
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.min(EMA_TRIM, samples.length - 1))
      .map((entry) => entry.index),
  );
  let ema: number | null = null;
  for (let index = 0; index < samples.length; index += 1) {
    if (drop.has(index)) continue;
    ema = ema === null ? samples[index] : ema + EMA_ALPHA * (samples[index] - ema);
  }
  return ema;
}

/** A fresh engine for a tier, at that tier's starting DPR. */
export function createAdaptiveDprState(tier: QualityPreset, suspended = false): AdaptiveDprState {
  return {
    dpr: CITY_TIERS[tier].dpr.start,
    samples: [],
    ema: null,
    overMs: 0,
    underMs: 0,
    dwellMs: 0,
    suspended,
  };
}

/**
 * One frame.  PURE and total: the returned state is a new object, so a caller can
 * compare identities to know whether anything moved, and any frame time — a
 * negative delta, a `NaN` from a clock hiccup, a three-second stall — is handled
 * rather than propagated.
 *
 * The only thing that ever moves `dpr` is a step, and every step lands inside the
 * tier's band, which is what makes the band a guarantee rather than a hope.
 */
export function stepAdaptiveDpr(
  state: AdaptiveDprState,
  tier: QualityPreset,
  frameMs: number,
  suspended = false,
): AdaptiveDprState {
  const band = CITY_TIERS[tier].dpr;

  // A transition's frames are not evidence.  The timers are zeroed, so the first
  // real frame after it starts from a clean slate.
  if (suspended) {
    if (state.suspended && state.overMs === 0 && state.underMs === 0) return state;
    return { ...state, suspended: true, overMs: 0, underMs: 0 };
  }

  // A frame that cannot be measured is not a frame: no sample, no timer.
  if (!Number.isFinite(frameMs) || frameMs <= 0) return state;

  const frame = Math.min(frameMs, SAMPLE_CLAMP_MS);
  const samples = [...state.samples, frame].slice(-EMA_WINDOW);
  const ema = trimmedEma(samples);
  if (ema === null) return state;

  const overMs = ema > STEP_DOWN_MS ? state.overMs + frame : 0;
  const underMs = ema < STEP_UP_MS ? state.underMs + frame : 0;
  const dwellMs = state.dwellMs + frame;

  let dpr = state.dpr;
  let stepped = false;
  if (dwellMs >= DWELL_MS) {
    if (overMs >= STEP_DOWN_SUSTAIN_MS && dpr - DPR_STEP >= band.min) {
      dpr -= DPR_STEP;
      stepped = true;
    } else if (underMs >= STEP_UP_SUSTAIN_MS && dpr + DPR_STEP <= band.max) {
      dpr += DPR_STEP;
      stepped = true;
    }
  }

  return {
    dpr,
    samples,
    ema,
    overMs: stepped ? 0 : overMs,
    underMs: stepped ? 0 : underMs,
    dwellMs: stepped ? 0 : dwellMs,
    suspended: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook — the engine, wired to a Canvas's frame loop
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAdaptiveDprOptions {
  /** The player's preset.  A change here re-applies the tier's own DPR. */
  tier: QualityPreset;
  /**
   * Told about a step, and nothing else.  The scene owns the Canvas's `dpr` prop,
   * so the value published here is the value the Canvas renders at.
   */
  onDprChange: (dpr: number) => void;
  /**
   * True while the scene is transitioning (the mounting warm-up, a fast travel and
   * `POST_TRANSITION_MS` after it).  Read per frame, so it costs no render.
   */
  suspendedRef: { readonly current: boolean };
}

/**
 * Mount INSIDE a `<Canvas>`: this is the only place a frame's own duration exists.
 * Returns nothing — the scene already holds the DPR as its own state.
 */
export function useAdaptiveDpr({ tier, onDprChange, suspendedRef }: UseAdaptiveDprOptions): void {
  const stateRef = useRef<AdaptiveDprState>(createAdaptiveDprState(tier, suspendedRef.current));
  // Kept in a ref so a step can publish without re-subscribing the frame loop, and
  // so the tier effect below depends on the TIER alone: an inline callback must not
  // be able to recreate the engine and reset the DPR mid-session.
  const publishRef = useRef(onDprChange);
  useEffect(() => {
    publishRef.current = onDprChange;
  }, [onDprChange]);

  // The tier is applied here — at mount and on a preset change, never mid-frame.
  useEffect(() => {
    const next = createAdaptiveDprState(tier, suspendedRef.current);
    stateRef.current = next;
    publishRef.current(next.dpr);
  }, [tier, suspendedRef]);

  useFrame((_, delta) => {
    const state = stateRef.current;
    const next = stepAdaptiveDpr(state, tier, delta * 1000, suspendedRef.current === true);
    if (next === state) return;
    stateRef.current = next;
    if (next.dpr !== state.dpr) publishRef.current(next.dpr);
  });
}
