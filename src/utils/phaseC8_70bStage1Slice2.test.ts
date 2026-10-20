/**
 * Phase C-8.70B Stage 1, Slice 2 — driving: movement, controls and the chase camera.
 *
 * Run with: bun test src/utils/phaseC8_70bStage1Slice2.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the scene drives the PURE movement module, at its fixed timestep, and
 *      integrates ONLY while the machine is in `racing`;
 *   §B the model's forward axis and the zero yaw offset the driving applies;
 *   §C both input paths (keyboard and touch) feed the SAME throttle/steer values;
 *   §D the HUD: a gait word and a labelled pace bar, never bare speed digits, with
 *      Slice 1's mm:ss.t clock untouched;
 *   §E the touch controls: two corner clusters, every control visible and
 *      labelled, Lefty Mode mirroring the WHOLE cluster, and the first race's
 *      fading labels — session-scoped, never saved;
 *   §F Clean Start composes with Slice 1 as a `racing`-state MODIFIER: no new
 *      state and no new transition;
 *   §G the scope guard: nothing in this slice writes a save, moves a collider or
 *      reaches combat, workshop or progression code.
 *
 * The suite reads the shipped sources, and imports the constants it asserts from
 * the modules that own them, so nothing here restates a number that could drift.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CHARIOT_MOVEMENT, CHARIOT_MODEL_FORWARD, CHARIOT_MODEL_YAW_OFFSET } from './chariotMovement';
import { RACE_STATES } from './raceState';
import { CITY_COLLIDERS } from './collisionShapes';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const sceneSrc = load('../components/3d/RaceScene.tsx');
const controlsSrc = load('../components/ui/RaceTouchControls.tsx');
const panelSrc = load('../components/hub/PreRacePanel.tsx');
const appSrc = load('../App.tsx');
const movementSrc = load('./chariotMovement.ts');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const sceneCode = code(sceneSrc);
const controlsCode = code(controlsSrc);

// ══════════════════════════════════════════════════════════════════════════
// A. The scene drives the pure module, only while racing
// ══════════════════════════════════════════════════════════════════════════

describe('A. The scene drives the pure movement module', () => {
  test('the movement is the module’s, not the scene’s own arithmetic', () => {
    expect(sceneSrc).toContain("from '../../utils/chariotMovement'");
    for (const member of ['advanceChariot', 'createChariotMotion', 'mergeChariotInputs', 'trackChariotLaunch', 'launchAccelScale', 'getChariotGait', 'getChariotPace']) {
      expect(sceneSrc, member).toContain(member);
    }
    // the scene does no physics of its own: no speed/heading maths on the motion
    expect(sceneCode).not.toContain('motion.speed +=');
    expect(sceneCode).not.toContain('motion.heading +=');
    expect(sceneCode).not.toContain('motion.x +=');
    expect(sceneCode).not.toContain('motion.z +=');
  });

  test('integration is gated on `racing` alone', () => {
    expect(sceneCode).toContain("const racing = raceState === 'racing'");
    expect(sceneCode).toContain('if (racing) {');
    const gate = sceneCode.indexOf('if (racing) {');
    const call = sceneCode.indexOf('advanceChariot(');
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
    // the camera follows in `racing` only, too
    expect(sceneCode).toContain("if (raceState !== 'racing') return;");
  });

  test('the frame delta is the module’s to clamp, and the accumulator is not the scene’s', () => {
    expect(sceneCode).toContain('advanceChariot(motion, input, delta, launchAccelScale(launch, elapsedSinceGoMs))');
    expect(CHARIOT_MOVEMENT.maxFrameDt).toBe(0.1);
    expect(movementSrc).toContain('maxFrameDt');
    expect(sceneCode).not.toContain('accumulator +=');
  });

  test('the motion, the inputs and the launch state are created once, not per frame', () => {
    expect(sceneCode.split('createChariotMotion(').length - 1).toBe(1);
    expect(sceneCode).toContain('useState(createChariotLaunchState)');
    expect(sceneCode.split('useState(createChariotLaunchState)').length - 1).toBe(1);
    // never re-created: the state initializer is the only place the factory runs
    expect(sceneCode).not.toContain('= createChariotLaunchState()');
    expect(sceneCode).toContain('useState(() =>');
    expect(sceneCode).toContain('useState<ChariotInput>(() => ({ throttle: 0, steer: 0 }))');
    const frame = sceneCode.slice(sceneCode.indexOf('useFrame((_state, delta) => {'));
    expect(frame.slice(0, frame.indexOf('});'))).not.toContain('createChariotMotion');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The model's own forward axis
// ══════════════════════════════════════════════════════════════════════════

describe('B. The axis the driving aligns to', () => {
  test('the model faces local −Z and the yaw offset is zero', () => {
    expect(CHARIOT_MODEL_FORWARD).toBe('-Z');
    expect(CHARIOT_MODEL_YAW_OFFSET).toBe(0);
    // the nose probe sits on the yoke's own centre line (chariotTeamFormation's
    // CHARIOT_YOKE_LINE_Z, −2.020) so it covers the yoke bar and the pole tip
    expect(CHARIOT_MOVEMENT.noseForward).toBeCloseTo(2.02, 9);
    expect(CHARIOT_MOVEMENT.noseRadius).toBeGreaterThan(0.65);
    expect(CHARIOT_MOVEMENT.bodyRadius).toBeGreaterThan(1.032);
  });

  test('the scene applies heading plus that offset to the model', () => {
    expect(sceneCode).toContain('chassis.rotation.y = motion.heading + CHARIOT_MODEL_YAW_OFFSET');
    expect(sceneCode).toContain('chassis.position.set(motion.x, RACE_START_POSITION[1], motion.z)');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Both input paths, one pair of values
// ══════════════════════════════════════════════════════════════════════════

describe('C. The two input paths', () => {
  test('the keyboard map covers throttle, brake and both steer directions', () => {
    for (const key of ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight']) {
      expect(sceneCode, key).toContain(key);
    }
    expect(sceneCode).toContain("KeyW: 'forward'");
    expect(sceneCode).toContain("KeyS: 'backward'");
    expect(sceneCode).toContain("KeyA: 'left'");
    expect(sceneCode).toContain("KeyD: 'right'");
  });

  test('the keyboard path writes its own object and the merge happens per frame', () => {
    expect(sceneCode).toContain('keyboardInput.throttle');
    expect(sceneCode).toContain('keyboardInput.steer');
    expect(sceneCode).toContain('mergeChariotInputs(input, keyboardInput, touchInput)');
  });

  test('a lost focus releases every key, so a tab switch cannot hold the throttle', () => {
    expect(sceneCode).toContain("window.addEventListener('blur', releaseAll)");
    expect(sceneCode).toContain('heldKeys.clear()');
  });

  test('the touch controls write the same two fields', () => {
    expect(controlsSrc).toContain('input.throttle = value');
    expect(controlsSrc).toContain('input.steer = value');
    expect(controlsCode).toContain('input.throttle = 0');
    expect(controlsCode).toContain('input.steer = 0');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The HUD
// ══════════════════════════════════════════════════════════════════════════

describe('D. The racing HUD', () => {
  test('speed reads as a gait word beside a labelled pace bar', () => {
    expect(sceneSrc).toContain('data-race-gait={gait}');
    expect(sceneSrc).toContain('data-race-pace={pace.toFixed(2)}');
    expect(sceneSrc).toContain('getChariotGait(readout.speed)');
    expect(sceneSrc).toContain('getChariotPace(readout.speed)');
    expect(sceneSrc).toContain('>Pace<');
  });

  test('no bare speed digits are rendered anywhere', () => {
    for (const token of ['{readout.speed}', '{motion.speed}', 'speed.toFixed', '{pace}']) {
      expect(sceneCode, token).not.toContain(token);
    }
  });

  test('the race clock stays Slice 1’s mm:ss.t, and the gait readout does not touch it', () => {
    expect(sceneSrc).toContain('formatRaceElapsed(elapsedMs)');
    expect(sceneSrc).toContain('data-race-timer={formatted}');
    expect(sceneSrc).toContain('startedAt={raceStartedAt}');
    expect(sceneCode).toContain('performance.now() - startedAt');
  });

  test('the Abort control is out of the thumbs’ corners, and still live in both states', () => {
    const abortAt = sceneCode.indexOf('data-race-action="abort"');
    expect(abortAt).toBeGreaterThan(-1);
    expect(sceneCode).toContain('isRaceRunning(raceState) &&');
    // the HUD block the abort sits in is the TOP of the screen
    const hud = sceneCode.slice(sceneCode.indexOf('z-30 flex items-start justify-between'), abortAt);
    expect(hud.length).toBeGreaterThan(0);
    expect(hud).not.toContain('bottom-0');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The touch controls
// ══════════════════════════════════════════════════════════════════════════

describe('E. The touch controls', () => {
  test('they are the two corner clusters, mounted once', () => {
    expect(sceneSrc).toContain("import { RaceTouchControls } from '../ui/RaceTouchControls'");
    expect(sceneCode.split('<RaceTouchControls').length - 1).toBe(1);
    expect(controlsCode).toContain('flex items-end justify-between');
    expect(controlsCode).toContain('absolute inset-0 pointer-events-none');
  });

  test('every control is visible, labelled and named — no invisible gesture zone', () => {
    for (const control of ['steer-left', 'steer-right', 'throttle', 'brake']) {
      expect(controlsCode, control).toContain(`control="${control}"`);
    }
    for (const label of ['LEFT', 'RIGHT', 'THROTTLE', 'BRAKE']) {
      expect(controlsSrc, label).toContain(label);
    }
    // a slider idiom does not exist in this project's TouchControls, so the
    // throttle is a hold-to-run button pair — not a range input
    expect(controlsCode).not.toContain('type="range"');
  });

  test('the hold idiom is the shipped TouchControls’ Block-button idiom', () => {
    for (const handler of ['onTouchStart', 'onTouchEnd', 'onTouchCancel', 'onMouseDown', 'onMouseUp', 'onMouseLeave']) {
      expect(controlsCode, handler).toContain(handler);
    }
    expect(controlsCode).toContain('event.preventDefault()');
    expect(controlsCode).toContain('touch-manipulation');
  });

  test('Lefty Mode mirrors the whole cluster, as one unit', () => {
    expect(controlsCode).toContain("const mirror = isLeftyMode ? 'flex-row-reverse' : ''");
    expect(controlsSrc).toContain('data-race-controls={isLeftyMode ? \'lefty\' : \'righty\'}');
    // the mirror is applied to the row that holds the clusters AND to each cluster
    expect(controlsCode.split('${mirror}').length - 1).toBe(3);
    expect(sceneSrc).toContain('isLeftyMode={isLeftyMode}');
    // Rebased by C-8.70B SET-1 (the settings slice): the race screen now also
    // receives its own settings entry and the panel's freeze flag, so the mount is
    // written across several lines.  The property this pins — the screen is mounted
    // with its abort handler and its handedness — is unchanged, and the mount count
    // below is still exactly one.
    expect(appSrc).toContain('onAbort={handleExitRace}');
    expect(appSrc).toContain('isLeftyMode={isLeftyMode}');
    expect(appSrc).toContain('frozen={settingsOpen}');
  });

  test('the first race of a session teaches on the controls, and nothing is saved', () => {
    expect(sceneCode).toContain('let hasRacedThisSession = false');
    expect(sceneCode).toContain('useState(!hasRacedThisSession)');
    expect(sceneCode).toContain('hasRacedThisSession = true');
    expect(controlsSrc).toContain('data-race-hint={control}');
    expect(controlsSrc).toContain('transition-opacity duration-700');
    expect(controlsCode).toContain('showHints');
  });

  test('the visible rev state rides on the throttle control', () => {
    expect(controlsCode).toContain("data-race-rev={rev ? 'true' : 'false'}");
    expect(controlsSrc).toContain("revving ? 'REV' : 'THROTTLE'");
    expect(sceneSrc).toContain("data-race-rev={revving ? 'true' : 'false'}");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Clean Start, and Slice 1's machine
// ══════════════════════════════════════════════════════════════════════════

describe('F. Clean Start is a modifier, not a state', () => {
  test('the machine still has exactly its five states and knows nothing of a launch', () => {
    expect(RACE_STATES).toEqual(['idle', 'countdown', 'racing', 'finished', 'aborted']);
    expect(code(load('./raceState.ts'))).not.toContain('launch');
    expect(sceneCode).not.toContain('finishRace');
  });

  test('the scene dispatches only Slice 1’s own three events', () => {
    for (const call of ['startRace(state)', 'markCountdownElapsed(state)', 'abortRace(state)']) {
      expect(sceneSrc, call).toContain(call);
    }
  });

  test('the launch reaches the physics only as an acceleration multiplier', () => {
    expect(sceneSrc).toContain('launchAccelScale(launch, elapsedSinceGoMs)');
    expect(sceneSrc).toContain('trackChariotLaunch(launch, input.throttle, racing, elapsedSinceGoMs)');
    expect(movementSrc).toContain('export function launchAccelScale');
    expect(CHARIOT_MOVEMENT.launch.cleanBoost).toBeGreaterThan(1);
    expect(CHARIOT_MOVEMENT.launch.boggedFactor).toBeLessThan(1);
  });

  test('the launch is announced through the HUD, and only while racing', () => {
    expect(sceneSrc).toContain('data-race-launch={launchQuality}');
    expect(sceneCode).toContain("raceState === 'racing' && launchQuality !== null");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Scope
// ══════════════════════════════════════════════════════════════════════════

describe('G. Scope', () => {
  test('nothing in this slice reads or writes a save', () => {
    for (const source of [sceneSrc, controlsSrc, panelSrc, movementSrc]) {
      for (const token of ['saveProfile', 'loadSavedProfile', 'localStorage', 'sessionStorage', 'PROFILE_STORAGE_KEY', 'services/storage']) {
        expect(source.includes(token), token).toBe(false);
      }
    }
  });

  test('no collider, movement constant in the city, or city geometry changed', () => {
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('circus-')).length).toBe(31);
    expect(CITY_COLLIDERS).toHaveLength(142);
    for (const file of ['./collisionShapes.ts', './cityCollisions.ts']) {
      const source = load(file);
      expect(source.includes('chariotMovement')).toBe(false);
      expect(source.includes('RaceScene')).toBe(false);
    }
  });

  test('combat, workshop, progression and the team plan are untouched consumers', () => {
    for (const file of ['./combatCalculations.ts', './chariotLoadout.ts', './racingProgression.ts', './chariotTeamFormation.ts']) {
      const source = load(file);
      expect(source.includes('chariotMovement'), file).toBe(false);
      expect(source.includes('RaceScene'), file).toBe(false);
    }
  });

  test('the dev harnesses stay out of production code', () => {
    for (const source of [sceneSrc, controlsSrc, panelSrc, appSrc, movementSrc]) {
      expect(source.includes('components/dev/')).toBe(false);
    }
  });

  test('the driving harness is dev-only, dynamically imported, and never in production code', () => {
    const mainSrc = load('../main.tsx');
    expect(mainSrc).toContain('const useRaceHarness');
    expect(mainSrc).toContain('import.meta.env.DEV &&');
    expect(mainSrc).toContain("get('devHarness') === 'race'");
    expect(mainSrc).toContain("readDevHarnessFlag() === 'race'");
    // dynamic only: a static import of the harness would land in the main chunk
    expect(mainSrc).toContain("void import('./components/dev/RaceHarness')");
    expect(mainSrc).not.toContain("import { RaceHarness } from");
    // and it is the last branch before <App />, which is still the final else.
    // Read comment-stripped: the header *prose* mentions `<App />` long before the
    // real mount, and prose must not be able to satisfy — or defeat — the ordering.
    const mainCode = code(mainSrc);
    expect(mainCode.indexOf('} else if (useRaceHarness) {')).toBeLessThan(mainCode.indexOf('<App />'));

    const harnessSrc = load('../components/dev/RaceHarness.tsx');
    expect(harnessSrc).toContain('import.meta.env.DEV');
    expect(harnessSrc).toContain('RaceScene');
    for (const token of ['saveProfile', 'localStorage', 'sessionStorage', 'PROFILE_STORAGE_KEY']) {
      expect(harnessSrc.includes(token), token).toBe(false);
    }
  });

  test('the pre-race panel carries the controls diagram', () => {
    expect(panelSrc).toContain('data-race-field="controls"');
    expect(panelSrc).toContain('How to drive');
    for (const token of ['Throttle', 'Brake', 'Steer', 'Clean start', 'Abort']) {
      expect(panelSrc, token).toContain(token);
    }
    expect(panelSrc).not.toContain('setNotice');
  });
});
