/**
 * Failed-dodge feedback — C-8.82D.
 *
 * C-8.82B gave Dodge parity with Shield Guard (0.88 evade). Parity created a new
 * readability gap: when the dodge was RAISED and the evade roll FAILED, the strike
 * landed for full damage and the chronicle wrote the same line as a blow against an
 * open guard - `X struck Y for N damage.` The player had just paid Dodge's 12 SP,
 * the stance was spent, damage went through, and the log never said the dodge was
 * taken and beaten. That silence reads as "the dodge did nothing", which is exactly
 * the wrong lesson to teach at the point where the balance work landed.
 *
 * This suite pins the one-line correction where it can be observed:
 *
 *   A the marker - one shared DODGE_FAILED_MARKER, present only on a failed dodge
 *   B what it says - the strike LANDED for real damage; no miss/block/refund claim,
 *     no second damage figure, no duplicate account of the same blow
 *   C crit legibility - a critical blow behind a failed dodge still reads as critical
 *   D the default path - open guard / block / evade wording is untouched, so the
 *     other three outcomes cannot drift into the new copy
 *   E production wiring - DuelScene feeds the marker from the raised stance
 *     (defender.isInvulnerable) inside the SAME addLog call the landed blow already
 *     made, and adds no second entry for the failure
 *
 * Every assertion runs against the shipped module; nothing restates a formula, and
 * no damage, stamina, timing or RNG rule is exercised or changed here.
 *
 * Run with: bun test src/utils/phaseC8_82d.test.ts
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { DODGE_FAILED_MARKER, landedStrikeText } from './strikeFeedback';

const attackerName = 'Cassius';
const defenderName = 'Brutus';

const failedDodge = (damage = 17, isCrit = false) =>
  landedStrikeText({ attackerName, defenderName, damage, isCrit, dodgeFailed: true });

/** Words that would contradict "the strike landed": the copy must never claim these. */
const DENIAL_WORDS = ['MISS', 'missed', 'EVADED', 'BLOCKED', 'blocked', 'no damage'];

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** Source with comments stripped, so a docstring can never satisfy or defeat a check. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const strikeModuleSource = readFileSync(new URL('./strikeFeedback.ts', import.meta.url), 'utf8');
const strikeModuleCode = stripComments(strikeModuleSource);
const duelSceneSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
// C-8.84F — the BLOCKED line's wording moved into the shared feedback module.
const guardFeedbackSource = readFileSync(new URL('./guardFeedback.ts', import.meta.url), 'utf8');

describe('C-8.82D A - the shared marker', () => {
  test('the marker is exported and non-empty', () => {
    expect(typeof DODGE_FAILED_MARKER).toBe('string');
    expect(DODGE_FAILED_MARKER.trim().length).toBeGreaterThan(0);
  });

  test('a failed dodge carries the marker exactly once, and names the defender', () => {
    const line = failedDodge();
    expect(countOf(line, DODGE_FAILED_MARKER)).toBe(1);
    expect(line.startsWith(defenderName)).toBe(true);
  });

  test('a normal landed blow does NOT carry the marker', () => {
    const line = landedStrikeText({ attackerName, defenderName, damage: 17, isCrit: false });
    expect(line.includes(DODGE_FAILED_MARKER)).toBe(false);
  });

  test('the marker is one source of truth - the module holds a single literal copy', () => {
    expect(countOf(strikeModuleSource, `'${DODGE_FAILED_MARKER}'`)).toBe(1);
  });
});

describe('C-8.82D B - the copy states what happened', () => {
  test('the landed damage figure appears once and is the caller figure', () => {
    const line = failedDodge(23);
    expect(line.includes('23')).toBe(true);
    expect(countOf(line, '23')).toBe(1);
  });

  test('the copy never claims a miss, an evade, a block or zero damage', () => {
    for (const damage of [1, 9, 17, 40]) {
      for (const isCrit of [false, true]) {
        const line = failedDodge(damage, isCrit);
        for (const denial of DENIAL_WORDS) {
          expect(line.includes(denial)).toBe(false);
        }
      }
    }
  });

  test('the copy says the dodge FAILED and that the strike landed', () => {
    const line = failedDodge();
    expect(line.includes('FAILS')).toBe(true);
    expect(line.toLowerCase()).toContain('lands');
  });

  test('one call yields ONE line - no newline, no second sentence about the same blow', () => {
    const line = failedDodge();
    expect(line.includes('\n')).toBe(false);
    // Exactly one terminal period: the message is one statement.
    expect(countOf(line, '.')).toBe(1);
  });

  test('the failed-dodge line differs from the open-guard line for the same hit', () => {
    const failed = failedDodge(17);
    const open = landedStrikeText({ attackerName, defenderName, damage: 17, isCrit: false });
    expect(failed).not.toBe(open);
    // Both report the same damage - the difference is context, not arithmetic.
    expect(open.includes('17')).toBe(true);
  });
});

describe('C-8.82D C - criticals stay legible', () => {
  test('a critical failed dodge still reads as a critical blow', () => {
    const line = failedDodge(34, true);
    const openCrit = landedStrikeText({ attackerName, defenderName, damage: 34, isCrit: true });
    expect(line.includes('CRITICAL BLOW!')).toBe(true);
    expect(openCrit.includes('CRITICAL BLOW!')).toBe(true);
    // The crit wording is shared, not a second spelling of it.
    expect(line.includes(DODGE_FAILED_MARKER)).toBe(true);
  });

  test('a non-crit failed dodge is not dressed up as a critical', () => {
    expect(failedDodge(17, false).includes('CRITICAL')).toBe(false);
  });
});

describe('C-8.82D D - the default path is untouched', () => {
  test('dodgeFailed defaults to false', () => {
    const line = landedStrikeText({ attackerName, defenderName, damage: 12, isCrit: false });
    expect(line).toBe(`${attackerName} struck ${defenderName} for 12 damage.`);
  });

  test('explicit false matches the omitted argument', () => {
    const omitted = landedStrikeText({ attackerName, defenderName, damage: 12, isCrit: false });
    const explicit = landedStrikeText({
      attackerName,
      defenderName,
      damage: 12,
      isCrit: false,
      dodgeFailed: false,
    });
    expect(explicit).toBe(omitted);
  });

  test('the open-guard crit line is unchanged', () => {
    const line = landedStrikeText({ attackerName, defenderName, damage: 34, isCrit: true });
    expect(line).toBe(`CRITICAL BLOW! ${attackerName} struck ${defenderName} for 34 DAMAGE!`);
  });
});

describe('C-8.82D E - production wiring', () => {
  test('DuelScene uses the shipped helper for the landed line', () => {
    expect(duelSceneSource.includes("from '../../utils/strikeFeedback'")).toBe(true);
    expect(duelSceneSource.includes('landedStrikeText({')).toBe(true);
  });

  test('the marker is fed by the raised stance, not by an outcome flag', () => {
    // isInvulnerable is set only by a dodge; the block and passive-evade paths are
    // separate branches, so this is the one truthful source for "dodge failed".
    expect(duelSceneSource.includes('dodgeFailed: defender.isInvulnerable')).toBe(true);
  });

  test('the failed dodge writes no chronicle entry of its own', () => {
    // The wording is passed into the existing addLog calls; the module never logs
    // (checked on code, not the docstring that names the callers' addLog).
    expect(strikeModuleCode.includes('addLog')).toBe(false);
    // No second, DuelScene-level spelling of the marker.
    expect(duelSceneSource.includes(DODGE_FAILED_MARKER)).toBe(false);
    // Exactly two addLog sites consume the line: the crit branch and the normal branch.
    expect(countOf(duelSceneSource, 'addLog(strikeLine,')).toBe(2);
  });

  test('the blocked path keeps its own BLOCKED line (no crossover copy)', () => {
    // C-8.84F — the line is now built by `blockedStrikeLog`, so the literal
    // lives in `guardFeedback`; the scene still consumes it.
    expect(duelSceneSource.includes('blockedStrikeLog(')).toBe(true);
    expect(stripComments(guardFeedbackSource)).toContain('BLOCKED by');
  });
});
