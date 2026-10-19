/**
 * Phase C-8.70B — Stage 1, Slice 0: the East Circus District race entry point,
 * wired to the player's selected team configuration.
 *
 * Run with: bun test src/utils/phaseC8_70b.test.ts
 *
 * ── WHAT THIS SLICE SHIPS ─────────────────────────────────────────────────
 *   • `getSelectedRacingConfig(profile)` in `racingProgression.ts` — the one new
 *     pure helper: the catalogue entry for the team size the profile has
 *     SELECTED, defaulting to Biga (2 horses) for a fresh, legacy, partial or
 *     hand-edited save.  Unlock and selection stay separate: an unlocked but
 *     unselected Triga still answers what `selected` actually names.
 *   • The district's race entry point — a signed signpost on the carceres
 *     forecourt (`EastCircusDistrict.tsx`), whose position is single-sourced in
 *     `circusDistrictGeometry.ts` (`CIRCUS_RACE_ENTRY`) and read by the hub
 *     trigger and the fast-travel arrival in `cityCollisions.ts`.  The trigger is
 *     the city's existing interaction component, not a parallel system.
 *   • `PreRacePanel.tsx` — the read-only pre-race panel, opened by that trigger
 *     from `CityHubScene`, showing the selected team by name and horse count and
 *     the fitted loadout from `chariotLoadout.ts`.  "Leave" closes it; "Start
 *     Race" sets one piece of local state and shows the in-panel notice.
 *
 * ── WHAT IT MUST NOT DO, AND HOW THAT IS CHECKED ──────────────────────────
 * Player saves are READ-ONLY here.  The panel imports no storage and names no
 * save writer; the helper is a pure read; and §B pins both by source.  Nothing
 * migrates, resets or writes progression, gold or unlocks.
 *
 * ── THE SOURCE OF TRUTH FOR "CURRENTLY SELECTED TEAM SIZE" ────────────────
 * `resolveRacingState(profile).selected` — the same value `selectRacingConfig`
 * writes and `RacingConfigSection` renders.  `getSelectedRacingConfig` reads it;
 * it does not re-derive, re-rank or merge unlock state into it.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  RACING_CONFIGS,
  defaultRacingState,
  getSelectedRacingConfig,
  resolveRacingState,
} from './racingProgression';
import { createNewProfile } from '../services/storage';
import {
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  clampBoundaryX,
  clampBoundaryZ,
  getNearbyHubLocation,
} from './cityCollisions';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith } from './collisionShapes';
import { CIRCUS_RACE_ENTRY } from './circusDistrictGeometry';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A fresh gladiator — no `racing` field at all, exactly a legacy/first save. */
const fresh = () => createNewProfile('Slice Zero');

const withRacing = (racing: unknown) =>
  ({ ...fresh(), racing } as ReturnType<typeof fresh>);

// ══════════════════════════════════════════════════════════════════════════
// A. The one new pure helper
// ══════════════════════════════════════════════════════════════════════════

describe('A. getSelectedRacingConfig — the selected team, for display', () => {
  test('a fresh profile answers Biga with 2 horses', () => {
    const config = getSelectedRacingConfig(fresh());
    expect(config.id).toBe('biga');
    expect(config.name).toBe('Biga');
    expect(config.horses).toBe(2);
  });

  test('a missing profile answers Biga, never a throw', () => {
    for (const profile of [null, undefined]) {
      const config = getSelectedRacingConfig(profile);
      expect(config.id).toBe('biga');
      expect(config.horses).toBe(2);
    }
  });

  test('Triga unlocked AND selected answers Triga with 3 horses', () => {
    const config = getSelectedRacingConfig(withRacing({ unlocked: [3], selected: 3 }));
    expect(config.id).toBe('triga');
    expect(config.name).toBe('Triga');
    expect(config.horses).toBe(3);
  });

  test('Quadra unlocked and selected answers Quadra with 4 horses', () => {
    const config = getSelectedRacingConfig(withRacing({ unlocked: [3, 4], selected: 4 }));
    expect(config.name).toBe('Quadra');
    expect(config.horses).toBe(4);
  });

  test('Triga unlocked but NOT selected answers the size actually selected', () => {
    // The acceptance case: unlock state and selection are separate, and the
    // panel must show the selection, not the highest unlock.
    expect(getSelectedRacingConfig(withRacing({ unlocked: [3], selected: 2 })).id).toBe('biga');
    // A partial field carrying the unlock alone is the same story.
    expect(getSelectedRacingConfig(withRacing({ unlocked: [3] })).id).toBe('biga');
    // …and the mirror: a stale `selected: 3` with no unlock resolves to Biga.
    expect(getSelectedRacingConfig(withRacing({ selected: 3 })).id).toBe('biga');
  });

  test('malformed and hand-edited fields fall back to Biga', () => {
    const fallbacks = [
      { unlocked: [4], selected: 4 }, // orphan Quadra — no legitimate transaction makes this
      { unlocked: 'all', selected: 'three' },
      { unlocked: [3.5, 2], selected: 9 },
      { unlocked: [], selected: null },
      {},
      'racing',
      null,
    ];
    for (const racing of fallbacks) {
      const config = getSelectedRacingConfig(withRacing(racing));
      expect(config.id, JSON.stringify(racing)).toBe('biga');
    }
  });

  test('CONTROL: a real unlock+selection is not swallowed by the fallback', () => {
    // The same predicate that answers Biga above must answer Triga here, so the
    // fallback is not simply constant.
    expect(getSelectedRacingConfig(withRacing({ unlocked: [3, 3, 2], selected: 3 })).id).toBe('triga');
    expect(getSelectedRacingConfig(withRacing({ unlocked: [3, 4], selected: 3 })).id).toBe('triga');
  });

  test('it returns the catalogue entry itself — one source of truth', () => {
    const config = getSelectedRacingConfig(withRacing({ unlocked: [3, 4], selected: 4 }));
    expect(config).toBe(RACING_CONFIGS.find((c) => c.horses === 4));
  });

  test('its horses always equals resolveRacingState().selected', () => {
    const profiles = [
      fresh(),
      withRacing({ unlocked: [3], selected: 3 }),
      withRacing({ unlocked: [3], selected: 2 }),
      withRacing({ unlocked: [3, 4], selected: 4 }),
      withRacing({ unlocked: [4], selected: 4 }),
    ];
    for (const profile of profiles) {
      expect(getSelectedRacingConfig(profile).horses).toBe(resolveRacingState(profile).selected);
    }
    // and the default state is the fresh-profile answer
    expect(defaultRacingState().selected).toBe(2);
    expect(getSelectedRacingConfig(fresh()).horses).toBe(defaultRacingState().selected);
  });

  test('it never mutates the profile it reads (frozen input)', () => {
    const profile = Object.freeze({
      ...fresh(),
      racing: Object.freeze({ unlocked: Object.freeze([3, 4]), selected: 4 }),
    });
    const before = JSON.stringify(profile);
    expect(getSelectedRacingConfig(profile as never).horses).toBe(4);
    expect(JSON.stringify(profile)).toBe(before);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Read-only: no save writer anywhere in the entry flow
// ══════════════════════════════════════════════════════════════════════════

describe('B. The entry flow is read-only', () => {
  const panel = load('../components/hub/PreRacePanel.tsx');
  const scene = load('../components/3d/city/CityHubScene.tsx');

  test('the panel imports no storage and names no save writer', () => {
    expect(panel.includes('saveProfile')).toBe(false);
    expect(panel.includes('clearSavedProfile')).toBe(false);
    expect(panel.includes('localStorage')).toBe(false);
    expect(panel.includes('sessionStorage')).toBe(false);
    expect(panel.includes('PROFILE_STORAGE_KEY')).toBe(false);
    expect(panel.includes('services/storage')).toBe(false);
  });

  test('the panel reads the selected team and the fitted loadout through the pure helpers', () => {
    expect(panel.includes('getSelectedRacingConfig')).toBe(true);
    expect(panel.includes('racingProgression')).toBe(true);
    expect(panel.includes('resolveChariotLoadout')).toBe(true);
    expect(panel.includes('chariotLoadout')).toBe(true);
    // and never through a racing transaction helper
    expect(panel.includes('purchaseRacingConfig')).toBe(false);
    expect(panel.includes('selectRacingConfig')).toBe(false);
  });

  test('"Start Race" is inert: local notice state only', () => {
    expect(panel.includes('data-race-action="start"')).toBe(true);
    expect(panel.includes('setNotice(true)')).toBe(true);
    expect(panel.includes('data-race-notice="pending"')).toBe(true);
    // nothing in the panel writes, navigates or changes scene
    expect(panel.includes('saveProfile')).toBe(false);
  });

  test('the city wiring only toggles local view state', () => {
    expect(scene.includes("nearbyLoc.id === 'east_circus_arena'")).toBe(true);
    expect(scene.includes('setShowRaceEntry(true)')).toBe(true);
    expect(scene.includes('setShowRaceEntry(false)')).toBe(true);
    expect(scene.includes('PreRacePanel')).toBe(true);
    // the panel is handed the profile and a close callback — no mutation path
    expect(scene.includes('saveProfile(profile)')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The district entry point: one trigger, one arrival, one sign
// ══════════════════════════════════════════════════════════════════════════

describe('C. The East Circus District race entry point', () => {
  const hub = HUB_LOCATIONS.find((l) => l.id === 'east_circus_arena');
  const arrival = FAST_TRAVEL_ARRIVALS.east_circus_arena;

  test('the hub trigger exists exactly once, from the layout module', () => {
    expect(HUB_LOCATIONS.filter((l) => l.id === 'east_circus_arena')).toHaveLength(1);
    expect(hub).toBeDefined();
    expect([hub!.position[0], hub!.position[2]]).toEqual([CIRCUS_RACE_ENTRY.x, CIRCUS_RACE_ENTRY.z]);
    expect(hub!.radius).toBe(CIRCUS_RACE_ENTRY.radius);
    expect(hub!.district).toBe('EAST');
    // it opens a panel, not a hub tab
    expect(hub!.tabKey).toBeUndefined();
  });

  test('the signpost mesh stands at the same world position, from the same constant', () => {
    const district = load('../components/3d/city/EastCircusDistrict.tsx');
    expect(district.includes('CIRCUS_RACE_ENTRY')).toBe(true);
    expect(district.includes('RaceEntrySign')).toBe(true);
    // single-sourced: the world position is not restated in the component
    expect(district.includes('40.5')).toBe(false);
    expect(district.includes('50.3')).toBe(false);
  });

  test('the arrival is inside the entry disc, clear and collision-free', () => {
    expect(arrival).toEqual([CIRCUS_RACE_ENTRY.x, CIRCUS_RACE_ENTRY.z - 2]);
    const d = Math.hypot(arrival[0] - hub!.position[0], arrival[1] - hub!.position[2]);
    expect(d).toBeLessThan(CIRCUS_RACE_ENTRY.radius);
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS + 0.5, CITY_COLLIDERS)).toBe(false);
  });

  test('the trigger and the arrival sit inside the walkable envelope', () => {
    for (const [x, z] of [
      [hub!.position[0], hub!.position[2]],
      arrival,
    ] as ReadonlyArray<readonly [number, number]>) {
      expect(clampBoundaryX(x, z)).toBe(x);
      expect(clampBoundaryZ(x, z)).toBe(z);
    }
  });

  test('the district answers its own prompt, from open forecourt ground', () => {
    expect(getNearbyHubLocation([hub!.position[0], 0, hub!.position[2]])?.id).toBe('east_circus_arena');
    expect(getNearbyHubLocation([arrival[0], 0, arrival[1]])?.id).toBe('east_circus_arena');
    expect(collidesWith(hub!.position[0], hub!.position[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('the signpost adds no collider (a sign is walked past, not around)', () => {
    const onSign = CITY_COLLIDERS.filter(
      (c) =>
        c.type === 'rect' &&
        Math.abs(c.cx - CIRCUS_RACE_ENTRY.x) <= c.hw &&
        Math.abs(c.cz - CIRCUS_RACE_ENTRY.z) <= c.hd,
    );
    expect(onSign).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Slice boundary
// ══════════════════════════════════════════════════════════════════════════

describe('D. Slice boundary — no dev harness, no arena change', () => {
  test('nothing this slice added imports a dev harness', () => {
    for (const rel of [
      '../components/hub/PreRacePanel.tsx',
      '../components/3d/city/CityHubScene.tsx',
      '../components/3d/city/EastCircusDistrict.tsx',
    ]) {
      expect(load(rel).includes('components/dev/')).toBe(false);
    }
  });

  test('the arena GLB, its transform and the closed ring are untouched', () => {
    const arena = load('../components/3d/city/EastCircusArena.tsx');
    expect(arena.includes("CIRCUS_ARENA_URL = '/_workspace_arena.glb'")).toBe(true);
    expect(arena.includes('CIRCUS_ARENA_POSITION')).toBe(true);
    expect(arena.includes('CIRCUS_ARENA_YAW = Math.PI / 2')).toBe(true);
    expect(arena.includes('CIRCUS_ARENA_SCALE = 0.2')).toBe(true);
  });
});
