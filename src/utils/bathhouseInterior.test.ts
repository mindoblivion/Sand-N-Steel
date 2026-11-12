/**
 * ===========================================================================
 * BATHHOUSE INTERIOR — the scene pins
 * ===========================================================================
 * The wiring pins for the slice, one section per claim:
 *
 *   §A the FLOOR — the thermae's four rooms, spawn, exit, and stations, all
 *      DOM-free math on the component, mirroring the forge/bounty pattern;
 *   §B STRATON — read by id from the keeper registry (he is NOT in
 *      SERVICE_BUILDING_KEEPERS, so the greeting primer would prime nothing),
 *      first visit recorded once, repeat line from the registry;
 *   §C the DOOR PANEL — "Enter the Bathhouse" / "Hear the Steam", no service
 *      to sell, no coin anywhere;
 *   §D the WIRING — App's lazy import + state + lock + prop + render block,
 *      and CityHubScene's import, prop, state, lock lists, hub branch,
 *      handlers, Escape block, and door-panel JSX;
 *   §E the HUB — the thermae's hub entry (subtitle stops promising rest;
 *      position, radius, prompt unchanged; the old `stats` tabKey stays in the
 *      data as the bounty hall keeps its old `tournament` tabKey — the branch
 *      intercepts it), and the Librarian chain's third stop still opens first;
 *   §F NO MECHANIC — the new files carry no transaction, no cure, no buff,
 *      and no save write. Flavour-only, per the canon Walter chose Nov 11.
 *
 * Run with: `bun test src/utils/bathhouseInterior.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BATHHOUSE_FLOOR_HALF_X,
  BATHHOUSE_FLOOR_HALF_Z,
  BATHHOUSE_SPAWN_X,
  BATHHOUSE_SPAWN_Z,
  BATHHOUSE_EXIT_MIN_Z,
  BATHHOUSE_EXIT_CENTER_X,
  BATHHOUSE_EXIT_HALF_WIDTH,
  clampToBathhouseFloor,
  isBathhouseExit,
  BATHHOUSE_STATIONS,
  nearestBathhouseStation,
  STRATON_BATH_FIRST_VISIT,
  STRATON_BATH_REPEAT,
  STRATON_BATH_TOPICS,
  BATHHOUSE_POOL_LINES,
} from '../components/3d/BathhouseInterior';
import { getKeeper } from '../data/keepers';
import { HUB_LOCATIONS } from './cityCollisions';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const BATH_SOURCE = code('components/3d/BathhouseInterior.tsx');
const PANEL_SOURCE = code('components/3d/city/BathhouseDoorPanel.tsx');
const SCENE_SOURCE = code('components/3d/city/CityHubScene.tsx');
const APP_SOURCE = code('App.tsx');
const KEEPERS_SOURCE = code('data/keepers.ts');
const COLLISIONS_SOURCE = code('utils/cityCollisions.ts');

describe('§A — the thermae floor', () => {
  test('four rooms in a row, walkable floor 24 x 10', () => {
    expect(BATHHOUSE_FLOOR_HALF_X).toBe(12);
    expect(BATHHOUSE_FLOOR_HALF_Z).toBe(5);
    // The shell builds three partition walls with open doorways.
    expect(BATH_SOURCE.match(/\{\[-6, 0, 6\]\.map/g)?.length).toBe(1);
    // Each partition is two wall segments plus a lintel over the doorway.
    expect(BATH_SOURCE).toContain('boxGeometry args={[0.5, 0.9, 2.2]}');
  });

  test('spawn is just inside the south door, in the apodyterium', () => {
    expect([BATHHOUSE_SPAWN_X, BATHHOUSE_SPAWN_Z]).toEqual([-9, 4.2]);
    expect(BATHHOUSE_EXIT_MIN_Z).toBe(4.9);
    expect(BATHHOUSE_EXIT_CENTER_X).toBe(-9);
    expect(BATHHOUSE_EXIT_HALF_WIDTH).toBe(1.6);
  });

  test('clamp holds the floor; the exit is the door gap only', () => {
    expect(clampToBathhouseFloor(99, -99)).toEqual([12, -5]);
    expect(clampToBathhouseFloor(0, 0)).toEqual([0, 0]);
    expect(isBathhouseExit(-9, 4.9)).toBe(true);
    expect(isBathhouseExit(-9, 4.8)).toBe(false);
    expect(isBathhouseExit(0, 5)).toBe(false);
    expect(isBathhouseExit(-10.6, 5)).toBe(true);
    expect(isBathhouseExit(-7.4, 5)).toBe(true);
    expect(isBathhouseExit(-7.3, 5)).toBe(false);
  });

  test('four stations: Straton and the three pools', () => {
    expect(BATHHOUSE_STATIONS.map((s) => s.id)).toEqual(['straton', 'tepidarium', 'caldarium', 'frigidarium']);
    expect(nearestBathhouseStation(-9, 2.2)?.id).toBe('straton');
    expect(nearestBathhouseStation(-3, -0.5)?.id).toBe('tepidarium');
    expect(nearestBathhouseStation(3, -0.3)?.id).toBe('caldarium');
    expect(nearestBathhouseStation(9, -0.5)?.id).toBe('frigidarium');
    expect(nearestBathhouseStation(0, 4.5)).toBeNull();
  });

  test('each room has its own water and steam', () => {
    expect(BATH_SOURCE).toContain('<Pool position={[-3, 0, -2.5]}');
    expect(BATH_SOURCE).toContain('<Pool position={[3, 0, -2.5]}');
    expect(BATH_SOURCE).toContain('<Pool position={[9, 0, -2.5]}');
    // Steam is densest in the caldarium, thinnest in the frigidarium.
    expect(BATH_SOURCE).toContain('<SteamWisps position={[3, 0, -2.5]} count={9}');
    expect(BATH_SOURCE).toContain('<SteamWisps position={[9, 0, -2.5]} count={2}');
    // Room lighting: warm caldarium, cool frigidarium.
    expect(BATH_SOURCE).toContain('color="#fb923c"');
    expect(BATH_SOURCE).toContain('color="#60a5fa"');
  });
});

describe('§B — Straton, read by id', () => {
  test('the component reads Straton by id, never through the service map', () => {
    expect(BATH_SOURCE).toContain("getKeeper('straton_of_corinth')");
    expect(BATH_SOURCE).not.toContain('getKeeperForBuilding');
    expect(BATH_SOURCE).not.toContain("primeKeeperGreeting");
    expect(SCENE_SOURCE).not.toContain("primeKeeperGreeting('bathhouse')");
  });

  test('the bathhouse is not a service building — the map proves it', () => {
    const mapBlock = KEEPERS_SOURCE.slice(
      KEEPERS_SOURCE.indexOf('const SERVICE_BUILDING_KEEPERS'),
      KEEPERS_SOURCE.indexOf('};', KEEPERS_SOURCE.indexOf('const SERVICE_BUILDING_KEEPERS'))
    );
    expect(mapBlock).not.toContain('bathhouse');
    expect(mapBlock).toContain('arena_medical_house');
  });

  test('first-visit and repeat lines are the registry lines, verbatim', () => {
    const straton = getKeeper('straton_of_corinth');
    expect(straton).toBeDefined();
    expect(straton?.buildingId).toBe('bathhouse');
    expect(STRATON_BATH_FIRST_VISIT).toBe(straton?.firstVisitLine);
    expect(STRATON_BATH_REPEAT).toBe(straton?.repeatLines[0]);
    expect(STRATON_BATH_FIRST_VISIT).toContain("Water's hot, oil's fresh");
  });

  test('the first talk records the keeper visit, once', () => {
    expect(BATH_SOURCE).toContain("onRecordKeeperVisitRef.current?.('straton_of_corinth')");
    expect(BATH_SOURCE).toContain('metStratonRef');
  });

  test('rumor topics are flavour, not the story fragment', () => {
    expect(STRATON_BATH_TOPICS.map((t) => t.id)).toEqual(['steam', 'city', 'regulars']);
    const allLines = STRATON_BATH_TOPICS.map((t) => t.line).join(' ');
    expect(allLines).not.toContain('fragment');
    expect(allLines).not.toContain('Felix');
    expect(allLines).not.toContain('Erased Champion');
  });

  test('no bathhouse NPC is named Felix', () => {
    expect(BATH_SOURCE.toLowerCase()).not.toContain('felix');
    expect(PANEL_SOURCE.toLowerCase()).not.toContain('felix');
  });
});

describe('§C — the door panel', () => {
  test('two actions: enter, or hear the steam', () => {
    expect(PANEL_SOURCE).toContain('data-bathhouse-panel');
    expect(PANEL_SOURCE).toContain('Enter the Bathhouse');
    expect(PANEL_SOURCE).toContain('Hear the Steam');
    expect(PANEL_SOURCE).toContain('onEnterBathhouse');
    expect(PANEL_SOURCE).toContain('onHearSteam');
  });

  test('no quick bathe, no price, no transaction', () => {
    expect(PANEL_SOURCE).not.toContain('Quick Bathe');
    expect(PANEL_SOURCE.toLowerCase()).not.toContain('gold');
    expect(PANEL_SOURCE).toContain('No coin changes hands here');
  });
});

describe('§D — the wiring', () => {
  test('App lazy-loads the interior and renders it on bathhouseOpen', () => {
    expect(APP_SOURCE).toContain(
      "const BathhouseInterior = React.lazy(() => import('./components/3d/BathhouseInterior').then((m) => ({ default: m.BathhouseInterior })));"
    );
    expect(APP_SOURCE).toContain('const [bathhouseOpen, setBathhouseOpen] = useState(false);');
    expect(APP_SOURCE).toContain("{currentScreen === 'city_3d' && bathhouseOpen && (");
    expect(APP_SOURCE).toContain('<BathhouseInterior');
    expect(APP_SOURCE).toContain('onRecordKeeperVisit={handleRecordKeeperVisit}');
  });

  test('App locks movement while inside and threads the rumor flag', () => {
    expect(APP_SOURCE).toContain(
      'movementLocked={!!oathBeatMode || tavernOpen || colosseumOpen || forgeOpen || bountyHallOpen || bathhouseOpen}'
    );
    expect(APP_SOURCE).toContain('onEnterBathhouse={(startWithRumors) => {');
    expect(APP_SOURCE).toContain('setBathhouseRumors(startWithRumors); setBathhouseOpen(true);');
    expect(APP_SOURCE).toContain('startWithRumors={bathhouseRumors}');
  });

  test('CityHubScene imports the panel and declares the prop', () => {
    expect(SCENE_SOURCE).toContain("import { BathhouseDoorPanel } from './BathhouseDoorPanel';");
    expect(SCENE_SOURCE).toContain('onEnterBathhouse: (startWithRumors: boolean) => void;');
    expect(SCENE_SOURCE).toContain('onEnterBathhouse,');
  });

  test('the bathhouse panel joins the lock lists', () => {
    expect(SCENE_SOURCE).toContain('const [bathhousePanel, setBathhousePanel] = useState(false);');
    expect(SCENE_SOURCE).toContain('forgePanel || bountyHallPanel || bathhousePanel || showRaceEntry || showNavDrawer');
    expect(SCENE_SOURCE).toContain('forgePanel, bountyHallPanel, bathhousePanel, showRaceEntry, showNavDrawer,');
    expect(SCENE_SOURCE).toContain('showRaceEntry, showNavDrawer, bountyHallPanel, bathhousePanel]');
  });

  test('the hub branch opens the door panel instead of the stats tab', () => {
    expect(SCENE_SOURCE).toContain("} else if (nearbyLoc.id === 'bathhouse') {");
    expect(SCENE_SOURCE).toContain('setBathhousePanel(true);');
    const branch = SCENE_SOURCE.indexOf("nearbyLoc.id === 'bathhouse'");
    const genericTab = SCENE_SOURCE.indexOf("} else if (nearbyLoc.tabKey) {", branch);
    expect(genericTab).toBeGreaterThan(branch);
  });

  test('handlers enter plain or with rumors; Escape closes the panel', () => {
    expect(SCENE_SOURCE).toContain('const handleEnterBathhouse = useCallback(() => {');
    expect(SCENE_SOURCE).toContain('onEnterBathhouse(false);');
    expect(SCENE_SOURCE).toContain('const handleHearSteam = useCallback(() => {');
    expect(SCENE_SOURCE).toContain('onEnterBathhouse(true);');
    expect(SCENE_SOURCE).toContain('if (bathhousePanel) {');
    expect(SCENE_SOURCE).toContain('setBathhousePanel(false)');
  });

  test('the door panel renders from the panel state', () => {
    expect(SCENE_SOURCE).toContain('{bathhousePanel && (');
    expect(SCENE_SOURCE).toContain('<BathhouseDoorPanel');
    expect(SCENE_SOURCE).toContain('onEnterBathhouse={handleEnterBathhouse}');
    expect(SCENE_SOURCE).toContain('onHearSteam={handleHearSteam}');
  });
});

describe('§E — the hub', () => {
  test('the hub subtitle stops promising rest', () => {
    const bathhouse = HUB_LOCATIONS.find((h) => h.id === 'bathhouse');
    expect(bathhouse?.subtitle).toBe('Thermae & Steam Rooms');
    expect(COLLISIONS_SOURCE).not.toContain('Recuperation Pools');
  });

  test('position, radius, and prompt are unchanged', () => {
    const bathhouse = HUB_LOCATIONS.find((h) => h.id === 'bathhouse');
    expect(bathhouse?.position).toEqual([-26, 0, 25]);
    expect(bathhouse?.radius).toBe(4.75);
    expect(bathhouse?.actionPrompt).toBe('Visit the Thermae');
    // The old `stats` tabKey stays in the data (bounty precedent: its old
    // `tournament` tabKey stays too) — the branch intercepts it.
    expect(bathhouse?.tabKey).toBe('stats');
    expect(HUB_LOCATIONS.find((h) => h.id === 'bounty_hall')?.tabKey).toBe('tournament');
  });

  test('the Librarian chain still opens first at the third stop', () => {
    const legendCheck = SCENE_SOURCE.indexOf('legendStopConversation(playerProfile, nearbyLoc.id)');
    const branch = SCENE_SOURCE.indexOf("nearbyLoc.id === 'bathhouse'");
    expect(legendCheck).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(legendCheck);
  });
});

describe('§F — no mechanic', () => {
  test('the new files carry no transaction, no cure, no buff, no save write', () => {
    for (const [name, src] of [
      ['BathhouseInterior', BATH_SOURCE],
      ['BathhouseDoorPanel', PANEL_SOURCE],
    ] as const) {
      for (const forbidden of [
        'gold',
        'heal',
        'buff',
        'stamina',
        'exhaustion',
        'injury',
        'saveProfile',
        'localStorage',
        'setProfile',
        'debit',
        'onDebitGold',
      ]) {
        expect(src.toLowerCase()).not.toContain(forbidden);
      }
    }
  });

  test('the pool lines are flavour only', () => {
    expect(Object.keys(BATHHOUSE_POOL_LINES).sort()).toEqual(['caldarium', 'frigidarium', 'tepidarium']);
    const joined = Object.values(BATHHOUSE_POOL_LINES).join(' ');
    expect(joined.toLowerCase()).not.toContain('gold');
    expect(joined.toLowerCase()).not.toContain('heal');
  });
});
