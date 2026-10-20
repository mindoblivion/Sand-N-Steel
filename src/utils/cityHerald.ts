/**
 * The city's herald — one session-scoped pointer at the next beat.
 *
 * The herald names the one place the city wants the gladiator to walk to next. It is
 * a POINTER, not a gate: it points at a place the city already has (a `HUB_LOCATIONS`
 * id, never a coordinate of its own — the name and the district it shows come from
 * that registry, so the pointer can never name a place the city does not have), the
 * city draws it beside the player's own identity card, and it opens the existing city
 * map rather than moving anyone.
 *
 * ── SESSION SCRATCH, NEVER THE SAVE ──────────────────────────────────────
 * Everything the herald knows lives in `sessionStorage` and dies with the tab: it is
 * one line of the arrival's fiction, not player progress. This module names no save
 * key, imports no storage service and can write nothing to the profile.
 *
 * ── THE TWO AIM TRANSITIONS THIS SLICE OWNS ──────────────────────────────
 *   • the oath entry holds the pointer DOWN (`suppressHeraldForEntry`) — the beat
 *     itself is doing the pointing, so the herald stays quiet for that arrival and
 *     that arrival only;
 *   • the release aims it at the Grand Colosseum (`aimHerald(HERALD_COLOSSEUM)`) —
 *     a sworn gladiator's next beat is the sand.
 * The store is injectable so both can be driven without a browser.
 */

export const HERALD_SESSION_KEY = 'sand_and_steel_herald_v1';

export interface HeraldAim {
  /** A `HUB_LOCATIONS` id — the herald never names a place the city does not have. */
  id: string;
  /** Why the herald is pointing there, in the city's own voice. */
  note: string;
}

export interface HeraldState {
  aim: HeraldAim | null;
  /** Held down for the arrival that is already being told: the oath entry. */
  suppressedForEntry: boolean;
}

/** Nothing to point at: the state a session starts in, and the one a torn record reads as. */
export const EMPTY_HERALD_STATE: HeraldState = { aim: null, suppressedForEntry: false };

/** The release's aim: the words are sworn, so the herald turns to the arena. */
export const HERALD_COLOSSEUM: HeraldAim = {
  id: 'colosseum',
  note: 'The words are sworn. Now let the sand hear them.',
};

/** The session store shape this module needs; a `sessionStorage` satisfies it. */
export interface HeraldStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultHeraldStore(): HeraldStore | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The herald's session state, resolved lazily: an absent, torn or malformed record
 * reads as "nothing to point at" and is left exactly as it was found — reading never
 * repairs a record any more than it repairs a save.
 */
export function readHeraldState(store: HeraldStore | null = defaultHeraldStore()): HeraldState {
  if (!store) return EMPTY_HERALD_STATE;
  try {
    const raw = store.getItem(HERALD_SESSION_KEY);
    if (!raw) return EMPTY_HERALD_STATE;
    const parsed = JSON.parse(raw) as { aim?: unknown; suppressedForEntry?: unknown };
    const aim = parsed?.aim;
    const named =
      aim && typeof aim === 'object' ? { id: (aim as HeraldAim).id, note: (aim as HeraldAim).note } : null;
    const clean: HeraldAim | null =
      named && typeof named.id === 'string' && named.id !== '' && typeof named.note === 'string'
        ? { id: named.id, note: named.note }
        : null;
    return { aim: clean, suppressedForEntry: parsed?.suppressedForEntry === true };
  } catch {
    return EMPTY_HERALD_STATE;
  }
}

/** Write a resolved state back. An unavailable store only means the pointer is not remembered. */
function writeHeraldState(
  state: HeraldState,
  store: HeraldStore | null = defaultHeraldStore(),
): HeraldState {
  if (!store) return state;
  try {
    store.setItem(HERALD_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Session scratch only: a refused store can never be an error state.
  }
  return state;
}

/** Point the herald at a place. Aiming always lifts an entry's suppression. */
export function aimHerald(aim: HeraldAim, store: HeraldStore | null = defaultHeraldStore()): HeraldState {
  return writeHeraldState({ aim, suppressedForEntry: false }, store);
}

/** Hold the pointer down for the arrival that is being told — the oath entry. */
export function suppressHeraldForEntry(store: HeraldStore | null = defaultHeraldStore()): HeraldState {
  const state = readHeraldState(store);
  return writeHeraldState({ aim: state.aim, suppressedForEntry: true }, store);
}

/** Any other arrival: the pointer is the city's again from this entry on. */
export function releaseHeraldForEntry(store: HeraldStore | null = defaultHeraldStore()): HeraldState {
  const state = readHeraldState(store);
  if (!state.suppressedForEntry) return state;
  return writeHeraldState({ aim: state.aim, suppressedForEntry: false }, store);
}

/** Does the city draw the pointer? It needs an aim, and no suppression for this arrival. */
export function heraldPointerVisible(state: HeraldState): boolean {
  return state.aim !== null && !state.suppressedForEntry;
}
