/**
 * NEMESIS-1 — THE ALTAR OF NEMESIS: the shrine's second altar, pinned.
 *
 * The slice is CONTENT ONLY, and this suite proves exactly that:
 *   §A  the altar is inside A1's shrine panel, BELOW the offering and the
 *       decline, and its three pieces of copy are the Director's, verbatim;
 *   §B  the one reactive beat is gated on the LIVE omen's kind — ill shows it,
 *       kind and no-omen do not — and the gate is the shipped expression, driven;
 *   §C  it adds no control, no price and no roll (three buttons before and after,
 *       none in the altar, no purse arithmetic anywhere in it);
 *   §D  the things the slice is FORBIDDEN to touch are untouched: no new profile
 *       field, OMEN_PRICE and the 50/50 draw exactly as A1 shipped them, and the
 *       keeper registry / greeting lines carry none of this copy.
 *
 * Run with: `bun test src/utils/nemesisAltar.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
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
const OMENS = 'utils/omens.ts';
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
const ILL_BEAT =
  'Nemesis has weighed you and found you wanting. Win anyway, and the scales tip back.';

describe('NEMESIS-1 §A the altar is inside the shrine panel, below the offering', () => {
  test('the panel carries the altar and its heading', () => {
    const panel = shrinePanel(code(CITY));
    expect(panel).toContain('data-nemesis-altar');
    expect(panel).toContain('Altar of Nemesis');
  });

  test('the inscription, Postumia’s words and the ill beat are the Director’s, verbatim', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    expect(altar).toContain(INSCRIPTION);
    expect(altar).toContain(POSTUMIA_QUOTE);
    expect(altar).toContain(ILL_BEAT);
  });

  test('Postumia is named as the speaker of the quote, in the panel', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    const quoteAt = altar.indexOf(POSTUMIA_QUOTE);
    expect(quoteAt).toBeGreaterThanOrEqual(0);
    // The attribution follows the quote, in the same block.
    expect(altar.slice(quoteAt)).toContain('— Postumia');
  });

  test('it sits BELOW the offering and the decline — A1’s flow is not disturbed', () => {
    const panel = shrinePanel(code(CITY));
    const decline = panel.indexOf('data-decline-omen');
    const altar = panel.indexOf('data-nemesis-altar');
    expect(decline).toBeGreaterThanOrEqual(0);
    expect(altar).toBeGreaterThan(decline);
    // And A1's own copy is still exactly where it was.
    expect(panel).toContain('Offer {OMEN_PRICE}g for an omen');
    expect(panel).toContain('Decline — trust your own arm');
  });

  test('each of the three pieces appears exactly once in the panel', () => {
    const panel = shrinePanel(code(CITY));
    for (const copy of [INSCRIPTION, POSTUMIA_QUOTE, ILL_BEAT]) {
      expect(panel.split(copy).length - 1, copy).toBe(1);
    }
  });
});

describe('NEMESIS-1 §B the one beat is gated on the live omen’s kind', () => {
  test('the gate is a live-omen kind test against `ill`, and it wraps the beat', () => {
    const panel = shrinePanel(code(CITY));
    const gate = panel.match(/\{\s*(liveOmen[^{}]*?)\s*&&\s*\(/);
    expect(gate, 'the ill-omen conditional is not in the panel').not.toBeNull();
    const expression = gate![1];
    expect(expression).toContain('liveOmen');
    expect(expression).toContain('kind');
    expect(expression).toContain("'ill'");
    // The beat lives INSIDE that guard — after it, and the guard closes after it.
    const gateAt = panel.indexOf(expression);
    const beatAt = panel.indexOf(ILL_BEAT);
    expect(beatAt).toBeGreaterThan(gateAt);
    expect(panel.slice(beatAt)).toContain(')}');
  });

  test('the SHIPPED expression shows it for a live ill omen and hides it otherwise', () => {
    const panel = shrinePanel(code(CITY));
    const expression = panel.match(/\{\s*(liveOmen[^{}]*?)\s*&&\s*\(/)![1];
    // Drive the panel's own gate exactly as the renderer would.
    const shows = (omen: unknown): boolean =>
      Boolean(
        // eslint-disable-next-line no-new-func
        new Function('liveOmen', `return Boolean(${expression});`)(omen),
      );

    expect(shows({ kind: 'ill', expiresAtBout: 9 })).toBe(true);
    expect(shows({ kind: 'kind', expiresAtBout: 9 })).toBe(false);
    expect(shows(null)).toBe(false);
    expect(shows(undefined)).toBe(false);
  });

  test('the gate reads the live omen the panel already resolves, and nothing else', () => {
    const city = code(CITY);
    expect(city).toContain('const liveOmen = resolveOmen(playerProfile);');
    const panel = shrinePanel(city);
    // The same state that prints the omen line and its kind attribute.
    expect(panel).toContain("data-shrine-omen={liveOmen ? liveOmen.kind : 'none'}");
    // `liveOmen` is `OmenState | null` — `kind` is only ever 'kind' or 'ill',
    // which the module's own type and reader declare (read as source, so this
    // suite stays OUT of the omen module's exact consumer set).
    const omens = code(OMENS);
    expect(code(TYPES)).toContain("export type OmenKind = 'kind' | 'ill';");
    expect(omens).toContain('if (!raw || typeof raw !== \'object\') return null;');
    expect(omens).toContain("if (kind !== 'kind' && kind !== 'ill') return null;");
  });

  test('the beat writes nothing and offers no transaction', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    for (const forbidden of ['saveProfile', 'localStorage', 'setShrine', 'onRecordKeeperVisit', 'Math.random']) {
      expect(altar, forbidden).not.toContain(forbidden);
    }
  });
});

describe('NEMESIS-1 §C no control, no price, no roll', () => {
  test('the panel still has A1’s three buttons, and the altar adds none', () => {
    const panel = shrinePanel(code(CITY));
    expect(panel.match(/<button/g)?.length).toBe(3);
    expect(altarPanel(panel)).not.toContain('<button');
  });

  test('the altar carries no purse arithmetic and no second offering', () => {
    const altar = altarPanel(shrinePanel(code(CITY)));
    // `gold` appears only inside Postumia's own words ("She takes no gold").
    for (const forbidden of ['OMEN_PRICE', 'playerProfile.gold', 'insufficient-gold', 'data-offer-omen', 'data-decline-omen']) {
      expect(altar, forbidden).not.toContain(forbidden);
    }
  });
});

describe('NEMESIS-1 §D the forbidden changes did not happen', () => {
  test('no new field on the profile type', () => {
    const types = code(TYPES);
    expect(/nemesis/i.test(types)).toBe(false);
    // The omen field shape A1 published is the only one the altar reads.
    expect(types).toContain('omen?: OmenState;');
    expect(types).toContain('omenTrickleClaimed?: boolean;');
  });

  test('the omen module knows nothing of Nemesis', () => {
    expect(/nemesis/i.test(code(OMENS))).toBe(false);
  });

  test('the price and the 50/50 draw are exactly what A1 shipped', () => {
    const omens = code(OMENS);
    // The two constants, read from the module's own declarations.
    expect(omens).toMatch(/export const OMEN_PRICE = 25;/);
    expect(omens).toMatch(/export const OMEN_KIND_CHANCE = 0\.5;/);
    expect(omens).toContain('gold < OMEN_PRICE');
    expect(omens).toContain('gold: gold - OMEN_PRICE');
    // The draw: one injected roll, split at the chance constant, both words reachable.
    expect(omens).toContain(
      "const kind: OmenKind = Number.isFinite(roll) && roll >= OMEN_KIND_CHANCE ? 'ill' : 'kind';",
    );
    // The panel still charges the module's price and nothing of its own.
    const panel = shrinePanel(code(CITY));
    expect(panel).toContain('Offer {OMEN_PRICE}g for an omen');
    expect(panel.match(/OMEN_PRICE/g)?.length).toBe(2);
  });

  test('no keeper line and no greeting carries the altar’s copy', () => {
    const keepers = code(KEEPERS_SRC);
    expect(/nemesis/i.test(keepers)).toBe(false);
    for (const copy of [INSCRIPTION, POSTUMIA_QUOTE, ILL_BEAT]) {
      expect(keepers, copy).not.toContain(copy);
    }
    // The registry itself is untoched: twenty keepers, Postumia at her shrine.
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
