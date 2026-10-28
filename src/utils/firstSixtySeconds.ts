/**
 * FIRST SIXTY SECONDS — §5's copy rules, its walk-off trigger, and the session's
 * own memory (retention build-order step 4: CORE ONLY).
 *
 * ── WHAT THIS MODULE OWNS ──────────────────────────────────────────────────
 *   • the greeting's ONE line (First Sixty Seconds — Director ruling R-GREET);
 *   • the Acta card's ONE unfinished-business line (First Sixty Seconds —
 *     Director ruling R-UNFINISHED);
 *   • the exact WALK-OFF trigger (below), and the session-scoped facts that make
 *     every §5 surface once-a-session: the greeting is shown once, and one
 *     dismissal (or one walk-off) silences the rest of them.
 *
 * ── SESSION SCRATCH, NEVER THE SAVE ────────────────────────────────────────
 * The two facts below are module memory, exactly the pattern Ludi Phase A's
 * `actaDismissedThisSession` already uses for the Acta card: they live for the
 * life of the page session, they are never written to the profile, they are never
 * read from storage, and a reload starts a new session — which greets again. There
 * is NO new top-level save field anywhere in this slice (save corpus §J stays 23).
 * No wall clock is read: "this session" is the lifetime of this module, never a
 * timestamp (timeState §G's clock-API ban is intact — this file names no clock).
 *
 * ── First Sixty Seconds — Director ruling R-GREET ──────────────────────────
 * The greeting is the SHIPPED day's name followed by that day's own Ludi
 * character line: `<day name> — <character line>`. The design's shrine-smoke
 * phrasing is Dies Fortunae's own flavour, so the rotation's per-day lines are the
 * general source; and because `LUDI_ROTATION`'s names already carry their own
 * "Dies" (Dies Mercatus … Dies Quietus, and Ludi Magni), the name is printed
 * verbatim rather than prefixed — "Dies Dies Mercatus" and "Dies Ludi Magni" would
 * both be inventions of a name the rotation does not have.
 *
 * ── First Sixty Seconds — Director ruling R-UNFINISHED ─────────────────────
 * The card's line is resolved from LIVE open loops, in this order, and nothing is
 * ever invented:
 *   1. a live unsettled grudge → 'A grudge waits: <rival name>'
 *      (read through `resolveGrudges`; `settled` retires it, and the rival's own
 *      roster name is used — an id the roster does not know prints nothing);
 *   2. an unviewed triumph → 'A triumph waits unviewed'
 *      (`unviewedTriumphs`: earned minus viewed, A8's own difference);
 *   3. no line at all. A day of deeds is not an open loop, so an unfinished Acta
 *      is owed nothing and prints nothing.
 *
 * ── THE WALK-OFF TRIGGER (§6's second half), pinned by the suite ────────────
 * Leaving the CITY FLOW for another screen silences every §5 surface for the rest
 * of the session: a bout (`duel`), one of the hub's own panels (`hub_2d`), or a
 * race (`race`). The city itself (`city_3d`), the title and character creation do
 * not: walking about the city is not walking off, and going to the title and back
 * is the same session — which is why the greeting does not return.
 *
 * ── DEFERRED, and stated rather than smuggled in ───────────────────────────
 *   • R-AWAY (DEFERRED): the quiet engine's "away >= 1 day" line is OUT of
 *     §5-core. It needs a last-session timestamp — a wall-clock read the clock ban
 *     forbids — and under the shipped exertion model NOTHING changes between
 *     sessions (the rotation turns and Laudes bank only while playing), so "what
 *     changed while you were away" is vacuous. It is deferred until a design
 *     ruling reconciles return-hooks with the exertion model.
 *   • R-RING (DEFERRED): the "one deed always completable within the plaza ring"
 *     guarantee is OUT of §5-core. §5 is sequencing over the state §2–§4 already
 *     built; the deed pool is fixed by Phase A under a determinism contract (same
 *     day → same deeds) and the design never defines the plaza ring's membership,
 *     so enforcing it would redesign the pool. The pointer + marker supply the
 *     "first action ten seconds away" instead.
 *   • R-TIMING: the design's 0–5 / 5–20 / 20–40 / 40–60 s figures are BEAT ORDER,
 *     not timers. There is no countdown choreography anywhere in this slice: the
 *     greeting fades on its own pattern and the card is already behind it.
 */
import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { resolveGrudges } from './grudgeBouts';
import { resolveLudiState } from './ludiCalendar';
import { unviewedTriumphs } from './triumphs';

/* ── The greeting (R-GREET) ───────────────────────────────────────────────── */

/** The greeting's day and its one line. `null` only for a missing profile. */
export function greetingFor(
  profile: PlayerProfile | null | undefined,
): { day: number; text: string } | null {
  if (!profile) return null;
  const state = resolveLudiState(profile);
  return { day: state.day, text: `${state.dayName} — ${state.characterLine}` };
}

/* ── The Acta's unfinished-business line (R-UNFINISHED) ───────────────────── */

/**
 * The card's ONE unfinished-business line, from live state, or `null` for none.
 * Priority: a live unsettled grudge, then an unviewed triumph, then nothing.
 */
export function unfinishedBusinessLine(
  profile: PlayerProfile | null | undefined,
): string | null {
  if (!profile) return null;

  // 1. A live grudge — an unsettled record, named from the roster's own row.
  const records = resolveGrudges(profile);
  for (const opponent of ALL_OPPONENTS) {
    const record = records[opponent.id];
    if (!record || record.settled === true) continue;
    return `A grudge waits: ${opponent.name}`;
  }

  // 2. An unviewed triumph — A8's earned-minus-viewed difference.
  if (unviewedTriumphs(profile).length > 0) return 'A triumph waits unviewed';

  // 3. No open loop. Deeds are not a debt, so nothing is printed.
  return null;
}

/* ── The walk-off trigger ─────────────────────────────────────────────────── */

/** The screens that leave the city flow: a bout, one of the hub's panels, a race. */
export const CITY_WALK_OFF_SCREENS: readonly string[] = ['duel', 'hub_2d', 'race'];

/**
 * Does moving to `nextScreen` count as walking off? YES for a bout, a hub panel or
 * a race — the player has gone to do their own thing, so §5 stops talking. NO for
 * the city itself, and no for the title or creation (a return to the title and
 * back is still this session).
 */
export function walkedOffCity(nextScreen: string): boolean {
  return CITY_WALK_OFF_SCREENS.includes(nextScreen);
}

/* ── Session memory (the Acta-dismissal pattern) ───────────────────────────── */

/** Has the greeting already been shown in this page session? */
let greetingShown = false;

/** Remember that the greeting has been shown. Nothing is persisted. */
export function markGreetingShown(): void {
  greetingShown = true;
}

/** Was the greeting already shown this session? (The second entry shows nothing.) */
export function greetingShownThisSession(): boolean {
  return greetingShown;
}

/** Has §5 been silenced for the rest of this page session? */
let silenced = false;

/**
 * Silence every §5 surface for this session. Called once by the first dismissal
 * (the Acta's ✕, the herald's pointer) or by the walk-off trigger above.
 */
export function silenceFirstSixtyForSession(): void {
  silenced = true;
}

/** Are §5's surfaces silent for the rest of this session? */
export function firstSixtySilencedThisSession(): boolean {
  return silenced;
}

/** Drop the session memory — the suite's own reset, never called by the game. */
export function resetFirstSixtySession(): void {
  greetingShown = false;
  silenced = false;
}
