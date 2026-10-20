/**
 * L1 verification gate (Living City) — the duel settlement's *identity-aware*
 * exactly-once latch.
 *
 * `DuelScene` calls `onMatchComplete` 1400 ms after the deciding blow, and that
 * call deliberately outlives the scene (an Armory exit must not drop an earned
 * purse). App therefore cannot learn, from the callback alone, WHICH bout is
 * being settled. A boolean latch answers "has anything settled since the last
 * duel began?", which is wrong in one direction: a callback from a just-finished
 * bout that arrives after a new bout has been entered consumes the NEW bout's
 * latch, so the new bout's own settlement is silently dropped (no purse, and no
 * day turned for it) while the old one is paid.
 *
 * This module fixes that by giving every bout an id and making the latch claim
 * an id rather than "the current one":
 *
 *   • `arm()` opens a bout and returns its id. App calls it in `handleEnterDuel`
 *     — the only route onto the duel screen — and passes the id to the
 *     settlement callback, so a callback always names the bout it belongs to.
 *   • `claim(id)` is true at most once per id, only for an armed id, and only in
 *     increasing order: a repeated callback for the same bout is refused, an id
 *     that was never armed is refused, and an older id arriving after a newer one
 *     has settled is refused (it would replay a stale profile snapshot).
 *   • A late callback for the PREVIOUS bout therefore settles that bout — its own
 *     rewards and one day — and can never settle the current one.
 *
 * Nothing here is persisted, and nothing reads storage, time or randomness; the
 * clock itself stays in `utils/cityClock.ts`.
 */

/** One bout's settlement bookkeeping. Ids are 1-based; 0 means "no bout yet". */
export interface DuelSettlementLatch {
  /** Open a new bout and return its id — the token its settlement must carry. */
  arm(): number;
  /** The id of the bout in progress (0 before the first `arm()`). */
  currentId(): number;
  /** True exactly once for one armed bout, and never for an unknown or replayed one. */
  claim(id: number): boolean;
}

/** Create a latch for one App instance (held in a `useRef`, never in a save). */
export function createDuelSettlementLatch(): DuelSettlementLatch {
  let current = 0;
  let settled = 0;

  return {
    arm() {
      current += 1;
      return current;
    },
    currentId() {
      return current;
    },
    claim(id: number) {
      // Only a real, armed, not-yet-settled bout can settle, and never out of
      // order: an older id arriving after a newer one has settled would replay a
      // stale profile snapshot, so it is refused rather than written.
      if (!Number.isInteger(id) || id < 1 || id > current || id <= settled) return false;
      settled = id;
      return true;
    },
  };
}
