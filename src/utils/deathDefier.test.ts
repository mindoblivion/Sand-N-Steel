/**
 * PHASE2-FATECON-2 — DEATH DEFIER: once per bout, survive an otherwise
 * fatal blow with a sliver of health.
 *
 * The decision lives in the pure predicate (`deathDefier.ts`); the wiring
 * pins (§X) read the defiance branch and the refs out of `DuelScene`, so a
 * disconnect between the helper and the shipped code fails here rather
 * than in a playtest. Mirrors the Second Rising's suite (`secondRising.
 * test.ts`) — same shape, same race, the player's side of it.
 *
 *   §1  the predicate     (owns the card, struck by the opponent, fatal,
 *                          not yet fired this bout)
 *   §2  the sliver        (exactly 1 HP, the codebase's floor)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/deathDefier.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DEATH_DEFIER_BANNER_TEXT,
  DEATH_DEFIER_SLIVER_HP,
  shouldDeathDefy,
  type DeathDefierInput,
} from './deathDefier';

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const duel = () => code('src/components/duel/DuelScene.tsx');

const base: DeathDefierInput = {
  ownsDeathDefier: true,
  isActorPlayer: false,
  deathDefied: false,
  fightEnded: true,
};

describe('PHASE2-FATECON-2 §1 — the predicate', () => {
  test('fires only when every condition holds', () => {
    expect(shouldDeathDefy(base)).toBe(true);
  });

  test('needs the card: without Death Defier, a fatal blow kills', () => {
    expect(shouldDeathDefy({ ...base, ownsDeathDefier: false })).toBe(false);
  });

  test('is the player’s, not the opponent’s: a blow the player strikes never defies', () => {
    expect(shouldDeathDefy({ ...base, isActorPlayer: true })).toBe(false);
  });

  test('once per bout: after it fires, the next fatal blow kills', () => {
    expect(shouldDeathDefy({ ...base, deathDefied: true })).toBe(false);
  });

  test('only on a fatal blow: a scratch never defies', () => {
    expect(shouldDeathDefy({ ...base, fightEnded: false })).toBe(false);
  });
});

describe('PHASE2-FATECON-2 §2 — the sliver', () => {
  test('the sliver is exactly 1 HP, the codebase’s floor', () => {
    expect(DEATH_DEFIER_SLIVER_HP).toBe(1);
  });

  test('the banner words live in exactly one place — the constant', () => {
    expect(DEATH_DEFIER_BANNER_TEXT).toBe('DEATH DEFIED');
    expect(source('src/utils/deathDefier.ts').split("'DEATH DEFIED'").length - 1).toBe(1);
    expect(duel()).not.toContain("'DEATH DEFIED'");
  });
});

describe('PHASE2-FATECON-2 §X — the wiring, read out of the sources', () => {
  test('the defiance branch sits beside the Second Rising and reads fightEnded', () => {
    const d = duel();
    const riseAt = d.indexOf('shouldSecondRise({');
    const defyAt = d.indexOf('shouldDeathDefy({');
    expect(riseAt).toBeGreaterThan(0);
    expect(defyAt).toBeGreaterThan(0);
    // Beside, not inside: after the rise block, before the MISSED branch.
    expect(defyAt).toBeGreaterThan(riseAt);
    expect(defyAt).toBeLessThan(d.indexOf("'MISSED!'", riseAt));
    const block = d.slice(defyAt, d.indexOf("'MISSED!'", defyAt));
    // The gates, verbatim: the player is the defender, once per bout, fatal.
    expect(block).toContain('ownsDeathDefier:');
    expect(block).toContain("fateBonuses.ownedCardIds.includes('death_defier')");
    expect(block).toContain('isActorPlayer,');
    expect(block).toContain('deathDefied: deathDefiedRef.current,');
    expect(block).toContain('fightEnded,');
    // The effect: the latch, the 1 HP write, the banner.
    expect(block).toContain('deathDefiedRef.current = true;');
    expect(block).toContain('health: DEATH_DEFIER_SLIVER_HP,');
    expect(block).toContain("action: 'hit',");
    expect(block).toContain('spawnDamageText(DEATH_DEFIER_BANNER_TEXT,');
    // It never recomputes the fatality: no fightEnded assignment in the block.
    expect(block).not.toMatch(/fightEnded\s*=/);
  });

  test('the defiance announces itself under the module’s banner words, once', () => {
    const d = duel();
    expect(d).toContain('DEATH_DEFIER_BANNER_TEXT');
    expect(d.split('DEATH_DEFIER_BANNER_TEXT').length - 1).toBe(3);
  });

  test('the defied ref resets with the other refs — and only there', () => {
    const d = duel();
    // The same three reset sites as risenRef: withdrawal cancel, victory, defeat.
    expect(d.split('deathDefiedRef.current = false').length - 1).toBe(3);
    expect(d.split('deathDefiedRef.current = true').length - 1).toBe(1);
  });

  test('the frozen file knows nothing about the defiance', () => {
    const frozen = code('src/utils/combatCalculations.ts');
    expect(frozen).not.toContain('death_defier');
    expect(frozen).not.toContain('deathDefied');
    expect(frozen).not.toContain('DEATH_DEFIER');
  });
});
