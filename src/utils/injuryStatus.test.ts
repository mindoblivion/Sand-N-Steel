/**
 * L8 (Living City) — the injury's presentation model.
 *
 * L7 shipped the injury lifecycle with no reader in the UI. This suite covers the one
 * presentation helper the three screens now share and the wiring that carries the
 * SETTLED injury to them, and nothing else: no lifecycle rule, no settlement, no
 * city-day, no reward and no save behaviour is restated or changed here.
 *
 * Written in the two registers the neighbouring suites use (`cityClock`,
 * `injurySettlement`, `storefrontPurchase`):
 *
 *   §A  `describeInjury`: the penalties and duration a screen shows, `null` for an
 *       absent / malformed / spent record, and the same normalization the stat
 *       calculation reads
 *   §B  the stats screen: an active injury is shown, an absent one renders nothing
 *   §C  the pre-fight screen: a concise warning when injured, no container when not
 *   §D  the result screen: the POST-SETTLEMENT injury, never an inference from the
 *       outcome, including the refresh on a defeat and the expiry after a victory
 *   §E  nothing gameplay-side moved: the settlement, the clock, the latch, the
 *       rewards and persistence are untouched
 *
 * Run with: `bun test src/utils/injuryStatus.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { normalizeInjury, settleInjury } from './injurySettlement';
import { describeInjury } from './injuryStatus';

const helperSource = readFileSync(new URL('./injuryStatus.ts', import.meta.url), 'utf8');
const statsTabSource = readFileSync(new URL('../components/hub/StatsTab.tsx', import.meta.url), 'utf8');
const preFightSource = readFileSync(new URL('../components/hub/PreFightModal.tsx', import.meta.url), 'utf8');
const resultModalSource = readFileSync(new URL('../components/hub/DuelResultModal.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const cityHubSource = readFileSync(new URL('../components/3d/city/CityHubScene.tsx', import.meta.url), 'utf8');
const schoolHubSource = readFileSync(new URL('../components/hub/GladiatorSchoolHub.tsx', import.meta.url), 'utf8');

/** Source with every comment removed, so prose can neither satisfy nor defeat a check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

const APPROVED_INJURY = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };

// ── §A. The presentation model ───────────────────────────────────────────────

describe('§A — describeInjury turns the one stored injury into what a screen shows', () => {
  test('an approved injury shows exactly its two penalties and two duels', () => {
    expect(describeInjury({ ...APPROVED_INJURY })).toEqual({
      penaltyStrength: 2,
      penaltyAgility: 2,
      fightsRemaining: 2,
      durationLabel: 'Affects the next 2 completed duels',
    });
  });

  test('one remaining fight reads in the singular', () => {
    const status = describeInjury({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 });
    expect(status?.fightsRemaining).toBe(1);
    expect(status?.durationLabel).toBe('Affects the next completed duel');
  });

  test('a longer legacy duration reads its own count', () => {
    const status = describeInjury({ fightsRemaining: 5, penaltyStrength: 2, penaltyAgility: 2 });
    expect(status?.durationLabel).toBe('Affects the next 5 completed duels');
  });

  test('an absent injury has nothing to show', () => {
    expect(describeInjury(null)).toBeNull();
    expect(describeInjury(undefined)).toBeNull();
  });

  test('an invalid or spent record has nothing to show', () => {
    const unusable: unknown[] = [
      {},
      [],
      [{ fightsRemaining: 2 }],
      'injured',
      7,
      { fightsRemaining: 0, penaltyStrength: 2, penaltyAgility: 2 },
      { fightsRemaining: -2, penaltyStrength: 2, penaltyAgility: 2 },
      { fightsRemaining: Number.NaN, penaltyStrength: 2, penaltyAgility: 2 },
      { fightsRemaining: Number.POSITIVE_INFINITY, penaltyStrength: 2, penaltyAgility: 2 },
      { fightsRemaining: '2', penaltyStrength: 2, penaltyAgility: 2 },
      { penaltyStrength: 2, penaltyAgility: 2 },
    ];
    for (const value of unusable) {
      expect(describeInjury(value)).toBeNull();
    }
  });

  test('a malformed penalty resolves to the canonical 2, never to NaN', () => {
    const status = describeInjury({ fightsRemaining: 2, penaltyStrength: Number.NaN, penaltyAgility: Infinity });
    expect(status).toEqual({
      penaltyStrength: 2,
      penaltyAgility: 2,
      fightsRemaining: 2,
      durationLabel: 'Affects the next 2 completed duels',
    });
    expect(Number.isFinite(status!.penaltyStrength)).toBe(true);
    expect(Number.isFinite(status!.penaltyAgility)).toBe(true);
  });

  test('a negative penalty clamps to 0 rather than showing a bonus', () => {
    const status = describeInjury({ fightsRemaining: 2, penaltyStrength: -4, penaltyAgility: -0.5 });
    expect(status?.penaltyStrength).toBe(0);
    expect(status?.penaltyAgility).toBe(0);
  });

  test('a fractional duration floors, exactly like the stat path reads it', () => {
    const status = describeInjury({ fightsRemaining: 1.5, penaltyStrength: 2, penaltyAgility: 2 });
    expect(status?.fightsRemaining).toBe(1);
    expect(status?.durationLabel).toBe('Affects the next completed duel');
  });

  test('the screen reads the SAME normalization calculateTotalStats applies', () => {
    const records: unknown[] = [
      { ...APPROVED_INJURY },
      { fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 },
      { fightsRemaining: 2, penaltyStrength: 3, penaltyAgility: 1 },
      { fightsRemaining: 0, penaltyStrength: 2, penaltyAgility: 2 },
      {},
      null,
    ];
    for (const record of records) {
      const normalized = normalizeInjury(record);
      const status = describeInjury(record);
      if (!normalized) {
        expect(status).toBeNull();
        continue;
      }
      expect(status).not.toBeNull();
      expect(status!.penaltyStrength).toBe(normalized.penaltyStrength);
      expect(status!.penaltyAgility).toBe(normalized.penaltyAgility);
      expect(status!.fightsRemaining).toBe(normalized.fightsRemaining);
    }
  });

  test('the helper mutates nothing it is handed', () => {
    const injury = { ...APPROVED_INJURY };
    const snapshot = JSON.stringify(injury);
    describeInjury(injury);
    expect(JSON.stringify(injury)).toBe(snapshot);
  });

  test('the helper is pure and reuses the canonical reader', () => {
    const body = code(helperSource);
    expect(body).toContain("import { normalizeInjury } from './injurySettlement';");
    expect(body).toContain('normalizeInjury(value)');
    for (const forbidden of ['localStorage', 'sessionStorage', 'Date.now', 'setTimeout', 'Math.random', 'settleInjury(']) {
      expect(body).not.toContain(forbidden);
    }
    // The validity rules are NOT restated here.
    expect(body).not.toContain('Number.isFinite');
    expect(body).not.toContain('Math.floor');
  });
});

// ── §B. The stats screen ────────────────────────────────────────────────────

describe('§B — the stats screen shows an active injury', () => {
  const body = code(statsTabSource);

  test('it reads the one canonical presentation helper', () => {
    expect(body).toContain("import { describeInjury } from '../../utils/injuryStatus';");
    expect(body).toContain('describeInjury(profile.injury)');
  });

  test('it names the injury, both penalties and the remaining duels', () => {
    expect(body).toContain('Injured');
    expect(body).toContain('injury.penaltyStrength');
    expect(body).toContain('injury.penaltyAgility');
    expect(body).toContain('injury.durationLabel');
  });

  test('the panel exists only when there is an injury', () => {
    expect(body).toContain('{injury && (');
    expect(body).toContain('data-testid="stats-injury-status"');
  });

  test('it is presentation only — no settlement, no storage, no stat math', () => {
    expect(body).not.toContain('settleInjury');
    expect(body).not.toContain('normalizeInjury');
    expect(body).not.toContain('localStorage');
    expect(body).not.toContain('saveProfile');
  });
});

// ── §C. The pre-fight screen ────────────────────────────────────────────────

describe('§C — the pre-fight briefing warns about an active injury', () => {
  const body = code(preFightSource);

  test('it takes the injury and reads the canonical helper', () => {
    expect(body).toContain('injury?: PlayerInjury | null;');
    expect(body).toContain('describeInjury(injury)');
  });

  test('the warning names the penalties and the remaining duration', () => {
    expect(body).toContain('Injured');
    expect(body).toContain('injuryStatus.penaltyStrength');
    expect(body).toContain('injuryStatus.penaltyAgility');
    expect(body).toContain('injuryStatus.durationLabel');
  });

  test('no warning container is rendered when uninjured', () => {
    expect(body).toContain('{injuryStatus && (');
    expect(body).toContain('data-testid="prefight-injury-status"');
  });

  test('both briefing call sites hand it the profile injury', () => {
    expect(code(cityHubSource)).toContain('injury={playerProfile.injury}');
    expect(code(schoolHubSource)).toContain('injury={playerProfile.injury}');
  });
});

// ── §D. The result screen ───────────────────────────────────────────────────

describe('§D — the result screen reflects the POST-SETTLEMENT injury', () => {
  const body = code(resultModalSource);

  test('it takes the settled injury, not the outcome', () => {
    expect(body).toContain('injury?: PlayerInjury | null;');
    expect(body).toContain('describeInjury(injury)');
  });

  test('it shows the penalties and the updated duration', () => {
    expect(body).toContain('injuryStatus.penaltyStrength');
    expect(body).toContain('injuryStatus.penaltyAgility');
    expect(body).toContain('injuryStatus.durationLabel');
  });

  test('a new injury and a surviving one read differently', () => {
    expect(body).toContain("didWin ? 'Still injured' : 'Injured'");
  });

  test('an expired injury renders nothing (no stale warning)', () => {
    expect(body).toContain('{injuryStatus && (');
    expect(body).toContain('data-testid="duel-injury-status"');
  });

  test("App carries settleInjury's own output into the result", () => {
    const app = code(appSource);
    // REBASED (L13A): computed once, from the settlement's newest-committed base.
    expect(app).toContain('const injury = settleInjury(base, didWin).injury ?? null;');
    expect(app).toContain('setDuelResult({ didWin, stats, injury });');
    expect(app).toContain('injury={duelResult.injury}');
    // The value carried is the settlement's, computed once, before the branches.
    const handler = between(app, 'const handleMatchComplete', 'const handleDuelResultDismiss');
    expect(handler.match(/settleInjury\(/g)?.length).toBe(1);
    expect(handler.indexOf('settleInjury(base, didWin)')).toBeLessThan(handler.indexOf('setDuelResult('));
  });

  test('the refresh and the expiry the screen must show are the settlement’s own results', () => {
    const base = { name: 'Verifier', injury: null } as unknown as { name: string; injury: unknown };
    const fresh = settleInjury({ ...base } as never, false) as unknown as { injury: unknown };
    expect(describeInjury(fresh.injury)?.durationLabel).toBe('Affects the next 2 completed duels');

    const refreshed = settleInjury(
      { ...base, injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 } } as never,
      false,
    ) as unknown as { injury: unknown };
    expect(describeInjury(refreshed.injury)?.fightsRemaining).toBe(2);

    const survived = settleInjury(
      { ...base, injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 } } as never,
      true,
    ) as unknown as { injury: unknown };
    expect(describeInjury(survived.injury)?.durationLabel).toBe('Affects the next completed duel');

    const expired = settleInjury(
      { ...base, injury: { fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 } } as never,
      true,
    ) as unknown as { injury: unknown };
    expect(describeInjury(expired.injury)).toBeNull();
  });
});

// ── §E. Nothing gameplay-side moved ─────────────────────────────────────────

describe('§E — the lifecycle, the clock, the latch and persistence are untouched', () => {
  const app = code(appSource);

  test('the injury is still settled exactly once, in the one settlement handler', () => {
    expect(app.match(/settleInjury\(/g)?.length).toBe(1);
    // The presentation helper is never used to decide anything in App.
    expect(app).not.toContain('describeInjury');
  });

  test('the city clock keeps its one call site', () => {
    expect(app.match(/advanceCityDay\(/g)?.length).toBe(1);
  });

  test('the per-bout claim still guards both branches', () => {
    const handler = between(app, 'const handleMatchComplete', 'const handleDuelResultDismiss');
    expect(handler).toContain('if (!duelSettlementRef.current.claim(settledDuelId)) return;');
    expect(handler.indexOf('claim(settledDuelId)')).toBeLessThan(handler.indexOf('const injury ='));
    expect(handler.match(/saveProfile\(/g)?.length).toBe(2);
  });

  test('no UI component settles, normalizes or writes an injury', () => {
    for (const source of [statsTabSource, preFightSource, resultModalSource, cityHubSource, schoolHubSource]) {
      const body = code(source);
      expect(body).not.toContain('settleInjury');
      expect(body).not.toContain('normalizeInjury');
      expect(body).not.toContain('localStorage');
      expect(body).not.toContain('saveProfile');
    }
  });

  test('the presentation helper is not part of the settlement path', () => {
    const settlement = code(readFileSync(new URL('./injurySettlement.ts', import.meta.url), 'utf8'));
    expect(settlement).not.toContain('describeInjury');
    expect(settlement).not.toContain('injuryStatus');
  });
});
