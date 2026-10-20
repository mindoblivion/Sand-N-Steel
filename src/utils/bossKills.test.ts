/**
 * FIX-A — `profile.bossKills` and its one writer.
 *
 * Run with: `bun test src/utils/bossKills.test.ts`
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A a first boss defeat raises the count by exactly one and records the id
 *      in the same write;
 *   §B a rematch against that same boss raises nothing (it is not a new kill);
 *   §C a non-boss victory records its id and leaves the count alone;
 *   §D a defeat changes nothing at all, and malformed saves read as zero;
 *   §E a gladiator one Tier-4 boss away from Legend derives Legend after that
 *      boss's first defeat, with the count and the felled id agreeing;
 *   §F the banner's stripes follow the count (0 / 1 / 4);
 *   §G the single-writer invariant — `src/utils/bossKills.ts` is the only place
 *      in `src/` that can raise the field, and `App.handleMatchComplete`'s
 *      victory branch is its only caller (the defeat branch never mentions it).
 *
 * The win composition the tests drive is the one `App.handleMatchComplete`
 * performs: the ids are appended exactly as that write does, and the count is
 * the value that same write carries. Nothing here reads storage or the clock.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { OpponentConfig, PlayerProfile } from '../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { nextBossKills } from './bossKills';
import { deriveRank, LEGEND_FAME } from './rank';
import { bannerStripeCount, resolveBanner } from './heraldry';

/** A minimal but complete save, in the shape `services/storage` writes. */
function base(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 0,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...overrides,
  };
}

/**
 * The victory write `App.handleMatchComplete` performs, reduced to the two fields
 * this rule touches: the ids are appended exactly as that write appends them, and
 * the count is read from — and carried by — the profile that same write saves.
 */
function victoryWrite(profile: PlayerProfile, opponent: OpponentConfig): PlayerProfile {
  const defeated = profile.defeatedOpponentIds.includes(opponent.id)
    ? profile.defeatedOpponentIds
    : [...profile.defeatedOpponentIds, opponent.id];

  return {
    ...profile,
    defeatedOpponentIds: defeated,
    bossKills: nextBossKills(profile, { defeatedOpponentIds: defeated }, opponent),
  };
}

const BOSSES = ALL_OPPONENTS.filter((opponent) => opponent.isBoss === true);
const TIER_FOUR_BOSS = ALL_OPPONENTS.find(
  (opponent) => opponent.isBoss === true && opponent.tier === 4
) as OpponentConfig;
const MOOK = ALL_OPPONENTS.find((opponent) => opponent.isBoss !== true) as OpponentConfig;

// ── §A. First defeat: +1, and the id recorded ──────────────────────────────

describe('§A — a first boss defeat raises the count by exactly one', () => {
  test('the roster really does carry bosses and a Tier-4 one', () => {
    expect(BOSSES.length).toBeGreaterThan(0);
    expect(TIER_FOUR_BOSS.isBoss).toBe(true);
    expect(TIER_FOUR_BOSS.tier).toBe(4);
  });

  test('every boss in the roster takes the count from 0 to 1 and is recorded', () => {
    for (const boss of BOSSES) {
      const before = base();
      const after = victoryWrite(before, boss);

      expect(after.bossKills).toBe(1);
      expect(after.defeatedOpponentIds).toContain(boss.id);
      // The record itself is untouched: exactly the ids it already had, plus this one.
      expect(after.defeatedOpponentIds).toEqual([boss.id]);
    }
  });

  test('each further first kill adds exactly one, one at a time', () => {
    let profile = base();

    for (let index = 0; index < BOSSES.length; index += 1) {
      profile = victoryWrite(profile, BOSSES[index]);
      expect(profile.bossKills).toBe(index + 1);
    }

    expect(profile.bossKills).toBe(BOSSES.length);
    expect(profile.defeatedOpponentIds).toEqual(BOSSES.map((boss) => boss.id));
  });

  test('a first kill on an existing record continues it rather than restarting', () => {
    const before = base({ bossKills: 2, defeatedOpponentIds: [BOSSES[0].id, BOSSES[1].id] });
    const after = victoryWrite(before, BOSSES[2]);

    expect(after.bossKills).toBe(3);
    expect(after.defeatedOpponentIds).toEqual([BOSSES[0].id, BOSSES[1].id, BOSSES[2].id]);
  });
});

// ── §B. Rematch: +0 ────────────────────────────────────────────────────────

describe('§B — a rematch over an already-defeated boss is not a new kill', () => {
  test('winning the same boss again leaves the count where it was', () => {
    const first = victoryWrite(base(), TIER_FOUR_BOSS);
    const rematch = victoryWrite(first, TIER_FOUR_BOSS);

    expect(first.bossKills).toBe(1);
    expect(rematch.bossKills).toBe(1);
    expect(rematch.defeatedOpponentIds).toEqual(first.defeatedOpponentIds);
  });

  test('repeated rematches never move it, whatever the count already reads', () => {
    let profile = base({ bossKills: 3, defeatedOpponentIds: BOSSES.slice(0, 3).map((b) => b.id) });

    for (let index = 0; index < 5; index += 1) {
      profile = victoryWrite(profile, BOSSES[1]);
      expect(profile.bossKills).toBe(3);
    }
  });
});

// ── §C. Non-boss victory: +0 ───────────────────────────────────────────────

describe('§C — a non-boss victory never raises the count', () => {
  test('the id is still recorded, and only the id', () => {
    const before = base();
    const after = victoryWrite(before, MOOK);

    expect(after.bossKills).toBe(0);
    expect(after.defeatedOpponentIds).toEqual([MOOK.id]);
  });

  test('a non-boss win leaves an existing boss count untouched', () => {
    const before = base({ bossKills: 2, defeatedOpponentIds: BOSSES.slice(0, 2).map((b) => b.id) });
    const after = victoryWrite(before, MOOK);

    expect(after.bossKills).toBe(2);
    expect(after.defeatedOpponentIds).toContain(MOOK.id);
  });

  test('an opponent with no isBoss flag is not a boss', () => {
    const unflagged: OpponentConfig = { ...MOOK, id: 'opp_unflagged' };
    delete (unflagged as { isBoss?: boolean }).isBoss;

    expect(nextBossKills(base(), { defeatedOpponentIds: ['opp_unflagged'] }, unflagged)).toBe(0);
  });
});

// ── §D. Defeat: no change ──────────────────────────────────────────────────

describe('§D — a defeat changes nothing', () => {
  test('the loss write (which records no id) leaves the count as it stands', () => {
    const before = base({ bossKills: 1, defeatedOpponentIds: [BOSSES[0].id] });
    // `handleMatchComplete`'s defeat branch writes fightsLost and the hype peak only.
    const lossWrite = { ...before, fightsLost: before.fightsLost + 1 };

    expect(nextBossKills(before, lossWrite, BOSSES[1])).toBe(1);
    expect(nextBossKills(before, lossWrite, BOSSES[0])).toBe(1);
    expect(lossWrite.bossKills).toBe(1);
  });

  test('a write that does not record the id cannot raise the count, boss or not', () => {
    // The rule reads the write it is handed: an id that never entered the record is
    // not a kill, whatever the opponent's `isBoss` says.
    expect(nextBossKills(base(), { defeatedOpponentIds: [] }, TIER_FOUR_BOSS)).toBe(0);
  });

  test('malformed saves read as zero and never throw', () => {
    const junk = { bossKills: Number.NaN, defeatedOpponentIds: 'nope' } as unknown as {
      bossKills: number;
      defeatedOpponentIds: string[];
    };

    expect(nextBossKills(junk, { defeatedOpponentIds: [TIER_FOUR_BOSS.id] }, TIER_FOUR_BOSS)).toBe(1);
    expect(nextBossKills({ bossKills: -3 }, { defeatedOpponentIds: [MOOK.id] }, MOOK)).toBe(0);
    expect(nextBossKills(null, null, TIER_FOUR_BOSS)).toBe(0);
    expect(nextBossKills(base(), { defeatedOpponentIds: [] }, null)).toBe(0);
  });

  test('the rule mutates neither profile it is handed', () => {
    const before = base({ bossKills: 1, defeatedOpponentIds: [BOSSES[0].id] });
    const after = { ...before, defeatedOpponentIds: [...before.defeatedOpponentIds, TIER_FOUR_BOSS.id] };
    const snapshot = JSON.stringify({ before, after });

    nextBossKills(before, after, TIER_FOUR_BOSS);

    expect(JSON.stringify({ before, after })).toBe(snapshot);
  });
});

// ── §E. One Tier-4 boss away from Legend ───────────────────────────────────

describe('§E — the Tier-4 boss’s first defeat derives Legend, with both records agreeing', () => {
  test('the profile one boss short of Legend derives Legend after that boss falls', () => {
    // One Tier-4 boss away: the fame and the circuit are already there, the kill is not.
    const before = base({
      fame: LEGEND_FAME,
      currentTier: 3,
      defeatedOpponentIds: BOSSES.filter((boss) => boss.tier !== 4).map((boss) => boss.id),
    });
    expect(deriveRank(before)).not.toBe('Legend');

    // The boss victory is also the fight that advances the tier (App's own rule).
    const win = { ...victoryWrite(before, TIER_FOUR_BOSS), currentTier: 4 };

    expect(deriveRank(win)).toBe('Legend');
    expect(win.bossKills).toBe(1);
    expect(win.defeatedOpponentIds).toContain(TIER_FOUR_BOSS.id);
  });

  test('the count and the felled id tell the same story at every step', () => {
    let profile = base({ fame: LEGEND_FAME, currentTier: 4 });

    for (const boss of BOSSES) {
      profile = victoryWrite(profile, boss);
      const felledBosses = profile.defeatedOpponentIds.filter((id) =>
        BOSSES.some((entry) => entry.id === id)
      );

      // One kill per boss felled — never a phantom kill, never a missed one.
      expect(profile.bossKills).toBe(felledBosses.length);
    }

    expect(deriveRank(profile)).toBe('Legend');
  });

  test('a rematch keeps the records in agreement too', () => {
    const first = victoryWrite(base({ fame: LEGEND_FAME, currentTier: 4 }), TIER_FOUR_BOSS);
    const rematch = victoryWrite(first, TIER_FOUR_BOSS);

    expect(rematch.bossKills).toBe(1);
    expect(rematch.defeatedOpponentIds).toEqual(first.defeatedOpponentIds);
    expect(deriveRank(rematch)).toBe('Legend');
  });
});

// ── §F. Heraldry stripes follow the count ──────────────────────────────────

describe('§F — the banner’s boss stripes derive from the count', () => {
  test('0 / 1 / 4 kills render 0 / 1 / 4 stripes', () => {
    for (const kills of [0, 1, 4]) {
      expect(bannerStripeCount(base({ bossKills: kills }))).toBe(kills);
    }
  });

  test('the banner itself carries the same count once a device is chosen', () => {
    for (const kills of [0, 1, 4]) {
      const banner = resolveBanner(base({ bossKills: kills, road: { bannerDevice: 'sword' } }));
      expect(banner?.stripes).toBe(kills);
    }
  });

  test('the stripes a victory writes are the stripes the banner shows', () => {
    let profile = base({ road: { bannerDevice: 'sword' } });

    for (let index = 0; index < 3; index += 1) {
      profile = victoryWrite(profile, BOSSES[index]);
      expect(resolveBanner(profile)?.stripes).toBe(index + 1);
    }
  });
});

// ── §G. One writer, one caller ─────────────────────────────────────────────

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every shipped source file under `src/` — suites excluded, since they never ship. */
function shippedSources(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push({ path: full, text: readFileSync(full, 'utf8') });
      }
    }
  };

  walk(SRC_ROOT);
  return found;
}

describe('§G — exactly one writer, called from the victory write', () => {
  test('no shipped source but bossKills.ts adds to the field', () => {
    const incrementers = shippedSources()
      .filter((file) => !file.path.endsWith(join('utils', 'bossKills.ts')))
      .flatMap((file) =>
        file.text
          .split('\n')
          .map((line, index) => ({ file: file.path, line: line.trim(), index: index + 1 }))
          .filter(
            (entry) =>
              entry.line.includes('bossKills') &&
              (/bossKills\s*(\+|\+=|\+\+)/.test(entry.line) || /\+\s*1/.test(entry.line))
          )
      );

    expect(incrementers).toEqual([]);
  });

  test('the helper holds the single increment', () => {
    const source = readFileSync(join(SRC_ROOT, 'utils', 'bossKills.ts'), 'utf8');
    expect(source.match(/stored \+ 1/g)?.length).toBe(1);
  });

  test('App writes the count through the helper, exactly once, in the win branch', () => {
    const app = readFileSync(join(SRC_ROOT, 'App.tsx'), 'utf8');
    const handler = app.slice(
      app.indexOf('const handleMatchComplete'),
      app.indexOf('const handleDuelResultDismiss')
    );

    // One mention in the whole handler — it is the helper call the win write carries.
    expect(handler.match(/bossKills/g)?.length).toBe(1);
    expect(handler).toContain('bossKills: nextBossKills(');

    // The defeat branch (everything after the win branch's `} else {`) never names it.
    const defeatBranch = handler.slice(handler.indexOf('} else {'));
    expect(defeatBranch).toContain('fightsLost');
    expect(defeatBranch).not.toContain('bossKills');
  });
});
