import React, { useEffect, useRef, useState } from 'react';
import type { PlayerProfile } from '../../types/game';
import { createNewProfile } from '../../services/storage';
import { VisitorPanel } from '../hub/VisitorPanel';
import { resolveChariotLoadout } from '../../utils/chariotLoadout';
import { recordVisitorEncounter } from '../../utils/visitorEncounter';
import { purchaseVisitorOffer, type VisitorPurchaseResult } from '../../utils/visitorPurchase';
import { readCompletedVisitors, resolveVisitorSchedule } from '../../utils/visitorSchedule';

/**
 * L16D — DEVELOPMENT-ONLY visitor harness.
 *
 * Reachable ONLY when `src/main.tsx` detects the exact `?devHarness=visitor`
 * query parameter in a Vite dev build (`import.meta.env.DEV`).  In that mode main
 * mounts this component INSTEAD OF `<App />`, so the title screen, the real save
 * loader, the city hub and every normal navigation path never run.
 *
 * Why it exists: L16C could not visually verify the L16B rare chariot finish
 * purchase row — the visitor panel only opens inside the 3D city, the bladesmith
 * is in town on one specific city day, and fabricating a real save to reach that
 * day risks the player's progress.  This harness reaches the same screen without
 * either cost.
 *
 * Persistence isolation — the point of this harness:
 *   - It never calls `saveProfile` / `loadSavedProfile` and never reads or writes
 *     `PROFILE_STORAGE_KEY`.  The disposable profile lives under its OWN key
 *     (`VISITOR_HARNESS_KEY`) and is serialized exactly the way the real save is
 *     (`JSON.stringify` of a `PlayerProfile`).
 *   - "Reset" removes and re-seeds ONLY that key.  Nothing here can reach the
 *     player's profile.
 *
 * Nothing about the visitor feature is faked for the demo:
 *   - the seeded DAY is resolved by the production schedule itself
 *     (`resolveVisitorSchedule`, the L10 resolver) — `resolveFinishOfferDay()`
 *     walks the real rotation from day 1 and returns the first day the bladesmith
 *     actually offers `finish_ventive`.  If the rotation ever moves, the harness
 *     follows it instead of insisting on a hard-coded day (it is day 5 today);
 *   - the rendered panel is the shipping `VisitorPanel`, and its two callbacks are
 *     the shipping transactions (`recordVisitorEncounter`, `purchaseVisitorOffer`)
 *     exactly as `App.handleVisitorEncounter` / `handleVisitorPurchase` call them;
 *   - the purse is only a DISPOSABLE profile's purse.  Being untrusted input to a
 *     currency field it is bounded (`clampHarnessGold`) before it is seeded.
 *
 * URL switches (all optional, all harness-only):
 *   `?gold=<n>`    the seeded purse, plain decimal digits, bounded — so a link can
 *                  show the affordable day and the `insufficient-gold` day;
 *   `?offer=item`  seeds the bladesmith's ordinary item day instead of the finish day;
 *   `?run=select`  presses the bladesmith's row on mount, so the offer, its price and
 *                  the affordability state are on screen without a hand;
 *   `?run=buy`     also presses the panel's own buy button, so the completed trade is
 *                  on screen the same way.  Every press is the shipping control.
 * The buttons on the screen do the same things interactively, and "Reset harness"
 * restores the disposable seed.
 *
 * Removal: delete this file, revert the `?devHarness=visitor` gate and branch in
 * `src/main.tsx`, and delete `src/utils/l16dVisitorHarness.test.ts`.  No shipping
 * screen imports any of it.
 */
export const VISITOR_HARNESS_KEY = 'sand_and_steel_visitor_harness_v1';

/** The one visitor whose cart carries the rare finish (`data/visitors`). */
export const HARNESS_VISITOR_ID = 'numidian_bladesmith';

/** The one visitor-only chariot finish (`data/chariotParts`). */
export const HARNESS_PART_ID = 'finish_ventive';

/** Enough for the actual bargained price (630) plus a visible remainder. */
export const DEFAULT_HARNESS_GOLD = 2_000;

/** Deliberately below the 630-gold bargain, to show the refusal state. */
export const LOW_HARNESS_GOLD = 100;

/** Ceiling for a seeded purse, so no caller can seed a nonsense balance. */
export const MAX_HARNESS_GOLD = 1_000_000;

/** How far the day walk looks for a real arrival before giving up. */
const MAX_DAY_SCAN = 365;

/**
 * `?gold=<n>` — the seeded purse, plain decimal digits only (the same URL
 * convention the chariot-workshop harness uses), so a link can produce both the
 * affordable and the unaffordable state without a hand on the screen.
 */
export const readSeedGold = (): number => {
  const raw = new URLSearchParams(window.location.search).get('gold')?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return DEFAULT_HARNESS_GOLD;
  return clampHarnessGold(Number(raw));
};

/** `?offer=item` seeds the bladesmith's ordinary item day instead of the finish day. */
export const readSeedMode = (): 'part' | 'item' =>
  new URLSearchParams(window.location.search).get('offer') === 'item' ? 'item' : 'part';

/**
 * `?run=select` / `?run=buy` — a URL load cannot click, so the harness performs the
 * gesture the acceptance needs through the panel's own handlers: `select` presses the
 * bladesmith's row (so the day's offer, its price and the affordability state are on
 * screen), `buy` also presses the buy button. Nothing is simulated: those are the
 * shipping `VisitorPanel` controls, and the transaction behind them is
 * `purchaseVisitorOffer`.
 */
export const readRunMode = (): 'off' | 'select' | 'buy' => {
  const run = new URLSearchParams(window.location.search).get('run');
  if (run === 'buy') return 'buy';
  if (run === 'select') return 'select';
  return 'off';
};

const seedFromUrl = (): PlayerProfile =>
  readSeedMode() === 'item' ? seedItemDayProfile(readSeedGold()) : seedFinishDayProfile(readSeedGold());

const clampHarnessGold = (gold: number): number => {
  if (!Number.isFinite(gold) || gold < 0) return 0;
  return Math.min(Math.floor(gold), MAX_HARNESS_GOLD);
};

/** The bladesmith's arrival on one day, through the production schedule. */
const bladesmithArrival = (day: number) =>
  resolveVisitorSchedule({ city: { day } }).arrivals.find(
    (arrival) => arrival.visitor.id === HARNESS_VISITOR_ID
  ) ?? null;

/**
 * The first city day on which the bladesmith offers the rare finish — resolved by
 * the production rotation (`resolveVisitorSchedule`), never hard-coded.
 * Memoized because the walk is a few hundred schedule reads.
 */
let finishOfferDay: number | null = null;
export const resolveFinishOfferDay = (): number => {
  if (finishOfferDay === null) {
    for (let day = 1; day <= MAX_DAY_SCAN && finishOfferDay === null; day += 1) {
      if (bladesmithArrival(day)?.offerPartId === HARNESS_PART_ID) finishOfferDay = day;
    }
    if (finishOfferDay === null) finishOfferDay = 1;
  }
  return finishOfferDay;
};

/** The first city day on which the bladesmith offers an ordinary ITEM. */
let itemOfferDay: number | null = null;
export const resolveItemOfferDay = (): number => {
  if (itemOfferDay === null) {
    for (let day = 1; day <= MAX_DAY_SCAN && itemOfferDay === null; day += 1) {
      if (bladesmithArrival(day)?.offerItemId) itemOfferDay = day;
    }
    if (itemOfferDay === null) itemOfferDay = 1;
  }
  return itemOfferDay;
};

/**
 * The disposable profile: a fresh new-game profile on a real visitor day, with a
 * purse this harness controls.  It carries no `chariot` field, so
 * `resolveChariotLoadout` reads the stock loadout — the rare finish is NOT owned.
 */
export const seedHarnessProfile = (gold: number, day: number): PlayerProfile => ({
  ...createNewProfile('Visitor Harness'),
  gold: clampHarnessGold(gold),
  city: { day },
});

export const seedFinishDayProfile = (gold = DEFAULT_HARNESS_GOLD): PlayerProfile =>
  seedHarnessProfile(gold, resolveFinishOfferDay());

export const seedItemDayProfile = (gold = DEFAULT_HARNESS_GOLD): PlayerProfile =>
  seedHarnessProfile(gold, resolveItemOfferDay());

/**
 * The harness's own scratch storage.  `sessionStorage` is preferred because it is
 * per-tab and is never part of a saved browser profile; `localStorage` is the
 * fallback where session storage is unavailable.
 */
const scratchStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
};

/** Touches only `VISITOR_HARNESS_KEY`. */
export const loadHarnessProfile = (): PlayerProfile | null => {
  try {
    const raw = scratchStorage()?.getItem(VISITOR_HARNESS_KEY) ?? null;
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
};

/** Touches only `VISITOR_HARNESS_KEY`. */
export const saveHarnessProfile = (profile: PlayerProfile): void => {
  try {
    scratchStorage()?.setItem(VISITOR_HARNESS_KEY, JSON.stringify(profile));
  } catch {
    // A harness that cannot persist still runs — the screen just reports it.
  }
};

/** Clears ONLY the harness's own record. The player's save key is never named. */
export const clearHarnessStorage = (): void => {
  try {
    scratchStorage()?.removeItem(VISITOR_HARNESS_KEY);
  } catch {
    // Nothing to clear.
  }
};

/** Reset: drop the disposable record and return a freshly seeded one. */
export const resetHarnessProfile = (gold = DEFAULT_HARNESS_GOLD): PlayerProfile => {
  clearHarnessStorage();
  const seeded = seedFinishDayProfile(gold);
  saveHarnessProfile(seeded);
  return seeded;
};

/**
 * The purchase callback's transaction, exactly as `App.handleVisitorPurchase`
 * runs it: the production `purchaseVisitorOffer` decides, and only a success is
 * persisted — to the harness key.  A refusal returns the transaction's own
 * reason and writes nothing.
 */
export const commitHarnessVisitorPurchase = (
  profile: PlayerProfile,
  visitorId: string
): VisitorPurchaseResult => {
  const result = purchaseVisitorOffer(profile, visitorId);
  if (result.ok) saveHarnessProfile(result.profile);
  return result;
};

/** The encounter callback's transaction, exactly as App runs it. */
export const commitHarnessVisitorEncounter = (
  profile: PlayerProfile,
  visitorId: string
): PlayerProfile => {
  const result = recordVisitorEncounter(profile, visitorId);
  if (!result.ok || !result.recorded) return profile;
  saveHarnessProfile(result.profile);
  return result.profile;
};

const describeResult = (result: VisitorPurchaseResult): string => {
  if (!result.ok) return `refused: ${result.reason}`;
  const bought = result.kind === 'part' ? `${result.part.id} (chariot part)` : result.item.id;
  return `bought ${bought} for ${result.price} gold`;
};

export const VisitorHarness: React.FC = () => {
  // Self-guard: belt-and-suspenders so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [profile, setProfile] = useState<PlayerProfile>(
    () => loadHarnessProfile() ?? seedFromUrl()
  );
  const profileRef = useRef(profile);
  // The panel is open by default: this screen exists to show it.
  const [panelOpen, setPanelOpen] = useState(true);
  const [lastResult, setLastResult] = useState<string>('—');

  // Seed the disposable profile once, so a reload reads it back instead of re-seeding.
  useEffect(() => {
    if (!loadHarnessProfile()) saveHarnessProfile(profile);
  }, []);

  // `?run=select` / `?run=buy` — press the panel's own row, and for `buy` its own
  // buy button. Both clicks go through the real React handlers, so the panel and the
  // transaction are exercised exactly as a player's thumb would exercise them.
  useEffect(() => {
    const run = readRunMode();
    if (run === 'off') return;
    let buyTimer: number | undefined;
    // Two frames: the panel is committed, so its row exists, and the click lands
    // before any capture can race it.
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-testid="visitor-row-${HARNESS_VISITOR_ID}"]`)
          ?.click();
        if (run !== 'buy') return;
        // The buy button only exists once the selection has rendered, so wait for it
        // (a frame or two) and press it exactly once.
        let frame = 0;
        const pressBuy = () => {
          const button = document.querySelector<HTMLButtonElement>(
            '[data-testid="visitor-buy-button"]'
          );
          if (button && !button.disabled) {
            button.click();
            return;
          }
          frame += 1;
          if (frame < 20) buyTimer = window.requestAnimationFrame(pressBuy);
        };
        buyTimer = window.requestAnimationFrame(pressBuy);
      });
      frames.push(secondFrame);
    });
    const frames: number[] = [firstFrame];
    return () => {
      for (const frame of frames) window.cancelAnimationFrame(frame);
      if (buyTimer !== undefined) window.cancelAnimationFrame(buyTimer);
    };
  }, []);

  const commit = (next: PlayerProfile) => {
    profileRef.current = next;
    setProfile(next);
  };

  const handleEncounter = (visitorId: string) => {
    commit(commitHarnessVisitorEncounter(profileRef.current, visitorId));
  };

  /** Exactly App's `handleVisitorPurchase`, writing to the harness's own key. */
  const handlePurchase = (visitorId: string): VisitorPurchaseResult => {
    const result = commitHarnessVisitorPurchase(profileRef.current, visitorId);
    if (result.ok) commit(result.profile);
    setLastResult(describeResult(result));
    return result;
  };

  const reseed = (seeded: PlayerProfile) => {
    clearHarnessStorage();
    saveHarnessProfile(seeded);
    commit(seeded);
    setLastResult('—');
    setPanelOpen(true);
  };

  const schedule = resolveVisitorSchedule(profile);
  const owned = resolveChariotLoadout(profile).owned;
  const completed = readCompletedVisitors(profile);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-3 sm:p-5">
      <div className="max-w-md mx-auto rounded-2xl border border-cyan-700/60 bg-cyan-950/30 p-3 font-mono text-[11px] leading-relaxed">
        <div className="text-cyan-300 font-bold uppercase tracking-wider mb-1">
          Dev harness — city visitors (disposable profile)
        </div>
        <div>
          save key: <span className="text-amber-200">{VISITOR_HARNESS_KEY}</span> — the real save is not read or written
        </div>
        <div data-testid="harness-day">
          city day: <span className="text-cyan-200">{schedule.day}</span> — arrivals:{' '}
          {schedule.arrivals.map((a) => a.visitor.name).join(', ') || 'none'}
        </div>
        <div data-testid="harness-gold">
          gold: <span className="text-yellow-300">{profile.gold}</span>
        </div>
        <div data-testid="harness-owned">chariot owned: {owned.join(', ')}</div>
        <div data-testid="harness-inventory">inventory: {profile.inventory.length} items</div>
        <div data-testid="harness-completed">
          completed visitors: {completed.join(', ') || 'none'}
        </div>
        <div data-testid="harness-last-result">last transaction: {lastResult}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            data-testid="harness-open"
            onClick={() => setPanelOpen(true)}
            className="min-h-[44px] px-3 rounded-xl bg-cyan-800 hover:bg-cyan-700 text-cyan-50 font-bold uppercase tracking-wider cursor-pointer"
          >
            Open visitor panel
          </button>
          <button
            data-testid="harness-seed-short"
            onClick={() => reseed(seedFinishDayProfile(LOW_HARNESS_GOLD))}
            className="min-h-[44px] px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
          >
            Short purse ({LOW_HARNESS_GOLD})
          </button>
          <button
            data-testid="harness-seed-item"
            onClick={() => reseed(seedItemDayProfile())}
            className="min-h-[44px] px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
          >
            Ordinary item day
          </button>
          <button
            data-testid="harness-reset"
            onClick={() => reseed(resetHarnessProfile())}
            className="min-h-[44px] px-3 rounded-xl bg-amber-800 hover:bg-amber-700 text-amber-50 cursor-pointer"
          >
            Reset harness
          </button>
        </div>
      </div>

      {panelOpen && (
        <VisitorPanel
          profile={profile}
          onEncounter={handleEncounter}
          onPurchase={handlePurchase}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
};
