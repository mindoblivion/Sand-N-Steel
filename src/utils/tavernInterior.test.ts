// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  clampToTavernFloor,
  isTavernExit,
  nearestTavernStation,
  TAVERN_FLOOR_HALF_X,
  TAVERN_FLOOR_MAX_Z,
  TAVERN_FLOOR_MIN_Z,
  TAVERN_SPAWN_X,
  TAVERN_SPAWN_Z,
  TAVERN_STATIONS,
} from '../components/3d/TavernInterior';

const scene = readFileSync('src/components/3d/TavernInterior.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const city = readFileSync('src/components/3d/city/CityHubScene.tsx', 'utf8');

describe('immersive Roman tavern scene', () => {
  test('the tavern is a separate, lazy-loaded full-screen scene', () => {
    expect(app).toContain("const TavernInterior = React.lazy(() => import('./components/3d/TavernInterior').then((m) => ({ default: m.TavernInterior })));");
    expect(app).toContain("const ForgeInterior = React.lazy(() => import('./components/3d/ForgeInterior').then((m) => ({ default: m.ForgeInterior })));");
    expect(app).toContain("const BountyHallInterior = React.lazy(() => import('./components/3d/BountyHallInterior').then((m) => ({ default: m.BountyHallInterior })));" );
    expect(app).toContain("const BathhouseInterior = React.lazy(() => import('./components/3d/BathhouseInterior').then((m) => ({ default: m.BathhouseInterior })));" );
    expect(app).toContain("{currentScreen === 'city_3d' && bountyHallOpen && (");
    expect(app).toContain("{currentScreen === 'city_3d' && bathhouseOpen && (")
    expect(app).toContain('{currentScreen === \'city_3d\' && tavernOpen && (');
    expect(app).toContain('movementLocked={!!oathBeatMode || tavernOpen || colosseumOpen || forgeOpen || bountyHallOpen || bathhouseOpen || academyOpen}');
    expect(app).toContain("const GladiatorAcademyInterior = React.lazy(() => import('./components/3d/GladiatorAcademyInterior').then((m) => ({ default: m.GladiatorAcademyInterior })));");
    expect(app).toContain("{currentScreen === 'city_3d' && academyOpen && (");
    expect(app).toContain('<TavernInterior onExit={() => setTavernOpen(false)}');
    expect(city).toContain("onEnterTavern(() => {");
  });

  test('warm multi-source lighting keeps the interior readable', () => {
    expect(scene).toContain('<ambientLight intensity={0.75} color="#ffdfb2" />');
    expect(scene).toContain('<hemisphereLight');
    expect(scene).toContain('<directionalLight');
    expect(scene).toContain('<pointLight');
    expect(scene).toContain('toneMappingExposure = 1.22');
    expect(scene).toContain('dpr={[1, 1.5]}');
    expect(scene).toContain("powerPreference: 'low-power'");
  });

  test('the room keeps its Roman tavern dressing and readable exit/service controls', () => {
    for (const feature of ['TimberBeam', 'Amphora', 'TavernTable', 'Bench', 'WallTorch', 'DrinkingCup', 'The Bronze Cup']) {
      expect(scene).toContain(feature);
    }
    expect(scene).toContain('aria-label="Talk to the tavern keeper"');
    expect(scene).toContain('aria-label="Leave tavern and return to the city"');
    expect(scene).toContain('onClick={onOpenServices}');
    expect(scene).toContain('onClick={() => setTimeout(onExit, 0)}');
  });

  test('patron silhouettes include floor-reaching legs and both arms', () => {
    expect(scene).toContain('position={[x, 0.28, 0.04]}');
    expect(scene).toContain('capsuleGeometry args={[0.105, 0.34, 3, 6]}');
    expect(scene).toContain('side * 0.29');
    expect(scene).toContain('side * -0.7');
  });

  test('the roof is raised so there is room to look around', () => {
    expect(scene).toContain('boxGeometry args={[15, 6, 0.35]}');
    expect(scene).toContain('boxGeometry args={[0.35, 6, 16]}');
    expect(scene).toContain('position={[0, 5.85, z]}');
    expect(scene).toContain('position={[x, 5.65, 0]}');
  });

  test('the bronze rims lie flat instead of standing upright', () => {
    expect(scene).toContain('position={[0, 0.91, 0]} rotation={[Math.PI / 2, 0, 0]}');
    expect(scene).toContain('position={[0, 0.605, 0]} rotation={[Math.PI / 2, 0, 0]}');
    expect(scene).toContain('position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}');
    expect(scene).toContain('position={[0, 1.62, 0.015]} rotation={[Math.PI / 2, 0, 0]}');
  });

  test('the player walks the tavern like the city, with a joystick and stations', () => {
    expect(scene).not.toContain('OrbitControls');
    expect(scene).toContain('TavernPlayerRig');
    expect(scene).toContain('clampToTavernFloor');
    expect(scene).toContain('nearestTavernStation');
    expect(scene).toContain('applyDeadZone');
    expect(scene).toContain('aria-label="Move"');
    expect(scene).toContain('walk back through the door to leave');
  });
});

describe('tavern floor math', () => {
  test('the floor clamp keeps the player inside the room', () => {
    expect(clampToTavernFloor(0, 0)).toEqual([0, 0]);
    expect(clampToTavernFloor(99, -99)).toEqual([TAVERN_FLOOR_HALF_X, TAVERN_FLOOR_MIN_Z]);
    expect(clampToTavernFloor(-99, 99)).toEqual([-TAVERN_FLOOR_HALF_X, TAVERN_FLOOR_MAX_Z]);
  });

  test('the spawn sits on open floor inside the room', () => {
    const [cx, cz] = clampToTavernFloor(TAVERN_SPAWN_X, TAVERN_SPAWN_Z);
    expect(cx).toBe(TAVERN_SPAWN_X);
    expect(cz).toBe(TAVERN_SPAWN_Z);
  });

  test('tables and the counter push the player out instead of letting them walk through', () => {
    const [tx, tz] = clampToTavernFloor(-3.3, -2.1);
    expect(Math.hypot(tx - -3.3, tz - -2.1)).toBeCloseTo(1.5, 5);
    expect(clampToTavernFloor(0, -6.7)).toEqual([0, -5.95]);
  });

  test('the door exit is the south doorway only', () => {
    expect(isTavernExit(0, TAVERN_FLOOR_MAX_Z)).toBe(true);
    expect(isTavernExit(1.6, TAVERN_FLOOR_MAX_Z)).toBe(true);
    expect(isTavernExit(2, TAVERN_FLOOR_MAX_Z)).toBe(false);
    expect(isTavernExit(0, TAVERN_FLOOR_MAX_Z - 0.5)).toBe(false);
    expect(isTavernExit(0, 0)).toBe(false);
  });

  test('every station resolves at its own position and open floor has none', () => {
    for (const s of TAVERN_STATIONS) {
      expect(nearestTavernStation(s.x, s.z)?.id).toBe(s.id);
    }
    expect(nearestTavernStation(5, 4)).toBeNull();
    expect(nearestTavernStation(TAVERN_SPAWN_X, TAVERN_SPAWN_Z)).toBeNull();
  });
});
