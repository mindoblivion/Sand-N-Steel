/**
 * Phase C-8.70B Stage 1, Slice 1 — the race scene's wiring and boundaries.
 *
 * Run with: bun test src/utils/phaseC8_70bStage1.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the scene switch: the race is a VALUE of the screen machine `App`
 *      already has (a `GameScreen` member, one `React.lazy` import, one
 *      conditional render), not a router and not a second scene manager;
 *   §B the hand-off: the city captures the pose it must come back to and `App`
 *      holds it in memory, and no part of that path writes to a save;
 *   §C the start line: on the arena's own long axis, inside the closed ring, and
 *      placed by POSITION only (no collider is touched anywhere);
 *   §D the reused pieces: the shipping `EastCircusArena` and the shipping
 *      chariot model, restated nowhere;
 *   §E Slice 1's boundaries: no dev harness, no horse asset, no opponent, and
 *      nothing in combat, workshop or progression changed.
 *
 * The suite reads the shipped sources; the module-level facts it needs (the
 * start line, the arena's own measured constants) are imported from the pure
 * modules that own them, so nothing here restates a number that could drift.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CIRCUS_ARCH_EAST_X,
  CIRCUS_ARCH_WEST_X,
  CIRCUS_AXIS_X,
  CIRCUS_CARCERES_FRONT_Z,
  CIRCUS_EAST_X,
  CIRCUS_NORTH_END_Z,
  CIRCUS_SOUTH_Z,
  CIRCUS_WEST_X,
  CITY_COLLIDERS,
} from './collisionShapes';
import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from './circusDistrictGeometry';
import { CHARIOT_MODEL_SCALE, CHARIOT_MODEL_URL } from './chariotGeometry';
import { COUNTDOWN_MS, GO_LABEL } from './raceState';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const appSrc = load('../App.tsx');
const sceneSrc = load('../components/3d/RaceScene.tsx');
const citySrc = load('../components/3d/city/CityHubScene.tsx');
const panelSrc = load('../components/hub/PreRacePanel.tsx');
const arenaSrc = load('../components/3d/city/EastCircusArena.tsx');
// PLAY-1: the screen union moved into the back-button contract module.
const screenHistorySrc = load('./screenHistory.ts');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/** The body of one `const name = ...;` handler, so a check can be scoped to it. */
const handlerBody = (source: string, name: string): string => {
  const start = source.indexOf(`const ${name} =`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  };', start);
  expect(end, `${name} closes`).toBeGreaterThan(start);
  return source.slice(start, end);
};

// ══════════════════════════════════════════════════════════════════════════
// A. The scene switch follows the existing pattern
// ══════════════════════════════════════════════════════════════════════════

describe('A. The race is a screen of the existing machine', () => {
  test('App gains one screen value and one lazy import — no router', () => {
    // Rebased by PLAY-1, not weakened: the one screen union moved into
    // `utils/screenHistory.ts` (the back button's contract), and App imports it. The
    // property pinned is unchanged — the race is ONE value of the one screen union,
    // mounted from a lazy import, with no router and no second scene manager.
    expect(screenHistorySrc).toContain(
      "export type GameScreen = 'title' | 'create_character' | 'city_3d' | 'hub_2d' | 'duel' | 'race';"
    );
    expect(appSrc).toContain("import type { GameScreen } from './utils/screenHistory';");
    expect(appSrc).toContain("import('./components/3d/RaceScene')");
    // Rebased by Slice 2 (driving): the race screen now also receives the
    // handedness flag, so its touch cluster can mirror in Lefty Mode.  The
    // property this pins — the screen is mounted with its abort handler — is
    // unchanged, and the mount count below is still exactly one.
    // Rebased by C-8.70B SET-1 (the settings slice): the race screen now also
    // receives its own settings entry and the panel's freeze flag, so the mount is
    // written across several lines.  The property this pins — the screen is mounted
    // with its abort handler and its handedness — is unchanged, and the mount count
    // below is still exactly one.
    expect(appSrc).toContain('onAbort={handleExitRace}');
    expect(appSrc).toContain('isLeftyMode={isLeftyMode}');
    expect(appSrc).toContain('frozen={settingsOpen}');
    expect(appSrc).toContain("currentScreen === 'race' &&");
    // the mechanism is the one that already moves between title / city / duel
    expect(appSrc).toContain("currentScreen === 'city_3d' &&");
    expect(appSrc).toContain("currentScreen === 'duel' &&");
    // no router, no second scene manager, no scene registry
    for (const token of ['react-router', 'createBrowserRouter', 'SceneManager', 'useNavigate']) {
      expect(appSrc, token).not.toContain(token);
    }
    // the race screen is mounted exactly once
    expect(appSrc.split('<RaceScene').length - 1).toBe(1);
  });

  test('the race scene is lazy and behind the shared Suspense fallback pattern', () => {
    expect(appSrc).toContain("React.lazy(() => import('./components/3d/RaceScene')");
    // Rebased by START-1, not weakened: the bare "Entering the Circus..." div became the
    // shared `WaitSurface` — the SAME fallback the city and the duel use — still inside
    // exactly one Suspense, now under the destination-load boundary for the circus tier.
    // The property this test exists to pin is unchanged: the race scene is a lazy chunk
    // behind a Suspense fallback rather than an eager import rendered without one.
    expect(appSrc).toContain('<React.Suspense fallback={<WaitSurface destination="circus" />}>');
    expect(appSrc).toContain('<LazySceneBoundary tier="circus">');
  });

  test('the race screen replaces the city rather than overlaying it', () => {
    // the city renders on `city_3d` only, so leaving for the race unmounts it
    const cityBlock = appSrc.slice(
      appSrc.indexOf("{currentScreen === 'city_3d' &&"),
      appSrc.indexOf("{currentScreen === 'hub_2d' &&")
    );
    expect(cityBlock).toContain('<CityHubScene');
    expect(cityBlock).not.toContain('<RaceScene');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The city pose is captured, returned, and written nowhere
// ══════════════════════════════════════════════════════════════════════════

describe('B. The pre-race pose, in memory only', () => {
  test('the city captures the live pose at the moment the race starts', () => {
    const start = handlerBody(citySrc, 'handleStartRace');
    expect(start).toContain('playerPosRef.current');
    expect(start).toContain('playerRotYRef.current');
    expect(start).toContain('setShowRaceEntry(false)');
    expect(start).toContain('onStartRace(pose)');
  });

  test('the panel hands off to the city and still writes nothing', () => {
    expect(panelSrc).toContain('onStartRace');
    expect(panelSrc).toContain('onClick={onStartRace}');
    for (const token of ['saveProfile', 'localStorage', 'sessionStorage', 'PROFILE_STORAGE_KEY', 'services/storage']) {
      expect(panelSrc, token).not.toContain(token);
    }
    // the Slice 0 notice — the stand-in for a race that did not exist yet — is gone
    expect(panelSrc).not.toContain('setNotice');
  });

  test('App holds the pose in state and hands it back to the city', () => {
    expect(appSrc).toContain('const [cityReturnPose, setCityReturnPose] = useState<CityExitPose | null>(null)');
    // The captured pose is what the city is handed — and the ONLY arrival that overrides
    // it is the oath's own, which a racing gladiator cannot be in: the race is entered
    // from free roam, and free roam is what the oath's yard arrival holds back.
    expect(appSrc).toContain(
      'initialPosition={oathBeatMode ? OATH_YARD_SPAWN.position : cityReturnPose?.position}',
    );
    expect(appSrc).toContain(
      'initialRotationY={oathBeatMode ? OATH_YARD_SPAWN.rotationY : cityReturnPose?.rotationY}',
    );
    expect(appSrc).toContain('onStartRace={handleStartRace}');
  });

  test('the city spawns at that pose instead of the town gate', () => {
    expect(citySrc).toContain('initialPosition ?? [0, 0, 16]');
    expect(citySrc).toContain('initialRotationY ?? Math.PI');
    // both the render state and the movement refs start there
    expect(citySrc).toContain('useRef<[number, number, number]>(initialPosition ?? [0, 0, 16])');
    expect(citySrc).toContain('useRef<number>(initialRotationY ?? Math.PI)');
  });

  test('neither race handler touches storage', () => {
    for (const name of ['handleStartRace', 'handleExitRace']) {
      const body = handlerBody(appSrc, name);
      for (const token of ['saveProfile', 'localStorage', 'sessionStorage', 'clearSavedProfile']) {
        expect(body, `${name} / ${token}`).not.toContain(token);
      }
    }
  });

  test('the race scene itself is read-only', () => {
    for (const token of ['saveProfile', 'localStorage', 'sessionStorage', 'PROFILE_STORAGE_KEY', 'services/storage']) {
      expect(sceneSrc, token).not.toContain(token);
    }
  });

  test('the race scene has no finish-line writer and no rewards', () => {
    for (const token of ['saveProfile', 'gold:', 'fame:', 'xpEarned', 'rewards', 'finishRace']) {
      expect(code(sceneSrc), token).not.toContain(token);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The start line, and the ring it sits inside
// ══════════════════════════════════════════════════════════════════════════

describe('C. The start line', () => {
  const start = CIRCUS_RACE_START;

  test('it is on the arena’s long axis', () => {
    expect(start.x).toBe(CIRCUS_AXIS_X);
    expect(CIRCUS_AXIS_X).toBe(52.34);
  });

  test('it sits inside the closed ring, on the sand side of every wall', () => {
    expect(start.x).toBeGreaterThan(CIRCUS_WEST_X);
    expect(start.x).toBeLessThan(CIRCUS_EAST_X);
    expect(start.z).toBeLessThan(CIRCUS_SOUTH_Z); // north of the carceres line
    expect(start.z).toBeGreaterThan(CIRCUS_NORTH_END_Z); // south of the north tip
    // …and inside the track's own Z band, which starts at the sand's south edge
    expect(start.z).toBeLessThan(CIRCUS_SOUTH_Z);
  });

  test('it is clear of the carceres block and of the interior monument', () => {
    // 3.80 north of the carceres' front face: a start line just off the gates,
    // not inside the block.
    expect(start.z).toBeLessThan(CIRCUS_CARCERES_FRONT_Z - 3);
    // the triumphal arch stands at Z -23.9 … -22.5 on X 49.84 … 54.84
    const insideArchXBand = start.x > CIRCUS_ARCH_WEST_X && start.x < CIRCUS_ARCH_EAST_X;
    const insideArchZBand = start.z > -23.9 && start.z < -22.5;
    expect(insideArchXBand && insideArchZBand).toBe(false);
  });

  test('it stands on the arena floor, facing down the long axis', () => {
    expect(start.y).toBe(0); // the track's top face — the arena floor since C-8.69B
    expect(start.rotationY).toBe(0); // the chariot's pole faces -Z
  });

  test('the ring is unchanged and surrounds the line', () => {
    const ring = CITY_COLLIDERS.filter((collider) => collider.id.startsWith('circus-'));
    expect(ring).toHaveLength(31);
    // every circus collider is pure X/Z: positioning inside the ring changes nothing
    for (const collider of ring) {
      expect(Object.keys(collider).sort()).not.toContain('y');
    }
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('circus-')).length).toBe(31);
    expect(CITY_COLLIDERS).toHaveLength(142);
  });

  test('CONTROL: the pose is not the city’s own spawn', () => {
    // The city hub's own spawn is the town-gate avenue — `[0, 0, 16]` facing π
    // (`CityHubScene`'s `initialPosition ?? [0, 0, 16]` / `initialRotationY ??
    // Math.PI`, which §B pins).  The start line is 52.34 east and 34.34 north of
    // it and faces the other way, so entering the race can never be confused with
    // the city spawn the player returns to.
    expect([start.x, start.y, start.z]).not.toEqual([0, 0, 16]);
    expect(start.rotationY).not.toBe(Math.PI);
    // …and control on the components themselves: the checks above are not vacuous.
    expect(start.x).not.toBe(0);
    expect(start.z).not.toBe(16);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The reused pieces, restated nowhere
// ══════════════════════════════════════════════════════════════════════════

describe('D. Reuse', () => {
  test('the arena is the shipping component, mounted once', () => {
    expect(sceneSrc).toContain("import { EastCircusArena } from './city/EastCircusArena'");
    expect(sceneSrc.split('<EastCircusArena').length - 1).toBe(1);
    // the scene does not restate the arena's transform: the component carries it
    // (checked on the code, not the prose — the header documents that transform)
    expect(code(sceneSrc)).not.toContain('52.34');
    expect(code(sceneSrc)).not.toContain('CIRCUS_ARENA_POSITION');
    expect(arenaSrc).toContain('CIRCUS_ARENA_POSITION');
  });

  test('the chariot is the shipping model, through the shipping constants', () => {
    expect(sceneSrc).toContain("import { CHARIOT_MODEL_SCALE, CHARIOT_MODEL_URL } from '../../utils/chariotGeometry'");
    expect(sceneSrc).toContain('useGLTF(CHARIOT_MODEL_URL)');
    expect(sceneSrc).toContain('CHARIOT_MODEL_SCALE');
    // the path is single-sourced; no literal in the scene's code
    expect(code(sceneSrc)).not.toContain('_workspace_chariot_model_RomanChariot.glb');
    expect(CHARIOT_MODEL_URL).toBe('/_workspace_chariot_model_RomanChariot.glb');
    expect(CHARIOT_MODEL_SCALE).toBe(1);
  });

  test('the loaded chariot scene is cloned, never mutated (the workshop’s rule)', () => {
    expect(sceneSrc).toContain('gltf.scene.clone(true)');
  });

  test('the start line is read from the layout module, not restated', () => {
    // the two layout constants the scene needs — the start line and the camera
    // derived from it — arrive in one import from the layout module
    expect(sceneSrc).toContain(
      "import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from '../../utils/circusDistrictGeometry'"
    );
    expect(sceneSrc).toContain('CIRCUS_RACE_START.x');
    expect(sceneSrc).toContain('CIRCUS_RACE_START.rotationY');
    expect(sceneSrc).not.toContain('CIRCUS_RACE_START:');
  });

  test('the countdown and the clock are the state machine’s own vocabulary', () => {
    expect(sceneSrc).toContain("from '../../utils/raceState'");
    expect(sceneSrc).toContain('getCountdownStep');
    expect(sceneSrc).toContain('markCountdownElapsed');
    expect(sceneSrc).toContain('formatRaceElapsed');
    expect(sceneSrc).toContain('abortRace');
    expect(sceneSrc).toContain("data-race-state={raceState}");
    expect(sceneSrc).toContain('data-race-timer={formatted}');
    expect(sceneSrc).toContain('data-race-action="abort"');
    expect(sceneSrc).toContain('data-race-overlay="countdown"');
    expect(sceneSrc).toContain('{GO_LABEL}');
    expect(GO_LABEL).toBe('GO');
    // the countdown is the machine's three seconds, not a second constant here
    expect(sceneSrc).not.toContain('3000');
    expect(COUNTDOWN_MS).toBe(3000);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Slice boundaries
// ══════════════════════════════════════════════════════════════════════════

describe('E. Slice boundaries', () => {
  test('no dev harness is imported by anything this slice added', () => {
    for (const source of [sceneSrc, appSrc, citySrc, panelSrc]) {
      expect(source.includes('components/dev/')).toBe(false);
    }
  });

  test('no horse and no opponent is mounted in this slice', () => {
    const scene = code(sceneSrc).toLowerCase();
    for (const token of ['_workspace_dist_horse', 'chariotteamformation', 'horses', 'rival', 'opponent']) {
      expect(scene, token).not.toContain(token);
    }
  });

  test('the race scene mounts exactly one Canvas and one camera rig', () => {
    expect(sceneSrc.split('<Canvas\n').length - 1).toBe(1);
    expect(sceneSrc.split('<RaceCameraRig').length - 1).toBe(1);
    expect(sceneSrc.split('<RaceChariot').length - 1).toBe(1);
    expect(sceneSrc.split('<RaceClock').length - 1).toBe(1);
  });

  test('no collider, movement constant or city geometry changed for this slice', () => {
    // both constants this slice added to the layout module are lifted out first —
    // the start line and the camera derived from it — so what remains is the module
    // as the district laid it out before the race existed.
    const withoutRaceBlock = code(load('./circusDistrictGeometry.ts'))
      .replace(/export const CIRCUS_RACE_START[\s\S]*?\} as const;/, '')
      .replace(/export const CIRCUS_RACE_CAMERA[\s\S]*?\} as const;/, '');
    expect(withoutRaceBlock).not.toContain('CIRCUS_RACE_START');
    const withoutRaceStart = code(load('./raceState.ts'));
    expect(withoutRaceStart).not.toContain('CITY_COLLIDERS');
    // the city's own collision files name the race nowhere
    for (const file of ['./collisionShapes.ts', './cityCollisions.ts']) {
      expect(load(file).includes('CIRCUS_RACE_START')).toBe(false);
      expect(load(file).includes('raceState')).toBe(false);
    }
  });

  test('combat, workshop and progression logic are untouched by this slice', () => {
    for (const file of [
      './combatCalculations.ts',
      './chariotLoadout.ts',
      './racingProgression.ts',
      './chariotTeamFormation.ts',
    ]) {
      const source = load(file);
      expect(source.includes('raceState'), file).toBe(false);
      expect(source.includes('RaceScene'), file).toBe(false);
    }
  });
});
