import React, { useEffect, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { GearTab } from '../hub/GearTab';
import { createNewProfile } from '../../services/storage';
import { purchaseChariotPart, equipChariotPart, resolveChariotLoadout } from '../../utils/chariotLoadout';
import {
  purchaseRacingConfig,
  resolveRacingState,
  selectRacingConfig,
} from '../../utils/racingProgression';

/**
 * RacingConfigHarness — DEVELOPMENT-ONLY transaction harness (Phase C-8.67C).
 *
 * Reachable ONLY when `src/main.tsx` detects the exact `?devHarness=racing` query
 * parameter (or the equivalent dev-only scratch flag) in a Vite dev build
 * (`import.meta.env.DEV`).  In that mode main mounts this component INSTEAD OF
 * `<App />`, so the title screen, the real save loader, the city hub and every
 * normal navigation path never run.
 *
 * Purpose: exercise the REAL Racing Configuration UI — the Armory's Chariot
 * Workshop subview, where the section is mounted, with the real cards and
 * controls — against a **disposable** profile that can afford the Triga (750) and
 * Quadra (1,500) teams.  The player's own save cannot be expected to carry the
 * 2,250 gold a full progression needs, which is exactly the C-8.66B limit this
 * harness pattern exists to remove.
 *
 * Persistence isolation — the point of this harness, and the same rules the
 * C-8.66C/C-8.66D workshop harness is pinned to:
 *   - It never calls `saveProfile` / `loadSavedProfile` and never reads or writes
 *     `PROFILE_STORAGE_KEY`.  The disposable profile lives under its OWN key
 *     (`HARNESS_RACING_PROFILE_KEY`) in per-tab scratch storage, serialized the
 *     way the real save is (`JSON.stringify` of a `PlayerProfile`), so a reload
 *     round-trips through real storage without any chance of overwriting the
 *     player's progress.
 *   - The starting gold is a URL parameter (`?gold=<n>`, default 2,500) applied
 *     ONLY when a fresh disposable profile is seeded, and it is bounded before
 *     use the way the C-8.66D audit requires of untrusted input to a currency
 *     field: plain decimal digits only, clamped to `MAX_HARNESS_RACING_GOLD`.
 *   - Buy and select go through the SAME pure helpers and the same flow App uses
 *     (`purchaseRacingConfig` / `selectRacingConfig` → state → save).  The
 *     workshop's own part handlers are wired the same way, so the subview this
 *     harness draws is the shipping one end to end.
 *
 * Removal: delete this file and revert the `?devHarness=racing` branch in
 * `src/main.tsx` (the import + the conditional).  No other file references it.
 */
export const HARNESS_RACING_PROFILE_KEY = 'sand_and_steel_racing_config_harness_v1';

/** The harness's disposable starting purse — enough for Triga (750) and Quadra (1,500). */
export const DEFAULT_HARNESS_RACING_GOLD = 2500;

/** Ceiling for a URL-supplied purse, mirroring the workshop harness's own bound. */
export const MAX_HARNESS_RACING_GOLD = 1_000_000;

/**
 * The disposable starting purse, from `?gold=<n>` (default 2,500).
 *
 * Accepted only as plain decimal digits: a sign, a fraction, an exponent, a hex
 * prefix, or an empty value is not a purse and falls back to the default — so the
 * seeded balance can never be negative, fractional, `NaN` or an overflowed
 * `Infinity`.  An accepted value is then clamped to `MAX_HARNESS_RACING_GOLD`,
 * which also catches a digit string long enough to read as `Infinity`.
 */
export const readRacingSeedGold = (): number => {
  const raw = new URLSearchParams(window.location.search).get('gold')?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return DEFAULT_HARNESS_RACING_GOLD;
  return Math.min(Number(raw), MAX_HARNESS_RACING_GOLD);
};

const seedProfile = (gold: number): PlayerProfile => ({
  ...createNewProfile('Racing Harness'),
  gold,
});

/**
 * The harness's own scratch storage: `sessionStorage` first (per-tab, never part
 * of a persisted browser profile, so a disposable profile cannot outlive the tab
 * it was made in), `localStorage` as the fallback where session storage is
 * unavailable.
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

/** Exported for the C-8.67C isolation suite; it touches only `HARNESS_RACING_PROFILE_KEY`. */
export const loadHarnessRacingProfile = (): PlayerProfile | null => {
  try {
    const raw = scratchStorage()?.getItem(HARNESS_RACING_PROFILE_KEY) ?? null;
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
};

/** Exported for the C-8.67C isolation suite; it touches only `HARNESS_RACING_PROFILE_KEY`. */
export const saveHarnessRacingProfile = (profile: PlayerProfile): void => {
  try {
    scratchStorage()?.setItem(HARNESS_RACING_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A harness that cannot persist still runs — the screen just reports it.
  }
};

export const RacingConfigHarness: React.FC = () => {
  // Self-guard: belt-and-suspenders so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [profile, setProfile] = useState<PlayerProfile>(
    () => loadHarnessRacingProfile() ?? seedProfile(readRacingSeedGold())
  );

  // Seed the disposable profile once, so a reload reads it back instead of re-seeding.
  useEffect(() => {
    if (!loadHarnessRacingProfile()) saveHarnessRacingProfile(profile);
  }, []);

  /** Exactly App's `handleBuyRacingConfig`. */
  const handleBuyRacingConfig = (horses: 2 | 3 | 4) => {
    const result = purchaseRacingConfig(profile, horses);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessRacingProfile(result.profile);
  };

  /** Exactly App's `handleSelectRacingConfig`. */
  const handleSelectRacingConfig = (horses: 2 | 3 | 4) => {
    const result = selectRacingConfig(profile, horses);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessRacingProfile(result.profile);
  };

  /** Exactly App's `handleBuyChariotPart` — the subview this harness draws also sells parts. */
  const handleBuyChariotPart = (partId: string) => {
    const result = purchaseChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessRacingProfile(result.profile);
  };

  /** Exactly App's `handleEquipChariotPart`. */
  const handleEquipChariotPart = (partId: string) => {
    const result = equipChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessRacingProfile(result.profile);
  };

  /** Re-seed the disposable profile: a legacy save (no `racing` field) with the URL's purse. */
  const resetDisposableProfile = () => {
    const fresh = seedProfile(readRacingSeedGold());
    setProfile(fresh);
    saveHarnessRacingProfile(fresh);
  };

  const racing = resolveRacingState(profile);
  const loadout = resolveChariotLoadout(profile);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-3 sm:p-5">
      <div className="max-w-4xl mx-auto mb-4 rounded-2xl border border-cyan-700/60 bg-cyan-950/30 p-3 font-mono text-[11px] leading-relaxed">
        <div className="text-cyan-300 font-bold uppercase tracking-wider mb-1">
          Dev harness — Racing Configuration (disposable profile)
        </div>
        <div>
          save key: <span className="text-amber-200">{HARNESS_RACING_PROFILE_KEY}</span> — the real save is
          not read or written
        </div>
        <div data-testid="harness-gold">
          gold: <span className="text-yellow-300">{profile.gold}</span>
        </div>
        <div data-testid="harness-racing">
          racing: unlocked=[{racing.unlocked.join(', ')}] selected={racing.selected} horses=
          {racing.horses}
        </div>
        <div data-testid="harness-chariot">
          chariot: owned=[{loadout.owned.join(', ')}] wheels={loadout.equipped.wheels} finish=
          {loadout.equipped.finish}
        </div>
        <button
          data-testid="harness-reset"
          onClick={resetDisposableProfile}
          className="mt-2 px-3 py-1.5 rounded-xl bg-neutral-800 border border-cyan-600/50 text-cyan-200 font-bold uppercase tracking-wider cursor-pointer active:scale-95"
        >
          Reset disposable profile
        </button>
      </div>

      <GearTab
        profile={profile}
        gearView="chariot"
        onGearViewChange={() => {}}
        onEquipWeapon={() => {}}
        onEquipArmor={() => {}}
        onBuyChariotPart={handleBuyChariotPart}
        onEquipChariotPart={handleEquipChariotPart}
        onBuyRacingConfig={handleBuyRacingConfig}
        onSelectRacingConfig={handleSelectRacingConfig}
      />
    </div>
  );
};
