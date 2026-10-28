/**
 * L21D — the herald's dismissal contract.
 *
 * The bug this pins is a *lost call*, not a cosmetic one: the visitor ledger spends
 * its `(day, visitorId)` key BEFORE it hands the cry back, so a dismissal that clears
 * the whole queue can destroy a cry that can never be raised again in the session.
 * `HeraldToast` used to do exactly that (`onDismiss={() => setHeraldCries([])}`).
 *
 *   §A a displayed snapshot is removed;
 *   §B cries appended after that snapshot survive;
 *   §C the old toast's timeout cannot erase a newer cry;
 *   §D consecutive dismissals cannot erase a newer queue;
 *   §E ordering, empty queues and the safe-failure cases;
 *   §F the toast's own wiring (rendered, plus the two payload sites);
 *   §G App's wiring (the helper, not a whole-queue clear).
 *
 * App's queue is modelled as its real writers leave it — two functional appends —
 * so every case here is a state transition App can actually perform.
 *
 * Run with: `bun test src/utils/heraldQueue.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { removeDisplayedCries } from './heraldQueue';
import { HeraldToast } from '../components/hub/HeraldToast';

const APP_SOURCE = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const TOAST_SOURCE = readFileSync(
  new URL('../components/hub/HeraldToast.tsx', import.meta.url),
  'utf8'
);

/** App's own append: `setHeraldCries((previous) => [...previous, ...cries])`. */
const append = (queue: string[], cries: readonly string[]): string[] => [...queue, ...cries];

/** One dismissal, exactly as App applies it through the helper. */
const dismiss = (queue: string[], displayed: readonly string[]): string[] =>
  removeDisplayedCries(queue, displayed);

describe('§A a displayed snapshot is removed', () => {
  test('dismissing the whole stack empties the queue', () => {
    const queue = append([], ['the herald cries: A', 'the herald cries: B']);
    expect(dismiss(queue, ['the herald cries: A', 'the herald cries: B'])).toEqual([]);
  });

  test('a leading snapshot removes only what it showed', () => {
    const queue = append([], ['A', 'B']);
    expect(dismiss(queue, ['A'])).toEqual(['B']);
  });
});

describe('§B cries appended after the snapshot survive', () => {
  test('a newer cry is still queued after the dismissal', () => {
    let queue = append([], ['A']);
    const shown = [...queue];
    queue = append(queue, ['B']);
    queue = dismiss(queue, shown);
    expect(queue).toEqual(['B']);
    expect(queue).not.toContain('A');
  });

  test('several appends after the snapshot all survive', () => {
    let queue = append([], ['A']);
    const shown = [...queue];
    queue = append(queue, ['B']);
    queue = append(queue, ['C']);
    queue = dismiss(queue, shown);
    expect(queue).toEqual(['B', 'C']);
  });
});

describe('§C the old toast`s timeout cannot erase a newer cry', () => {
  test('a timer armed for an older snapshot leaves the newer cry visible', () => {
    let queue = append([], ['A']);
    // What the toast rendered when it armed its seven-second timer.
    const shownByTimer = [...queue];
    const onTimeout = () => {
      queue = dismiss(queue, shownByTimer);
    };

    // A visitor arrival lands before that timer fires (the ledger key is spent here).
    queue = append(queue, ['B']);
    onTimeout();

    expect(queue).toEqual(['B']);
  });

  test('the pre-fix whole-queue clear is shown to lose the newer cry (control)', () => {
    let queue = append([], ['A']);
    queue = append(queue, ['B']);
    // The shipped defect: `onDismiss={() => setHeraldCries([])}`.
    queue = [];
    expect(queue).toEqual([]);
    expect(dismiss(append([], ['A', 'B']), ['A'])).toEqual(['B']);
  });
});

describe('§D consecutive dismissals cannot erase a newer queue', () => {
  test('a stale repeat dismissal is a no-op, and the new stack still dismisses', () => {
    let queue = append([], ['A']);
    const firstShown = [...queue];
    queue = append(queue, ['B']);

    queue = dismiss(queue, firstShown);
    expect(queue).toEqual(['B']);
    queue = dismiss(queue, firstShown);
    expect(queue).toEqual(['B']);

    // The re-rendered stack is ['B'], shown after B arrived.
    queue = dismiss(queue, ['B']);
    expect(queue).toEqual([]);
  });
});

describe('§E ordering, empties and safe failure', () => {
  test('appends keep their order and dismissal never reorders what remains', () => {
    let queue = append([], ['road-1']);
    queue = append(queue, ['visitor-1', 'visitor-2']);
    expect(queue).toEqual(['road-1', 'visitor-1', 'visitor-2']);
    queue = dismiss(queue, ['road-1']);
    expect(queue).toEqual(['visitor-1', 'visitor-2']);
  });

  test('an empty dismissal or a non-matching queue returns the SAME array', () => {
    const single = append([], ['A']);
    expect(dismiss(single, [])).toBe(single);
    expect(dismiss([], [])).toEqual([]);

    const other = append([], ['B', 'C']);
    expect(dismiss(other, ['A'])).toBe(other);
    expect(dismiss(other, ['B', 'C', 'D'])).toBe(other);
    expect(other).toEqual(['B', 'C']);
  });

  test('duplicate text is dismissed once per displayed row', () => {
    const queue = append([], ['X', 'X']);
    expect(dismiss(queue, ['X'])).toEqual(['X']);
  });
});

describe('§F the toast`s own wiring', () => {
  const render = (cries: string[]): string =>
    renderToStaticMarkup(
      React.createElement(HeraldToast, { cries, onDismiss: () => {} })
    );

  test('the stack renders every cry in order, with its live region and a control each', () => {
    const markup = render(['first cry', 'second cry']);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup.indexOf('first cry')).toBeGreaterThan(-1);
    expect(markup.indexOf('second cry')).toBeGreaterThan(markup.indexOf('first cry'));
    expect(markup.match(/aria-label="Dismiss the herald"/g) ?? []).toHaveLength(2);
  });

  test('an empty queue renders nothing', () => {
    expect(render([])).toBe('');
  });

  test('both dismissal paths hand back the snapshot they displayed', () => {
    // The repo's bun harness has no DOM renderer (no `@testing-library/react`), so the
    // payloads are pinned where they are written: the timer and the dismiss control.
    // Behaviour is covered by §A–§E against the real rule they feed.
    expect(TOAST_SOURCE).toContain(
      'const timer = window.setTimeout(() => onDismiss(cries), durationMs);'
    );
    expect(TOAST_SOURCE).toContain('onClick={() => onDismiss(cries)}');
    expect(TOAST_SOURCE).not.toContain('window.setTimeout(onDismiss, durationMs)');
  });
});

describe('§G the App wiring', () => {
  test('the dismissal removes the displayed cries instead of clearing the queue', () => {
    expect(APP_SOURCE).toContain(
      'setHeraldCries((previous) => removeDisplayedCries(previous, displayed));'
    );
    expect(APP_SOURCE).not.toContain('setHeraldCries([])');
    expect(APP_SOURCE).toContain(
      '<HeraldToast cries={heraldCries} onDismiss={handleHeraldDismiss} />'
    );
  });

  test('both cry channels still append, and the visitor ledger is untouched', () => {
    expect(APP_SOURCE).toContain('setHeraldCries((previous) => [...previous, ...cries]);');
    expect(APP_SOURCE).toContain(
      'setHeraldCries((previous) => [...previous, ...evaluation.cries]);'
    );
    expect(APP_SOURCE).toContain(
      'const visitorHeraldRef = useRef(createVisitorHeraldLedger());'
    );
  });
});
