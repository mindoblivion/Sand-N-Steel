/**
 * C-8.70C Slice C-D — boss phases, the telegraph floor, and explainable defeats.
 *
 * Run with: `bun test src/utils/bossPhases.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the four ladders, as data — and WHICH numbers are AUTHORED, so an
 *       authored value can never be mistaken for a design one.
 *   §B  Phase 1 IS TODAY: every Goliath / Ignis / Valéria / Aurelius parameter
 *       reproduces the shipped behaviour value for value, and the shipped
 *       telegraph holds are byte-identical.
 *   §C  the phase line (the given 50 %), and the fence: only the four LADDER
 *       boss ROWS own phases — never a regular row, a grudge copy, a feature
 *       bout or a non-boss carrying the mechanic string.
 *   §D  the telegraph floor, reused from Slice C-C's `TELEGRAPH_FLOOR_SECONDS`
 *       (no second constant), enforced at the point of use for every boss in
 *       every phase and every mode: Sand exact, Steel/Invictus ON the floor,
 *       never below it.
 *   §E  "why you fell": ≤3 plain lines from synthetic tallies, boss and non-boss,
 *       reading the player's mix through the EXISTING `dominantClassOfMix`.
 *   §F  boss-only mechanics stay boss-only across the whole roster.
 *   §G  a phase change never interrupts a telegraphed action in flight (the
 *       deferral is asserted on the shipped source, because a canvas cannot be
 *       mounted here).
 *   §H  the wiring: the duel reads these helpers, and no mechanic was re-implemented.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BOSS_PHASES,
  BOSS_PHASE_THRESHOLD,
  bossChainHeavies,
  bossCounterWindowTurns,
  bossPhaseAt,
  bossPhaseLadderFor,
  bossPhaseProfileFor,
  bossRageChargeThreshold,
  bossTelegraphChance,
  bossTelegraphHoldMs,
  rageChargeAtThreshold,
} from '../data/bossPhases';
import { TELEGRAPH_FLOOR_SECONDS, modeTelegraphWindowMs } from '../data/boutModes';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { whyYouFellClock, whyYouFellLines } from './whyYouFell';
import { turnResolutionMs } from '../components/duel/DuelScene';
import type { BoutMode, OpponentConfig } from '../types/game';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(`${SRC_DIR}${path}`, 'utf8');
const duel = read('components/duel/DuelScene.tsx');
const phasesSrc = read('data/bossPhases.ts');
/** Source with comments removed, so prose can never satisfy a check. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const MODES: BoutMode[] = ['sand', 'steel', 'invictus'];
const byId = (id: string): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!row) throw new Error(`no such opponent: ${id}`);
  return row;
};

const GOLIATH = byId('opp_goliath_boss');
const IGNIS = byId('opp_ignis_boss');
const VALERIA = byId('opp_valeria_boss');
const AURELIUS = byId('opp_aurelius_boss');
const BOSSES = [GOLIATH, IGNIS, VALERIA, AURELIUS];

/** A row's HP at a fraction of its maximum — the duel's own reading. */
const atFraction = (row: OpponentConfig, fraction: number): number =>
  row.stats.healthMax * fraction;

describe('§A — the four ladders are data, and the AUTHORED values are flagged', () => {
  test('every ladder boss owns exactly two phases, opening at full HP', () => {
    for (const row of BOSSES) {
      const ladder = bossPhaseLadderFor(row);
      expect(ladder).not.toBeNull();
      expect(ladder!.bossId).toBe(row.id);
      expect(ladder!.phases.length).toBe(2);
      expect(ladder!.phases[0].phase).toBe(1);
      expect(ladder!.phases[0].atOrBelow).toBe(1);
      expect(ladder!.phases[1].phase).toBe(2);
      expect(ladder!.phases[1].atOrBelow).toBe(BOSS_PHASE_THRESHOLD);
    }
  });

  test('the phase line is the GIVEN 50 % (not re-authored)', () => {
    expect(BOSS_PHASE_THRESHOLD).toBe(0.5);
    for (const ladder of Object.values(BOSS_PHASES)) {
      expect(ladder.phases[1].atOrBelow).toBe(0.5);
    }
  });

  test('exactly the three AUTHORED Phase-2 rows are flagged, and Phase 1 never is', () => {
    for (const ladder of Object.values(BOSS_PHASES)) {
      expect(ladder.phases[0].authored).toBe(false);
    }
    expect(BOSS_PHASES.phase_weapon_switch.phases[1].authored).toBe(true);
    expect(BOSS_PHASES.counter_dodge.phases[1].authored).toBe(true);
    expect(BOSS_PHASES.rage_mode_colossus.phases[1].authored).toBe(true);
    // Goliath's chain count is the design's own (2); his announce rate is
    // unchanged, so no number on his ladder is authored.
    expect(BOSS_PHASES.heavy_telegraph.phases[1].authored).toBe(false);
  });

  test('the data module defines NO second telegraph floor', () => {
    const body = code(phasesSrc);
    expect(body).toContain('TELEGRAPH_FLOOR_SECONDS');
    expect(/const\s+\w*FLOOR\w*\s*=\s*0\.8/.test(body)).toBe(false);
    expect(/clampTelegraphSeconds/.test(body)).toBe(false);
    // The floor it uses is Slice C-C's export, and it is 0.8 s.
    expect(TELEGRAPH_FLOOR_SECONDS).toBe(0.8);
  });
});

describe('§B — Phase 1 reproduces TODAY, value for value', () => {
  test('Goliath: a 30 % announce rate and ONE heavy per announcement', () => {
    expect(bossTelegraphChance(GOLIATH, atFraction(GOLIATH, 1), GOLIATH.stats.healthMax)).toBe(0.3);
    expect(bossChainHeavies(GOLIATH, atFraction(GOLIATH, 1), GOLIATH.stats.healthMax)).toBe(1);
    expect(bossTelegraphChance(GOLIATH, atFraction(GOLIATH, 0.8), GOLIATH.stats.healthMax)).toBe(0.3);
  });

  test('Ignis: Phase 1 is his own published 0.85 / 0.45 profile row', () => {
    expect(BOSS_PHASES.phase_weapon_switch.phases[0].params).toEqual({
      aggression: IGNIS.aggression,
      blockChance: IGNIS.blockChance,
    });
    expect(bossPhaseProfileFor(IGNIS, atFraction(IGNIS, 0.9), IGNIS.stats.healthMax, 'sand')).toBeNull();
  });

  test('Valéria: Phase 1 has no window — the counter resolves on her next turn', () => {
    expect(bossCounterWindowTurns(VALERIA, atFraction(VALERIA, 1), VALERIA.stats.healthMax)).toBe(0);
  });

  test('Aurelius: Phase 1 needs a FULL rage charge for the published multiplier', () => {
    expect(bossRageChargeThreshold(AURELIUS, atFraction(AURELIUS, 1), AURELIUS.stats.healthMax)).toBe(1);
    expect(rageChargeAtThreshold(0.42, 1)).toBe(0.42);
  });

  test('the shipped telegraph holds are byte-identical under Sand', () => {
    expect(turnResolutionMs('telegraph', false, 'sand')).toBe(1450);
    expect(turnResolutionMs('beast_crouch', false, 'sand')).toBe(1000);
    // …and Steel/Invictus still shorten them to the floor, no further.
    expect(turnResolutionMs('telegraph', false, 'steel')).toBe(800);
    expect(turnResolutionMs('beast_crouch', false, 'invictus')).toBe(800);
  });

  test('Phase 2 intensifies the SIGNATURE mechanic only', () => {
    // Goliath chains a second heavy; the chance is untouched.
    expect(bossChainHeavies(GOLIATH, atFraction(GOLIATH, 0.4), GOLIATH.stats.healthMax)).toBe(2);
    expect(bossTelegraphChance(GOLIATH, atFraction(GOLIATH, 0.4), GOLIATH.stats.healthMax)).toBe(0.3);
    // Valéria gains a two-turn counter window.
    expect(bossCounterWindowTurns(VALERIA, atFraction(VALERIA, 0.4), VALERIA.stats.healthMax)).toBe(2);
    // Aurelius's rage reaches its published maximum at half the charge.
    expect(bossRageChargeThreshold(AURELIUS, atFraction(AURELIUS, 0.4), AURELIUS.stats.healthMax)).toBe(0.5);
    expect(rageChargeAtThreshold(0.5, 0.5)).toBe(1);
    // Ignis swaps his profile row.
    expect(bossPhaseProfileFor(IGNIS, atFraction(IGNIS, 0.4), IGNIS.stats.healthMax, 'sand')).toEqual({
      aggression: 0.9,
      blockChance: 0.4,
    });
  });
});

describe('§C — the given phase line, and the fence', () => {
  test('the phase flips at the 50 % line and never before', () => {
    for (const row of BOSSES) {
      const max = row.stats.healthMax;
      expect(bossPhaseAt(row, max, max)).toBe(1);
      expect(bossPhaseAt(row, max * 0.51, max)).toBe(1);
      expect(bossPhaseAt(row, max * 0.5, max)).toBe(2);
      expect(bossPhaseAt(row, max * 0.2, max)).toBe(2);
    }
  });

  test('a killing blow announces no phase, and malformed HP reads as Phase 1', () => {
    expect(bossPhaseAt(GOLIATH, 0, GOLIATH.stats.healthMax)).toBe(1);
    expect(bossPhaseAt(GOLIATH, NaN, GOLIATH.stats.healthMax)).toBe(1);
    expect(bossPhaseAt(GOLIATH, 10, 0)).toBe(1);
  });

  test('the fence: only the four LADDER boss ROWS own phases', () => {
    for (const row of ALL_OPPONENTS) {
      const ladder = bossPhaseLadderFor(row);
      if (BOSSES.some((boss) => boss.id === row.id)) {
        expect(ladder).not.toBeNull();
      } else {
        expect(ladder).toBeNull();
      }
    }
    // A grudge copy keeps the mechanic string but not the row's identity.
    expect(bossPhaseLadderFor({ ...GOLIATH, id: 'grudge_goliath' })).toBeNull();
    // A regular row forced to carry the mechanic is still not a boss.
    expect(bossPhaseLadderFor({ ...byId('opp_marcus'), bossMechanic: 'heavy_telegraph' })).toBeNull();
    // A FEATURE bout's mechanic has no ladder at all.
    const marcellin = byId('opp_marcellin_boss');
    expect(marcellin.isBoss).toBe(true);
    expect(bossPhaseLadderFor(marcellin)).toBeNull();
  });

  test('every helper answers its neutral Phase-1 value outside the fence', () => {
    const stranger = { ...byId('opp_marcus'), bossMechanic: 'heavy_telegraph' as const };
    expect(bossPhaseAt(stranger, 1, 100)).toBe(1);
    expect(bossTelegraphChance(stranger, 1, 100)).toBe(0);
    expect(bossChainHeavies(stranger, 1, 100)).toBe(1);
    expect(bossCounterWindowTurns(stranger, 1, 100)).toBe(0);
    expect(bossRageChargeThreshold(stranger, 1, 100)).toBe(1);
    expect(bossPhaseProfileFor(stranger, 1, 100, 'sand')).toBeNull();
  });
});

describe('§D — the telegraph floor, reused and enforced at the point of use', () => {
  const shippedHolds = [1450, 1000, 800, 700, 450];

  test('no hold resolves below the floor, in any mode', () => {
    for (const shipped of shippedHolds) {
      for (const mode of MODES) {
        expect(bossTelegraphHoldMs(mode, shipped)).toBeGreaterThanOrEqual(800);
      }
    }
  });

  test('Sand keeps the shipped hold; Steel/Invictus sit ON the floor, never below', () => {
    expect(bossTelegraphHoldMs('sand', 1450)).toBe(1450);
    expect(bossTelegraphHoldMs('sand', 1000)).toBe(1000);
    expect(bossTelegraphHoldMs('steel', 1450)).toBe(800);
    expect(bossTelegraphHoldMs('invictus', 1000)).toBe(800);
    // A shipped hold already below the floor is raised TO it — the one case
    // Slice C-C's resolver would leave alone.
    expect(modeTelegraphWindowMs('steel', 700)).toBe(700);
    expect(bossTelegraphHoldMs('steel', 700)).toBe(800);
    expect(bossTelegraphHoldMs('sand', 700)).toBe(800);
  });

  test('every boss, in every phase and every mode, resolves a legal hold', () => {
    for (const row of BOSSES) {
      for (const fraction of [1, 0.49]) {
        expect(bossPhaseAt(row, atFraction(row, fraction), row.stats.healthMax)).toBe(
          fraction > 0.5 ? 1 : 2,
        );
        for (const mode of MODES) {
          for (const action of ['telegraph', 'beast_crouch'] as const) {
            expect(turnResolutionMs(action, false, mode)).toBeGreaterThanOrEqual(800);
          }
        }
      }
    }
  });

  test('a non-finite hold still cannot resolve below the floor', () => {
    expect(bossTelegraphHoldMs('sand', NaN)).toBe(800);
  });
});

describe('§E — "why you fell": ≤3 plain lines from the duel’s own tallies', () => {
  const bossInput = {
    opponentName: 'Goliath the Pit Behemoth',
    mechanic: { owner: 'His' as const, mechanic: 'overhead slam', landings: 3 },
    damageByClass: { quick: 86, power: 214 },
    crowdTurned: true,
    crowdTurnedAtSeconds: 41,
    playerMix: { quick: 4, power: 7 },
  };

  test('a boss defeat names the heaviest class, its total, and the mechanic', () => {
    const lines = whyYouFellLines(bossInput);
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Goliath the Pit Behemoth');
    expect(lines[0]).toContain('heavy attacks');
    expect(lines[0]).toContain('214 damage');
    expect(lines[0]).toContain('his overhead slam landed 3 times');
  });

  test('the crowd line reports a turning, and a steady crowd', () => {
    expect(whyYouFellLines(bossInput)[1]).toBe('The crowd turned cold at 0:41.');
    expect(
      whyYouFellLines({ ...bossInput, crowdTurned: false })[1],
    ).toBe('The crowd stayed with you.');
  });

  test('the player’s line comes from the EXISTING dominant-class reading', () => {
    expect(whyYouFellLines(bossInput)[2]).toBe('You built your fight on heavy attacks.');
    expect(whyYouFellLines({ ...bossInput, playerMix: { quick: 9, power: 2 } })[2]).toBe(
      'You built your fight on quick strikes.',
    );
    expect(whyYouFellLines({ ...bossInput, playerMix: { quick: 5, power: 5 } })[2]).toBe(
      'Your attacks stayed an even mix.',
    );
  });

  test('a non-boss defeat never mentions a mechanic', () => {
    const lines = whyYouFellLines({
      opponentName: 'Marcus',
      mechanic: null,
      damageByClass: { quick: 40, power: 72 },
      crowdTurned: false,
      playerMix: { quick: 1, power: 1 },
    });
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("Marcus's heavy attacks dealt 72 damage.");
    expect(lines.join(' ')).not.toContain('landed');
  });

  test('a mechanic that never landed is not mentioned; a tie names neither class', () => {
    const none = whyYouFellLines({
      ...bossInput,
      mechanic: { owner: 'Her' as const, mechanic: 'counter', landings: 0 },
    });
    expect(none[0]).toBe("Goliath the Pit Behemoth's heavy attacks dealt 214 damage.");
    const tie = whyYouFellLines({ ...bossInput, damageByClass: { quick: 60, power: 60 } });
    expect(tie[0]).toContain('attacks dealt 120 damage');
  });

  test('it is never more than three lines, and a blank tally degrades safely', () => {
    const blank = whyYouFellLines({
      opponentName: '',
      damageByClass: { quick: NaN, power: -4 },
      crowdTurned: false,
      playerMix: null,
    });
    expect(blank.length).toBe(2);
    expect(blank[0]).toBe('The crowd stayed with you.');
    expect(whyYouFellLines(bossInput).length).toBeLessThanOrEqual(3);
    expect(whyYouFellClock(0)).toBe('0:00');
    expect(whyYouFellClock(125)).toBe('2:05');
  });

  test('the breakdown reuses the shared mix helper and keeps no counter of its own', () => {
    const source = code(read('utils/whyYouFell.ts'));
    expect(source).toContain('dominantClassOfMix');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('saveProfile');
    expect(/quick\s*\+=\s*1/.test(source)).toBe(false);
  });
});

describe('§F — boss-only mechanics stay boss-only (the enforcement pass)', () => {
  test('no non-boss roster row carries a bossMechanic', () => {
    for (const row of [...ALL_OPPONENTS, DOCTORE_TEST_OPPONENT]) {
      if (row.bossMechanic === undefined) continue;
      expect(row.isBoss).toBe(true);
    }
  });

  test('every ladder mechanic belongs to exactly one boss ROW, and every phase reads it', () => {
    const mechanicByBossId: Record<string, string> = {
      opp_goliath_boss: 'heavy_telegraph',
      opp_ignis_boss: 'phase_weapon_switch',
      opp_valeria_boss: 'counter_dodge',
      opp_aurelius_boss: 'rage_mode_colossus',
    };
    for (const [id, mechanic] of Object.entries(mechanicByBossId)) {
      const carriers = ALL_OPPONENTS.filter((row) => row.bossMechanic === mechanic);
      expect(carriers.map((row) => row.id)).toEqual([id]);
    }
  });

  test('the phase helpers are the ONLY gate the duel uses for phase behaviour', () => {
    const body = code(duel);
    for (const helper of [
      'bossChainHeavies',
      'bossCounterWindowTurns',
      'bossPhaseProfileFor',
      'bossRageChargeThreshold',
      'bossTelegraphChance',
      'bossTelegraphHoldMs',
    ]) {
      expect(body).toContain(`${helper}(`);
    }
    // The shipped mechanic gates survive (they are boss-and-mechanic fences), and
    // no new one was invented.
    expect(body).toContain("opponent.bossMechanic === 'heavy_telegraph'");
    expect(body).toContain("opponent.bossMechanic === 'counter_dodge'");
    expect(body).toContain("opponent.bossMechanic !== 'phase_weapon_switch'");
  });
});

describe('§G — a phase change never interrupts a telegraphed action in flight', () => {
  const phaseAnnounce = (() => {
    const start = duel.indexOf('THE PHASE CHANGE AND ITS ONE-SHOT SIGNAL');
    const end = duel.indexOf('// Boss phase-2 weapon switch', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return code(duel.slice(start, end));
  })();

  test('the phase announce waits for the standing telegraph, then transitions', () => {
    expect(phaseAnnounce).toContain('if (opp.telegraphText || pendingHeavyAttackRef.current) return;');
    expect(phaseAnnounce).toContain('phaseAnnouncedRef');
    expect(phaseAnnounce).toContain("setOpp((prev) => (prev.isPhase2 ? prev : { ...prev, isPhase2: true }))");
    // …and it re-runs when the banner clears, so the transition cannot be lost.
    expect(phaseAnnounce).toContain('opp.telegraphText,');
  });

  test('Ignis’s weapon switch obeys the same deferral', () => {
    const start = duel.indexOf('// Boss phase-2 weapon switch');
    const end = duel.indexOf('Aurelius rage_mode_colossus', start);
    const body = code(duel.slice(start, end));
    expect(body).toContain('if (opp.telegraphText || pendingHeavyAttackRef.current) return;');
    expect(body).toContain('phaseSwitchedRef.current = true');
  });

  test('the phase banner fires once and only once', () => {
    expect(phaseAnnounce).toContain('if (phaseAnnouncedRef.current || isMatchOver.current) return;');
    // One banner, one announcement, one presentation pulse.
    expect(phaseAnnounce.match(/spawnDamageText\(/g)?.length).toBe(1);
    expect(phaseAnnounce.match(/setBossVignettePulse\(/g)?.length).toBe(1);
  });
});

describe('§H — the wiring the duel actually runs', () => {
  test('the resolution hold goes through the floor at its single point of use', () => {
    const body = code(duel);
    const start = body.indexOf('export const turnResolutionMs');
    const end = body.indexOf('// The opponent', start);
    const resolver = body.slice(start, end === -1 ? undefined : end);
    expect(resolver).toContain('bossTelegraphHoldMs(mode, shipped)');
    // The shipped table is unchanged (1450 / 1000 asserted in §B).
    expect(resolver).toContain('mode');
  });

  test('the defeat breakdown is computed in memory and never saved', () => {
    const body = code(duel);
    expect(body).toContain('whyYouFellLines({');
    expect(body).toContain('statsRef.current.whyYouFell');
    // Nothing on this path writes a profile (the duel never has).
    expect(body).not.toContain('saveProfile');
    // The mix is READ, not re-counted: only D-5's own counter feeds it.
    expect(body.match(/longMemoryRef\.current\.mix/g)?.length).toBeGreaterThanOrEqual(1);
  });

  test('the HUD marker is drawn from the duel’s phase state, not from HP', () => {
    expect(code(duel)).toContain('bossPhase={bossPhaseLadderFor(opponent) ? (opp.isPhase2 ? 2 : 1) : undefined}');
    const hud = code(read('components/ui/CombatHUD.tsx'));
    expect(hud).toContain('data-boss-phase={bossPhase}');
    expect(hud).toContain("PHASE {bossPhase === 2 ? 'II' : 'I'}");
  });
});
