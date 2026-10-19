import React, { useEffect, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { GearTab } from '../hub/GearTab';
import { createNewProfile } from '../../services/storage';
import { purchaseChariotPart, equipChariotPart, resolveChariotLoadout } from '../../utils/chariotLoadout';

/**
 * ChariotWorkshopHarness — DEVELOPMENT-ONLY transaction harness (Phase C-8.66C).
 *
 * Reachable ONLY when `src/main.tsx` detects the exact `?devHarness=chariot`
 * query parameter in a Vite dev build (`import.meta.env.DEV`).  In that mode main
 * mounts this component INSTEAD OF `<App />`, so the title screen, the real save
 * loader, the city hub and every normal navigation path never run.
 *
 * Purpose: exercise the REAL workshop UI (`GearTab` → `ChariotWorkshopTab` → its
 * 3D preview) against a **disposable** profile that can afford the paid parts —
 * which the player's own save cannot be expected to do.  C-8.66B recorded the
 * purchase click as unverified for exactly that reason.
 *
 * Persistence isolation — the point of this harness:
 *   - It never calls `saveProfile` / `loadSavedProfile` and never reads or writes
 *     `PROFILE_STORAGE_KEY`.  The disposable profile lives under its OWN key
 *     (`HARNESS_PROFILE_KEY`) and is serialized exactly the way the real save is
 *     (`JSON.stringify` of a `PlayerProfile`), so a reload round-trips through
 *     real storage without any chance of overwriting the player's progress.
 *   - The starting gold is a URL parameter (`?gold=600`, default 600) applied
 *     ONLY when a fresh disposable profile is seeded.  Seeding a disposable
 *     profile is not "forcing affordability" on the real one: the player's save
 *     is a different key and is never touched.
 *   - Buy and equip go through the SAME pure helpers and the same flow App uses
 *     (`purchaseChariotPart` / `equipChariotPart` → state → save), so the UI path
 *     under test is the shipping one.
 *
 * Removal: delete this file and revert the `?devHarness=chariot` branch in
 * `src/main.tsx` (the import + the conditional).  No other file references it.
 */
export const HARNESS_PROFILE_KEY = 'sand_and_steel_chariot_workshop_harness_v1';

/** The harness's disposable starting purse — enough for the 450-gold wheel set. */
const DEFAULT_HARNESS_GOLD = 600;

const readSeedGold = (): number => {
  const raw = new URLSearchParams(window.location.search).get('gold');
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_HARNESS_GOLD;
};

const seedProfile = (gold: number): PlayerProfile => ({
  ...createNewProfile('Workshop Harness'),
  gold,
});

/**
 * The harness's own scratch storage.  `sessionStorage` is preferred because it is
 * per-tab and is never part of a saved/persisted browser profile, so a disposable
 * profile cannot outlive the tab it was made in; `localStorage` is the fallback
 * where session storage is unavailable.
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

const loadHarnessProfile = (): PlayerProfile | null => {
  try {
    const raw = scratchStorage()?.getItem(HARNESS_PROFILE_KEY) ?? null;
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
};

const saveHarnessProfile = (profile: PlayerProfile): void => {
  try {
    scratchStorage()?.setItem(HARNESS_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A harness that cannot persist still runs — the screen just reports it.
  }
};

export const ChariotWorkshopHarness: React.FC = () => {
  // Self-guard: belt-and-suspenders so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [profile, setProfile] = useState<PlayerProfile>(
    () => loadHarnessProfile() ?? seedProfile(readSeedGold())
  );

  // Seed the disposable profile once, so a reload reads it back instead of re-seeding.
  useEffect(() => {
    if (!loadHarnessProfile()) saveHarnessProfile(profile);
  }, []);

  /** Exactly App's `handleBuyChariotPart`, writing to the harness's own key. */
  const handleBuyPart = (partId: string) => {
    const result = purchaseChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessProfile(result.profile);
  };

  /** Exactly App's `handleEquipChariotPart`. */
  const handleEquipPart = (partId: string) => {
    const result = equipChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveHarnessProfile(result.profile);
  };

  const loadout = resolveChariotLoadout(profile);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-3 sm:p-5">
      <div className="max-w-4xl mx-auto mb-4 rounded-2xl border border-cyan-700/60 bg-cyan-950/30 p-3 font-mono text-[11px] leading-relaxed">
        <div className="text-cyan-300 font-bold uppercase tracking-wider mb-1">
          Dev harness — Chariot Workshop (disposable profile)
        </div>
        <div>
          save key: <span className="text-amber-200">{HARNESS_PROFILE_KEY}</span> — the real save is not read or written
        </div>
        <div data-testid="harness-gold">
          gold: <span className="text-yellow-300">{profile.gold}</span>
        </div>
        <div data-testid="harness-owned">owned: {loadout.owned.join(', ')}</div>
        <div data-testid="harness-equipped">
          equipped: wheels={loadout.equipped.wheels} finish={loadout.equipped.finish}
        </div>
      </div>

      <GearTab
        profile={profile}
        gearView="chariot"
        onGearViewChange={() => {}}
        onEquipWeapon={() => {}}
        onEquipArmor={() => {}}
        onBuyChariotPart={handleBuyPart}
        onEquipChariotPart={handleEquipPart}
      />
    </div>
  );
};
