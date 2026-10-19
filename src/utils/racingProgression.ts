/**
 * Phase C-8.67B — pure Biga / Triga / Quadra racing-progression helpers.
 *
 * This module is the whole data model for horse-team progression.  It owns the
 * three configurations, their prices and their order, and the four operations
 * the racing work will need:
 *
 *   • `resolveRacingState`  — the effective state of any profile;
 *   • `purchaseRacingConfig`  — buy Triga or Quadra;
 *   • `selectRacingConfig`  — choose an unlocked configuration;
 *   • `getRacingPurchaseEligibility` / `getRacingSelectionEligibility` — the same
 *     rules, read out before the caller draws a control.
 *
 * Everything here is a pure function of `(profile, config)` and follows the
 * C-8.66B chariot-loadout transaction pattern exactly:
 *   • no profile, racing field or nested array is ever mutated in place — a
 *     success returns a NEW `PlayerProfile` for the caller to hand to the
 *     existing `saveProfile()` path;
 *   • a refused call returns `{ ok: false, reason }` and leaves the caller's own
 *     profile — and its gold — exactly as it was;
 *   • a legacy save (no `racing` field), a partial field and a malformed field
 *     all resolve to "Biga selected, Triga and Quadra locked" instead of
 *     throwing, so nothing here can break loading an older save.
 *
 * It reads no storage and no environment: there is no second currency, no second
 * storage key and no parallel save path.  Racing unlocks are deliberately
 * independent of the chariot-parts catalogue — owning a wheel or a finish never
 * unlocks a horse count, and buying a configuration never touches the loadout.
 */

import { PlayerProfile, ChariotTeamSize, RacingProgression } from '../types/game';

/** The three configurations by name; `horses` is the size a caller races with. */
export type RacingConfigId = 'biga' | 'triga' | 'quadra';

/** A configuration reference: the team size itself, or the configuration's name. */
export type RacingConfigRef = ChariotTeamSize | RacingConfigId;

export interface RacingConfig {
  id: RacingConfigId;
  /** The team size this configuration fields. */
  horses: ChariotTeamSize;
  name: string;
  /** Gold price.  Biga is 0 — it is never bought. */
  price: number;
  /** The configuration that must be unlocked before this one can be bought. */
  requires?: RacingConfigId;
}

/**
 * The catalogue, in progression order.  750 / 1,500 are the proposed prices and
 * are the single source of truth for the tests and any future screen.
 */
export const RACING_CONFIGS: RacingConfig[] = [
  { id: 'biga', horses: 2, name: 'Biga', price: 0 },
  { id: 'triga', horses: 3, name: 'Triga', price: 750, requires: 'biga' },
  { id: 'quadra', horses: 4, name: 'Quadra', price: 1500, requires: 'triga' },
];

/** The one configuration every profile has, at no cost: Biga, two horses. */
export const BIGA_HORSES: ChariotTeamSize = 2;

const CONFIG_BY_HORSES: ReadonlyMap<ChariotTeamSize, RacingConfig> = new Map(
  RACING_CONFIGS.map((config) => [config.horses, config])
);
const CONFIG_BY_ID: ReadonlyMap<RacingConfigId, RacingConfig> = new Map(
  RACING_CONFIGS.map((config) => [config.id, config])
);

/**
 * Look a configuration up by team size (2 | 3 | 4) or by name
 * (`biga` | `triga` | `quadra`).  Anything else — a string number, a fraction,
 * an unknown size, `null` — resolves to `undefined`, which every caller turns
 * into a refusal rather than a guess.
 */
export function getRacingConfig(ref: unknown): RacingConfig | undefined {
  if (typeof ref === 'number') return CONFIG_BY_HORSES.get(ref as ChariotTeamSize);
  if (typeof ref === 'string') return CONFIG_BY_ID.get(ref as RacingConfigId);
  return undefined;
}

/** The effective racing state: what is unlocked, and what is selected. */
export interface RacingState {
  /** Unlocked configurations, ascending by horse count.  Always contains Biga. */
  unlocked: ChariotTeamSize[];
  /** The selected configuration — always one that is unlocked. */
  selected: ChariotTeamSize;
  /** Shorthand for `selected`. */
  horses: ChariotTeamSize;
}

/** Biga selected, Triga and Quadra locked — every profile's starting state. */
export function defaultRacingState(): RacingState {
  return { unlocked: [BIGA_HORSES], selected: BIGA_HORSES, horses: BIGA_HORSES };
}

/** The stored field, or `undefined` when it is absent or not a plain object. */
function storedRacing(
  profile: PlayerProfile | null | undefined
): Partial<RacingProgression> | undefined {
  const stored = profile?.racing;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored;
}

/**
 * Resolve the player's racing progression.
 *
 * Never throws and never returns something the racing work cannot use:
 *   • a profile with no `racing` field (every pre-C-8.67B save, local or in the
 *     cloud) reads as Biga selected with Triga and Quadra locked;
 *   • `unlocked` entries that are not exactly 3 or 4 are dropped;
 *   • Quadra is dropped when Triga is not unlocked, because that combination is
 *     not a valid progression state and can only come from a hand-edited save;
 *   • `selected` resolves to Biga unless it names an unlocked configuration.
 */
export function resolveRacingState(
  profile: PlayerProfile | null | undefined
): RacingState {
  const stored = storedRacing(profile);

  const unlocked = new Set<ChariotTeamSize>([BIGA_HORSES]);
  const rawUnlocked = stored && Array.isArray(stored.unlocked) ? stored.unlocked : [];
  for (const entry of rawUnlocked) {
    if (entry === 3 || entry === 4) unlocked.add(entry);
  }
  if (!unlocked.has(3)) unlocked.delete(4);

  const ordered: ChariotTeamSize[] = [
    BIGA_HORSES,
    ...(unlocked.has(3) ? [3 as ChariotTeamSize] : []),
    ...(unlocked.has(4) ? [4 as ChariotTeamSize] : []),
  ];

  const wanted = stored?.selected;
  const selected: ChariotTeamSize =
    typeof wanted === 'number' && ordered.includes(wanted as ChariotTeamSize)
      ? (wanted as ChariotTeamSize)
      : BIGA_HORSES;

  return { unlocked: ordered, selected, horses: selected };
}

/**
 * Phase C-8.70B — the racing configuration the player is currently racing with,
 * for display.
 *
 * A pure read of the same `selected` source of truth `resolveRacingState` uses:
 * the returned `RacingConfig` is the catalogue entry for the resolved team size,
 * so a fresh or legacy profile (nothing unlocked, nothing selected) answers
 * `Biga` with 2 horses — exactly the state `defaultRacingState()` describes, and
 * the state the race entry panel must show from a fresh profile.  A partial or
 * hand-edited `racing` field falls back the same way, because the fallback lives
 * in `resolveRacingState` and is not duplicated here.
 *
 * Unlock and selection stay separate: a Triga that is unlocked but not selected
 * still answers whatever `selected` actually names, never the highest unlock.
 *
 * Read-only by construction — it neither writes, migrates nor repairs the save.
 * The race entry panel is its only consumer; the transaction helpers above remain
 * the single mutation path.
 */
export function getSelectedRacingConfig(
  profile: PlayerProfile | null | undefined
): RacingConfig {
  return getRacingConfig(resolveRacingState(profile).selected) ?? RACING_CONFIGS[0];
}

/** Is this configuration unlocked for the profile?  Biga always is. */
export function isRacingConfigUnlocked(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): boolean {
  const config = getRacingConfig(ref);
  if (!config) return false;
  return resolveRacingState(profile).unlocked.includes(config.horses);
}

/** Why a purchase or a selection was refused.  `ok: true` never carries a reason. */
export type RacingRejectionReason =
  | 'no-profile'
  | 'unknown-config'
  | 'already-unlocked'
  | 'prerequisite-locked'
  | 'insufficient-gold'
  | 'not-unlocked';

export type RacingResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: RacingRejectionReason };

/**
 * A profile whose gold is missing or not a finite number can afford nothing —
 * treating it as "not enough gold" keeps a malformed save from producing a NaN
 * balance by subtraction.
 */
function canAfford(profile: PlayerProfile, price: number): boolean {
  return typeof profile.gold === 'number' && Number.isFinite(profile.gold) && profile.gold >= price;
}

/**
 * The stored `unlocked` list: the bought sizes only, in catalogue order.  Biga
 * is implicit for every profile and is therefore never written to the save.
 */
function paidUnlocks(horses: readonly ChariotTeamSize[]): number[] {
  return RACING_CONFIGS.filter(
    (config) => config.horses !== BIGA_HORSES && horses.includes(config.horses)
  ).map((config) => config.horses as number);
}

/**
 * Can the player buy this configuration right now?  Used by a caller to disable
 * a control and explain the state; the purchase itself re-checks the same rules.
 */
export function getRacingPurchaseEligibility(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): { ok: true } | { ok: false; reason: RacingRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const config = getRacingConfig(ref);
  if (!config) return { ok: false, reason: 'unknown-config' };

  const state = resolveRacingState(profile);
  if (state.unlocked.includes(config.horses)) return { ok: false, reason: 'already-unlocked' };

  if (config.requires) {
    const required = CONFIG_BY_ID.get(config.requires);
    if (!required || !state.unlocked.includes(required.horses)) {
      return { ok: false, reason: 'prerequisite-locked' };
    }
  }

  if (!canAfford(profile, config.price)) return { ok: false, reason: 'insufficient-gold' };

  return { ok: true };
}

/**
 * Buy Triga or Quadra with the player's existing gold.
 *
 * Deducts `price` exactly once and records the unlock; it never selects the new
 * configuration (selecting is a separate, free step, exactly as buying a chariot
 * part never equips it).  Refuses, leaving the caller's profile untouched, when
 * there is no profile, the configuration is unknown, it is already unlocked, its
 * prerequisite is locked (Quadra before Triga), or gold is short.
 */
export function purchaseRacingConfig(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): RacingResult {
  const eligibility = getRacingPurchaseEligibility(profile, ref);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const config = getRacingConfig(ref)!;
  const state = resolveRacingState(profile);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - config.price,
      racing: {
        unlocked: paidUnlocks([...state.unlocked, config.horses]),
        selected: state.selected,
      },
    },
  };
}

/** What a selection would do right now. */
export function getRacingSelectionEligibility(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): { ok: true } | { ok: false; reason: RacingRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const config = getRacingConfig(ref);
  if (!config) return { ok: false, reason: 'unknown-config' };

  if (!resolveRacingState(profile).unlocked.includes(config.horses)) {
    return { ok: false, reason: 'not-unlocked' };
  }

  return { ok: true };
}

/**
 * Select an unlocked configuration.  Costs nothing — the player's gold is
 * carried through untouched — and refuses a configuration that is not unlocked.
 * Selecting what is already selected is allowed and changes nothing.
 */
export function selectRacingConfig(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): RacingResult {
  const eligibility = getRacingSelectionEligibility(profile, ref);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const config = getRacingConfig(ref)!;
  const state = resolveRacingState(profile);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold,
      racing: {
        unlocked: paidUnlocks(state.unlocked),
        selected: config.horses,
      },
    },
  };
}

/** A short, player-facing explanation of a refusal. */
export function describeRacingRejection(reason: RacingRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator profile loaded.';
    case 'unknown-config':
      return 'That team is not one the stables offer.';
    case 'already-unlocked':
      return 'Already unlocked — select it without paying again.';
    case 'prerequisite-locked':
      return 'A Quadra team needs the Triga team first.';
    case 'insufficient-gold':
      return 'Not enough gold.';
    case 'not-unlocked':
      return 'Buy this team before racing with it.';
  }
}
