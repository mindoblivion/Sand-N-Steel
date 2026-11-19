/**
 * NEMESIS-1 — THE ALTAR OF NEMESIS: the shrine's second altar, pinned.
 *
 * The slice is CONTENT ONLY, and this suite proves exactly that:
 *   §A  the altar is inside A1's shrine panel, BELOW the alms, and its two
 *       pieces of copy are the Director's, verbatim;
 *   §B  BET-1 — the one reactive beat is GONE with the Omen: no live-omen gate,
 *       no ill-omen line, and the altar is unconditional content;
 *   §C  it adds no control, no price and no roll (two buttons before and after,
 *       none in the altar, no purse arithmetic anywhere in it);
 *   §D  the things the slice is FORBIDDEN to touch are untouched: no new profile
 *       field, the alms price exactly as BET-1 ships it, and the keeper registry /
 *       greeting lines carry none of this copy.
 *
 * Run with: `bun test src/utils/nemesisAltar.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEEPERS, getKeeper } from '../data/keepers';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const CITY = 'components/3d/city/CityHubScene.tsx';
const CALENDAR = 'utils/ludiCalendar.ts';
const TYPES = 'types/game.ts';
const KEEPERS_SRC = 'data/keepers.ts';

/** The shrine panel's own JSX, from its opening attribute to the controls bar after it. */
function shrinePanel(source: string): string {
  const start = source.indexOf('data-shrine-panel');
  expect(start, 'the shrine panel is not in the scene').toBeGreaterThanOrEqual(0);
  const end = source.indexOf('<kbd', start);
  expect(end, 'the shrine panel is not bounded').toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The altar's own JSX: from its hook to the panel's close (nothing follows it). */
function altarPanel(panel: string): string {
  const start = panel.indexOf('data-nemesis-altar');
  expect(start, 'the altar is not in the shrine panel').toBeGreaterThanOrEqual(0);
  return panel.slice(start);
}

// The Director's copy, verbatim. Written here as the source states it.
const INSCRIPTION =
  'NEMESIS — who weighs the sand. Fortuna gives what she gives. Nemesis gives what is deserved.';
const POSTUMIA_QUOTE =
  'Nemesis keeps the other altar. She takes no gold and gives no words — she only watches, and her scales never lie.';

describe('NEMESIS-1 §A the altar is inside the shrine panel, below the alms', () => {
  test('the panel carries the altar and its heading', () => {
    const panel = shrinePanel(code(CITY));
    expect(panel).toContain('data-nemesis-altar');
    expect(panel).toContain('Altar of Nemesis');
  });

  test('the inscription and Postumia’s words are the Director’s, verbatim', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    expect(altar).toContain(INSCRIPTION);
    expect(altar).toContain(POSTUMIA_QUOTE);
  });

  test('Postumia is named as the speaker of the quote, in the panel', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    const quoteAt = altar.indexOf(POSTUMIA_QUOTE);
    expect(quoteAt).toBeGreaterThanOrEqual(0);
    // The attribution follows the quote, in the same block.
    expect(altar.slice(quoteAt)).toContain('— Postumia');
  });

  test('it sits BELOW the alms — BET-1’s flow is not disturbed', () => {
    const panel = shrinePanel(code(CITY));
    const alms = panel.indexOf('data-leave-alms');
    const altar = panel.indexOf('data-nemesis-altar');
    expect(alms).toBeGreaterThanOrEqual(0);
    expect(altar).toBeGreaterThan(alms);
    // And BET-1's own copy is still exactly where it was.
    expect(panel).toContain('Leave alms ({SHRINE_ALMS_PRICE}g)');
  });

  test('each of the two pieces appears exactly once in the panel', () => {
    const panel = shrinePanel(code(CITY));
    for (const copy of [INSCRIPTION, POSTUMIA_QUOTE]) {
      expect(panel.split(copy).length - 1, copy).toBe(1);
    }
  });
});

describe('NEMESIS-1 §B the reactive beat is gone with the Omen', () => {
  test('no live-omen gate survives anywhere in the panel', () => {
    const panel = shrinePanel(code(CITY));
    for (const gone of ['liveOmen', 'data-nemesis-ill-omen', 'data-shrine-omen', 'omenLine']) {
      expect(panel, gone).not.toContain(gone);
    }
    // The ill beat's own copy is gone with it.
    expect(panel).not.toContain('Nemesis has weighed you and found you wanting');
    expect(panel).not.toContain('the scales tip back');
  });

  test('the altar is unconditional content now — no guard wraps it', () => {
    const panel = shrinePanel(code(CITY));
    const altarAt = panel.indexOf('data-nemesis-altar');
    // The altar's opening div is plain JSX, not a `{condition && (` branch.
    const before = panel.slice(Math.max(0, altarAt - 400), altarAt);
    expect(before).not.toMatch(/&&\s*\(\s*$/);
    // The altar opens as a plain div, not a conditional branch.
    expect(panel.slice(altarAt - 5, altarAt)).toBe('<div ');
  });

  test('the altar writes nothing and offers no transaction', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    for (const forbidden of ['saveProfile', 'localStorage', 'setShrine', 'onRecordKeeperVisit', 'Math.random']) {
      expect(altar, forbidden).not.toContain(forbidden);
    }
  });
});

describe('NEMESIS-1 §C no control, no price, no roll', () => {
  test('the panel still has BET-1’s two buttons, and the altar adds none', () => {
    const panel = shrinePanel(code(CITY));
    expect(panel.match(/<button/g)?.length).toBe(2);
    expect(altarPanel(panel)).not.toContain('<button');
  });

  test('the altar carries no purse arithmetic and no second offering', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    // `gold` appears only inside Postumia's own words ("She takes no gold").
    for (const forbidden of ['SHRINE_ALMS_PRICE', 'playerProfile.gold', 'insufficient-gold', 'data-leave-alms']) {
      expect(altar, forbidden).not.toContain(forbidden);
    }
  });
});

describe('NEMESIS-1 §D the forbidden changes did not happen', () => {
  test('no new field on the profile type', () => {
    const types = code(TYPES);
    expect(/nemesis/i.test(types)).toBe(false);
    // The omen fields stay DECLARED (BET-1 leaves them inert so old saves keep
    // loading and §J stays 29) — the altar reads none of them.
    expect(types).toContain('omen?: OmenState;');
    expect(types).toContain('omenTrickleClaimed?: boolean;');
  });

  test('the omens module is gone, and the alms price lives in the calendar', () => {
    expect(existsSync(join(SRC_ROOT, 'utils/omens.ts'))).toBe(false);
    const calendar = code(CALENDAR);
    expect(calendar).toMatch(/export const SHRINE_ALMS_PRICE = 25;/);
    expect(calendar).toContain('canDebitGold(profile.gold, SHRINE_ALMS_PRICE)');
    expect(calendar).toContain('gold: profile.gold - SHRINE_ALMS_PRICE');
    // The panel still charges the calendar's price and nothing of its own.
    const panel = shrinePanel(code(CITY));
    expect(panel).toContain('Leave alms ({SHRINE_ALMS_PRICE}g)');
    expect(panel.match(/SHRINE_ALMS_PRICE/g)?.length).toBe(2);
  });

  test('no keeper line and no greeting carries the altar’s copy', () => {
    const keepers = code(KEEPERS_SRC);
    expect(/nemesis/i.test(keepers)).toBe(false);
    for (const copy of [INSCRIPTION, POSTUMIA_QUOTE]) {
      expect(keepers, copy).not.toContain(copy);
    }
    // The registry itself is untouched: twenty keepers, Postumia at her shrine.
    expect(KEEPERS.length).toBe(20);
    expect(getKeeper('postumia')!.buildingId).toBe('shrine_temple');
    expect(getKeeper('postumia')!.title).toBe('the priestess');
    // The greeting selector is not edited for this slice.
    const city = code(CITY);
    expect(city).toContain('keeperLineFor(shrineKeeper)');
    // The quote lives in the panel and nowhere else in the scene.
    expect(city.split(POSTUMIA_QUOTE).length - 1).toBe(1);
  });

  test('the panel’s keeper plate heading is unchanged', () => {
    const panel = shrinePanel(code(CITY));
    expect(panel).toContain('<KeeperPlate keeper={shrineKeeper} line={keeperLineFor(shrineKeeper)} />');
  });
});
