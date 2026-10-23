/**
 * Phase C-8.78B — Crowd Momentum reward accuracy + hit-stop regression pins.
 * ===========================================================================
 * Two narrow pieces of coverage, no gameplay change beyond one chronicle string.
 *
 *   §A–§C  Crowd Momentum reports what the meter actually did.
 *          `crowdMomentumReward` now returns `hypeAwarded` — the grant AFTER the
 *          100-point cap — alongside the nominal `hypeGain`. The confirmed defect
 *          (C-8.78A §D1) was the caller printing `+10% Hype` at hype 100 while the
 *          meter stayed at 100. Normal gains, partial gains near the ceiling and
 *          the zero-award case at the ceiling are driven through the PRODUCTION
 *          helper here; the thresholds, the cap, the transition rule and the gold
 *          payout are re-pinned as unchanged.
 *
 *   §D     The shipped caller reads `hypeAwarded`, keeps the milestone gate and
 *          the single hype write, and says something truthful when the award is 0.
 *          Source-level, because there is no DOM renderer for `<DuelScene/>`.
 *
 *   §E–§H  The hit-stop configuration C-8.78A §2/U2 flagged as unpinned:
 *          `HIT_STOP_MS`, `SHAKE_TRAUMA` and the camera response are read out of
 *          `DuelScene.tsx` and evaluated, and the blocked → telegraphed heavy →
 *          crit → quick → power precedence is exercised as a real expression.
 *          NO value is changed by this phase; these tests exist so a future edit
 *          that renames a key, deletes a constant or drifts a duration fails here.
 *          They also pin that the brief's "≈140 ms" is the DIFFERENCE between the
 *          telegraphed heavy (200) and a quick strike (60), not a configured hold.
 *
 *   §I     `impactAnimationScale` — the shipped pure helper both fighters'
 *          mixers read — is exercised on a controlled clock (0 while held, 1 at
 *          and after the deadline), plus its two wiring sites in `GladiatorMesh`.
 *
 * Extraction is whitespace-insensitive and comment-tolerant (regex + brace
 * matching + `new Function`), so re-formatting the constant blocks cannot fail
 * these tests — only a real rename, deletion or value change can.
 *
 * Run with: bun test src/utils/phaseC8_78b.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  CROWD_HYPE_MAX,
  CROWD_MOMENTUM_HYPE_GAIN,
  crowdMomentumReward,
} from './crowdMomentum';
import { impactAnimationScale } from '../components/3d/GladiatorMesh';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const meshSource = readFileSync(
  new URL('../components/3d/GladiatorMesh.tsx', import.meta.url),
  'utf8',
);

/** The duel's own starting hype (`DuelScene`'s `useState(25)`). */
const HYPE_START = 25;

// ── Source readers (formatting-tolerant, fail loudly if a name disappears) ──

/** Read `const <name> = { key: number, … }` out of a source file. */
function numberObject(source: string, name: string): Record<string, number> {
  const opener = new RegExp(`const\\s+${name}\\s*=\\s*\\{`).exec(source);
  if (!opener) throw new Error(`\`${name}\` is no longer declared in the source`);
  const start = opener.index + opener[0].length;
  const end = source.indexOf('}', start);
  if (end < 0) throw new Error(`\`${name}\` has no closing brace`);
  const body = source.slice(start, end);
  const out: Record<string, number> = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*(-?\d+(?:\.\d+)?)/g)) out[m[1]] = Number(m[2]);
  return out;
}

/** Read the right-hand side of `const <name> = <expression>;`. */
function assignmentExpression(source: string, name: string): string {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);`).exec(source);
  if (!m) throw new Error(`\`${name}\` is no longer declared in the source`);
  return m[1];
}

/** Read a plain numeric constant `const <name> = <number>;`. */
function numberConstant(source: string, name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;`).exec(source);
  if (!m) throw new Error(`\`${name}\` is no longer a numeric literal in the source`);
  return Number(m[1]);
}

// ── §A  Crowd Momentum: normal gains ──────────────────────────────────────
describe('C-8.78B — an ordinary milestone reports the full +10', () => {
  test('a milestone below the ceiling gains exactly the configured amount', () => {
    const reward = crowdMomentumReward(HYPE_START, 2, 3);
    expect(reward.milestone).toBe(true);
    expect(reward.hypeGain).toBe(CROWD_MOMENTUM_HYPE_GAIN);
    expect(reward.hypeAwarded).toBe(CROWD_MOMENTUM_HYPE_GAIN);
    expect(reward.hype).toBe(HYPE_START + CROWD_MOMENTUM_HYPE_GAIN);
  });

  test('every milestone of a clean streak pays its full amount', () => {
    let hype = HYPE_START;
    let combo = 0;
    const awards: number[] = [];
    for (let hit = 1; hit <= 9; hit++) {
      const previous = combo;
      combo += 1; // the duel's `landed` event
      const reward = crowdMomentumReward(hype, previous, combo);
      hype = reward.hype;
      if (reward.milestone) awards.push(reward.hypeAwarded);
    }
    expect(awards).toEqual([10, 10, 10]); // 25 → 55, all three uncapped
    expect(hype).toBe(55);
  });

  test('a transition that is not a milestone awards nothing and claims nothing', () => {
    for (const [previous, combo] of [[2, 2], [3, 4], [0, 1], [6, 6]] as const) {
      const reward = crowdMomentumReward(HYPE_START, previous, combo);
      expect(reward.milestone).toBe(false);
      expect(reward.hypeGain).toBe(0);
      expect(reward.hypeAwarded).toBe(0);
      expect(reward.hype).toBe(HYPE_START);
    }
  });

  test('a malformed meter is treated as empty, and the award is the real gain', () => {
    for (const junk of [Number.NaN, Number.POSITIVE_INFINITY, -40]) {
      const reward = crowdMomentumReward(junk, 2, 3);
      expect(reward.hype).toBe(CROWD_MOMENTUM_HYPE_GAIN);
      expect(reward.hypeAwarded).toBe(CROWD_MOMENTUM_HYPE_GAIN);
    }
  });
});

// ── §B  Crowd Momentum: partial gains near the cap ────────────────────────
describe('C-8.78B — near the ceiling the award is the remaining headroom', () => {
  test('95 gains 5, not 10', () => {
    const reward = crowdMomentumReward(95, 2, 3);
    expect(reward.hypeGain).toBe(10); // the milestone is still worth 10…
    expect(reward.hypeAwarded).toBe(5); // …but only 5 fits
    expect(reward.hype).toBe(CROWD_HYPE_MAX);
  });

  test('99.5 gains 0.5 and lands exactly on the ceiling', () => {
    const reward = crowdMomentumReward(99.5, 5, 6);
    expect(reward.hypeAwarded).toBe(0.5);
    expect(reward.hype).toBe(CROWD_HYPE_MAX);
  });

  test('91 gains 9', () => {
    expect(crowdMomentumReward(91, 8, 9).hypeAwarded).toBe(9);
  });

  test('awarded + previous always equals the new meter reading', () => {
    for (let hype = 0; hype <= CROWD_HYPE_MAX; hype += 0.5) {
      const reward = crowdMomentumReward(hype, 2, 3);
      expect(reward.hypeAwarded).toBeCloseTo(reward.hype - hype, 10);
      expect(reward.hypeAwarded).toBeLessThanOrEqual(reward.hypeGain);
      expect(reward.hype).toBeLessThanOrEqual(CROWD_HYPE_MAX);
    }
  });
});

// ── §C  Crowd Momentum: zero gain at the cap (the reported defect) ────────
describe('C-8.78B — at the ceiling the milestone pays nothing and says so', () => {
  test('hype 100: the milestone still triggers but awards 0', () => {
    const reward = crowdMomentumReward(CROWD_HYPE_MAX, 2, 3);
    expect(reward.milestone).toBe(true);
    expect(reward.hypeGain).toBe(10); // nominal value, unchanged
    expect(reward.hypeAwarded).toBe(0); // the meter did not move
    expect(reward.hype).toBe(CROWD_HYPE_MAX);
  });

  test('every later milestone at the ceiling also awards 0', () => {
    for (const [previous, combo] of [[5, 6], [8, 9], [11, 12]] as const) {
      const reward = crowdMomentumReward(CROWD_HYPE_MAX, previous, combo);
      expect(reward.hypeAwarded).toBe(0);
      expect(reward.hype).toBe(CROWD_HYPE_MAX);
    }
  });

  test('an over-cap reading is clamped first, so the award is still 0', () => {
    expect(crowdMomentumReward(120, 2, 3).hypeAwarded).toBe(0);
    expect(crowdMomentumReward(120, 2, 3).hype).toBe(CROWD_HYPE_MAX);
  });

  test('awarded is 0 exactly when the meter is full, and never negative', () => {
    expect(crowdMomentumReward(CROWD_HYPE_MAX, 2, 3).hypeAwarded).toBe(0);
    expect(crowdMomentumReward(CROWD_HYPE_MAX - 0.001, 2, 3).hypeAwarded).toBeGreaterThan(0);
    expect(crowdMomentumReward(0, 2, 3).hypeAwarded).toBe(10);
  });
});

// ── §D  The shipped caller reports the real movement ──────────────────────
describe('C-8.78B — the chronicle line is driven by hypeAwarded', () => {
  test('the reward is still evaluated once, destructuring the awarded amount', () => {
    expect(duelSource.split('crowdMomentumReward(').length - 1).toBe(1);
    expect(duelSource).toContain(
      'const { hypeGain, hype, hypeAwarded } = crowdMomentumReward(',
    );
  });

  test('the line prints the awarded amount and never the nominal gain', () => {
    expect(duelSource).toContain('(+${hypeAwarded}% Hype)');
    expect(duelSource).not.toContain('(+${hypeGain}% Hype)');
  });

  test('a zero award gets its own truthful line, gated on the real movement', () => {
    expect(duelSource).toContain('hypeAwarded > 0');
    expect(duelSource).toContain('the Hype is already at its full');
    expect(duelSource).toContain('${CROWD_HYPE_MAX}%');
    expect(duelSource).toContain(
      "import { CROWD_HYPE_MAX, crowdMomentumReward } from '../../utils/crowdMomentum';",
    );
  });

  test('the milestone gate and the single hype write are unchanged', () => {
    const call = duelSource.indexOf('crowdMomentumReward(');
    const gate = duelSource.indexOf('if (hypeGain === 0) return;', call);
    const write = duelSource.indexOf('updateCrowdHype(() => hype);', call);
    const log = duelSource.indexOf('CROWD MOMENTUM!', call);
    expect(gate).toBeGreaterThan(call);
    expect(write).toBeGreaterThan(gate);
    expect(log).toBeGreaterThan(gate);
    // The gate reads the NOMINAL gain, so a capped milestone still celebrates.
    expect(duelSource).not.toContain('if (hypeAwarded === 0) return;');
  });
});

// ── §E  Hit-stop holds, pinned at their shipped values ────────────────────
const HIT_STOP_MS = numberObject(duelSource, 'HIT_STOP_MS');
const SHAKE_TRAUMA = numberObject(duelSource, 'SHAKE_TRAUMA');

describe('C-8.78B — HIT_STOP_MS is exactly as shipped', () => {
  test('the constant still exists with exactly these five keys', () => {
    expect(Object.keys(HIT_STOP_MS).sort()).toEqual(
      ['blocked', 'crit', 'power', 'quick', 'telegraphedHeavy'],
    );
  });

  test('the five holds are 40 / 60 / 110 / 170 / 200 ms', () => {
    expect(HIT_STOP_MS.blocked).toBe(40);
    expect(HIT_STOP_MS.quick).toBe(60);
    expect(HIT_STOP_MS.power).toBe(110);
    expect(HIT_STOP_MS.crit).toBe(170);
    expect(HIT_STOP_MS.telegraphedHeavy).toBe(200);
  });

  test('the holds keep their severity order, blocked shortest / heavy longest', () => {
    const held = [
      HIT_STOP_MS.blocked,
      HIT_STOP_MS.quick,
      HIT_STOP_MS.power,
      HIT_STOP_MS.crit,
      HIT_STOP_MS.telegraphedHeavy,
    ];
    expect(held).toEqual([...held].sort((a, b) => a - b));
    expect(new Set(held).size).toBe(held.length);
  });

  test('every hold fits inside one turn, so none can reach a turn boundary', () => {
    for (const hold of Object.values(HIT_STOP_MS)) {
      expect(hold).toBeGreaterThan(0);
      expect(hold).toBeLessThan(1100); // the 1100 ms resolution window
    }
  });
});

// ── §F  The relationship the documentation must not confuse ───────────────
describe('C-8.78B — 140 ms is the heavy-minus-quick DELTA, not a hold', () => {
  test('the difference between the telegraphed heavy and a quick strike is 140', () => {
    expect(HIT_STOP_MS.telegraphedHeavy - HIT_STOP_MS.quick).toBe(140);
  });

  test('no configured hold is 140, and no key claims to be', () => {
    expect(Object.values(HIT_STOP_MS)).not.toContain(140);
    expect(Object.keys(HIT_STOP_MS)).not.toContain('telegraphed');
    expect(duelSource.split('HIT_STOP_MS.telegraphedHeavy').length - 1).toBeGreaterThan(0);
  });
});

// ── §G  Precedence, evaluated as the real expression ──────────────────────
type Stop = Record<string, number>;

const freezeExpression = assignmentExpression(duelSource, 'freezeMs');
const traumaExpression = assignmentExpression(duelSource, 'trauma');

const resolveFreeze = new Function(
  'HIT_STOP_MS',
  'isBlocked',
  'isTelegraphedHeavy',
  'isCrit',
  'isQuick',
  `return (${freezeExpression});`,
) as (stop: Stop, blocked: boolean, telegraphed: boolean, crit: boolean, quick: boolean) => number;

const resolveTrauma = new Function(
  'SHAKE_TRAUMA',
  'isActorPlayer',
  'isCrit',
  'isQuick',
  `return (${traumaExpression});`,
) as (shake: Stop, actorIsPlayer: boolean, crit: boolean, quick: boolean) => number;

describe('C-8.78B — hit-stop precedence: blocked → telegraphed → crit → quick → power', () => {
  test('blocked wins over everything', () => {
    expect(resolveFreeze(HIT_STOP_MS, true, true, true, true)).toBe(HIT_STOP_MS.blocked);
  });

  test('the telegraphed heavy wins over a crit and a quick strike', () => {
    expect(resolveFreeze(HIT_STOP_MS, false, true, true, true)).toBe(
      HIT_STOP_MS.telegraphedHeavy,
    );
  });

  test('a crit wins over a quick strike', () => {
    expect(resolveFreeze(HIT_STOP_MS, false, false, true, true)).toBe(HIT_STOP_MS.crit);
  });

  test('quick wins only on a plain quick strike, otherwise the blow is a power attack', () => {
    expect(resolveFreeze(HIT_STOP_MS, false, false, false, true)).toBe(HIT_STOP_MS.quick);
    expect(resolveFreeze(HIT_STOP_MS, false, false, false, false)).toBe(HIT_STOP_MS.power);
  });

  test('the hold is written as a wall-clock deadline, not a timer', () => {
    expect(duelSource).toContain('impactRef.current.freezeUntil = performance.now() + freezeMs;');
    expect(duelSource).not.toContain('setTimeout(() => {\n              impactRef');
  });
});

describe('C-8.78B — shake trauma: the player\'s blow earns it, a blow received is flat', () => {
  test('SHAKE_TRAUMA is exactly as shipped', () => {
    expect(Object.keys(SHAKE_TRAUMA).sort()).toEqual(['crit', 'playerHit', 'power', 'quick']);
    expect(SHAKE_TRAUMA.quick).toBe(0.25);
    expect(SHAKE_TRAUMA.power).toBe(0.45);
    expect(SHAKE_TRAUMA.crit).toBe(0.7);
    expect(SHAKE_TRAUMA.playerHit).toBe(0.2);
  });

  test('a landed crit / quick / power attack scales with what the player landed', () => {
    expect(resolveTrauma(SHAKE_TRAUMA, true, true, false)).toBe(SHAKE_TRAUMA.crit);
    expect(resolveTrauma(SHAKE_TRAUMA, true, false, true)).toBe(SHAKE_TRAUMA.quick);
    expect(resolveTrauma(SHAKE_TRAUMA, true, false, false)).toBe(SHAKE_TRAUMA.power);
  });

  test('a blow the player RECEIVES is one flat value, never both', () => {
    expect(resolveTrauma(SHAKE_TRAUMA, false, true, true)).toBe(SHAKE_TRAUMA.playerHit);
    expect(resolveTrauma(SHAKE_TRAUMA, false, false, false)).toBe(SHAKE_TRAUMA.playerHit);
  });

  test('a crit shakes hardest and trauma accumulates into a 0…1 clamp', () => {
    expect(SHAKE_TRAUMA.crit).toBeGreaterThan(SHAKE_TRAUMA.power);
    expect(SHAKE_TRAUMA.power).toBeGreaterThan(SHAKE_TRAUMA.quick);
    expect(SHAKE_TRAUMA.quick).toBeGreaterThan(SHAKE_TRAUMA.playerHit);
    expect(duelSource).toContain(
      'impactRef.current.trauma = Math.min(1, impactRef.current.trauma + trauma);',
    );
  });
});

// ── §H  The camera response those traumas feed ────────────────────────────
describe('C-8.78B — camera shake response is pinned', () => {
  test('the amplitudes and decay are the shipped ones', () => {
    expect(numberConstant(duelSource, 'CAMERA_SHAKE_POSITION_AMPLITUDE')).toBe(0.18);
    expect(numberConstant(duelSource, 'CAMERA_SHAKE_LOOK_DEGREES')).toBe(0.6);
    expect(numberConstant(duelSource, 'CAMERA_SHAKE_TRAUMA_DECAY')).toBe(1.6); // units per second
  });
});

// ── §I  impactAnimationScale, driven on a controlled clock ────────────────
describe('C-8.78B — impactAnimationScale holds the mixers and nothing else', () => {
  test('0 strictly before the deadline, 1 at and after it', () => {
    const impact = { freezeUntil: 1_000, trauma: 0.4 };
    expect(impactAnimationScale(impact, 999)).toBe(0);
    expect(impactAnimationScale(impact, 1_000)).toBe(1); // wall-clock comparison, not a timer
    expect(impactAnimationScale(impact, 1_001)).toBe(1);
  });

  test('no impact, a cleared impact or an expired one all animate normally', () => {
    expect(impactAnimationScale(null, 500)).toBe(1);
    expect(impactAnimationScale(undefined, 500)).toBe(1);
    expect(impactAnimationScale({ freezeUntil: 0, trauma: 0 }, 500)).toBe(1);
  });

  test('a hold scales animation time by exactly 0 (the value the mixer reads)', () => {
    const delta = 1 / 60;
    const impact = { freezeUntil: 2_000, trauma: 0 };
    expect(delta * impactAnimationScale(impact, 1_999)).toBe(0);
    expect(delta * impactAnimationScale(impact, 2_000)).toBeCloseTo(delta, 12);
  });

  test('both fighters read it from the shared ref, in their own frame loops', () => {
    expect(meshSource).toContain('mixer.timeScale = impactAnimationScale(impactRef?.current);');
    expect(meshSource).toContain('delta * impactAnimationScale(impactRef?.current)');
    expect(meshSource.split('impactAnimationScale(').length - 1).toBe(3); // 1 definition + 2 uses
  });
});
