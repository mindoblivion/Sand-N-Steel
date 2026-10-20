/**
 * START-1 — the post-Oath save-progress nudge.
 *
 * After a gladiator takes the Oath (character creation completes) the title sequence
 * offers ONCE, in that session, to keep the new gladiator safe by making an account.
 * The offer is a nudge, never a gate: it is dismissible, it never blocks input to
 * anything else, and it does not come back until the next launch.
 *
 * READ-ONLY where the player's save is concerned. The only thing this module touches is
 * a SESSION flag in `sessionStorage` — scratch state that dies with the tab — so showing
 * or dismissing the nudge can never write, migrate or otherwise move the profile. The
 * profile's own key (`sand_and_steel_gladiator_save_v2`) is not named here at all.
 *
 * The store is injectable so the behaviour can be driven without a browser; the default
 * is the real session storage, and a browser that refuses it simply means the nudge may
 * appear once more — which is never an error state.
 */

/** The session flag. Session-scoped by design: a new launch may ask again. */
export const POST_OATH_NUDGE_KEY = 'sand_and_steel_post_oath_nudge_seen';

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultSessionStore(): SessionStore | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Has the nudge already been shown (or dismissed) this session? */
export function hasSeenPostOathNudge(store: SessionStore | null = defaultSessionStore()): boolean {
  if (!store) return false;
  try {
    return store.getItem(POST_OATH_NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record that the nudge has been shown, so it never re-appears this session. */
export function markPostOathNudgeSeen(store: SessionStore | null = defaultSessionStore()): void {
  if (!store) return;
  try {
    store.setItem(POST_OATH_NUDGE_KEY, '1');
  } catch {
    // A blocked session store only means the nudge may appear once more; never an error.
  }
}

/**
 * Should the nudge be offered for this completed Oath? True only when the Oath has just
 * happened and this session has not shown it yet.
 */
export function shouldOfferPostOathNudge(
  oathJustTaken: boolean,
  store: SessionStore | null = defaultSessionStore(),
): boolean {
  return oathJustTaken && !hasSeenPostOathNudge(store);
}
