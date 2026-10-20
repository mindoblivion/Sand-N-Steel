/**
 * The gladiator's oath — the beat that closes a new gladiator's arrival in the city.
 *
 * ── WHAT THIS MODULE OWNS ────────────────────────────────────────────────
 *   • the road state, resolved lazily (`is this profile sworn?`);
 *   • the trigger — which arrival opens the beat at all, and the grandfather
 *     rule that keeps a legacy gladiator out of it;
 *   • the hold state machine the presented scene is driven by;
 *   • the beat's ONE write, `withOathSworn` — `road.oathSworn` is set here and
 *     nowhere else in the app.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *   It reads no storage and writes none: `withOathSworn` returns a NEW profile
 *   for the caller to hand to its own save-on-change path (the `chariotLoadout`
 *   / `racingProgression` house pattern), so the field is written exactly where
 *   every other profile change is written — `App`'s own `setProfile` +
 *   `saveProfile` pair — and a beat that is abandoned mid-line writes nothing at
 *   all, because nothing here has a save to write to.
 *
 * ── TWO TIMES ARE THE ONLY TIMES ─────────────────────────────────────────
 *   A line advances ONLY while the press is down: a step with no press changes
 *   nothing, a release keeps the progress it earned, and no phase in this machine
 *   can be failed into. The scene therefore needs no timer of its own, and the
 *   machine can be driven — and pinned — with no clock at all.
 */

import type { PlayerProfile, RoadProgress } from '../types/game';

// ══════════════════════════════════════════════════════════════════════════
// The oath itself
// ══════════════════════════════════════════════════════════════════════════

export interface OathLine {
  /** The Latin, as the Doctore says it. */
  latin: string;
  /** The gloss, on the SAME line: what the recruit is swearing to. */
  gloss: string;
}

/** How long one line's hold has to be held. The beat has no other clock. */
export const OATH_HOLD_MS = 1500;

/** The four lines the recruit swears, in order, each in Latin with its gloss. */
export const OATH_LINES: readonly OathLine[] = [
  { latin: 'Uri', gloss: 'to endure burning' },
  { latin: 'Vinciri', gloss: 'to be bound' },
  { latin: 'Verberari', gloss: 'to be beaten' },
  { latin: 'Ferroque necari', gloss: 'and to be killed by the sword' },
];

/** The Doctore's framing line, before the first word is asked for. */
export const OATH_FRAMING_LINE =
  'You come to my yard unsworn, and unsworn men are meat. Kneel, and say the words as they are given to you.';

/** The closing vow — the fifth line, and the last thing the recruit swears. */
export const OATH_CLOSING_LINE = 'What I swear, I swear. Let the city witness.';

/** The repeat profile's one-step skip: the recruit who already knows the words. */
export const OATH_SKIP_LABEL = 'I know the words';

/** One line as the scene reads it: the Latin and its gloss on the same line. */
export function oathLineText(line: OathLine): string {
  return `${line.latin} — ${line.gloss}`;
}

/** Where the presented scene stands: the Doctore's own yard, at first light. */
export const OATH_SCENE_LABEL = 'The Doctore · Ludus Martial Yard · dawn';

// ══════════════════════════════════════════════════════════════════════════
// The road, and who has already sworn
// ══════════════════════════════════════════════════════════════════════════

/**
 * The road, resolved lazily. `road` is optional and so is every subfield, so a save
 * written before this slice carries no road at all and must keep loading: an absent,
 * partial or malformed road always means "nothing said" — the save is never repaired
 * and never migrated. `chariot` and `racing` follow the same rule.
 */
export function readRoad(profile: PlayerProfile | null | undefined): RoadProgress | null {
  const road = profile?.road;
  return road && typeof road === 'object' ? road : null;
}

/** What the field itself says. Only `true` counts; absent, false or junk is unresolved. */
export function isOathSwornByField(profile: PlayerProfile | null | undefined): boolean {
  return readRoad(profile)?.oathSworn === true;
}

/**
 * Creation evidence ALREADY IN THE SAVE: the save's own record that this gladiator
 * has already fought, trained or advanced. A gladiator of this slice cannot have any
 * of it before the words are sworn — the beat owns first city entry, so nothing in
 * this flow can win a fight, earn a point of fame or reach a second level while the
 * oath is still owed — so a save that carries any of it was written before this slice
 * existed, and its gladiator is grandfathered as sworn. `fightsWon > 0` is the
 * fallback the slice mandates, stated first so it can never be lost behind the rest.
 */
export function hasPlayedBeforeRoad(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.fightsWon > 0 ||
    profile.fightsLost > 0 ||
    profile.level > 1 ||
    profile.xp > 0 ||
    profile.fame > 0 ||
    profile.bossKills > 0 ||
    profile.newGamePlus > 0 ||
    (profile.defeatedOpponentIds?.length ?? 0) > 0
  );
}

/**
 * The resolved road state. Sworn when the field says so — and sworn for every
 * profile the save shows to predate this slice (the grandfather rule: a legacy
 * gladiator is never asked to swear an oath he has already lived, and this slice
 * never stands between him and the city he was already playing in).
 */
export function resolveOathSworn(profile: PlayerProfile | null | undefined): boolean {
  return isOathSwornByField(profile) || hasPlayedBeforeRoad(profile);
}

/**
 * Does this arrival open the beat? Only a profile that resolves UNSWORN does — a
 * fresh gladiator's first city entry, and the same entry again if he leaves before
 * the words are sworn.
 */
export function shouldPlayOathBeat(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  return !resolveOathSworn(profile);
}

// ══════════════════════════════════════════════════════════════════════════
// The hold state machine
// ══════════════════════════════════════════════════════════════════════════

export type OathBeatMode = 'full' | 'skip';

/**
 * A profile that resolves sworn gets the one-hold skip; a fresh one swears it whole.
 * The skip is the beat's own guard: whichever path starts the beat — today's first
 * city entry, or any later re-trigger — a gladiator who already has the words is
 * never made to say them line by line again.
 */
export function resolveOathBeatMode(profile: PlayerProfile | null | undefined): OathBeatMode {
  return resolveOathSworn(profile) ? 'skip' : 'full';
}

/** The beat's phases. There is no failure phase: a line can only wait. */
export type OathPhase = 'lines' | 'closing' | 'skip' | 'sworn';

export interface OathBeatState {
  mode: OathBeatMode;
  phase: OathPhase;
  /** The oath line being sworn (an index into `OATH_LINES`) while the phase is `lines`. */
  line: number;
  /** Milliseconds held on the current line. A release never resets it. */
  heldMs: number;
  /** Is the press down AND counting for this line? */
  holding: boolean;
  /**
   * A finished line waits for the press to come back up before the next one arms,
   * so one continuous press cannot swear two lines: every line gets its own press.
   */
  awaitingRelease: boolean;
  /** Lines sworn — the closing vow included. The beat's own tally of what was said. */
  holds: number;
}

export interface OathBeatInput {
  /** The press, from any of the three paths — touch, mouse and Space all write this. */
  pressed: boolean;
  /** Milliseconds since the previous step. */
  deltaMs: number;
}

/** A fresh beat: the four lines, or the skip's single one. */
export function startOathBeat(mode: OathBeatMode = 'full'): OathBeatState {
  return {
    mode,
    phase: mode === 'skip' ? 'skip' : 'lines',
    line: 0,
    heldMs: 0,
    holding: false,
    awaitingRelease: false,
    holds: 0,
  };
}

/** A line lands: the next one arms, the closing vow follows the fourth, and the vow ends it. */
function finishHold(state: OathBeatState): OathBeatState {
  const holds = state.holds + 1;
  if (state.phase === 'lines' && state.line + 1 < OATH_LINES.length) {
    return { ...state, line: state.line + 1, heldMs: 0, holding: false, awaitingRelease: true, holds };
  }
  if (state.phase === 'lines') {
    return { ...state, phase: 'closing', heldMs: 0, holding: false, awaitingRelease: true, holds };
  }
  return { ...state, phase: 'sworn', heldMs: OATH_HOLD_MS, holding: false, awaitingRelease: true, holds };
}

/**
 * One step of the beat. `deltaMs` only ever counts WHILE the press is down, so
 * nothing in the scene advances on its own and a line cannot time out; a release
 * keeps the progress it earned and simply stops counting.
 */
export function stepOathBeat(state: OathBeatState, input: OathBeatInput): OathBeatState {
  if (state.phase === 'sworn') return state;

  if (state.awaitingRelease) {
    if (input.pressed) return state;
    return { ...state, awaitingRelease: false, holding: false };
  }

  if (!input.pressed) {
    return state.holding ? { ...state, holding: false } : state;
  }

  const heldMs = state.heldMs + Math.max(0, input.deltaMs);
  if (heldMs < OATH_HOLD_MS) return { ...state, holding: true, heldMs };
  return finishHold({ ...state, holding: true, heldMs });
}

/** The current line's hold, 0…1 — what the scene draws. */
export function oathHoldProgress(state: OathBeatState): number {
  return Math.min(1, state.heldMs / OATH_HOLD_MS);
}

/** Has the oath been sworn? The beat's only ending. */
export function isOathComplete(state: OathBeatState): boolean {
  return state.phase === 'sworn';
}

/** Which of the four lines is being sworn, for the scene's own label. */
export function oathCurrentLine(state: OathBeatState): OathLine {
  return OATH_LINES[Math.min(state.line, OATH_LINES.length - 1)];
}

// ══════════════════════════════════════════════════════════════════════════
// The one write
// ══════════════════════════════════════════════════════════════════════════

/**
 * The beat's completion write, for the caller's own save-on-change path: a NEW
 * profile carrying `road.oathSworn = true`, or `null` when there is nothing to
 * write.
 *
 * `null` is what keeps the field a one-time event: a profile that already resolves
 * sworn is refused (so a repeat completion, or the skip, cannot set it a second
 * time) and a missing profile is refused. The road's other subfields — RG-1's
 * `bannerDevice` and `milestonesSeen` — are carried over untouched, and nothing
 * else on the profile is touched at all.
 */
export function withOathSworn(profile: PlayerProfile | null | undefined): PlayerProfile | null {
  if (!profile) return null;
  if (resolveOathSworn(profile)) return null;
  return { ...profile, road: { ...(readRoad(profile) ?? {}), oathSworn: true } };
}

/** Is this finished beat the one that writes? Only a completed FULL oath is. */
export function oathWriteOnCompletion(state: OathBeatState): boolean {
  return state.mode === 'full' && state.phase === 'sworn';
}

// ══════════════════════════════════════════════════════════════════════════
// Where it is delivered
// ══════════════════════════════════════════════════════════════════════════

/**
 * The pose the oath is delivered from: inside the Ludus Martial Yard, at the yard's
 * own fast-travel arrival (`FAST_TRAVEL_ARRIVALS.training_yard` = [-18, 2], which
 * `phaseC8_47.test.ts` §F pins as collision-free with a clear step out), facing north
 * into the yard where the pells stand and the Doctore waits. Y is 0: the city ground
 * is flat there, and the city's own fast travel resolves the same point through
 * `getTerrainY`. The suite pins this pose against the arrival table, so the two
 * cannot drift apart.
 */
export const OATH_YARD_SPAWN: { position: [number, number, number]; rotationY: number } = {
  position: [-18, 0, 2],
  rotationY: Math.PI,
};
