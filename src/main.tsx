import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Phase 4 — development-only character test harness. Reachable ONLY in a Vite
// dev build (import.meta.env.DEV) when the EXACT `?devHarness=character` query
// parameter is present. In that mode the normal <App /> is not mounted at all,
// so the title screen, save loader and city hub never run. In production
// (import.meta.env.DEV is `false`) the branch is statically eliminated, so the
// harness cannot be activated even by supplying the parameter.
const useCharacterHarness =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('devHarness') === 'character';

// Phase C-8.66C — development-only Chariot Workshop transaction harness.
// Reachable ONLY in a Vite dev build, either through the exact
// `?devHarness=chariot` query parameter or — for a preview browser that cannot
// deliver a query parameter on a reload — through the equivalent dev-only
// scratch-storage flag `sand_and_steel_dev_harness = 'chariot'`.  It drives the REAL
// workshop UI against a DISPOSABLE profile stored under its own storage key,
// so a purchase and an equip can be exercised end to end without touching the
// player's save.  `?gold=<n>` sets the disposable profile's starting purse when
// it is first seeded (default 600); the flag route uses that default.
const DEV_HARNESS_KEY = 'sand_and_steel_dev_harness';
const readDevHarnessFlag = (): string | null => {
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      const value = store.getItem(DEV_HARNESS_KEY);
      if (value !== null) return value;
    } catch {
      // Ignore an unavailable store and try the next one.
    }
  }
  return null;
};

const useChariotHarness =
  import.meta.env.DEV &&
  (new URLSearchParams(window.location.search).get('devHarness') === 'chariot' ||
    readDevHarnessFlag() === 'chariot');

// Phase C-8.67C — development-only Racing Configuration transaction harness.
// Reachable ONLY in a Vite dev build, through the exact `?devHarness=racing`
// query parameter or the equivalent dev-only scratch-storage flag
// `sand_and_steel_dev_harness = 'racing'`.  It drives the REAL Racing
// Configuration UI (inside the Armory's subview the Imperial Stable opens)
// against a DISPOSABLE profile stored under its own storage key, so a team
// purchase and a team selection can be exercised end to end without touching
// the player's save.  `?gold=<n>` sets the disposable profile's starting purse
// when it is first seeded (default 2,500 — enough for Triga and Quadra).
const useRacingHarness =
  import.meta.env.DEV &&
  (new URLSearchParams(window.location.search).get('devHarness') === 'racing' ||
    readDevHarnessFlag() === 'racing');

// Phase C-8.68C — development-only horse ↔ chariot FIT PROTOTYPE. Reachable ONLY
// in a Vite dev build, through the exact `?devHarness=horsefit` query parameter or
// the equivalent dev-only scratch-storage flag `sand_and_steel_dev_harness =
// 'horsefit'`.  It renders a DISPOSABLE scale-and-alignment viewer — the real
// horse GLB and the real chariot, with reference guides — so the C-8.68B
// proportion decision can be judged in the renderer.  It is not racing, it is not
// wired into the city or the arena, it saves nothing and it never reads the
// player's save.  Like every branch here it is dynamically imported INSIDE the
// `import.meta.env.DEV` gate, so a production build contains none of it.
const useHorseFitHarness =
  import.meta.env.DEV &&
  (new URLSearchParams(window.location.search).get('devHarness') === 'horsefit' ||
    readDevHarnessFlag() === 'horsefit');

if (useCharacterHarness) {
  // Lazy so the harness module (and its DuelScene chunk) is never even parsed
  // outside this dev+param path.
  void import('./components/dev/CharacterTestHarness').then(({ CharacterTestHarness }) => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <CharacterTestHarness />
      </React.StrictMode>,
    );
  });
} else if (useChariotHarness) {
  void import('./components/dev/ChariotWorkshopHarness').then(({ ChariotWorkshopHarness }) => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <ChariotWorkshopHarness />
      </React.StrictMode>,
    );
  });
} else if (useRacingHarness) {
  void import('./components/dev/RacingConfigHarness').then(({ RacingConfigHarness }) => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <RacingConfigHarness />
      </React.StrictMode>,
    );
  });
} else if (useHorseFitHarness) {
  void import('./components/dev/HorseChariotFitPrototype').then(({ HorseChariotFitPrototype }) => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <HorseChariotFitPrototype />
      </React.StrictMode>,
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
