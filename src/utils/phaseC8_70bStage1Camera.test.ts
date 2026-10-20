/**
 * phaseC8_70bStage1Camera.test.ts — the chase camera at the surveyed standard
 * (the camera addendum to Phase C-8.70B Stage 1, Slice 2).
 *
 * Run with: bun test src/utils/phaseC8_70bStage1Camera.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the rig drives the standard rather than restating it: the composed pose,
 *      the speed-coupled FOV and the follow smoothing all come from
 *      `utils/chaseCamera.ts`;
 *   §B the FOV actually reaches the camera — set on the frame, the projection
 *      matrix rebuilt only when it moves, and the rest FOV restored whenever the
 *      race is not `racing`;
 *   §C the preset's attachment point: one optional prop, one resolver, one settings
 *      row (C-8.70B SET-1 landed the row this addendum pre-arranged);
 *   §D the start composition is the layout module's, never a literal in the
 *      scene, and the camera constants are not restated in the rig;
 *   §E the frame loop still allocates nothing;
 *   §F the scope guard: the movement module keeps its physics and loses only the
 *      camera, no save is written, no collider or city geometry moves, and the
 *      project's other 3D screens keep their own FOVs.
 *
 * The suite reads the shipped sources and imports the constants it asserts from
 * the modules that own them, so nothing here restates a number that could drift.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CHARIOT_CHASE_CAMERA, CHASE_DISTANCE_PRESET_DEFAULT } from './chaseCamera';
import { CHARIOT_MOVEMENT } from './chariotMovement';
import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from './circusDistrictGeometry';
import { CITY_COLLIDERS } from './collisionShapes';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const sceneSrc = load('../components/3d/RaceScene.tsx');
const cameraSrc = load('./chaseCamera.ts');
const movementSrc = load('./chariotMovement.ts');
const appSrc = load('../App.tsx');
const duelSrc = load('../components/duel/DuelScene.tsx');
const hubSrc = load('../components/3d/city/CityHubScene.tsx');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const sceneCode = code(sceneSrc);
const cameraCode = code(cameraSrc);
const movementCode = code(movementSrc);

// ══════════════════════════════════════════════════════════════════════════
// A. The rig drives the standard
// ══════════════════════════════════════════════════════════════════════════

describe('A. The chase rig reads the surveyed standard', () => {
  test('the scene imports the camera module and the scene does no camera maths of its own', () => {
    expect(sceneSrc).toContain("from '../../utils/chaseCamera'");
    for (const member of [
      'CHARIOT_CHASE_CAMERA',
      'chaseFovForSpeed',
      'composeChasePose',
      'createChasePose',
      'resolveChaseDistancePreset',
    ]) {
      expect(sceneSrc, member).toContain(member);
    }
    // no `chaseDistance` maths and no FOV curve in the scene: both are the module's
    expect(sceneCode).not.toContain('fovAtFullSpeed');
    expect(sceneCode).not.toContain('lookAheadPerSpeed');
    expect(sceneCode).not.toContain('smoothStep');
  });

  test('the desired pose is composed from the motion, the steering input and the preset', () => {
    expect(sceneCode).toContain('composeChasePose(pose.current, motion, input.steer, preset)');
    // the steering comes from the SAME merged input the movement module is driven
    // with, so the lean and the turn cannot disagree
    expect(sceneCode).toContain('mergeChariotInputs(input, keyboardInput, touchInput)');
  });

  test('the rig still follows only while `racing`, with Slice 2’s frame-based smoothing', () => {
    expect(sceneCode).toContain("if (raceState !== 'racing') return;");
    expect(sceneCode).toContain('const alpha = 1 - Math.exp(-CHARIOT_CHASE_CAMERA.followRate * dt);');
    expect(sceneCode).toContain('Math.min(delta, CHARIOT_MOVEMENT.maxFrameDt)');
    expect(CHARIOT_CHASE_CAMERA.followRate).toBe(5);
  });

  test('the look-ahead and the rest framing are the module’s, and the scene holds the preset', () => {
    expect(sceneCode).toContain('useRef(createChasePose())');
    expect(sceneCode).toContain('preset: ChaseDistancePreset;');
    expect(sceneSrc).toContain('const desired = composeChasePose(');
    expect(cameraCode).toContain('export function composeChasePose(');
    expect(cameraCode).toContain('export function chaseLookAhead(');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The FOV reaches the camera
// ══════════════════════════════════════════════════════════════════════════

describe('B. The FOV is the survey’s, on the running camera', () => {
  test('the Canvas starts at the rest FOV rather than a literal of its own', () => {
    expect(sceneSrc).toContain('fov: CHARIOT_CHASE_CAMERA.fovAtRest');
    expect(sceneCode).not.toContain('fov: 50');
    expect(CHARIOT_CHASE_CAMERA.fovAtRest).toBe(55);
  });

  test('the frame sets the FOV from the speed and rebuilds the projection only when it moves', () => {
    expect(sceneCode).toContain('const fov = chaseFovForSpeed(motion.speed);');
    expect(sceneCode).toContain('camera.fov = fov;');
    expect(sceneCode).toContain('camera.updateProjectionMatrix();');
    expect(sceneCode).toContain('if (fov !== camera.fov) {');
  });

  test('a state that is not `racing` restores the static camera at the rest FOV', () => {
    const reset = sceneCode.slice(sceneCode.indexOf("if (raceState === 'racing') return;"));
    expect(reset).toContain('camera.fov = CHARIOT_CHASE_CAMERA.fovAtRest;');
    expect(reset).toContain('camera.updateProjectionMatrix();');
    expect(reset).toContain('RACE_CAMERA_POSITION');
  });

  test('the rig adds nothing to the scene: no geometry, no draw call, no allocation', () => {
    const rig = sceneCode.slice(
      sceneCode.indexOf('const RaceCameraRig'),
      sceneCode.indexOf('};', sceneCode.indexOf('return null;'))
    );
    expect(rig).toContain('return null;');
    for (const token of ['new THREE.', 'new ', 'clone(', 'geometry', 'material', '<mesh', '<group']) {
      expect(rig, token).not.toContain(token);
    }
    // exactly one camera rig is mounted, and nothing was added beside it
    expect(sceneSrc.split('<RaceCameraRig').length - 1).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The preset's attachment point
// ══════════════════════════════════════════════════════════════════════════

describe('C. One prop, one resolver, one settings row (rebased by C-8.70B SET-1)', () => {
  test('the scene takes the preset as an optional prop and resolves it', () => {
    expect(sceneCode).toContain('chaseDistancePreset?: ChaseDistancePreset;');
    expect(sceneCode).toContain('resolveChaseDistancePreset(chaseDistancePreset)');
    expect(CHASE_DISTANCE_PRESET_DEFAULT).toBe('standard');
  });

  // C-8.70B SET-1 landed the settings row this addendum pre-arranged, so App is now
  // the ONE caller and it passes the stored value.  The two properties this section
  // was written for are unchanged: the prop is still optional (the config default
  // still covers a caller that passes nothing) and the module is still the resolver.
  test('App is the one caller, and what it passes is the settings record value', () => {
    expect(appSrc).toContain('chaseDistancePreset={settings.raceCamDistance}');
    // the dev harness still passes nothing, so the default path stays exercised
    expect(load('../components/dev/RaceHarness.tsx')).not.toContain('ChaseDistancePreset');
    // and the scene adds no default of its own
    expect(sceneCode).not.toContain("chaseDistancePreset = 'standard'");
  });

  test('the resolver is the module own, and nothing else reads the config', () => {
    expect(cameraSrc).toContain('export function resolveChaseDistancePreset(');
    expect(sceneCode).not.toContain('CHASE_DISTANCE_PRESETS');
    expect(cameraCode).toContain('CHASE_DISTANCE_PRESETS');
    // the row that offers the presets is the settings panel's, and the rig reaches the
    // preset through the prop - the race scene still reads no settings module itself.
    const modal = load('../components/hub/SettingsModal.tsx');
    expect(modal).toContain('label="Race Camera Distance"');
    expect(modal).toContain('onChange={(raceCamDistance) => set({ raceCamDistance })}');
    expect(sceneCode).not.toContain('services/settings');
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe('D. Nothing is restated in the scene', () => {
  test('the start line, the static pose and the rest offsets are read, not typed in', () => {
    expect(sceneSrc).toContain(
      "import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from '../../utils/circusDistrictGeometry'"
    );
    for (const literal of ['3.66', '8.5', '7.5', '6.6', '52.34', '2.18']) {
      expect(sceneCode, literal).not.toContain(literal);
    }
    expect(cameraSrc).toContain('CIRCUS_RACE_CAMERA.position[0] - CIRCUS_RACE_START.x');
    expect(cameraCode).toContain('CHASE_REST_FRAMING');
  });

  test('the movement module owns no camera constant at all', () => {
    for (const token of ['CHARIOT_CHASE_CAMERA', 'fovAtRest', 'steerLookBias', 'speedFraction', 'lookAhead']) {
      expect(movementCode, token).not.toContain(token);
    }
    expect(cameraCode).toContain('export const CHARIOT_CHASE_CAMERA');
  });

  test('the rest framing is Slice 1’s measured pose', () => {
    // the module derives it; the pose itself is still the layout module's
    expect(CIRCUS_RACE_CAMERA.position[0] - CIRCUS_RACE_START.x).toBeCloseTo(3.66, 12);
    expect(CIRCUS_RACE_START.z - CIRCUS_RACE_CAMERA.position[2]).toBeCloseTo(8.5, 12);
    expect(CIRCUS_RACE_CAMERA.position[1]).toBeCloseTo(3.4, 12);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The frame loop allocates nothing
// ══════════════════════════════════════════════════════════════════════════

describe('E. No per-frame allocation was added', () => {
  test('the desired pose is created once and reused', () => {
    expect(sceneCode.split('createChasePose()').length - 1).toBe(1);
    expect(sceneCode).toContain('const pose = useRef(createChasePose());');
  });

  test('the frame body composes into that object and reads its fields', () => {
    const frame = sceneCode.slice(sceneCode.indexOf('useFrame((_state, delta) => {'));
    const body = frame.slice(0, frame.indexOf('});'));
    expect(body).toContain('const desired = composeChasePose(pose.current, motion, input.steer, preset);');
    for (const field of ['desired.x', 'desired.y', 'desired.z', 'desired.lookX', 'desired.lookY', 'desired.lookZ']) {
      expect(body, field).toContain(field);
    }
    // the FOV is a number, not an object
    expect(body).toContain('const fov = chaseFovForSpeed(motion.speed);');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Scope
// ══════════════════════════════════════════════════════════════════════════

describe('F. Scope: the camera, and nothing else', () => {
  test('the movement module keeps its physics and loses only the camera', () => {
    expect(CHARIOT_MOVEMENT.maxSpeed).toBe(13);
    expect(CHARIOT_MOVEMENT.maxReverseSpeed).toBe(3.2);
    expect(CHARIOT_MOVEMENT.acceleration).toBe(6.5);
    expect(CHARIOT_MOVEMENT.fixedDt).toBeCloseTo(1 / 60, 12);
    expect(CHARIOT_MOVEMENT.maxFrameDt).toBe(0.1);
    expect(CHARIOT_MOVEMENT.bodyRadius).toBe(1.05);
    expect(CHARIOT_MOVEMENT.noseForward).toBeCloseTo(2.02, 9);
    expect(movementCode).toContain('export function stepChariot(');
    expect(movementCode).toContain('export function advanceChariot(');
  });

  test('nothing in this addendum writes a save', () => {
    for (const source of [sceneSrc, cameraSrc, sceneCode, cameraCode]) {
      for (const token of ['saveProfile', 'loadSavedProfile', 'localStorage', 'sessionStorage', 'services/storage']) {
        expect(source.includes(token), token).toBe(false);
      }
    }
  });

  test('no collider, city mesh or movement boundary moved', () => {
    expect(CITY_COLLIDERS.filter((collider) => collider.id.startsWith('circus-'))).toHaveLength(31);
    expect(CITY_COLLIDERS).toHaveLength(142);
    for (const file of ['./collisionShapes.ts', './cityCollisions.ts']) {
      const source = load(file);
      expect(source.includes('chaseCamera')).toBe(false);
      expect(source.includes('CHASE_DISTANCE')).toBe(false);
    }
    expect(CIRCUS_RACE_START.z).toBe(42.5);
    expect(CIRCUS_RACE_START.rotationY).toBe(0);
  });

  test('the project’s other 3D screens keep their own FOVs', () => {
    expect(duelSrc).toContain('fov: 45');
    expect(hubSrc).toContain('fov: 58');
    expect(cameraSrc).not.toContain('DuelScene');
    expect(cameraSrc).not.toContain('CityHubScene');
  });
});
