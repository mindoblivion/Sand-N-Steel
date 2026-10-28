/**
 * Progression Slice 3 — the Road of Glory's rituals, the herald and the banner.
 *
 * Run with: bun test src/utils/roadMilestones.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A a newly reached stage fires once and its id is recorded, and a seen id
 *      suppresses its refire;
 *   §B the rank-gate cries carry the gladiator's own name;
 *   §C a boss kill names the boss from the roster — at every boss win, first defeat or
 *      rematch, and exactly once — while a mook says nothing;
 *   §D the Device Choosing write happens once and can never be rewritten;
 *   §E the boss stripes are derived from `bossKills` (0 / 1 / 4);
 *   §F a save with no `milestonesSeen` at all resolves cleanly;
 *   §G grandfathering: past Veteran with no device is offered the panel;
 *   §H the four devices carry a Latin name, a gloss and a palette field.
 *
 * Nothing here reads storage or the clock: the evaluators are pure.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import type { PlayerProfile } from '../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { CHAMPION_FAME, CHAMPION_TIER, VETERAN_FAME, VETERAN_TIER } from './rank';
import { resolveRoadProgress } from './roadOfGlory';
import { chooseBannerDevice, evaluateRoadMilestones } from './roadMilestones';
import {
  BANNER_DEVICE_SPECS,
  bannerDeviceSpec,
  bannerStripeCount,
  resolveBanner,
} from './heraldry';

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

/** The roster's own tier-4 boss, read rather than copied. */
const AURELIUS = ALL_OPPONENTS.find((opponent) => opponent.isBoss === true && opponent.tier === 4);

// ── §A. Fired once, recorded once ──────────────────────────────────────────

describe('§A — a stage fires once and is recorded', () => {
  test('the first bout fires Blooded and records it', () => {
    const before = base({ road: { oathSworn: true } });
    const after = { ...before, fightsWon: 1 };

    const evaluation = evaluateRoadMilestones(before, after);

    expect(evaluation.rituals.map((ritual) => ritual.stage)).toEqual(['blooded']);
    expect(evaluation.changed).toBe(true);
    expect(evaluation.profile.road?.milestonesSeen).toEqual(['blooded']);
    expect(evaluation.profile).not.toBe(after);
  });

  test('a second evaluation of the saved profile is silent', () => {
    const before = base({ road: { oathSworn: true } });
    const first = evaluateRoadMilestones(before, { ...before, fightsWon: 1 });
    const second = evaluateRoadMilestones(first.profile, first.profile);

    expect(second.rituals).toEqual([]);
    expect(second.cries).toEqual([]);
    expect(second.changed).toBe(false);
    expect(second.profile).toBe(first.profile);
  });

  test('an id already in milestonesSeen suppresses its refire', () => {
    const before = base({ road: { oathSworn: true, milestonesSeen: ['blooded'] } });
    const after = { ...before, fightsWon: 1 };

    expect(evaluateRoadMilestones(before, after).rituals).toEqual([]);
  });

  test('a stage this event did not reach never fires', () => {
    const profile = base();
    expect(evaluateRoadMilestones(profile, profile).rituals).toEqual([]);
  });
});

// ── §B. The herald's copy ──────────────────────────────────────────────────

describe('§B — the rank gates raise their cries with the name', () => {
  test('Veteran, then Champion, in the herald\'s own voice', () => {
    const before = base({ name: 'Spartacus' });
    const veteran = { ...before, fame: VETERAN_FAME, currentTier: VETERAN_TIER };
    const champion = { ...veteran, fame: CHAMPION_FAME, currentTier: CHAMPION_TIER };

    const veteranCries = evaluateRoadMilestones(before, veteran).cries;
    expect(veteranCries).toContain('The herald cries: Spartacus, Veteran of the Ludus!');

    const championCries = evaluateRoadMilestones(veteran, champion).cries;
    expect(championCries).toContain('The herald cries: Spartacus, Champion of Rome!');
    expect(championCries).not.toContain('The herald cries: Spartacus, Veteran of the Ludus!');
  });

  test('the Veteran ritual is the one that offers the device panel', () => {
    const before = base();
    const veteran = { ...before, fame: VETERAN_FAME, currentTier: VETERAN_TIER };
    const evaluation = evaluateRoadMilestones(before, veteran);

    // The road is cumulative, so the stages below Veteran are recorded too — silently.
    expect(evaluation.rituals.find((ritual) => ritual.stage === 'known')).toEqual({
      stage: 'known',
      cry: 'The herald cries: Test, Veteran of the Ludus!',
      offerDeviceChoice: true,
    });
    expect(evaluation.rituals.filter((ritual) => ritual.cry !== null)).toHaveLength(1);
    expect(evaluation.offerDeviceChoice).toBe(true);
  });
});

// ── §C. Bosses ─────────────────────────────────────────────────────────────

describe('§C — a boss kill is named from the roster', () => {
  test('the boss name is the roster\'s, and the cry carries it', () => {
    expect(AURELIUS).toBeDefined();
    const before = base();
    const after = { ...before, defeatedOpponentIds: [AURELIUS!.id], bossKills: 1 };

    expect(evaluateRoadMilestones(before, after).cries).toContain(
      `${AURELIUS!.name} has fallen to Test!`
    );
  });

  test('a non-boss defeat says nothing', () => {
    const mook = ALL_OPPONENTS.find((opponent) => opponent.isBoss !== true);
    expect(mook).toBeDefined();
    const before = base();
    const after = { ...before, defeatedOpponentIds: [mook!.id] };

    expect(evaluateRoadMilestones(before, after).cries).toEqual([]);
  });

  test('a boss already felled is not announced twice', () => {
    const before = base({ defeatedOpponentIds: [AURELIUS!.id] });
    const after = { ...before, bossKills: 2 };

    expect(evaluateRoadMilestones(before, after).cries).toEqual([]);
  });

  // CORR-BATCH-2 — road-of-glory §4: the cry sounds at each boss defeat, "then each",
  // so the duel's own opponent is what names it.  A rematch is no longer silent.
  test('a rematch win cries the boss again, passed in from the duel', () => {
    const before = base({ defeatedOpponentIds: [AURELIUS!.id], bossKills: 1 });
    const after = { ...before, bossKills: 2 };

    expect(evaluateRoadMilestones(before, after, AURELIUS!).cries).toEqual([
      `${AURELIUS!.name} has fallen to Test!`,
    ]);
  });

  test('a first defeat cries the boss exactly once when the opponent is passed in', () => {
    const before = base();
    const after = { ...before, defeatedOpponentIds: [AURELIUS!.id], bossKills: 1 };

    const bossCry = `${AURELIUS!.name} has fallen to Test!`;
    const cries = evaluateRoadMilestones(before, after, AURELIUS!).cries;
    // One boss cry — never a second, and the rank gates behind it are untouched.
    expect(cries.filter((cry) => cry === bossCry)).toHaveLength(1);
  });

  test('a non-boss win says nothing when the opponent is passed in', () => {
    const mook = ALL_OPPONENTS.find((opponent) => opponent.isBoss !== true);
    expect(mook).toBeDefined();
    const before = base();
    const after = { ...before, defeatedOpponentIds: [mook!.id] };

    expect(evaluateRoadMilestones(before, after, mook!).cries).toEqual([]);
  });
});

// ── §D. The one-time choice ────────────────────────────────────────────────

describe('§D — the banner device is written once', () => {
  test('the first choice writes, every later one is refused', () => {
    const chosen = chooseBannerDevice(base(), 'sword');
    expect(chosen?.road?.bannerDevice).toBe('sword');
    expect(chooseBannerDevice(chosen, 'bull')).toBe(null);
    expect(chosen?.road?.bannerDevice).toBe('sword');
  });

  test('an unknown device is refused rather than stored', () => {
    expect(chooseBannerDevice(base(), 'wolf' as never)).toBe(null);
  });

  test('the choice keeps the road\'s other subfields', () => {
    const profile = base({ road: { oathSworn: true, milestonesSeen: ['sworn'] } });
    const chosen = chooseBannerDevice(profile, 'laurel');

    expect(chosen?.road).toEqual({
      oathSworn: true,
      milestonesSeen: ['sworn'],
      bannerDevice: 'laurel',
    });
  });
});

// ── §E. The stripes are derived ────────────────────────────────────────────

describe('§E — the boss stripes derive from bossKills', () => {
  test('0, 1 and 4 kills give 0, 1 and 4 stripes', () => {
    for (const kills of [0, 1, 4]) {
      const profile = base({ bossKills: kills, road: { bannerDevice: 'sword' } });
      expect(bannerStripeCount(profile)).toBe(kills);
      expect(resolveBanner(profile)?.stripes).toBe(kills);
    }
  });

  test('a hand-edited or absent count reads as none', () => {
    expect(bannerStripeCount({ bossKills: -3 } as PlayerProfile)).toBe(0);
    expect(bannerStripeCount({ bossKills: Number.NaN } as PlayerProfile)).toBe(0);
    expect(bannerStripeCount(null)).toBe(0);
  });

  test('no banner exists until a device is chosen', () => {
    expect(resolveBanner(base({ bossKills: 2 }))).toBe(null);
  });

  test('the banner moves to the Colosseum gate at the champion stage', () => {
    const champion = base({ road: { bannerDevice: 'bull' }, defeatedOpponentIds: [AURELIUS!.id] });
    expect(resolveBanner(champion)?.atGate).toBe(true);
    expect(resolveBanner(base({ road: { bannerDevice: 'bull' } }))?.atGate).toBe(false);
  });
});

// ── §F. Saves without the field ────────────────────────────────────────────

describe('§F — a save with no milestonesSeen resolves cleanly', () => {
  test('absent road, absent field, and the evaluation writes nothing', () => {
    const profile = base();
    expect(profile.road).toBeUndefined();
    expect(resolveRoadProgress(profile).milestonesSeen).toEqual([]);

    const evaluation = evaluateRoadMilestones(profile, profile);
    expect(evaluation.changed).toBe(false);
    expect(evaluation.profile).toBe(profile);
    expect(evaluation.profile.road).toBeUndefined();
  });

  test('a torn milestonesSeen is ignored rather than repaired', () => {
    const profile = base({ road: { milestonesSeen: 'nope' as never } });
    expect(resolveRoadProgress(profile).milestonesSeen).toEqual([]);
    expect(evaluateRoadMilestones(profile, profile).changed).toBe(false);
  });
});

// ── §G. Grandfathering ─────────────────────────────────────────────────────

describe('§G — never silently deviceless', () => {
  test('a gladiator already past Veteran is offered the panel', () => {
    const veteran = base({ fame: VETERAN_FAME, currentTier: VETERAN_TIER });
    expect(evaluateRoadMilestones(veteran, veteran).offerDeviceChoice).toBe(true);
  });

  test('once a device is recorded the panel never returns', () => {
    const sworn = base({
      fame: VETERAN_FAME,
      currentTier: VETERAN_TIER,
      road: { bannerDevice: 'laurel' },
    });
    expect(evaluateRoadMilestones(sworn, sworn).offerDeviceChoice).toBe(false);
  });

  test('a gladiator short of Veteran is not offered it', () => {
    const rookie = base();
    expect(evaluateRoadMilestones(rookie, rookie).offerDeviceChoice).toBe(false);
  });
});

// ── §H. The four devices ───────────────────────────────────────────────────

describe('§H — the four personal devices', () => {
  test('sword, laurel, spear and bull, each with Latin, a gloss and a palette field', () => {
    expect(BANNER_DEVICE_SPECS.map((spec) => spec.id)).toEqual(['sword', 'laurel', 'spear', 'bull']);

    for (const spec of BANNER_DEVICE_SPECS) {
      expect(spec.latin.length).toBeGreaterThan(3);
      expect(spec.gloss.length).toBeGreaterThan(20);
      expect(spec.primary).toMatch(/^#[0-9a-f]{6}$/);
      expect(spec.ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(spec.path.length).toBeGreaterThan(20);
    }
  });

  test('an unknown stored device paints nothing', () => {
    expect(bannerDeviceSpec('wolf')).toBe(null);
    expect(bannerDeviceSpec(null)).toBe(null);
    expect(bannerDeviceSpec('   ')).toBe(null);
    expect(bannerDeviceSpec('bull')?.latin).toBe('Taurus');
  });
});
