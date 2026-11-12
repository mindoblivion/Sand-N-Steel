/**
 * ===========================================================================
 * GLADIATOR ACADEMY INTERIOR — the scene pins
 * ===========================================================================
 * The wiring pins for the slice, one section per claim:
 *
 *   §A the FLOOR — the academy's four rooms, spawn, exit, and stations, all
 *      DOM-free math on the component, mirroring the bathhouse pattern;
 *   §B RUFUS — read by id from the keeper registry (he is NOT in
 *      SERVICE_BUILDING_KEEPERS, so the greeting primer would prime
 *      nothing), first visit recorded once, repeat line from the registry,
 *      and the level-gated Academy first-visit line (the yard line below
 *      level 3, the hard course named only to those who qualify);
 *   §C the COURSE — the Intensive is the module's pure transaction (+2, 3x
 *      the yard price, level 3+, the day's timetable), run by App's
 *      handleTrainIntensive with the same time step and one save as a yard
 *      session, and the panel lists the four drills;
 *   §D the WIRING — App's lazy import + state + lock + prop + render block,
 *      and CityHubScene's import, prop, state, lock lists, hub branch,
 *      handlers, Escape block, and door-panel JSX;
 *   §E the CODEX — the trophy room's "Study" station opens the Codex in
 *      the library, which is why App owns the library page now (the third
 *      door into the one rack, after the tab and the character sheet);
 *   §F the HUB — the academy's hub entry is untouched (position, radius,
 *      prompt, subtitle); the old `training` tabKey stays in the data as
 *      the bounty hall keeps its old `tournament` tabKey — the branch
 *      intercepts it.
 *
 * Run with: `bun test src/utils/gladiatorAcademyInterior.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACADEMY_FLOOR_HALF_X,
  ACADEMY_FLOOR_HALF_Z,
  ACADEMY_SPAWN_X,
  ACADEMY_SPAWN_Z,
  ACADEMY_EXIT_MIN_Z,
  ACADEMY_EXIT_CENTER_X,
  ACADEMY_EXIT_HALF_WIDTH,
  clampToAcademyFloor,
  isAcademyExit,
  ACADEMY_STATIONS,
  nearestAcademyStation,
  RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED,
  RUFUS_TOPICS,
  ATRIUM_LOOK_LINE,
  rufusAcademyFirstVisitLine,
  rufusFirstVisitLine,
  rufusRepeatLine,
} from '../components/3d/GladiatorAcademyInterior';
import { getKeeper } from '../data/keepers';
import { HUB_LOCATIONS } from './cityCollisions';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const ACADEMY_SOURCE = code('components/3d/GladiatorAcademyInterior.tsx');
const PANEL_SOURCE = code('components/3d/city/GladiatorAcademyDoorPanel.tsx');
const SCENE_SOURCE = code('components/3d/city/CityHubScene.tsx');
const APP_SOURCE = code('App.tsx');
const HUB_SOURCE = code('components/hub/GladiatorSchoolHub.tsx');
const KEEPERS_SOURCE = code('data/keepers.ts');

describe('§A — the academy floor', () => {
  test('four rooms in a row, walkable floor 24 x 10', () => {
    expect(ACADEMY_FLOOR_HALF_X).toBe(12);
    expect(ACADEMY_FLOOR_HALF_Z).toBe(5);
    // The shell builds three partition walls with open doorways.
    expect(ACADEMY_SOURCE.match(/\{\[-6, 4, 8\]\.map/g)?.length).toBe(1);
    // Each partition is two wall segments plus a lintel over the doorway.
    expect(ACADEMY_SOURCE).toContain('boxGeometry args={[0.5, 0.9, 2.2]}');
  });

  test('spawn in the atrium, exit through the south door', () => {
    expect([ACADEMY_SPAWN_X, ACADEMY_SPAWN_Z]).toEqual([-9, 4.2]);
    expect(ACADEMY_EXIT_MIN_Z).toBe(4.9);
    expect(ACADEMY_EXIT_CENTER_X).toBe(-9);
    expect(ACADEMY_EXIT_HALF_WIDTH).toBe(1.6);
    expect(isAcademyExit(-9, 4.95)).toBe(true);
    expect(isAcademyExit(-9, 4.5)).toBe(false);
    expect(isAcademyExit(-7, 4.95)).toBe(false);
    expect(clampToAcademyFloor(99, -99)).toEqual([12, -5]);
  });

  test('four stations, one per room, in the right rooms', () => {
    expect(ACADEMY_STATIONS.map((s) => s.id)).toEqual([
      'atrium',
      'intensive',
      'techniques',
      'rufus',
    ]);
    const atrium = ACADEMY_STATIONS.find((s) => s.id === 'atrium')!;
    const intensive = ACADEMY_STATIONS.find((s) => s.id === 'intensive')!;
    const techniques = ACADEMY_STATIONS.find((s) => s.id === 'techniques')!;
    const rufus = ACADEMY_STATIONS.find((s) => s.id === 'rufus')!;
    expect(atrium.x).toBeLessThan(-6); // the atrium, west of the first partition
    expect(intensive.x).toBeGreaterThan(-6);
    expect(intensive.x).toBeLessThan(4); // the hall, between the partitions
    expect(techniques.x).toBeGreaterThanOrEqual(4);
    expect(techniques.x).toBeLessThan(8); // the trophy room
    expect(rufus.x).toBeGreaterThanOrEqual(8); // the office, east of the last partition
    expect(nearestAcademyStation(10, 2.0)?.id).toBe('rufus');
    expect(nearestAcademyStation(0, 4)).toBeNull(); // open floor in the hall, north of the lanes
  });

  test('the set dressing is the design: mosaic, mirrors, lanes, trophy gear, desk', () => {
    expect(ACADEMY_SOURCE).toContain('makeMosaicTexture');
    expect(ACADEMY_SOURCE).toContain('map={mosaic}');
    expect(ACADEMY_SOURCE.match(/<Mirror /g)?.length).toBe(2);
    expect(ACADEMY_SOURCE).toContain('<DrillLanes />');
    expect(ACADEMY_SOURCE.match(/<GearStand /g)?.length).toBe(3);
    expect(ACADEMY_SOURCE).toContain('<LaurelWreath');
    expect(ACADEMY_SOURCE.match(/<Bust /g)?.length).toBe(2);
    expect(ACADEMY_SOURCE).toContain('<OfficeDesk');
    expect(ACADEMY_SOURCE.match(/<TraineeFigure /g)?.length).toBe(2);
    expect(ACADEMY_SOURCE).toContain('<RufusNPC');
  });
});

describe('§B — Rufus, the Doctore', () => {
  test('Rufus is read by id — he is NOT in SERVICE_BUILDING_KEEPERS', () => {
    const keeper = getKeeper('aulus_galerius_rufus');
    expect(keeper?.buildingId).toBe('gladiator_academy');
    expect(keeper?.name).toBe('Aulus Galerius Rufus');
    expect(keeper?.title).toBe('the Doctore');
    expect(ACADEMY_SOURCE).toContain("const RUFUS_ID = 'aulus_galerius_rufus';");
    expect(ACADEMY_SOURCE).toContain('getKeeper(RUFUS_ID)');
    expect(ACADEMY_SOURCE).not.toContain('primeKeeperGreeting');
    expect(ACADEMY_SOURCE).not.toContain('getKeeperForBuilding');
  });

  test('the first visit is the registry line, the repeat is the registry line', () => {
    const keeper = getKeeper('aulus_galerius_rufus')!;
    expect(rufusFirstVisitLine()).toBe(keeper.firstVisitLine);
    expect(rufusFirstVisitLine()).toContain('25 times your level');
    expect(rufusRepeatLine()).toBe(keeper.repeatLines[0]);
    expect(rufusRepeatLine()).toContain('The sand remembers your feet');
  });

  test('the Academy first-visit line is level-gated: yard line below 3, hard course at 3+', () => {
    expect(rufusAcademyFirstVisitLine(1)).toBe(rufusFirstVisitLine());
    expect(rufusAcademyFirstVisitLine(2)).toBe(rufusFirstVisitLine());
    expect(rufusAcademyFirstVisitLine(3)).toBe(RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED);
    expect(RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED).toContain('three times the price, twice the gain');
    expect(RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED).toContain('25 times your level');
  });

  test('the topics are flavour and teaching, never story content', () => {
    expect(RUFUS_TOPICS.map((t) => t.id)).toEqual(['course', 'yard', 'champions']);
    for (const topic of RUFUS_TOPICS) {
      expect(topic.line.toLowerCase()).not.toContain('felix');
      expect(topic.line).not.toContain('fragment');
    }
    expect(RUFUS_TOPICS.find((t) => t.id === 'champions')!.line).toContain('the Codex keeps their ways');
    expect(ATRIUM_LOOK_LINE).toContain('mosaic of champions');
    expect(ACADEMY_SOURCE.toLowerCase()).not.toContain('felix');
  });
});

describe('§C — the Intensive Course', () => {
  test('the interior reads the course from the module, never a local price', () => {
    expect(ACADEMY_SOURCE).toContain('intensiveCourseCost(profile)');
    expect(ACADEMY_SOURCE).toContain('INTENSIVE_LEVEL_MIN');
    expect(ACADEMY_SOURCE).toContain("TRAINING_ACTIONS.map((action) => {");
    expect(ACADEMY_SOURCE).toContain('isTrainingActionScheduled(profile, stat)');
    expect(ACADEMY_SOURCE).toContain("canDebitGold(profile.gold, courseCost)");
    expect(ACADEMY_SOURCE).toContain('Train +2');
    expect(ACADEMY_SOURCE).toContain('Resting today');
    expect(ACADEMY_SOURCE).toContain('The course opens at level 3');
  });

  test('App runs the course through the module, then the time step and the one save', () => {
    expect(APP_SOURCE).toContain('const handleTrainIntensive = (stat: PhysicalTrainingStat): string => {');
    expect(APP_SOURCE).toContain('applyIntensiveTraining(profile, stat)');
    expect(APP_SOURCE).toContain('intensiveRefusalLine(result.reason, intensiveCourseCost(profile))');
    expect(APP_SOURCE).toContain('advanceTimeBy(result.profile, 1)');
    expect(APP_SOURCE).toContain('saveProfile(timed.profile);');
    expect(APP_SOURCE).toContain('intensiveSuccessLine(stat)');
  });

  test('the course panel shows the gate below level 3 and the drills at 3+', () => {
    expect(ACADEMY_SOURCE).toContain('{profile && !qualified && (');
    expect(ACADEMY_SOURCE).toContain('{profile && qualified && (');
    expect(ACADEMY_SOURCE).toContain('The yard session');
  });
});

describe('§D — the wiring', () => {
  test('App lazy-loads the interior, holds the state, locks movement, and passes the profile', () => {
    expect(APP_SOURCE).toContain(
      "const GladiatorAcademyInterior = React.lazy(() => import('./components/3d/GladiatorAcademyInterior').then((m) => ({ default: m.GladiatorAcademyInterior })));",
    );
    expect(APP_SOURCE).toContain('const [academyOpen, setAcademyOpen] = useState(false);');
    expect(APP_SOURCE).toContain('const [academyTalk, setAcademyTalk] = useState(false);');
    expect(APP_SOURCE).toContain(
      'movementLocked={!!oathBeatMode || tavernOpen || colosseumOpen || forgeOpen || bountyHallOpen || bathhouseOpen || academyOpen}',
    );
    expect(APP_SOURCE).toContain(
      'onEnterAcademy={(startWithTalk) => { setAcademyTalk(startWithTalk); setAcademyOpen(true); }}',
    );
    expect(APP_SOURCE).toContain("{currentScreen === 'city_3d' && academyOpen && (");
    expect(APP_SOURCE).toContain('profile={profile}');
    expect(APP_SOURCE).toContain('onTrainIntensive={handleTrainIntensive}');
    expect(APP_SOURCE).toContain('onOpenCodex={handleOpenCodex}');
    expect(APP_SOURCE).toContain('startWithTalk={academyTalk}');
  });

  test('the door panel offers Enter or See Rufus', () => {
    expect(PANEL_SOURCE).toContain('Enter the Academy');
    expect(PANEL_SOURCE).toContain('See Rufus');
    expect(PANEL_SOURCE).toContain('three times the price, twice the gain');
  });

  test('CityHubScene wires the panel state, the hub branch, the handlers and the Escape block', () => {
    expect(SCENE_SOURCE).toContain("import { GladiatorAcademyDoorPanel } from './GladiatorAcademyDoorPanel';");
    expect(SCENE_SOURCE).toContain('onEnterAcademy: (startWithTalk: boolean) => void;');
    expect(SCENE_SOURCE).toContain('const [academyPanel, setAcademyPanel] = useState(false);');
    expect(SCENE_SOURCE).toContain('visitorPanel || colosseumPanel || forgePanel || bountyHallPanel || bathhousePanel || academyPanel || showRaceEntry || showNavDrawer');
    expect(SCENE_SOURCE).toContain(
      'legendPanel, visitorPanel, colosseumPanel, forgePanel, bountyHallPanel, bathhousePanel, academyPanel, showRaceEntry, showNavDrawer,',
    );
    expect(SCENE_SOURCE).toContain("} else if (nearbyLoc.id === 'gladiator_academy') {");
    expect(SCENE_SOURCE).toContain('setAcademyPanel(true);');
    expect(SCENE_SOURCE).toContain('const handleEnterAcademy = useCallback(() => {');
    expect(SCENE_SOURCE).toContain('const handleSeeRufus = useCallback(() => {');
    expect(SCENE_SOURCE).toContain("if (academyPanel) {");
    expect(SCENE_SOURCE).toContain('showRaceEntry, showNavDrawer, bountyHallPanel, bathhousePanel, academyPanel]');
    expect(SCENE_SOURCE).toContain('<GladiatorAcademyDoorPanel');
    expect(SCENE_SOURCE).toContain('onEnterAcademy={handleEnterAcademy}');
    expect(SCENE_SOURCE).toContain('onSeeRufus={handleSeeRufus}');
  });

  test('handlers enter plain or with Rufus talking; Escape closes the panel', () => {
    expect(SCENE_SOURCE).toContain('onEnterAcademy(false)');
    expect(SCENE_SOURCE).toContain('onEnterAcademy(true)');
    expect(SCENE_SOURCE).toContain("if (code === 'Escape' || key === 'escape') setAcademyPanel(false);");
  });
});

describe('§E — the Codex', () => {
  test('the trophy room station opens the Codex through App', () => {
    expect(ACADEMY_SOURCE).toContain('onOpenCodex: () => void;');
    expect(ACADEMY_SOURCE).toContain('onOpenCodexRef.current()');
    expect(APP_SOURCE).toContain('const handleOpenCodex = () => {');
    expect(APP_SOURCE).toContain("setLibraryPage('codex');");
    expect(APP_SOURCE).toContain("handleOpenHubTab('library');");
  });

  test('App owns the library page now — the third door into the one rack', () => {
    expect(APP_SOURCE).toContain("const [libraryPage, setLibraryPage] = useState<LibraryPageId>('road');");
    expect(APP_SOURCE).toContain('libraryPage={libraryPage}');
    expect(APP_SOURCE).toContain('onLibraryPageChange={setLibraryPage}');
    expect(HUB_SOURCE).toContain('libraryPage: LibraryPageId;');
    expect(HUB_SOURCE).toContain('onLibraryPageChange: (page: LibraryPageId) => void;');
    expect(HUB_SOURCE).not.toContain('const [libraryPage, setLibraryPage] = useState');
    expect(HUB_SOURCE).toContain("onLibraryPageChange('road')");
    expect(HUB_SOURCE).toContain("onLibraryPageChange('triumphs')");
    expect(HUB_SOURCE).toContain('onPageChange={onLibraryPageChange}');
  });
});

describe('§F — the hub', () => {
  test('the academy hub entry is untouched', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'gladiator_academy')!;
    expect(hub.name).toBe('Gladiator Ludus Academy');
    expect(hub.position).toEqual([30.5, 0, -27]);
    expect(hub.radius).toBe(5.25);
    expect(hub.actionPrompt).toBe('Enter Ludus Academy');
    expect(hub.subtitle).toBe('Advanced Gladiator Training');
    // The old `training` tabKey stays in the data — the new branch intercepts it.
    expect(hub.tabKey).toBe('training');
  });

  test('the hub branch fires before the generic tabKey branch', () => {
    expect(SCENE_SOURCE.indexOf("nearbyLoc.id === 'gladiator_academy'")).toBeLessThan(
      SCENE_SOURCE.indexOf('} else if (nearbyLoc.tabKey) {'),
    );
  });

  test('the keeper registry holds exactly one Academy keeper', () => {
    expect(KEEPERS_SOURCE.match(/buildingId: 'gladiator_academy',/g)?.length).toBe(1);
    expect(getKeeper('aulus_galerius_rufus')?.buildingId).toBe('gladiator_academy');
  });
});
