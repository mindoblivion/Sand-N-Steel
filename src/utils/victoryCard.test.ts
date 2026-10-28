/**
 * PITCH A6 — THE VICTORY CARD (duel card only): composer, frames, margin and
 * the share guard.
 *
 * Pitch A6 — Director ruling R-TEST: canvas output is not unit-tested here.
 * Pixel-perfect typography is accepted on Walter's S24; this suite covers the
 * composer, the frame selection, the margin formatting, the share-availability
 * guard and the transient field's result-time wiring — nothing about pixels.
 *
 * ── WHAT THIS SUITE PINS ─────────────────────────────────────────────────
 *   §A  director ruling R-FRAME — result first: defeat → Defeat frame; a win
 *       against any boss row → Champion; else Victory (real roster rows).
 *   §B  the content — name, class (armatura), opponent, result, peak hype.
 *   §C  director ruling R-MARGIN — the margin is the winner's remaining health
 *       as a whole percent; an absent transient omits the line entirely.
 *   §D  the share guard — only `navigator.canShare({ files }) === true` shows a
 *       Share button; no navigator, no canShare, false or a throw all hide it.
 *   §E  the result-time wiring — `DuelScene` reads the WINNER's live HP in both
 *       result branches, in memory only (no save, no profile field).
 *   §F  director ruling R-COLOUR — the frames are the shipped A1 atmosphere
 *       constants, not invented faction colours.
 *   §G  director ruling R-SIZE and the painter's guard — 1080x1350, a capped
 *       device ratio, and `null` (never a throw) with no canvas.
 *
 * Run with: `bun test src/utils/victoryCard.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  canShareVictoryCard,
  composeVictoryCard,
  formatHealthMargin,
  victoryCardFileName,
  victoryCardFrame,
  winnerHealthFraction,
  VICTORY_CARD_FRAME_LABEL,
  type VictoryCardData,
} from './victoryCard';
import {
  paintVictoryCard,
  VICTORY_CARD_HEIGHT,
  VICTORY_CARD_MAX_DPR,
  VICTORY_CARD_PALETTES,
  VICTORY_CARD_WIDTH,
} from './victoryCardPainter';
import { PHASE_LIGHT } from './atmosphere';
import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS, LADDER_OPPONENTS } from '../data/opponents';
import { BOUNTY_DESERTER } from '../data/bountyBoard';
import type { OpponentConfig } from '../types/game';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

const DUEL_SCENE = read('src/components/duel/DuelScene.tsx');
const TYPES = read('src/types/game.ts');
const STORAGE = read('src/services/storage.ts');

const regular: OpponentConfig =
  LADDER_OPPONENTS.find((row) => row.isBoss !== true) ?? ALL_OPPONENTS[0];
const ladderBoss: OpponentConfig =
  LADDER_OPPONENTS.find((row) => row.isBoss === true) ?? regular;
const featureBout: OpponentConfig = FEATURE_BOUT_OPPONENTS[0] ?? ladderBoss;

const statsOf = (over: Partial<{ crowdHypePeak: number; winnerHealthFraction?: number }> = {}) =>
  ({ crowdHypePeak: 0, ...over });

const PLAYER = { name: 'Caius Vorenus', armatura: 'thraex' as const };

// ── §A — R-FRAME: result first, then the boss flag ─────────────────────────
describe('Pitch A6 §A — the frame is decided result-first (Director ruling R-FRAME)', () => {
  test('a player defeat is the Defeat frame, whatever the opponent is', () => {
    expect(victoryCardFrame(false, regular)).toBe('defeat');
    expect(victoryCardFrame(false, ladderBoss)).toBe('defeat');
    expect(victoryCardFrame(false, featureBout)).toBe('defeat');
    expect(victoryCardFrame(false, BOUNTY_DESERTER)).toBe('defeat');
    expect(victoryCardFrame(false, null)).toBe('defeat');
  });

  test('a win against any boss row is the Champion frame', () => {
    expect(ladderBoss.isBoss).toBe(true);
    expect(featureBout.isBoss).toBe(true);
    expect(BOUNTY_DESERTER.isBoss).toBe(true);
    expect(victoryCardFrame(true, ladderBoss)).toBe('champion');
    expect(victoryCardFrame(true, featureBout)).toBe('champion');
    expect(victoryCardFrame(true, BOUNTY_DESERTER)).toBe('champion');
  });

  test('a win against a regular row is the Victory frame', () => {
    expect(regular.isBoss === true).toBe(false);
    expect(victoryCardFrame(true, regular)).toBe('victory');
    expect(victoryCardFrame(true, {})).toBe('victory');
    expect(victoryCardFrame(true, null)).toBe('victory');
  });

  test('the composer takes the frames from the same rule, never from the caller', () => {
    const win = composeVictoryCard(PLAYER, regular, statsOf(), true);
    const bossWin = composeVictoryCard(PLAYER, ladderBoss, statsOf(), true);
    const loss = composeVictoryCard(PLAYER, ladderBoss, statsOf(), false);
    expect([win.frame, bossWin.frame, loss.frame]).toEqual(['victory', 'champion', 'defeat']);
  });

  test('every frame has its own word on the poster', () => {
    expect(VICTORY_CARD_FRAME_LABEL).toEqual({
      victory: 'VICTORY',
      defeat: 'DEFEAT',
      champion: 'CHAMPION',
    });
  });
});

// ── §B — the content ───────────────────────────────────────────────────────
describe('Pitch A6 §B — the card content', () => {
  test('the player, his class, his rival and the result, exactly', () => {
    const card = composeVictoryCard(PLAYER, regular, statsOf({ crowdHypePeak: 63 }), true);
    expect(card.playerName).toBe('Caius Vorenus');
    expect(card.className).toBe('Thraex');
    expect(card.opponentName).toBe(regular.name);
    expect(card.result).toBe('Victory');
    expect(card.peakHype).toBe(63);
  });

  test('the class is the armatura the save fights as, resolved once', () => {
    expect(composeVictoryCard({ name: 'A', armatura: 'murmillo' }, regular, statsOf(), true).className).toBe('Murmillo');
    expect(composeVictoryCard({ name: 'A', armatura: 'retiarius' }, regular, statsOf(), true).className).toBe('Retiarius');
    expect(composeVictoryCard({ name: 'A' }, regular, statsOf(), true).className).toBe('Murmillo');
  });

  test('a defeat prints Defeat, and the peak is the bout’s own whole percent', () => {
    const loss = composeVictoryCard(PLAYER, regular, statsOf({ crowdHypePeak: 41.6 }), false);
    expect(loss.result).toBe('Defeat');
    expect(loss.peakHype).toBe(42);
    expect(composeVictoryCard(PLAYER, regular, statsOf({ crowdHypePeak: 0 }), true).peakHype).toBe(0);
    expect(composeVictoryCard(PLAYER, regular, statsOf({ crowdHypePeak: 160 }), true).peakHype).toBe(100);
    expect(composeVictoryCard(PLAYER, regular, null, true).peakHype).toBe(0);
  });

  test('it is pure: same inputs, same card, and the inputs are not mutated', () => {
    const stats = statsOf({ crowdHypePeak: 55, winnerHealthFraction: 0.4 });
    const snapshot = JSON.stringify(stats);
    const a = composeVictoryCard(PLAYER, ladderBoss, stats, true);
    const b = composeVictoryCard(PLAYER, ladderBoss, stats, true);
    expect(a).toEqual(b);
    expect(JSON.stringify(stats)).toBe(snapshot);
  });
});

// ── §C — R-MARGIN: the winner's remaining health ───────────────────────────
describe('Pitch A6 §C — the margin (Director ruling R-MARGIN)', () => {
  test('the transient is a fraction of the maximum entered with, clamped', () => {
    expect(winnerHealthFraction(50, 100)).toBe(0.5);
    expect(winnerHealthFraction(0, 100)).toBe(0);
    expect(winnerHealthFraction(100, 100)).toBe(1);
    expect(winnerHealthFraction(-8, 100)).toBe(0);
    expect(winnerHealthFraction(140, 100)).toBe(1);
    expect(winnerHealthFraction(50, 0)).toBeUndefined();
    expect(winnerHealthFraction(Number.NaN, 100)).toBeUndefined();
    expect(winnerHealthFraction(50, Number.NaN)).toBeUndefined();
  });

  test('it prints as a whole remaining-health percentage', () => {
    expect(formatHealthMargin(0.645)).toBe('65%');
    expect(formatHealthMargin(1)).toBe('100%');
    expect(formatHealthMargin(0)).toBe('0%');
    expect(formatHealthMargin(1.4)).toBe('100%');
    expect(formatHealthMargin(-0.2)).toBe('0%');
    expect(formatHealthMargin(undefined)).toBeUndefined();
    expect(formatHealthMargin(Number.NaN)).toBeUndefined();
  });

  test('the margin is the winner’s reading on a win and on a defeat alike', () => {
    const win = composeVictoryCard(PLAYER, regular, statsOf({ winnerHealthFraction: 0.32 }), true);
    const loss = composeVictoryCard(PLAYER, ladderBoss, statsOf({ winnerHealthFraction: 0.08 }), false);
    expect(win.margin).toBe('32%');
    expect(loss.margin).toBe('8%');
  });

  test('an absent transient omits the margin line rather than inventing one', () => {
    const card: VictoryCardData = composeVictoryCard(PLAYER, regular, statsOf(), true);
    expect(card.margin).toBeUndefined();
    expect('margin' in card).toBe(false);
    expect(composeVictoryCard(PLAYER, regular, { crowdHypePeak: 10 }, true).margin).toBeUndefined();
  });
});

// ── §D — the share guard ───────────────────────────────────────────────────
describe('Pitch A6 §D — the Share button exists only when files can be shared', () => {
  const file = new File([new Uint8Array([1])], 'card.png', { type: 'image/png' });

  test('a navigator that can share this file shows the button', () => {
    let seen: ShareData | undefined;
    const nav = {
      canShare: (data?: ShareData) => {
        seen = data;
        return true;
      },
    };
    expect(canShareVictoryCard([file], nav)).toBe(true);
    expect(seen?.files).toEqual([file]);
  });

  test('no navigator, no canShare, a false answer or a throw all hide it', () => {
    expect(canShareVictoryCard([file], null)).toBe(false);
    expect(canShareVictoryCard([file], undefined)).toBe(false);
    expect(canShareVictoryCard([file], {})).toBe(false);
    expect(canShareVictoryCard([file], { canShare: () => false })).toBe(false);
    expect(
      canShareVictoryCard([file], {
        canShare: () => {
          throw new Error('not supported');
        },
      }),
    ).toBe(false);
    // Only an exact `true` counts — a truthy non-boolean does not.
    expect(
      canShareVictoryCard([file], { canShare: (() => 'yes') as unknown as () => boolean }),
    ).toBe(false);
  });

  test('an empty share has nothing to offer', () => {
    expect(canShareVictoryCard([], { canShare: () => true })).toBe(false);
  });

  test('the file handed to the sheet is one named PNG per frame', () => {
    expect(victoryCardFileName('victory')).toBe('sand-and-steel-victory-card.png');
    expect(victoryCardFileName('defeat')).toBe('sand-and-steel-defeat-card.png');
    expect(victoryCardFileName('champion')).toBe('sand-and-steel-champion-card.png');
    expect(victoryCardFileName('victory')).toMatch(/\.png$/);
  });
});

// ── §E — the transient field's result-time wiring ──────────────────────────
describe('Pitch A6 §E — DuelScene reads the winner’s live HP at result time', () => {
  test('both result branches write the transient, exactly twice', () => {
    const writes = DUEL_SCENE.match(/statsRef\.current\.winnerHealthFraction =/g) ?? [];
    expect(writes.length).toBe(2);
    expect(DUEL_SCENE).toContain('statsRef.current.winnerHealthFraction = winnerHealthFraction(');
    expect(DUEL_SCENE).toContain("import { winnerHealthFraction } from '../../utils/victoryCard';");
  });

  test('the victory branch reads the PLAYER, the defeat branch the OPPONENT', () => {
    const winIndex = DUEL_SCENE.indexOf('statsRef.current.winnerHealthFraction');
    const winBranch = DUEL_SCENE.slice(winIndex, winIndex + 300);
    expect(winBranch).toContain('player.health,');
    expect(winBranch).toContain('player.stats.healthMax,');

    const lossIndex = DUEL_SCENE.lastIndexOf('statsRef.current.winnerHealthFraction');
    const lossBranch = DUEL_SCENE.slice(lossIndex, lossIndex + 300);
    expect(lossBranch).toContain('opp.health,');
    expect(lossBranch).toContain('opp.stats.healthMax,');
  });

  test('it is tracked the way lowestHealthFraction is: a reading, never a rule', () => {
    // One import plus the two result-time writes — the transient is written HERE
    // and nowhere else, the same in-memory contract lowestHealthFraction carries.
    expect(DUEL_SCENE.match(/winnerHealthFraction/g)?.length).toBe(5); // 1 import + 2 calls + 2 fields
    expect(DUEL_SCENE).not.toContain('statsRef.current.winnerHealthFraction >');
    expect(DUEL_SCENE).not.toContain('statsRef.current.winnerHealthFraction <');
  });

  test('DuelStatistics carries it as OPTIONAL and in memory only', () => {
    expect(TYPES).toContain('winnerHealthFraction?: number;');
    const block = TYPES.slice(
      TYPES.indexOf('export interface DuelStatistics {'),
      TYPES.indexOf('export interface DuelGoldBreakdown {'),
    );
    expect(block).toContain('winnerHealthFraction?: number;');
    expect(block).toContain('IN-MEMORY only');
  });

  test('no profile field is added: the save corpus is untouched', () => {
    const profileStart = TYPES.indexOf('export interface PlayerProfile {');
    expect(profileStart).toBeGreaterThan(-1);
    const profileEnd = TYPES.indexOf('\nexport interface ', profileStart + 10);
    const profileBlock = TYPES.slice(profileStart, profileEnd > -1 ? profileEnd : undefined);
    expect(profileBlock.length).toBeGreaterThan(1000);
    expect(profileBlock).not.toContain('winnerHealthFraction');
    // Nothing that saves a profile ever sees the card or its transient reading.
    expect(STORAGE).not.toContain('winnerHealthFraction');
    expect(STORAGE).not.toContain('VictoryCard');
  });
});

// ── §F — R-COLOUR: the shipped A1 atmosphere palette, no factions ──────────
describe('Pitch A6 §F — the frames are the shipped atmosphere constants (R-COLOUR)', () => {
  test('Victory is the goldenHour row: its glow, its ember, its haze', () => {
    const victory = VICTORY_CARD_PALETTES.victory;
    expect(victory.accent).toBe(PHASE_LIGHT.golden.sunGlow);
    expect(victory.glow).toBe(PHASE_LIGHT.golden.sunColor);
    expect(victory.ink).toBe(PHASE_LIGHT.golden.fogColor);
  });

  test('Defeat is the dusk row’s muted steel', () => {
    const defeat = VICTORY_CARD_PALETTES.defeat;
    expect(defeat.accent).toBe(PHASE_LIGHT.dusk.hemiSky);
    expect(defeat.glow).toBe(PHASE_LIGHT.dusk.fogColor);
    expect(defeat.ink).toBe(PHASE_LIGHT.midday.fogColor);
  });

  test('Champion is gilded from the goldenHour row', () => {
    const champion = VICTORY_CARD_PALETTES.champion;
    expect(champion.fieldTop).toBe(PHASE_LIGHT.golden.skyHorizon);
    expect(champion.glow).toBe(PHASE_LIGHT.golden.sunGlow);
  });

  test('no faction colour system is invented anywhere in the slice', () => {
    const code = read('src/utils/victoryCard.ts')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('/*') && !trimmed.startsWith('//');
      })
      .join('\n');
    expect(code.toLowerCase()).not.toContain('faction');
    expect(Object.keys(VICTORY_CARD_PALETTES)).toEqual(['victory', 'defeat', 'champion']);
  });
});

// ── §G — R-SIZE, dpr, and the painter's guards ─────────────────────────────
describe('Pitch A6 §G — the fixed template and the painter’s guards', () => {
  const card = composeVictoryCard(PLAYER, regular, statsOf({ winnerHealthFraction: 0.5 }), true);

  test('the template is the 1080x1350 poster ratio', () => {
    expect([VICTORY_CARD_WIDTH, VICTORY_CARD_HEIGHT]).toEqual([1080, 1350]);
    expect(VICTORY_CARD_WIDTH / VICTORY_CARD_HEIGHT).toBeCloseTo(0.8, 6);
    expect(VICTORY_CARD_MAX_DPR).toBe(2);
  });

  test('no canvas → null, never a throw (import-safe: nothing runs at load)', () => {
    expect(paintVictoryCard(card, { document: null, canvas: null })).toBeNull();
    const noContext = { getContext: () => null, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    expect(paintVictoryCard(card, { canvas: noContext })).toBeNull();
    const thrower = {
      getContext: () => {
        throw new Error('2d unavailable');
      },
    } as unknown as HTMLCanvasElement;
    expect(paintVictoryCard(card, { canvas: thrower })).toBeNull();
  });

  test('a supplied canvas is sized by a CAPPED device pixel ratio', () => {
    const calls: number[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        setTransform: (a: number) => calls.push(a),
        fillRect: () => {},
        strokeRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        measureText: (text: string) => ({ width: text.length * 20 }),
      }),
    } as unknown as HTMLCanvasElement;
    expect(paintVictoryCard(card, { canvas, devicePixelRatio: 3 })?.width).toBe(2160);
    expect(calls[0]).toBe(2);
    expect(paintVictoryCard(card, { canvas, devicePixelRatio: 1 })?.width).toBe(1080);
    expect(calls[1]).toBe(1);
  });
});
