/**
 * K2 — the keeper plates on the S5/S7 service surfaces, pinned.
 *
 * K1 built the registry and the plate, and put the plate at the head of the four
 * shop storefronts. K2 puts the same plate on the three SERVICE counters the 3D
 * city opens — the Medical House's cure, the Caravanserai's rest and the Golden
 * Palm's rumours — through the same registry, the same displayed-line rules and
 * the same one `seenKeepers` write, and changes no transaction of any kind.
 *
 * What this suite proves:
 *   §A  the one new lookup: building id -> keeper, answered from the registry
 *   §B  each of the three panels renders the plate for its own keeper
 *   §C  a visit is recorded through the SINGLE write path, and nowhere else
 *   §D  first-visit vs repeat resolution matches ShopTab's rules on these panels
 *   §E  the treatment, rest and rumour transaction code is untouched by the slice
 *   §F  no keeper is, or can become, an opponent
 *
 * Run with: `bun test src/utils/keepersK2.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEEPERS,
  getKeeper,
  getKeeperForBuilding,
  nightClerkLine,
  recordKeeperVisit,
  resolveSeenKeepers,
  selectRepeatLine,
} from '../data/keepers';
import type { PlayerProfile } from '../types/game';
import { HUB_LOCATIONS } from './cityCollisions';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const code = (path: string): string =>
  readFileSync(join(SOURCE_DIR, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Every shipped source file under `src/`, suites excluded. */
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full));
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * A named function's own text: the marker's position onwards, bounded by the
 * window rather than by the first `);` (a body's own statements close with one).
 */
function block(source: string, marker: string, length = 700): string {
  const start = source.indexOf(marker);
  expect(start, `${marker} is not in the file`).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + length);
}

const CITY = 'components/3d/city/CityHubScene.tsx';
const SHOP = 'components/hub/ShopTab.tsx';
const APP = 'App.tsx';

/**
 * The three service counters this slice plates, and the keeper each one keeps —
 * the ids are the `HUB_LOCATIONS` ids the buildings carry.
 */
const PANELS = [
  {
    panel: 'the Medical House treatment panel',
    buildingId: 'arena_medical_house',
    keeperId: 'antiochis_of_pergamon',
  },
  {
    panel: 'the Caravanserai rest panel',
    buildingId: 'caravanserai',
    keeperId: 'barates_of_palmyra',
  },
  {
    panel: 'the Golden Palm rumour panel',
    buildingId: 'tavern',
    keeperId: 'aelia_prisca',
  },
] as const;

describe('K2 §A the service-counter lookup', () => {
  test('each of the three service buildings answers its own keeper', () => {
    for (const { panel, buildingId, keeperId } of PANELS) {
      const keeper = getKeeperForBuilding(buildingId);
      expect(keeper, panel).toBeDefined();
      expect(keeper!.id, panel).toBe(keeperId);
      // The lookup hands back the registry's own entry: one source of truth.
      expect(getKeeperForBuilding(buildingId)).toBe(getKeeper(keeperId));
      expect(keeper!.buildingId).toBe(buildingId);
    }
  });

  test('the three buildings are real hub locations, and the three keepers are distinct', () => {
    const hubIds = new Set(HUB_LOCATIONS.map((location) => location.id));
    for (const { buildingId } of PANELS) expect(hubIds.has(buildingId), buildingId).toBe(true);
    const answered = PANELS.map(({ buildingId }) => getKeeperForBuilding(buildingId)!.id);
    expect(new Set(answered).size).toBe(3);
  });

  test('a building with no service counter answers nothing', () => {
    // The Bounty Hall hosts two boards and has no service surface, so it is
    // deliberately absent rather than arbitrarily answering one of them.
    expect(getKeeperForBuilding('bounty_hall')).toBeUndefined();
    expect(getKeeperForBuilding('colosseum')).toBeUndefined();
    expect(getKeeperForBuilding('northern_fortress')).toBeUndefined();
    expect(getKeeperForBuilding('')).toBeUndefined();
    expect(getKeeperForBuilding('not-a-building')).toBeUndefined();
  });

  test('the registry itself is untouched: twenty keepers, in the K1 order', () => {
    expect(KEEPERS.length).toBe(20);
    expect(KEEPERS[4].buildingId).toBe('arena_medical_house');
    expect(KEEPERS[5].buildingId).toBe('caravanserai');
    for (const { keeperId } of PANELS) {
      const keeper = getKeeper(keeperId)!;
      expect(keeper.firstVisitLine.trim().length).toBeGreaterThan(0);
      expect(keeper.repeatLines.length).toBeGreaterThan(0);
    }
  });

  test('none of the three has a night line, so its own line shows at every hour', () => {
    for (const { keeperId } of PANELS) {
      const keeper = getKeeper(keeperId)!;
      expect(keeper.nightLine, keeperId).toBeUndefined();
      expect(nightClerkLine(keeper), keeperId).toBe('');
    }
  });
});

describe('K2 §B the three panels render the plate', () => {
  test('each panel resolves its keeper from the registry, by its building id', () => {
    const city = code(CITY);
    expect(city).toContain("medical_house: 'arena_medical_house'");
    expect(city).toContain("caravanserai: 'caravanserai'");
    expect(city).toContain('getKeeperForBuilding(TREATMENT_BUILDING[treatmentPanel])');
    expect(city).toContain("getKeeperForBuilding('tavern')");
    // …and the plate is K1's own component, not a re-implementation.
    expect(city).toContain("import { KeeperPlate } from '../../hub/KeeperPlate';");
  });

  test('each panel heads with its plate, ABOVE its transaction controls', () => {
    const city = code(CITY);
    // RE-SCOPED, not weakened — K3-SHRINE plated the Shrine of Fortuna's panel, so
    // the city scene now carries THREE plates: these two counters plus the shrine's.
    // The property this test exists for (one plate per plated panel, each above its
    // own transaction controls) is unchanged and is checked below and in
    // `keepersK3shrine.test.ts` §B; the count moved because a panel was added.
    expect(city.match(/<KeeperPlate /g)?.length).toBe(3);

    const treatmentPanelAt = city.indexOf('data-treatment-panel={treatmentPanel}');
    const treatmentPlateAt = city.indexOf('<KeeperPlate keeper={treatmentKeeper}');
    const treatmentBuyAt = city.indexOf('onClick={() => handleTreatment(treatmentPanel)}');
    expect(treatmentPanelAt).toBeGreaterThanOrEqual(0);
    expect(treatmentPlateAt).toBeGreaterThan(treatmentPanelAt);
    expect(treatmentBuyAt).toBeGreaterThan(treatmentPlateAt);

    const intelPanelAt = city.indexOf('data-intel-panel');
    const intelPlateAt = city.indexOf('<KeeperPlate keeper={intelKeeper}');
    const intelBuyAt = city.indexOf('data-buy-intel={opponent.id}');
    expect(intelPanelAt).toBeGreaterThanOrEqual(0);
    expect(intelPlateAt).toBeGreaterThan(intelPanelAt);
    expect(intelBuyAt).toBeGreaterThan(intelPlateAt);
  });

  test('the plate is a header on every panel: it adds no control', () => {
    const city = code(CITY);
    for (const line of [
      '<KeeperPlate keeper={treatmentKeeper} line={keeperLineFor(treatmentKeeper)} />',
      '<KeeperPlate keeper={intelKeeper} line={keeperLineFor(intelKeeper)} />',
    ]) {
      expect(city).toContain(line);
      expect(line).not.toContain('<button');
      expect(line).not.toContain('onClick');
      expect(line).not.toContain('onTouchStart');
    }
    // And K1's component is still the control-free plate it shipped.
    const plate = code('components/hub/KeeperPlate.tsx');
    expect(plate).not.toContain('<button');
    expect(plate).not.toContain('onClick');
  });

  test('a closed panel resolves no keeper, so nothing is shown', () => {
    const city = code(CITY);
    expect(city).toContain('const treatmentKeeper = treatmentPanel');
    expect(city).toContain(
      "const intelKeeper = intelPanel ? getKeeperForBuilding('tavern') : undefined;"
    );
    expect(city).toContain('{treatmentKeeper && (');
    expect(city).toContain('{intelKeeper && (');
  });
});

describe('K2 §C the visit is recorded through the single write path', () => {
  test('the scene reports at most one visit, and only while a counter is open', () => {
    const city = code(CITY);
    expect(city.match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(1);
    // RE-SCOPED, not weakened — K3-SHRINE's priestess joins the SAME single record
    // path, so the expression gained a third term. The property pinned here (one
    // open-counter id, one call site, one write) is unchanged: there is still
    // exactly one `onRecordKeeperVisit?.()` call, asserted just above.
    expect(city).toContain(
      'const openCounterKeeperId = (treatmentKeeper ?? intelKeeper ?? shrineKeeper)?.id;'
    );
    expect(city).toContain('if (!openCounterKeeperId) return;');
  });

  test('the first-visit freeze means a repeat open records nothing', () => {
    const city = code(CITY);
    expect(city).toContain('if (frozen?.keeperId === openCounterKeeperId && frozen.seen) return;');
  });

  test('`App` still writes `seenKeepers` in one place, and relays it to both screens', () => {
    const app = code(APP);
    expect(app.match(/recordKeeperVisit\(profile, /g)?.length).toBe(1);
    expect(app).toContain('const handleRecordKeeperVisit = (keeperId: string) => {');
    expect(app).toContain('if (!visited || visited === profile) return;');
    expect(app).toContain('saveProfile(visited);');
    // One relay per screen that shows a plate: the hub's storefronts (K1) and the
    // city's three service counters (K2). Both reach the handler above.
    expect(app.match(/onRecordKeeperVisit=\{handleRecordKeeperVisit\}/g)?.length).toBe(2);
  });

  test('no second `seenKeepers` writer exists anywhere in the tree', () => {
    const rel = (file: string): string => file.slice(SOURCE_DIR.length + 1);
    const writers = sourcesUnder(SOURCE_DIR)
      .filter((file) => /seenKeepers\??\s*[:=]/.test(code(rel(file))))
      .map(rel)
      .sort();
    // The registry's own record (K1) and the profile's type declaration. Nothing else.
    expect(writers).toEqual(['data/keepers.ts', 'types/game.ts']);
  });
});

describe('K2 §D first-visit vs repeat, the same rules ShopTab uses', () => {
  test('both surfaces resolve the line with the same two helpers', () => {
    const city = code(CITY);
    const shop = code(SHOP);
    for (const source of [shop, city]) {
      expect(source).toContain('keeper.firstVisitLine');
      expect(source).toContain('selectRepeatLine(keeper, 2)');
      expect(source).toContain('nightClerkLine(keeper)');
    }
  });

  test('both freeze the reading at open time, so the save cannot swap the line', () => {
    const shop = code(SHOP);
    const city = code(CITY);
    expect(shop).toContain('keeperMetRef.current?.met === true');
    expect(shop).toContain('keeperMetRef.current?.id !== keeper.id');
    expect(city).toContain('const frozen = keeperGreetingRef.current;');
    expect(city).toContain('frozen?.keeperId === keeper.id');
    expect(city).toContain(
      '{ keeperId: keeper.id, seen: resolveSeenKeepers(playerProfile).includes(keeper.id) }'
    );
  });

  test('on these three keepers a first visit says the greeting and a return the repeat line', () => {
    for (const { keeperId } of PANELS) {
      const keeper = getKeeper(keeperId)!;
      // A profile that has not met the keeper: the greeting.
      const fresh = { seenKeepers: undefined } as unknown as PlayerProfile;
      expect(resolveSeenKeepers(fresh).includes(keeper.id)).toBe(false);
      // A profile that has: visit two is the keeper's own repeat line.
      const met = recordKeeperVisit(fresh, keeper.id)!;
      expect(resolveSeenKeepers(met)).toEqual([keeper.id]);
      expect(selectRepeatLine(keeper, 2)).toBe(keeper.repeatLines[0]);
      expect(selectRepeatLine(keeper, 2)).not.toBe(keeper.firstVisitLine);
    }
  });

  test('the hour never swaps these three lines — they have no night clerk', () => {
    for (const { keeperId } of PANELS) {
      const keeper = getKeeper(keeperId)!;
      // The panel's own expression: the hour speaks only when there IS a night line.
      expect(nightClerkLine(keeper) || keeper.firstVisitLine).toBe(keeper.firstVisitLine);
    }
  });
});

describe('K2 §E the transactions are untouched', () => {
  test('the panels still call `App` for the treatment, the rest and the rumour', () => {
    const city = code(CITY);
    expect(city).toContain('onClick={() => handleTreatment(treatmentPanel)}');
    expect(city).toContain('onClick={() => handleBuyIntel(opponent.id)}');
    expect(city).toContain('getIntelPurchaseEligibility(playerProfile, opponent.id)');
    expect(city).toContain('${treatmentPrice(treatmentPanel)}g');
    expect(city).toContain('${REST_PRICE}g');
    expect(city).toContain('{INTEL_PRICE}g');

    expect(block(city, 'const handleTreatment = useCallback(')).toContain(
      "service === 'medical_house' ? onTreatInjury() : onRestAtInn()"
    );
    expect(block(city, 'const handleBuyIntel = useCallback(')).toContain(
      'onBuyIntel(opponentId)'
    );
  });

  test('no keeper path reaches a transaction: the handlers know nothing of keepers', () => {
    const city = code(CITY);
    expect(block(city, 'const handleTreatment = useCallback(')).not.toContain('eeper');
    expect(block(city, 'const handleBuyIntel = useCallback(')).not.toContain('eeper');
    expect(block(city, 'const handleUseConsumable = useCallback(')).not.toContain('eeper');
  });

  test('`App` still runs each transaction through its own pure module', () => {
    const app = code(APP);
    const treat = block(app, 'const handleTreatInjury = ');
    expect(treat).toContain('treatInjury(profile)');
    expect(treat).toContain('saveProfile(treated);');

    const rest = block(app, 'const handleRestAtInn = ');
    expect(rest).toContain('restAtInn(profile)');
    expect(rest).toContain('advanceToNextDawn(night)');
    expect(rest).toContain('saveProfile(settled);');

    const intel = block(app, 'const handleBuyIntel = ');
    expect(intel).toContain('purchaseIntel(profile, opponentId)');
    expect(intel).toContain('saveProfile(result.profile);');
  });

  test('the visit record and the transaction are separate calls on the same visit', () => {
    const city = code(CITY);
    const effect = block(city, 'useEffect(() => {\n    if (!openCounterKeeperId) return;');
    expect(effect).toContain('onRecordKeeperVisit?.(openCounterKeeperId);');
    expect(effect).not.toContain('onTreatInjury');
    expect(effect).not.toContain('onRestAtInn');
    expect(effect).not.toContain('onBuyIntel');
  });
});

describe('K2 §F keepers are never opponents', () => {
  const roster = [...ALL_OPPONENTS, DOCTORE_TEST_OPPONENT];
  const norm = (value: string): string =>
    value.toLowerCase().replace(/[",]/g, ' ').replace(/\s+/g, ' ').trim();

  test('none of the three plated keepers is on the fight roster', () => {
    const opponentNames = new Set(roster.map((opponent) => norm(opponent.name)));
    const opponentIds = new Set(roster.map((opponent) => opponent.id));
    for (const { keeperId } of PANELS) {
      const keeper = getKeeper(keeperId)!;
      expect(opponentNames.has(norm(keeper.name)), keeper.id).toBe(false);
      expect(opponentIds.has(keeper.id), keeper.id).toBe(false);
    }
  });

  test('no keeper id appears in the roster source at all', () => {
    const opponents = code('data/opponents.ts');
    for (const keeper of KEEPERS) expect(opponents).not.toContain(keeper.id);
  });
});
