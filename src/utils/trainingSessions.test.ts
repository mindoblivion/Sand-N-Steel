/**
 * ===========================================================================
 * TRAINING SESSIONS — the enforcement suite (PHASE2-TRAINING)
 * ===========================================================================
 * The counter was shown and never enforced; this slice makes it a hard cap:
 *
 *   §A the YARD GATE — handleTrainStat refuses at 0 sessions before the
 *      clock step (the same refusal pattern as the gold check) and spends
 *      one session per yard session, in the same transaction, one save;
 *   §B the DISPLAY — TrainingTab disables every drill at 0 sessions and
 *      labels the buttons, so the yard cannot be entered past the cap.
 *
 * The Intensive's own gate lives in intensiveTraining.ts (§G there); the
 * rollover that refreshes the counter lives in dayRollover.ts and is
 * untouched. Run with: `bun test src/utils/trainingSessions.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// ── Sources ────────────────────────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP = code('App.tsx');
const TAB = code('components/hub/TrainingTab.tsx');

/** The yard handler's own body, measured whole. */
const TRAIN = APP.slice(
  APP.indexOf('const handleTrainStat'),
  APP.indexOf('const handleBuyItem', APP.indexOf('const handleTrainStat')),
);

describe('§A the yard gate', () => {
  test('a session the day does not have returns before the clock step', () => {
    expect(TRAIN).toContain('if (profile.trainingSessionsLeft <= 0) return;');
    // The refusal sits with the other guards, ahead of the advance — a
    // refused session advances nothing, exactly like the gold refusal.
    expect(TRAIN.indexOf('if (profile.trainingSessionsLeft <= 0) return;')).toBeLessThan(
      TRAIN.indexOf('advanceTimeBy('),
    );
  });

  test('a yard session spends one session, in the same transaction', () => {
    expect(TRAIN).toContain('trainingSessionsLeft: profile.trainingSessionsLeft - 1');
    // Composed into the trained profile, not a second write: still one
    // advance and one save in the handler.
    expect(TRAIN.match(/advanceTimeBy\(/g)?.length).toBe(1);
    expect(TRAIN.match(/saveProfile\(/g)?.length).toBe(1);
  });

  test('the schedule and gold gates still stand, ahead of the advance', () => {
    expect(TRAIN).toContain('isTrainingActionScheduled(profile, stat)');
    expect(TRAIN).toContain('canDebitGold(profile.gold, cost)');
    expect(TRAIN.indexOf('isTrainingActionScheduled(profile, stat)')).toBeLessThan(
      TRAIN.indexOf('advanceTimeBy('),
    );
    expect(TRAIN.indexOf('canDebitGold(profile.gold, cost)')).toBeLessThan(
      TRAIN.indexOf('advanceTimeBy('),
    );
  });
});

describe('§B the display', () => {
  test('at zero sessions every drill is disabled and labelled', () => {
    expect(TAB).toContain('const noSessionsLeft = profile.trainingSessionsLeft <= 0;');
    expect(TAB).toContain('disabled={!canAfford || resting || noSessionsLeft}');
    expect(TAB).toContain('No sessions left today');
  });

  test('the counter line still reads the live count', () => {
    expect(TAB).toContain('Sessions left today:');
    expect(TAB).toContain('data-training-sessions={profile.trainingSessionsLeft}');
  });
});
