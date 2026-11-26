/**
 * PHASE2-FATE — THE WIRING: the queue, the draft modal and the choice.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the queue: one `queueFateLevelUps` call in App, next to the XP write
 *       in the victory branch, and the queued drafts ride that same write
 *       only when the win gained a level;
 *   §B  the dismiss seam: BOTH exits of the duel-result modal open a queued
 *       draft — the plain Continue and the secondary "Spend Stat Points /
 *       Next Bout" CTA — so a level-up can never be silently skipped;
 *   §C  the choice: App's handler accepts only what the resolver accepts,
 *       pays the immediate gold, records the card and saves exactly once;
 *   §D  the modal: three cards from the draft, blocking (no close path at
 *       all), 48px-min cards, and the same short-landscape compaction rules
 *       as the duel HUD;
 *   §E  the save shape: the only `fate:` writes in App are the two nested
 *       ones under `records` — no new top-level field, §J stays 29.
 *
 * Source assertions read comment-stripped code, so prose can never satisfy
 * (or defeat) them — the `code` helper below is the treatment suite's idiom.
 *
 * Run with: `bun test src/utils/fateWiring.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Strip comments so prose can never satisfy (or defeat) a source assertion. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const APP_SOURCE = code(readFileSync(join(SRC_ROOT, 'App.tsx'), 'utf8'));
const MODAL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'hub', 'FateDraftModal.tsx'), 'utf8'),
);
const CSS_SOURCE = code(readFileSync(join(SRC_ROOT, 'index.css'), 'utf8'));

/** The block of one `const name = ...;` handler, for counting its own writes. */
function handlerBlock(source: string, name: string): string {
  const at = source.indexOf(`const ${name}`);
  expect(at).toBeGreaterThan(-1);
  const end = source.indexOf('\n  };', at);
  expect(end).toBeGreaterThan(at);
  return source.slice(at, end);
}

describe('PHASE2-FATE §A — the queue rides the victory write', () => {
  test('exactly one queue call, next to the XP write', () => {
    expect(APP_SOURCE.match(/queueFateLevelUps\(/g)?.length).toBe(1);
    expect(APP_SOURCE.indexOf('queueFateLevelUps(')).toBeGreaterThan(
      APP_SOURCE.indexOf('resolveXpProgression({'),
    );
    expect(APP_SOURCE).toContain(
      'queueFateLevelUps(\n        profile.records?.fate,\n        profile.level,\n        nextLevel,\n        profile.name || \'Spartacus\',\n      )',
    );
  });

  test('the queued drafts ride the same write, only on a level-gaining win', () => {
    expect(APP_SOURCE.match(/fate: fateState/g)?.length).toBe(1);
    expect(APP_SOURCE).toContain('...(levelsGained > 0');
    const at = APP_SOURCE.indexOf('fate: fateState');
    expect(APP_SOURCE.indexOf('...(levelsGained > 0')).toBeLessThan(at);
  });
});

describe('PHASE2-FATE §B — the dismiss seam opens a queued draft', () => {
  test('the opener is defined once and reads the saved profile', () => {
    expect(APP_SOURCE.match(/const openFateDraftIfPending/g)?.length).toBe(1);
    const block = handlerBlock(APP_SOURCE, 'openFateDraftIfPending');
    expect(block).toContain(
      'resolveFateState(profile.records?.fate).pendingDrafts.length > 0',
    );
    expect(block).toContain('setFateDraftOpen(true)');
  });

  test('both exits of the result modal open the draft', () => {
    for (const handler of ['handleDuelResultDismiss', 'handleDuelResultContinueToHub']) {
      const block = handlerBlock(APP_SOURCE, handler);
      expect(block, handler).toContain('openFateDraftIfPending();');
    }
  });

  test('the shown draft is the first pending draft, and the modal renders it', () => {
    expect(APP_SOURCE.match(/resolveFateState\(profile\?\.records\?\.fate\)/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/<FateDraftModal/g)?.length).toBe(1);
    expect(APP_SOURCE).toContain('draft={pendingFateDraft}');
    expect(APP_SOURCE).toContain('onChoose={handleFateCardChoice}');
  });
});

describe('PHASE2-FATE §C — the choice writes exactly once', () => {
  test('the handler accepts only what the resolver accepts, pays the gold, saves once', () => {
    const block = handlerBlock(APP_SOURCE, 'handleFateCardChoice');
    expect(block).toContain('chooseFateCard(profile.records?.fate, cardId)');
    expect(block).toContain('if (!choice) return;');
    expect(block).toContain('gold: profile.gold + choice.immediateGold');
    expect(block).toContain('records: { ...(profile.records ?? {}), fate: choice.state }');
    expect(block.match(/setProfile\(/g)?.length).toBe(1);
    expect(block.match(/saveProfile\(/g)?.length).toBe(1);
  });
});

describe('PHASE2-FATE §D — the modal: three cards, blocking, compact', () => {
  test('three cards from the draft, each a 48px-min choice', () => {
    expect(MODAL_SOURCE).toContain('draft.cardIds');
    expect(MODAL_SOURCE).toContain('.map((cardId) => getFateCard(cardId))');
    expect(MODAL_SOURCE).toContain('data-fate-card-id={card.id}');
    expect(MODAL_SOURCE).toContain('onChoose(card.id)');
    expect(MODAL_SOURCE).toContain('min-h-[48px]');
    expect(MODAL_SOURCE).toContain('role="dialog"');
    expect(MODAL_SOURCE).toContain('aria-modal="true"');
  });

  test('blocking: no close path of any kind', () => {
    expect(MODAL_SOURCE).not.toContain('onClose');
    expect(MODAL_SOURCE).not.toContain('onCancel');
    expect(MODAL_SOURCE).not.toContain('Escape');
  });

  test('the same short-landscape compaction rules as the duel HUD', () => {
    expect(MODAL_SOURCE).toContain('fate-draft-modal');
    expect(MODAL_SOURCE).toContain('fate-draft-tagline');
    expect(MODAL_SOURCE).toContain('fate-draft-card');
    const mediaAt = CSS_SOURCE.indexOf('@media (orientation: landscape) and (max-height: 520px)');
    expect(mediaAt).toBeGreaterThan(-1);
    expect(CSS_SOURCE.indexOf('.fate-draft-modal .fate-draft-tagline')).toBeGreaterThan(mediaAt);
    expect(CSS_SOURCE.indexOf('.fate-draft-modal .fate-draft-card')).toBeGreaterThan(mediaAt);
  });

  test('every card states plainly whether its effect is live', () => {
    // Keyed on the effect kind, not the card id, so the line stays true for
    // any future gold_flat card — and no card ever promises a live effect
    // the game does not deliver yet.
    expect(MODAL_SOURCE).toContain("card.effect.kind === 'gold_flat'");
    expect(MODAL_SOURCE).toContain('Takes effect immediately.');
    expect(MODAL_SOURCE).toContain('Not yet in effect.');
  });
});

describe('PHASE2-FATE §E — the save shape: nested only, §J stays 29', () => {
  test('the only fate writes in App are the two nested ones under records', () => {
    expect(APP_SOURCE.match(/fate: fateState/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/fate: choice\.state/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/fate:/g)?.length).toBe(2);
  });
});
