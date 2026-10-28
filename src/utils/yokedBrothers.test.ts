/**
 * D-4 — the Cotta brothers (Slice D-4), pinned.
 *
 * The suite drives the PURE module the duel calls — the fence, the alternation,
 * each brother's published profile, the Crossing's cadence and its three answers,
 * the withdrawal at half the pair, the Oath's one-shot announcements, the net's
 * suppression of the Crossing, and the presentation state — plus the source-level
 * wiring that makes the duel use them. Every number is read from the row or the
 * module, never restated from the prompt.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { getWeaponByType } from '../data/itemsDB';
import { BOSS_PRESENTATION_DELTAS, bossSceneDeltas } from '../data/bossPresentationStates';
import {
  CROSSING_EXPOSED_WORDS,
  CROSSING_RECOVERY_WORDS,
  CROSSING_TELEGRAPH_WORDS,
  brotherAggression,
  brotherBlockChance,
  brotherPresentation,
  brotherProfile,
  brotherWeapon,
  brothersIntelLine,
  canLeadCrossing,
  completeBrothersSlot,
  createBrothersState,
  crossingAnswerFor,
  flankSide,
  frontWithdrawalDue,
  isYokedBrothersBout,
  oathWords,
  planBrothersSlot,
  resolveCrossingAnswer,
  survivorDamageMult,
  withdrawFront,
  yokedBrothersConfigFor,
  type BrothersDuelState,
  type BrothersRole,
  type BrothersSlotContext,
} from './yokedBrothers';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');
const DUEL_SCENE = read('components/duel/DuelScene.tsx');
const HUD = read('components/ui/CombatHUD.tsx');
const CARD = read('components/hub/TournamentTab.tsx');

const cotta = (): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_cotta_boss');
  if (!row) throw new Error('the Cotta row is missing from the roster');
  return row;
};
const cfg = () => {
  const pair = yokedBrothersConfigFor(cotta());
  if (!pair) throw new Error('the Cotta row no longer admits a pair');
  return pair;
};

/** One boss slot through the real planner: opens it, then settles the actor. */
function slot(
  state: BrothersDuelState,
  ctx: Partial<BrothersSlotContext> = {},
  /** The actor who led the EXCHANGE (the flank ends it, when one was sent). */
  exchangeActor?: BrothersRole,
): { state: BrothersDuelState; plan: string; actor: BrothersRole } {
  const planned = planBrothersSlot(state, cfg(), {
    frontEntangled: false,
    pendingHeavy: false,
    inRange: true,
    ...ctx,
  });
  const settled = completeBrothersSlot(planned.state, exchangeActor ?? planned.actor);
  return { state: settled, plan: planned.plan, actor: planned.actor };
}

// ════════════════════════════════════════════════════════════════════════════
// §A — the fence
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §A — the fence', () => {
  test('the Cotta row admits the pair, with Lucius in front and Gaius behind him', () => {
    const row = cotta();
    expect(isYokedBrothersBout(row)).toBe(true);
    const pair = cfg();
    expect(pair.front.name).toBe('Lucius');
    expect(pair.rear.name).toBe('Gaius');
    expect(pair.front.weaponType).toBe('sword_shield');
    expect(pair.rear.weaponType).toBe('dual_blades');
    // One row, one pool: the pair's HP is the row's own.
    expect(row.stats.healthMax).toBeGreaterThan(0);
  });

  test('each brother resolves his own published weapon through the registry', () => {
    const pair = cfg();
    expect(brotherWeapon(pair, 'front')).toEqual(getWeaponByType('sword_shield'));
    expect(brotherWeapon(pair, 'rear')).toEqual(getWeaponByType('dual_blades'));
    expect(brotherWeapon(pair, 'front').damageHeavy).not.toBe(
      brotherWeapon(pair, 'rear').damageHeavy,
    );
  });

  test('the fence refuses every shape that is not a valid pair bout', () => {
    const base = cotta();
    const withOverrides = (overrides: Partial<OpponentConfig>): OpponentConfig => ({
      ...base,
      ...overrides,
    });
    expect(yokedBrothersConfigFor(undefined)).toBeNull();
    expect(yokedBrothersConfigFor(null)).toBeNull();
    // Not a boss.
    expect(yokedBrothersConfigFor(withOverrides({ isBoss: false }))).toBeNull();
    // A ladder boss (boss, but not a Feature Bout).
    expect(yokedBrothersConfigFor(withOverrides({ featureBout: undefined }))).toBeNull();
    // The wrong mechanic.
    expect(
      yokedBrothersConfigFor(withOverrides({ bossMechanic: 'unbroken_panoply' })),
    ).toBeNull();
    // The mechanic with no sub-data at all.
    expect(yokedBrothersConfigFor(withOverrides({ brothers: undefined }))).toBeNull();
  });

  test('a malformed pair block is refused rather than half-used', () => {
    const base = cotta();
    const pair = cfg();
    const withPair = (brothers: unknown): OpponentConfig => ({ ...base, brothers: brothers as never });
    expect(yokedBrothersConfigFor(withPair({ ...pair, crossingEveryNthAction: 0 }))).toBeNull();
    expect(yokedBrothersConfigFor(withPair({ ...pair, survivorDamageMult: 1 }))).toBeNull();
    expect(yokedBrothersConfigFor(withPair({ ...pair, survivorDamageMult: 0.9 }))).toBeNull();
    expect(yokedBrothersConfigFor(withPair({ ...pair, survivorAggressionBonus: -0.1 }))).toBeNull();
    expect(yokedBrothersConfigFor(withPair({ ...pair, withdrawalAtHealthFraction: 1 }))).toBeNull();
    expect(yokedBrothersConfigFor(withPair({ ...pair, withdrawalAtHealthFraction: 0 }))).toBeNull();
    expect(
      yokedBrothersConfigFor(withPair({ ...pair, front: { ...pair.front, name: '  ' } })),
    ).toBeNull();
    expect(
      yokedBrothersConfigFor(withPair({ ...pair, rear: { ...pair.rear, aggression: 1.4 } })),
    ).toBeNull();
    expect(
      yokedBrothersConfigFor(withPair({ ...pair, rear: { ...pair.rear, blockChance: Number.NaN } })),
    ).toBeNull();
  });

  test('THE STRING-COPY FENCE: a regular row with the mechanic and the sub-data copied on fights as one man', () => {
    const regular = ALL_OPPONENTS.find((opponent) => !opponent.isBoss);
    if (!regular) throw new Error('the roster has no non-boss row');
    const copied: OpponentConfig = {
      ...regular,
      bossMechanic: 'yoked_brothers',
      brothers: cfg() as never,
    };
    expect(yokedBrothersConfigFor(copied)).toBeNull();
    expect(isYokedBrothersBout(copied)).toBe(false);
    // The same copy made a boss but NOT a Feature Bout is refused too.
    expect(yokedBrothersConfigFor({ ...copied, isBoss: true })).toBeNull();
    // A Feature Bout with the pair's sub-data but another mechanic is refused.
    expect(
      yokedBrothersConfigFor({ ...copied, isBoss: true, featureBout: true, bossMechanic: 'beast_hunt' }),
    ).toBeNull();
  });

  test('the roster sweep: exactly one row fields the pair', () => {
    const pairs = ALL_OPPONENTS.filter((opponent) => isYokedBrothersBout(opponent));
    expect(pairs.map((opponent) => opponent.id)).toEqual(['opp_cotta_boss']);
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.id === 'opp_cotta_boss') continue;
      expect(yokedBrothersConfigFor(opponent), opponent.id).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the alternation
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §B — the alternation', () => {
  test('the brothers alternate, and every fourth slot is the Crossing led by the front', () => {
    let state = createBrothersState();
    // A Crossing's announced heavy is still live when its resolution slot opens.
    let pendingHeavy = false;
    const kinds: string[] = [];
    const actors: BrothersRole[] = [];
    for (let i = 0; i < 8; i += 1) {
      const run = slot(state, { pendingHeavy });
      kinds.push(run.plan);
      actors.push(run.actor);
      pendingHeavy = run.plan === 'crossing';
      state = run.state;
    }
    expect(kinds).toEqual([
      'act',
      'act',
      'act',
      'crossing',
      'crossing-resolution',
      'act',
      'act',
      'crossing',
    ]);
    // The front leads the Crossing whatever the alternation had reached; the rear
    // takes the ordinary slots either side of it.
    expect(actors).toEqual(['front', 'rear', 'front', 'front', 'front', 'rear', 'front', 'front']);
  });

  test('the slot after a resolved Crossing belongs to the other brother', () => {
    let state = createBrothersState();
    for (let i = 0; i < 3; i += 1) state = slot(state).state;
    const crossing = slot(state);
    expect(crossing.plan).toBe('crossing');
    // The Crossing's heavy resolves on the next slot (its announced heavy is
    // live): the flank ends the exchange, and the leader hands the next slot over.
    const heavy = slot(crossing.state, { pendingHeavy: true });
    expect(heavy.plan).toBe('crossing-resolution');
    state = completeBrothersSlot(heavy.state, 'front');
    expect(state.active).toBe('rear');
    const next = slot(state);
    expect(next.actor).toBe('rear');
  });

  test('completeBrothersSlot hands the next slot to the other brother', () => {
    const start = createBrothersState();
    expect(completeBrothersSlot(start, 'front').active).toBe('rear');
    expect(completeBrothersSlot(start, 'rear').active).toBe('front');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — each brother fights with HIS published profile
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §C — the two profiles', () => {
  test('the two halves differ, and each is read by role', () => {
    const pair = cfg();
    expect(brotherProfile(pair, 'front')).toEqual(pair.front);
    expect(brotherProfile(pair, 'rear')).toEqual(pair.rear);
    expect(brotherBlockChance(pair, 'front')).toBe(pair.front.blockChance);
    expect(brotherBlockChance(pair, 'rear')).toBe(pair.rear.blockChance);
    expect(pair.front.aggression).not.toBe(pair.rear.aggression);
    expect(pair.front.blockChance).not.toBe(pair.rear.blockChance);
  });

  test('the pair aggregate the row states is the mean of the two published halves', () => {
    const row = cotta();
    const pair = cfg();
    // AUTHORED values, anchored to the row: the two brothers average out to the
    // pair's own published aggression / blockChance.
    expect((pair.front.aggression + pair.rear.aggression) / 2).toBeCloseTo(row.aggression, 5);
    expect((pair.front.blockChance + pair.rear.blockChance) / 2).toBeCloseTo(row.blockChance, 5);
  });

  test('the aggression read adds the Oath only for the survivor', () => {
    const pair = cfg();
    const state = createBrothersState();
    expect(brotherAggression(pair, state, 'front')).toBe(pair.front.aggression);
    const sworn: BrothersDuelState = {
      ...state,
      phase: 'survivor',
      survivor: 'rear',
      frontWithdrawn: true,
    };
    expect(brotherAggression(pair, sworn, 'rear')).toBeCloseTo(
      pair.rear.aggression + pair.survivorAggressionBonus,
      10,
    );
    // The withdrawn front brother gains nothing.
    expect(brotherAggression(pair, sworn, 'front')).toBe(pair.front.aggression);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the Crossing's cadence
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §D — cadence', () => {
  test('the Crossing fires only on the fourth slot, and only while both stand', () => {
    let state = createBrothersState();
    const plans: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const run = slot(state);
      plans.push(run.plan);
      state = run.state;
    }
    expect(plans.filter((plan) => plan === 'crossing')).toHaveLength(2);
    expect(plans[3]).toBe('crossing');
    expect(plans[7]).toBe('crossing');

    // Survivor phase: the fourth slot is an ordinary one, for ever.
    const survivor: BrothersDuelState = {
      ...createBrothersState(),
      slots: 3,
      phase: 'survivor',
      survivor: 'rear',
      frontWithdrawn: true,
      active: 'rear',
    };
    expect(slot(survivor).plan).toBe('act');
  });

  test('out of reach, the cadence slot is an ordinary action — the trap needs contact', () => {
    const state: BrothersDuelState = { ...createBrothersState(), slots: 3 };
    expect(slot(state, { inRange: false }).plan).toBe('act');
    expect(slot(state, { inRange: true }).plan).toBe('crossing');
  });

  test('an announced Crossing is never re-planned as a fresh one', () => {
    const state: BrothersDuelState = { ...createBrothersState(), slots: 3 };
    const crossing = planBrothersSlot(state, cfg(), {
      frontEntangled: false,
      pendingHeavy: false,
      inRange: true,
    });
    expect(crossing.plan).toBe('crossing');
    expect(crossing.state.crossing).toBe('announced');
    // Without the pending heavy (the player's turn in between) the slot is not a
    // second Crossing.
    const next = planBrothersSlot(crossing.state, cfg(), {
      frontEntangled: false,
      pendingHeavy: false,
      inRange: true,
    });
    expect(next.plan).toBe('act');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the three answers
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §E — the Crossing’s answers', () => {
  test('the answer is read off the stances the heavy met', () => {
    expect(crossingAnswerFor({ playerInDodge: true, frontBlocked: true })).toBe('dodged');
    expect(crossingAnswerFor({ playerInDodge: false, frontBlocked: true })).toBe('blocked');
    expect(crossingAnswerFor({ playerInDodge: false, frontBlocked: false })).toBe('open');
  });

  test('a block (or an open answer) sends the rear flank strike through the pipeline', () => {
    for (const answer of ['blocked', 'open'] as const) {
      const state: BrothersDuelState = { ...createBrothersState(), crossing: 'announced' };
      const resolved = resolveCrossingAnswer(state, answer);
      expect(resolved.flank).toBe('resolves');
      expect(resolved.state.crossing).toBe('idle');
      expect(resolved.exposedNow).toBe(false);
      expect(resolved.words).toBeNull();
    }
  });

  test('a dodge auto-misses the flank and exposes the pair — announced exactly once', () => {
    const announced: BrothersDuelState = { ...createBrothersState(), crossing: 'announced' };
    const first = resolveCrossingAnswer(announced, 'dodged');
    expect(first.flank).toBe('auto-miss');
    expect(first.state.crossing).toBe('exposed');
    expect(first.exposedNow).toBe(true);
    expect(first.words).toBe(CROSSING_EXPOSED_WORDS);
    expect(first.words).toBe("They've overreached — the pair is exposed.");

    // The Exposed slot is a recovery, and it returns the pair to idle.
    const recovery = planBrothersSlot(first.state, cfg(), {
      frontEntangled: false,
      pendingHeavy: false,
      inRange: true,
    });
    expect(recovery.plan).toBe('recovery');
    expect(recovery.state.crossing).toBe('idle');

    // A LATER Crossing can be dodged again, but the words are one-shot.
    const second = resolveCrossingAnswer(
      { ...first.state, crossing: 'announced', exposedAnnounced: true },
      'dodged',
    );
    expect(second.flank).toBe('auto-miss');
    expect(second.exposedNow).toBe(false);
    expect(second.words).toBeNull();
  });

  test('the recovery slot resolves nothing: it is a tempo beat, not an attack', () => {
    const state: BrothersDuelState = { ...createBrothersState(), crossing: 'exposed' };
    const recovery = planBrothersSlot(state, cfg(), {
      frontEntangled: false,
      pendingHeavy: false,
      inRange: true,
    });
    expect(recovery.plan).toBe('recovery');
    expect(recovery.state.crossing).toBe('idle');
    // The scene's recovery branch carries these words and no damage stage.
    expect(CROSSING_RECOVERY_WORDS).toContain('no blade comes');
  });

  test('the Crossing’s banner names the trap for the whole telegraph', () => {
    expect(CROSSING_TELEGRAPH_WORDS).toBe('THE BROTHERS CROSS — HEAVY INCOMING');
    expect(DUEL_SCENE).toContain('CROSSING_TELEGRAPH_WORDS');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the withdrawal at half the pair
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §F — the front withdrawal', () => {
  test('the line is the pair’s own half, crossed inclusively and only once', () => {
    const pair = cfg();
    const row = cotta();
    const max = row.stats.healthMax;
    const state = createBrothersState();
    expect(frontWithdrawalDue(state, max, max, pair)).toBe(false);
    expect(frontWithdrawalDue(state, max * 0.5 + 0.5, max, pair)).toBe(false);
    expect(frontWithdrawalDue(state, max * 0.5, max, pair)).toBe(true);
    expect(frontWithdrawalDue(state, max * 0.5 - 30, max, pair)).toBe(true);
    // Malformed readings never withdraw him.
    expect(frontWithdrawalDue(state, Number.NaN, max, pair)).toBe(false);
    expect(frontWithdrawalDue(state, 0, 0, pair)).toBe(false);
  });

  test('withdrawal puts the rear brother alone on the sand and announces both lines once', () => {
    const pair = cfg();
    const withdrawn = withdrawFront(createBrothersState(), pair);
    expect(withdrawn.state.phase).toBe('survivor');
    expect(withdrawn.state.survivor).toBe('rear');
    expect(withdrawn.state.frontWithdrawn).toBe(true);
    expect(withdrawn.state.crossing).toBe('idle');
    expect(withdrawn.state.active).toBe('rear');
    expect(withdrawn.state.acting).toBe('rear');
    expect(withdrawn.words).toContain('Attendants drag Lucius from the sand');
    expect(withdrawn.oathWords).toBe('Gaius swears the oath — one blade, all grief.');
    expect(withdrawn.oathWords).toBe(oathWords('Gaius'));

    // A second crossing of the line says nothing (and cannot withdraw a second man).
    const again = withdrawFront(withdrawn.state, pair);
    expect(again.words).toBeNull();
    expect(again.oathWords).toBeNull();
    expect(again.state).toBe(withdrawn.state);
    // Withdrawn, he is no longer due.
    expect(frontWithdrawalDue(withdrawn.state, 1, 195, pair)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — the Oath
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §G — the survivor’s Oath', () => {
  test('the Oath is +15% damage and +0.10 aggression, and only in the survivor phase', () => {
    const pair = cfg();
    expect(pair.survivorDamageMult).toBe(1.15);
    expect(pair.survivorAggressionBonus).toBe(0.1);
    expect(survivorDamageMult(pair, createBrothersState())).toBe(1);
    const sworn: BrothersDuelState = {
      ...createBrothersState(),
      phase: 'survivor',
      survivor: 'rear',
      frontWithdrawn: true,
    };
    expect(survivorDamageMult(pair, sworn)).toBe(1.15);
    expect(survivorDamageMult(pair, null)).toBe(1);
    // The scene folds it into the SAME traitMult chain every modifier rides.
    expect(DUEL_SCENE).toContain('survivorDamageMult(brothersCfg, brothersRef.current)');
  });

  test('the Oath is announced once, and the flag is the guard', () => {
    const pair = cfg();
    const withdrawn = withdrawFront(createBrothersState(), pair);
    expect(withdrawn.state.oathAnnounced).toBe(true);
    expect(withdrawn.oathWords).not.toBeNull();
    expect(withdrawFront(withdrawn.state, pair).oathWords).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the net suppresses the Crossing
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §H — the net', () => {
  test('a netted brother cannot lead the Crossing', () => {
    expect(canLeadCrossing(false)).toBe(true);
    expect(canLeadCrossing(true)).toBe(false);
  });

  test('with the front brother entangled the cadence slot passes as an ordinary action', () => {
    const state: BrothersDuelState = { ...createBrothersState(), slots: 3 };
    const netted = planBrothersSlot(state, cfg(), {
      frontEntangled: true,
      pendingHeavy: false,
      inRange: true,
    });
    expect(netted.plan).toBe('act');
    expect(netted.state.crossing).toBe('idle');
    // …and the slot is still consumed, so the cadence is not deferred.
    expect(netted.state.slots).toBe(4);
    // The very next cadence, with the net off, is a Crossing again.
    const free: BrothersDuelState = { ...createBrothersState(), slots: 7 };
    expect(
      planBrothersSlot(free, cfg(), { frontEntangled: false, pendingHeavy: false, inRange: true })
        .plan,
    ).toBe('crossing');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — presentation
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §I — presentation', () => {
  test('the acting brother holds the line, the other takes the rear station', () => {
    expect(brotherPresentation(createBrothersState())).toEqual({
      front: 'fighting',
      rear: 'station',
    });
    expect(brotherPresentation({ ...createBrothersState(), acting: 'rear' })).toEqual({
      front: 'station',
      rear: 'fighting',
    });
  });

  test('the Crossing sends the rear to the flank; the survivor stands alone', () => {
    expect(
      brotherPresentation({ ...createBrothersState(), crossing: 'announced' }),
    ).toEqual({ front: 'fighting', rear: 'flank' });
    expect(
      brotherPresentation({
        ...createBrothersState(),
        phase: 'survivor',
        survivor: 'rear',
        frontWithdrawn: true,
      }),
    ).toEqual({ front: 'withdrawn', rear: 'fighting' });
  });

  test('the flank side mirrors with Lefty Mode, so the tell exists in both hands', () => {
    expect(flankSide(false)).toBe(1);
    expect(flankSide(true)).toBe(-1);
    expect(DUEL_SCENE).toContain('flankSide(isLeftyMode)');
  });

  test('the authored state’s property deltas are its own, and cost no draw call', () => {
    expect(Object.keys(BOSS_PRESENTATION_DELTAS)).toContain('brothers');
    const delta = bossSceneDeltas(cotta());
    expect(delta).toEqual(BOSS_PRESENTATION_DELTAS.brothers!);
    expect(Object.keys(delta ?? {}).sort()).toEqual(
      ['ambientColor', 'ambientIntensity', 'fogColor', 'sunColor', 'sunIntensity'].sort(),
    );
    // A standard row still reads null.
    expect(bossSceneDeltas(ALL_OPPONENTS[0])).toBeNull();
  });

  test('the deep card’s line is built from the row, never restated in a component', () => {
    const line = brothersIntelLine(cfg());
    expect(line).toContain('Lucius');
    expect(line).toContain('Gaius');
    expect(line).toContain('Crossing every 4th boss action');
    expect(line).toContain('withdrawal at 50% HP');
    expect(line).toContain('Oath +15% damage');
    expect(brothersIntelLine(null)).toBe('');
    expect(CARD).toContain('brothersIntelLine(opp.brothers)');
    expect(CARD).toContain('data-brothers-intel');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §J — the wiring
// ════════════════════════════════════════════════════════════════════════════
describe('D-4 §J — the duel wiring', () => {
  test('the duel mounts the pair as two models and the single mesh only otherwise', () => {
    expect(DUEL_SCENE).toContain('<BrothersPair');
    expect(DUEL_SCENE).toContain('front={brotherModels.front}');
    expect(DUEL_SCENE).toContain('rear={brotherModels.rear}');
    // The single-opponent mesh lives in the pair's `else` branch.
    const pairAt = DUEL_SCENE.indexOf('<BrothersPair');
    const singleAt = DUEL_SCENE.indexOf('<GladiatorMesh\n                    fighter={opp}');
    expect(pairAt).toBeGreaterThan(-1);
    expect(singleAt).toBeGreaterThan(pairAt);
    // The front model is unmounted once the attendants have taken him.
    expect(DUEL_SCENE).toContain("frontVisible={brothersStage.front !== 'withdrawn'}");
  });

  test('every strike uses the acting brother’s published weapon — no bespoke damage math', () => {
    expect(DUEL_SCENE).toContain('const attackerWeapon = brothersWeapon ?? attacker.loadout.weapon;');
    expect(DUEL_SCENE).toContain('getStaminaCost(attackerWeapon, isQuick)');
    expect(DUEL_SCENE).toContain('getWeaponRange(attackerWeapon)');
    expect(DUEL_SCENE).toContain('attackerWeapon.damageLight');
    expect(DUEL_SCENE).toContain('attackerWeapon.damageHeavy');
    // The old reads are gone: no strike falls back to the row's own weapon.
    // The base-damage expression itself reads the acting brother's weapon.
    expect(DUEL_SCENE).not.toContain('? attacker.loadout.weapon.damageLight');
  });

  test('the flank strike and the recovery ride the existing dispatch points', () => {
    expect(DUEL_SCENE).toContain("executeCombatTurn('opponent', 'quick_attack')");
    expect(DUEL_SCENE).toContain("executeCombatTurn('opponent', 'brothers_recovery')");
    expect(DUEL_SCENE).toContain("executeCombatTurn('opponent', 'power_attack')");
    // The recovery resolves nothing: its branch has no damage stage.
    const at = DUEL_SCENE.indexOf("actionType === 'brothers_recovery'");
    expect(at).toBeGreaterThan(-1);
    const branch = DUEL_SCENE.slice(at, DUEL_SCENE.indexOf('// 2e. BEAST HUNT', at));
    expect(branch).not.toContain('calculateAttackDamage');
    expect(branch).not.toContain('health:');
  });

  test('the flank strike is part of the Crossing exchange, not a slot of its own', () => {
    // The pair's cadence counter must not advance on the flank, or a Crossing
    // could be planned on top of the one it is finishing.
    expect(DUEL_SCENE).toContain('if (brothersCfg && !flankStrikeRef.current) {');
    const flankAt = DUEL_SCENE.indexOf('if (flankStrikeRef.current) {');
    const planAt = DUEL_SCENE.indexOf('planBrothersSlot(brothersRef.current, brothersCfg, {');
    expect(flankAt).toBeGreaterThan(planAt);
  });

  test('the HUD receives the pair and draws it beside the boss’s name', () => {
    expect(DUEL_SCENE).toContain('brothers={');
    expect(DUEL_SCENE).toContain('activeName: brotherProfile(brothersCfg, brothers.acting).name');
    expect(HUD).toContain('data-brothers-active={brothers.activeName}');
    expect(HUD).toContain('data-brothers-phase={brothers.phase}');
    expect(HUD).toContain('data-brothers-crossing={brothers.crossing}');
    expect(HUD).toContain('data-brothers-oath={brothers.oath ?');
  });

  test('the pair is duel-session state only: the module knows no storage and no save', () => {
    const module = read('utils/yokedBrothers.ts');
    for (const token of ['localStorage', 'sessionStorage', 'saveProfile', 'PlayerProfile', 'Math.random']) {
      expect(module, token).not.toContain(token);
    }
    // The duel keeps the pair in a ref/state pair, seeded fresh per mount.
    expect(DUEL_SCENE).toContain('useState<BrothersDuelState>(() => createBrothersState())');
  });

  test('one boss row, one purse: the pair adds no second roster entry or reward path', () => {
    const rows = ALL_OPPONENTS.filter((opponent) => opponent.name.includes('Cotta'));
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(row.rewardGold).toBeGreaterThan(0);
      expect(row.brothers).toBeDefined();
      // The pair is a Feature Bout: never a ladder rung, never a bossKills stripe.
      expect(row.featureBout).toBe(true);
      expect(row.fightIndex).toBe(0);
    }
  });
});
