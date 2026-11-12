// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const scene = readFileSync('src/components/3d/TavernInterior.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const city = readFileSync('src/components/3d/city/CityHubScene.tsx', 'utf8');

describe('immersive Roman tavern scene', () => {
  test('the tavern is a separate, lazy-loaded full-screen scene', () => {
    expect(app).toContain("const TavernInterior = React.lazy(() => import('./components/3d/TavernInterior').then((m) => ({ default: m.TavernInterior })));");
    expect(app).toContain("const ForgeInterior = React.lazy(() => import('./components/3d/ForgeInterior').then((m) => ({ default: m.ForgeInterior })));");
    expect(app).toContain("const BountyHallInterior = React.lazy(() => import('./components/3d/BountyHallInterior').then((m) => ({ default: m.BountyHallInterior })));");
    expect(app).toContain('{currentScreen === \'city_3d\' && bountyHallOpen && (");
    expect(app).toContain("{currentScreen === 'city_3d' && tavernOpen && (');
    expect(app).toContain('movementLocked={!!oathBeatMode || tavernOpen || colosseumOpen || forgeOpen || bountyHallOpen}');
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
    expect(scene).toContain('onClick={onExit}');
  });

  test('patron silhouettes include floor-reaching legs and both arms', () => {
    expect(scene).toContain('position={[x, 0.28, 0.04]}');
    expect(scene).toContain('capsuleGeometry args={[0.105, 0.34, 3, 6]}');
    expect(scene).toContain('side * 0.29');
    expect(scene).toContain('side * -0.7');
  });
});
