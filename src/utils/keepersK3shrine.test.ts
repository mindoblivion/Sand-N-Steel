/**
 * K3-SHRINE — Postumia's KeeperPlate on the Fortuna shrine panel, pinned.
 *
 * This is a PARTIAL K3, named honestly: the slice builds ONLY the shrine plate.
 * The board plates (Scribonia, Felix) and the hall plates are NOT in it — their
 * panels do not exist (the Bounty Hall's board is a rendered 3D mesh, not an
 * interactive panel, and no mercenary board surface exists at all), so no panel
 * is invented for them and the lookup answers nothing for those buildings.
 *
 * K2's plate pattern, unchanged and reused: the plate heads the panel, the
 * greeting is frozen once per panel open (`keeperGreetingRef`), the visit records
 * ONLY through `App.handleRecordKeeperVisit`, and the plate adds no control.
 * Postumia has no night line, so at night the plate shows her own lines.
 *
 * What this suite proves:
 *   §A  shrine_temple resolves to Postumia, from the registry's one map
 *   §B  the plate heads A1's shrine panel, and the greeting is frozen per open
 *   §C  night shows HER lines, because no night line was invented
 *   §D  the visit records through the SINGLE App write path and nowhere else
 *   §E  the shrine's omen transaction is untouched by this slice's diff
 *
 * Run with: `bun test src/utils/keepersK3shrine.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
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
import type { Keeper } from '../data/keepers';
import type { PlayerProfile } from '../types/game';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const code = (path: string): string =>
  readFileSync(join(SOURCE_DIR, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CITY = 'components/3d/city/CityHubScene.tsx';
const APP = 'App.tsx';

/** A named marker's own text, bounded by the window. */
function block(source: string, marker: string, length = 700): string {
  const start = source.indexOf(marker);
  expect(start, `${marker} is not in the file`).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + length);
}

/** The shrine panel's own JSX, from its opening attribute to the next sibling block. */
function shrinePanel(source: string): string {
  const start = source.indexOf('data-shrine-panel');
  expect(start, 'the shrine panel is not in the scene').toBeGreaterThanOrEqual(0);
  const end = source.indexOf('<kbd', start); // the desktop controls bar follows it
  expect(end, 'the shrine panel is not bounded').toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * The scene's own greeting expression, restated so the RULE can be driven without
 * a renderer: the frozen reading wins while the panel stays open, the live profile
 * is only the fallback for a panel that was never primed.
 */
type Frozen = { keeperId: string; seen: boolean } | null;
function lineFor(keeper: Keeper, frozen: Frozen, hasMet: boolean, phase: string): string {
  const seen =
    frozen?.keeperId === keeper.id ? frozen.seen : hasMet;
  const own = seen ? selectRepeatLine(keeper, 2) : keeper.firstVisitLine;
  return phase === 'night' ? nightClerkLine(keeper) || own : own;
}

const POSTUMIA = getKeeper('postumia')!;

/** A bare profile carrying only the field the keepers read. */
const profileWith = (ids: string[]): PlayerProfile =>
  ({ seenKeepers: ids } as unknown as PlayerProfile);

describe('K3-SHRINE §A the shrine resolves its keeper', () => {
  test('shrine_temple answers Postumia, from the registry’s own entry', () => {
    const keeper = getKeeperForBuilding('shrine_temple');
    expect(keeper).toBeDefined();
    expect(keeper!.id).toBe('postumia');
    // One source of truth: the lookup hands back the registry object itself.
    expect(getKeeperForBuilding('shrine_temple')).toBe(getKeeper('postumia'));
    expect(keeper!.buildingId).toBe('shrine_temple');
    expect(keeper!.title).toBe('the priestess');
  });

  test('she keeps the shrine and no other counter, and no other keeper keeps it', () => {
    const atShrine = KEEPERS.filter((keeper) => keeper.buildingId === 'shrine_temple');
    expect(atShrine.map((keeper) => keeper.id)).toEqual(['postumia']);
  });

  test('the map is EXTENDED, not duplicated: one entry, added exactly once', () => {
    const registry = code('data/keepers.ts');
    expect(registry.match(/const SERVICE_BUILDING_KEEPERS/g)?.length).toBe(1);
    expect(registry.match(/shrine_temple: 'postumia',/g)?.length).toBe(1);
    // The registry itself is untouched by the slice: twenty keepers, K1 order.
    expect(KEEPERS.length).toBe(20);
  });

  test('the boards and halls stay unplated — no panel is invented for them', () => {
    // The Bounty Hall's board is a rendered 3D mesh, not a panel; no mercenary
    // board or hall plate surface exists. So the lookup must not answer for them.
    expect(getKeeperForBuilding('bounty_hall')).toBeUndefined();
    expect(getKeeperForBuilding('veteran_gladiator_hall')).toBeUndefined();
    expect(getKeeperForBuilding('gladiator_barracks')).toBeUndefined();
  });

  test('Postumia’s own registry row is the shipped text, used verbatim', () => {
    expect(POSTUMIA.name).toBe('Postumia');
    expect(POSTUMIA.firstVisitLine).toBe(
      'Fortuna hears everyone; she answers those who pay attention. Leave an offering before a great fight and take the omen she gives — kind or ill, it is yours.'
    );
    expect(POSTUMIA.repeatLines).toEqual([
      'She turned her face from you last time, and you won anyway. Either she is testing you — or you are becoming interesting.',
    ]);
  });
});

describe('K3-SHRINE §B the plate heads the panel, greeting frozen per open', () => {
  test('the plate is K1’s component, and it heads the shrine panel', () => {
    const city = code(CITY);
    expect(city).toContain("import { KeeperPlate } from '../../hub/KeeperPlate';");
    // Three plated panels in the city now: K2's treatment and rumour counters
    // plus this slice's shrine. Each is the same component.
    expect(city.match(/<KeeperPlate /g)?.length).toBe(3);

    const panel = shrinePanel(city);
    const plateAt = panel.indexOf('<KeeperPlate keeper={shrineKeeper}');
    const offerAt = panel.indexOf('data-offer-omen');
    const declineAt = panel.indexOf('data-decline-omen');
    expect(plateAt).toBeGreaterThanOrEqual(0);
    expect(offerAt).toBeGreaterThan(plateAt);
    expect(declineAt).toBeGreaterThan(plateAt);
  });

  test('it renders only when its keeper resolves, and only while the panel is open', () => {
    const city = code(CITY);
    expect(city).toContain(
      "const shrineKeeper = shrinePanel ? getKeeperForBuilding('shrine_temple') : undefined;"
    );
    expect(shrinePanel(city)).toContain('{shrineKeeper && (');
    expect(shrinePanel(city)).toContain(
      '<KeeperPlate keeper={shrineKeeper} line={keeperLineFor(shrineKeeper)} />'
    );
  });

  test('the greeting is decided ONCE, as the panel opens', () => {
    const city = code(CITY);
    const shrineAt = city.indexOf("nearbyLoc.id === 'shrine_temple'");
    const primeAt = city.indexOf("primeKeeperGreeting('shrine_temple');", shrineAt);
    const openAt = city.indexOf('setShrinePanel(true);', shrineAt);
    expect(shrineAt).toBeGreaterThanOrEqual(0);
    expect(primeAt).toBeGreaterThan(shrineAt);
    expect(openAt).toBeGreaterThan(primeAt);

    // …through K2's own frozen reading, not a second mechanism.
    expect(city).toContain('const frozen = keeperGreetingRef.current;');
    expect(city).toContain('frozen?.keeperId === keeper.id');
    expect(city).toContain(
      '{ keeperId: keeper.id, seen: resolveSeenKeepers(playerProfile).includes(keeper.id) }'
    );
  });

  test('a first visit says her greeting and a return says her repeat line', () => {
    const fresh = lineFor(POSTUMIA, null, false, 'day');
    expect(fresh).toBe(POSTUMIA.firstVisitLine);
    const returning = lineFor(POSTUMIA, null, true, 'day');
    expect(returning).toBe(selectRepeatLine(POSTUMIA, 2));
    expect(returning).toBe(POSTUMIA.repeatLines[0]);
    expect(returning).not.toBe(POSTUMIA.firstVisitLine);
  });

  test('the frozen greeting does not change while the panel stays open', () => {
    // The first-visit save lands a frame later, so the live profile HAS met her by
    // the next render — and the plate must still be saying the greeting.
    const greetedOnce = lineFor(POSTUMIA, { keeperId: POSTUMIA.id, seen: false }, true, 'day');
    expect(greetedOnce).toBe(POSTUMIA.firstVisitLine);
    // …and a return visit is not swapped back to the greeting by a stale read.
    const returnVisit = lineFor(POSTUMIA, { keeperId: POSTUMIA.id, seen: true }, false, 'day');
    expect(returnVisit).toBe(POSTUMIA.repeatLines[0]);
  });
});

describe('K3-SHRINE §C night shows her own lines — no night line invented', () => {
  test('Postumia has no nightLine, and the night clerk answers empty', () => {
    expect(POSTUMIA.nightLine).toBeUndefined();
    expect(nightClerkLine(POSTUMIA)).toBe('');
    // …and the slice added none to her registry row.
    expect(block(code('data/keepers.ts'), "id: 'postumia',", 700)).not.toContain('nightLine');
  });

  test('after dark the plate shows her own lines, first visit and return', () => {
    expect(lineFor(POSTUMIA, null, false, 'night')).toBe(POSTUMIA.firstVisitLine);
    expect(lineFor(POSTUMIA, null, true, 'night')).toBe(POSTUMIA.repeatLines[0]);
    // The expression is K2's: the hour speaks only when there IS a night line.
    expect(nightClerkLine(POSTUMIA) || POSTUMIA.firstVisitLine).toBe(POSTUMIA.firstVisitLine);
    expect(nightClerkLine(POSTUMIA) || POSTUMIA.repeatLines[0]).toBe(POSTUMIA.repeatLines[0]);
  });
});

describe('K3-SHRINE §D the visit records through App’s one write path', () => {
  test('the scene still reports through ONE call site, the existing one', () => {
    const city = code(CITY);
    expect(city.match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(1);
    expect(city.match(/onRecordKeeperVisit\?\.\(openCounterKeeperId\)/g)?.length).toBe(1);
  });

  test('the shrine’s keeper joins that one open-counter id', () => {
    const city = code(CITY);
    expect(city).toContain(
      'const openCounterKeeperId = (treatmentKeeper ?? intelKeeper ?? shrineKeeper)?.id;'
    );
    expect(city).toContain('if (!openCounterKeeperId) return;');
  });

  test('a repeat open records nothing, so there is no second save and no re-render', () => {
    const city = code(CITY);
    expect(city).toContain('if (frozen?.keeperId === openCounterKeeperId && frozen.seen) return;');

    // …and the transaction agrees: an id already met returns the SAME profile.
    const met = recordKeeperVisit(profileWith([]), 'postumia')!;
    expect(resolveSeenKeepers(met)).toEqual(['postumia']);
    expect(recordKeeperVisit(met, 'postumia')).toBe(met);

    // A real first visit is a NEW profile carrying only the record.
    const before = profileWith([]);
    const snapshot = JSON.stringify(before);
    const after = recordKeeperVisit(before, 'postumia')!;
    expect(after).not.toBe(before);
    const { seenKeepers: _ignored, ...rest } = after as PlayerProfile & { seenKeepers?: string[] };
    const { seenKeepers: _alsoIgnored, ...restBefore } = before as PlayerProfile & {
      seenKeepers?: string[];
    };
    expect(JSON.stringify(rest)).toBe(JSON.stringify(restBefore));
    expect(JSON.stringify(before)).toBe(snapshot); // the caller's profile was not mutated
  });

  test('App keeps the single seenKeepers write, and relays it to the same two screens', () => {
    const app = code(APP);
    expect(app.match(/recordKeeperVisit\(profile, /g)?.length).toBe(1);
    expect(app).toContain('const handleRecordKeeperVisit = (keeperId: string) => {');
    expect(app).toContain('if (!visited || visited === profile) return;');
    expect(app).toContain('saveProfile(visited);');
    // The hub's storefronts (K1) and the city's plated counters (K2 + this slice):
    // this slice adds no third relay, it rides the existing one.
    expect(app.match(/onRecordKeeperVisit=\{handleRecordKeeperVisit\}/g)?.length).toBe(2);
  });
});

describe('K3-SHRINE §E the shrine’s omen transaction is untouched', () => {
  test('the panel still offers the omen at the module’s own price', () => {
    const city = code(CITY);
    expect(city).toContain('OMEN_PRICE,');
    expect(city).toContain('Offer {OMEN_PRICE}g for an omen');
    // No second price, trickle or kind chance is written into the panel by this slice.
    const panel = shrinePanel(city);
    expect(panel).not.toContain('25 gold');
    expect(panel).not.toContain('OMEN_TRICKLE_FAME');
    expect(panel).not.toContain('OMEN_KIND_CHANCE');
  });

  test('the panel’s own hooks are all still there', () => {
    const panel = shrinePanel(code(CITY));
    for (const hook of [
      'data-shrine-panel',
      'data-shrine-omen={liveOmen ? liveOmen.kind : \'none\'}',
      'data-omen-result',
      'data-offer-omen',
      'data-omen-refusal="insufficient-gold"',
      'data-decline-omen',
    ]) {
      expect(panel, hook).toContain(hook);
    }
    expect(panel).toContain('{omenResult && (');
    expect(panel).toContain('{liveOmen ? omenLine(liveOmen) : \'No omen rests on you.\'}');
  });

  test('the slice adds no tap target: three controls, each still thumb-sized', () => {
    const panel = shrinePanel(code(CITY));
    // Close, offer, decline — A1's three, and nothing the plate added.
    expect(panel.match(/<button/g)?.length).toBe(3);
    expect(panel.match(/min-h-\[48px\]/g)?.length).toBe(2);
    expect(panel).toContain('aria-label="Close shrine panel"');
    // The plate line itself carries no control.
    const plateLine = panel.slice(panel.indexOf('<KeeperPlate keeper={shrineKeeper}'));
    expect(plateLine.slice(0, 80)).not.toContain('onClick');
  });

  test('the two handlers still report the player’s choice and know nothing of keepers', () => {
    const city = code(CITY);
    const offer = block(city, 'const handleOfferOmen = useCallback(');
    const decline = block(city, 'const handleDeclineOmen = useCallback(');
    expect(offer).toContain('onOfferOmen()');
    expect(offer).toContain('omenOfferResultLine(outcome.omen)');
    expect(decline).toContain('onDeclineOmen()');
    expect(decline).toContain('omenDeclineResultLine(outcome)');
    for (const handler of [offer, decline]) expect(handler).not.toContain('eeper');
  });

  test('the omen module still knows nothing of keepers, and no keeper path prices a bout', () => {
    const omens = code('utils/omens.ts');
    expect(omens).not.toContain('keepers');
    expect(omens).not.toContain('KeeperPlate');
    // The shrine interaction's own block: the visit record and the panel open, and
    // no transaction moved into it by this slice.
    const branch = block(code(CITY), "nearbyLoc.id === 'shrine_temple'", 500);
    expect(branch).toContain("primeKeeperGreeting('shrine_temple');");
    expect(branch).toContain('setShrinePanel(true);');
    expect(branch).not.toContain('onOfferOmen');
    expect(branch).not.toContain('onDeclineOmen');
    expect(branch).not.toContain('OMEN_PRICE');
  });
});
