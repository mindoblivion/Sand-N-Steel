/**
 * ===========================================================================
 * SAND & STEEL — VISITOR CATALOGUE (Living City L10 foundation)
 * ===========================================================================
 * The Living City discovery audit (`AGENTS.md`) asks for "a small visitor
 * catalogue with an arrival window derived from `day`, ... and one optional,
 * non-progression-critical offer each". L10 ships that catalogue and nothing
 * else: no mesh, no disc, no prompt, no purchase and no completion action reads
 * it yet.
 *
 * The two fields the roadmap names, as they are implemented here — the same
 * reading `utils/visitorSchedule.ts` applies:
 *
 *   - **window** — the visitor's ARRIVAL window: an INCLUSIVE range of city
 *     days (`from <= day <= to`) outside which the visitor can never appear. It
 *     is the "arrival window derived from `day`" the audit describes, and its two
 *     ends are what "window boundaries are respected" means. It is not a stay
 *     length: a visitor is present on the days it arrives, and on no other day.
 *   - **cadence** — how often, inside that window, the visitor may arrive: one
 *     day in `cadence` (the audit's `fnv1a(`${day}:${visitorId}`) % cadence ===
 *     0`). `2` is every other day, `7` is roughly weekly. It is never `1`, which
 *     would make the arrival rule vacuous.
 *
 * The offer is deliberately NON-PROGRESSION-CRITICAL: every ITEM pool draws only
 * on goods the permanent spine (the forge and the armorer) already stocks, so a
 * run with zero visitors still reaches the next tier. The one exception is
 * `finish_ventive` (L16B): a chariot finish that is cosmetic only, is marked
 * `visitorOnly` in its own catalogue, and is the visitor's reason to be worth the
 * walk. The day's single offer is chosen by the existing L2 rotation
 * (`selectDailyWindow`), never by a second hash, so it is a pure function of
 * (visitor id, day) and a reload cannot re-roll it.
 *
 * Pure data — no React, no storage, no clock, no randomness.
 */

/**
 * The days a visitor may arrive on: `from` through `to` inclusive, in city days.
 * Bounded on purpose — an unbounded window would make a visitor permanent, which
 * is the one thing an "occasional visitor" must not be.
 */
export interface VisitorWindow {
  readonly from: number;
  readonly to: number;
}

/** The one optional thing a visitor brings to the city. */
export interface VisitorOffer {
  /** What the visitor is in the city to trade — one line, for a later phase's prompt. */
  readonly summary: string;
  /**
   * The ids this visitor may offer: `ITEMS_DB` item ids, and (since L16B) at most
   * one `CHARIOT_PARTS` id for a visitor-acquired chariot finish. ONE is on offer
   * on a day, through `selectDailyWindow` (the L2 rotation), so the offer rotates
   * with the city day and is identical after a reload. `utils/visitorSchedule`
   * classifies the day's pick — item or chariot part — for its callers.
   */
  readonly pool: readonly string[];
}

/** One occasional visitor: who they are, when they arrive, what they offer. */
export interface Visitor {
  /** Stable, unique id. The arrival hash and `completedVisitors` both key on it. */
  readonly id: string;
  readonly name: string;
  readonly title: string;
  /** One line of flavour. Presentation only; no rule reads it. */
  readonly description: string;
  /** Days between arrivals: roughly one day in `cadence`, never 1. */
  readonly cadence: number;
  /** The inclusive range of city days this visitor may arrive on. */
  readonly window: VisitorWindow;
  /**
   * L15 — this visitor's own asking price as a fraction of the item's canonical
   * `ITEMS_DB` price. The one reason to trade with a visitor instead of the shop:
   * they undercut the permanent spine. It is a RATE, never a price — the only
   * prices in the game stay in `ITEMS_DB`, and `utils/visitorPurchase` derives
   * `Math.ceil(canonical × rate)` from it.
   *
   * A valid rate is strictly inside `(0, 1)`: zero would make the item free and
   * one (or more) would be no bargain or a markup. Anything missing or malformed
   * is read by the resolver as "no bargain" and the canonical price is charged.
   */
  readonly bargainRate?: number;
  readonly offer: VisitorOffer;
}

/** The narrowest cadence: a visitor may arrive every other day. */
export const VISITOR_CADENCE_MIN = 2;

/** The widest cadence: a visitor arrives roughly once a week. */
export const VISITOR_CADENCE_MAX = 7;

/** The last city day any window may reach — no visitor is permanent. */
export const VISITOR_WINDOW_MAX_DAY = 365;

/** How many of a visitor's stock are on offer on one day (one, by design). */
export const VISITOR_OFFER_SLOTS = 1;

/**
 * The catalogue, in the order a later phase would list its visitors. Three
 * entries: deliberately small, because a visitor is an occasion and the city's
 * frame cost must not depend on how many there are.
 *
 * Every ITEM offer pool draws on forge / armorer stock only (see the module
 * header); the bladesmith's pool additionally carries L16B's visitor-only chariot
 * finish, which is cosmetic and reachable no other way by design.
 *
 * The seasons are staggered so the city has somebody to meet from the first
 * week and through most of its first year. Measured from the shipped rule (and
 * pinned in `utils/visitorSchedule.test.ts`): the bladesmith first arrives on
 * day 5, the armorer on day 8 and the trader on day 31; over the first 90 days
 * 52 of them have at least one visitor and 10 have two, with the remaining ones
 * quiet — a visitor is an occasion, not a fixture. After day 365 no window holds
 * anyone, which is the bound this phase deliberately imposes.
 */
export const VISITORS: readonly Visitor[] = Object.freeze([
  Object.freeze({
    id: 'numidian_bladesmith',
    name: 'Hanno of Cirta',
    title: 'Wandering Bladesmith',
    description: 'A Numidian smith who follows the games and grinds a fine edge in the shade of the gate.',
    cadence: 3,
    // L15 — the bladesmith undercuts the forge by 30%.
    bargainRate: 0.7,
    window: Object.freeze({ from: 1, to: 150 }),
    offer: Object.freeze({
      summary: 'A short blade ground on the whetstone of his own camp.',
      // L16B — the rare finish rotates in beside his two blades, so on the days
      // the rotation picks it the finish IS the day's offer (one offer a day).
      pool: Object.freeze(['dagger_pugio', 'dirk_desert', 'finish_ventive']),
    }),
  }),
  Object.freeze({
    id: 'campanian_armorer',
    name: 'Vibius the Campanian',
    title: 'Itinerant Armorer',
    description: 'A Campanian armourer with a mule cart of strapped bronze, in the city while the season lasts.',
    cadence: 4,
    // L15 — the armorer undercuts the permanent armorer by 25%.
    bargainRate: 0.75,
    window: Object.freeze({ from: 6, to: 240 }),
    offer: Object.freeze({
      summary: 'A single piece of worn bronze armor, offered from the cart.',
      pool: Object.freeze(['arms_manica', 'legs_greaves_bronze', 'helm_galea_iron']),
    }),
  }),
  Object.freeze({
    id: 'emesan_weapon_trader',
    name: 'Zabdibel of Emesa',
    title: 'Caravan Trader',
    description: 'An Emesan trader whose caravan halts by the arena wall for as long as the water holds.',
    cadence: 5,
    // L15 — the caravan trader undercuts the forge by 20%.
    bargainRate: 0.8,
    window: Object.freeze({ from: 24, to: 365 }),
    offer: Object.freeze({
      summary: 'Eastern steel from the caravan, one piece unpacked at a time.',
      pool: Object.freeze(['bronze_mace', 'shamshir_curved', 'spatha_legion']),
    }),
  }),
]);

/** The catalogue entry with this id, or `undefined` for an id the city does not host. */
export function getVisitor(id: string): Visitor | undefined {
  return VISITORS.find((visitor) => visitor.id === id);
}
