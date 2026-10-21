/**
 * CL-3 — the Doctore's guided beats: the pure trigger engine's suite.
 *
 * Run with: `bun test src/utils/coachMarks.beats.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  D1–D7 each fire on its own state, do NOT fire before it, and never fire
 *       again once the id is in `seen` (for any opponent).
 *   §B  the priority rule — lowest beat number first, one card at a time.
 *   §C  purity — same inputs, same answer; `seen` and the snapshot are never
 *       mutated, and a profile handed through `resolveSeenState` is untouched.
 *   §D  D8 — the result screen only, a profile's FIRST loss only.
 *   §E  a full simulated fight sequence — a profile with every D-beat seen gets
 *       zero cards, while the same sequence drives D1–D7 for a fresh profile.
 *
 * Data and pure functions only: nothing here reads or writes storage, and no
 * test mutates a profile.
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import {
  BEAT_EXPIRY_ACTIONS,
  DUEL_BEAT_IDS,
  HYPE_HIGH,
  OPPONENT_REELING_HEALTH_FRACTION,
  beatDismissesOn,
  evaluateBeats,
  markSeen,
  resolveSeenState,
  type CombatSnapshot,
  type FightSnapshot,
  type ResultSnapshot,
  type SeenState,
} from './coachMarks';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';

/**
 * A fight snapshot whose every trigger is false: it is the second player turn,
 * nobody is reeling, hype is below HIGH, no telegraph, and the last strike
 * landed. Each test changes exactly the field its beat reads.
 */
function fight(over: Partial<FightSnapshot> = {}): FightSnapshot {
  return {
    phase: 'fight',
    opponentId: 'opp_gaius',
    isBoss: false,
    playerTurn: 2,
    playerActing: true,
    inReach: true,
    playerStamina: 60,
    playerStaminaMax: 100,
    quickStaminaCost: 12,
    powerStaminaCost: 22,
    lastPlayerStrike: 'landed',
    opponentHealth: 100,
    opponentHealthMax: 100,
    hype: 25,
    telegraph: false,
    ...over,
  };
}

function result(over: Partial<ResultSnapshot> = {}): ResultSnapshot {
  return { phase: 'result', result: 'loss', losses: 1, ...over };
}

const seen = (...ids: string[]): SeenState =>
  Object.fromEntries(ids.map((id) => [id, true as const])) as SeenState;

describe('CL-3 §A — each beat fires on its state, never before, never twice', () => {
  test('the quiet snapshot triggers nothing at all', () => {
    expect(evaluateBeats(fight(), {})).toBeNull();
  });

  test('D1 — the first player turn of a duel against Marcus', () => {
    const on = fight({ opponentId: 'opp_marcus', playerTurn: 1, playerActing: true });
    expect(evaluateBeats(on, {})).toBe('D1');

    // Not before the state: another opponent, a later turn, or a resolving action.
    expect(evaluateBeats(fight({ opponentId: 'opp_gaius', playerTurn: 1 }), {})).toBeNull();
    expect(evaluateBeats(fight({ opponentId: 'opp_marcus', playerTurn: 2 }), {})).toBeNull();
    expect(
      evaluateBeats(fight({ opponentId: 'opp_marcus', playerTurn: 1, playerActing: false }), {})
    ).toBeNull();

    // Never again once seen.
    expect(evaluateBeats(on, seen('D1'))).toBeNull();
    // …and D1 is Marcus's alone: a fresh player fighting anyone else learns D2–D7.
    expect(evaluateBeats(fight({ opponentId: 'opp_gaius', playerTurn: 1 }), seen())).toBeNull();
  });

  test('D2 — a strike attempted out of weapon reach', () => {
    const on = fight({ inReach: false, lastPlayerStrike: 'missed_out_of_reach' });
    expect(evaluateBeats(on, {})).toBe('D2');

    // Out of reach alone is a range reading, not an attempted strike.
    expect(evaluateBeats(fight({ inReach: false, lastPlayerStrike: null }), {})).toBeNull();
    expect(evaluateBeats(fight({ inReach: false, lastPlayerStrike: 'landed' }), {})).toBeNull();

    expect(evaluateBeats(on, seen('D2'))).toBeNull();
  });

  test('D3 — stamina below the Power strike cost', () => {
    const on = fight({ playerStamina: 21, powerStaminaCost: 22 });
    expect(evaluateBeats(on, {})).toBe('D3');

    // Exactly enough stamina is not "below" the cost.
    expect(evaluateBeats(fight({ playerStamina: 22, powerStaminaCost: 22 }), {})).toBeNull();
    expect(evaluateBeats(fight({ playerStamina: 60, powerStaminaCost: 22 }), {})).toBeNull();

    expect(evaluateBeats(on, seen('D3'))).toBeNull();
  });

  test('D4 — the opponent blocks a player strike', () => {
    const on = fight({ lastPlayerStrike: 'blocked' });
    expect(evaluateBeats(on, {})).toBe('D4');

    // A landed strike is not a blocked one, and a miss is D2's state, not D4's.
    expect(evaluateBeats(fight({ lastPlayerStrike: 'landed' }), {})).toBeNull();
    expect(evaluateBeats(fight({ inReach: false, lastPlayerStrike: 'missed_out_of_reach' }), {})).toBe('D2');

    expect(evaluateBeats(on, seen('D4'))).toBeNull();
  });

  test('D5 — full stamina against a reeling opponent', () => {
    const reeling = fight({
      playerStamina: 100,
      playerStaminaMax: 100,
      opponentHealth: 25,
      opponentHealthMax: 100,
    });
    expect(evaluateBeats(reeling, {})).toBe('D5');
    expect(OPPONENT_REELING_HEALTH_FRACTION).toBe(0.25);

    // A healthy opponent, a spent player, or a dead one is not the state.
    expect(evaluateBeats(fight({ playerStamina: 100, opponentHealth: 26 }), {})).toBeNull();
    expect(evaluateBeats(fight({ playerStamina: 99, opponentHealth: 25 }), {})).toBeNull();
    expect(evaluateBeats(fight({ playerStamina: 100, opponentHealth: 0 }), {})).toBeNull();

    expect(evaluateBeats(reeling, seen('D5'))).toBeNull();
  });

  test('D6 — hype crosses HIGH', () => {
    const on = fight({ hype: HYPE_HIGH + 1 });
    expect(evaluateBeats(on, {})).toBe('D6');
    expect(HYPE_HIGH).toBe(40);

    // At the threshold the meter still reads LOW; crossing it is the trigger.
    expect(evaluateBeats(fight({ hype: HYPE_HIGH }), {})).toBeNull();
    expect(evaluateBeats(fight({ hype: 25 }), {})).toBeNull();

    expect(evaluateBeats(on, seen('D6'))).toBeNull();
  });

  test('D7 — the first boss telegraph, and boss fights only', () => {
    const on = fight({ isBoss: true, telegraph: true });
    expect(evaluateBeats(on, {})).toBe('D7');

    // The telegraph flag is boss-gated in the shipped combat; a non-boss never fires it.
    expect(evaluateBeats(fight({ isBoss: true, telegraph: false }), {})).toBeNull();
    expect(evaluateBeats(fight({ isBoss: false, telegraph: true }), {})).toBeNull();

    expect(evaluateBeats(on, seen('D7'))).toBeNull();
  });

  test('a beat already seen never re-fires — for any opponent', () => {
    const triggers: Array<[string, FightSnapshot]> = [
      ['D1', fight({ opponentId: 'opp_marcus', playerTurn: 1 })],
      ['D2', fight({ inReach: false, lastPlayerStrike: 'missed_out_of_reach' })],
      ['D3', fight({ playerStamina: 4 })],
      ['D4', fight({ lastPlayerStrike: 'blocked' })],
      ['D5', fight({ playerStamina: 100, opponentHealth: 10 })],
      ['D6', fight({ hype: 88 })],
      ['D7', fight({ isBoss: true, telegraph: true })],
    ];
    for (const [id, snapshot] of triggers) {
      expect(evaluateBeats(snapshot, {})).toBe(id);
      // The profile that saw it once never sees it again, against any opponent.
      expect(evaluateBeats(snapshot, seen(id))).toBeNull();
      expect(
        evaluateBeats({ ...snapshot, opponentId: 'opp_someone_else' }, seen(id))
      ).toBeNull();
    }
  });
});

describe('CL-3 §B — priority: the lowest beat number wins, one card at a time', () => {
  test('D3 and D6 together answer D3', () => {
    const both = fight({ playerStamina: 5, hype: 90 });
    expect(evaluateBeats(both, {})).toBe('D3');
    expect(evaluateBeats(both, seen('D3'))).toBe('D6');
  });

  test('D2, D4 and D7 can never collide, but D5/D6/D7 do — and resolve in order', () => {
    const both = fight({
      playerStamina: 100,
      opponentHealth: 10,
      hype: 90,
      isBoss: true,
      telegraph: true,
    });
    expect(evaluateBeats(both, {})).toBe('D5');
    expect(evaluateBeats(both, seen('D5'))).toBe('D6');
    expect(evaluateBeats(both, seen('D5', 'D6'))).toBe('D7');
    expect(evaluateBeats(both, seen('D5', 'D6', 'D7'))).toBeNull();
  });

  test('Marcus’s opening turn outranks every later beat', () => {
    const marcusOpening = fight({
      opponentId: 'opp_marcus',
      playerTurn: 1,
      isBoss: true,
      telegraph: true,
      hype: 95,
    });
    expect(evaluateBeats(marcusOpening, {})).toBe('D1');
    expect(evaluateBeats(marcusOpening, seen('D1'))).toBe('D6');
  });
});

describe('CL-3 §C — the evaluator is pure', () => {
  test('the same inputs always answer the same id', () => {
    const snapshot = fight({ playerStamina: 3, hype: 70 });
    const ids = new Set([evaluateBeats(snapshot, {}), evaluateBeats(snapshot, {}), evaluateBeats(snapshot, {})]);
    expect([...ids]).toEqual(['D3']);
  });

  test('neither the snapshot nor the seen record is mutated', () => {
    const snapshot = fight({ playerStamina: 3, lastPlayerStrike: 'blocked' });
    const seenRecord: SeenState = { D3: true };
    const snapshotBefore = JSON.stringify(snapshot);
    const seenBefore = JSON.stringify(seenRecord);

    expect(evaluateBeats(snapshot, seenRecord)).toBe('D4');
    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(JSON.stringify(seenRecord)).toBe(seenBefore);
    expect(Object.keys(seenRecord)).toEqual(['D3']);
  });

  test('a profile is never touched — the evaluator only reads its resolved seen record', () => {
    const profile = markSeen(createNewProfile('Spartacus'), 'D6') as PlayerProfile;
    const before = JSON.stringify(profile);

    const snapshot = fight({ playerStamina: 2, hype: 99 });
    expect(evaluateBeats(snapshot, resolveSeenState(profile))).toBe('D3');
    expect(JSON.stringify(profile)).toBe(before);
    expect(profile.seen).toEqual({ D6: true });
  });

  test('it is total: junk, missing or frozen inputs answer without throwing', () => {
    expect(evaluateBeats(fight(), null)).toBeNull();
    expect(evaluateBeats(fight(), undefined)).toBeNull();
    expect(evaluateBeats(fight({ hype: Number.NaN, playerStamina: Number.NaN }), {})).toBeNull();
    expect(evaluateBeats(fight({ lastPlayerStrike: 'blocked' }), Object.freeze({}) as SeenState)).toBe('D4');
  });
});

describe('CL-3 §D — D8, the profile’s first loss', () => {
  test('a first loss shows D8 on the result screen', () => {
    expect(evaluateBeats(result({ result: 'loss', losses: 1 }), {})).toBe('D8');
  });

  test('a win never shows it', () => {
    expect(evaluateBeats(result({ result: 'win', losses: 0 }), {})).toBeNull();
    expect(evaluateBeats(result({ result: 'win', losses: 3 }), {})).toBeNull();
  });

  test('a second loss never shows it again — nor does a profile that saw it', () => {
    expect(evaluateBeats(result({ result: 'loss', losses: 2 }), {})).toBeNull();
    expect(evaluateBeats(result({ result: 'loss', losses: 9 }), {})).toBeNull();
    expect(evaluateBeats(result({ result: 'loss', losses: 1 }), seen('D8'))).toBeNull();
  });

  test('the in-fight beats never fire on the result screen, and D8 never fires in a fight', () => {
    const everyFightTrigger: FightSnapshot = {
      ...fight({
        opponentId: 'opp_marcus',
        playerTurn: 1,
        inReach: false,
        playerStamina: 0,
        playerStaminaMax: 100,
        lastPlayerStrike: 'blocked',
        opponentHealth: 5,
        hype: 100,
        isBoss: true,
        telegraph: true,
      }),
    };
    expect(evaluateBeats(everyFightTrigger, {})).toBe('D1');
    expect(evaluateBeats(everyFightTrigger, seen(...DUEL_BEAT_IDS))).toBeNull();
  });
});

describe('CL-3 §E — a full simulated fight', () => {
  /**
   * One resolved player turn, evaluated exactly the way DuelScene does it: the
   * snapshot is built from the fight's state, the answered beat is recorded, and
   * the fight carries on. Returns every beat the sequence produced.
   */
  function runFight(
    start: PlayerProfile,
    turns: Array<Partial<FightSnapshot>>
  ): { shown: string[]; profile: PlayerProfile } {
    let profile = start;
    const shown: string[] = [];
    for (const turn of turns) {
      const snapshot = fight(turn);
      const beat = evaluateBeats(snapshot, resolveSeenState(profile));
      if (beat) {
        shown.push(beat);
        profile = markSeen(profile, beat) as PlayerProfile;
      }
    }
    return { shown, profile };
  }

  const TURNS: Array<Partial<FightSnapshot>> = [
    { opponentId: 'opp_marcus', playerTurn: 1 },
    { inReach: false, lastPlayerStrike: 'missed_out_of_reach' },
    { playerStamina: 8, lastPlayerStrike: 'landed' },
    { lastPlayerStrike: 'blocked', playerStamina: 40 },
    { playerStamina: 100, opponentHealth: 20, lastPlayerStrike: 'landed' },
    { hype: 61, playerStamina: 80, opponentHealth: 80 },
    { isBoss: true, telegraph: true, hype: 30, playerStamina: 90, opponentHealth: 90 },
    { hype: 20, playerStamina: 90, opponentHealth: 90 },
  ];

  test('a fresh profile is walked through D1–D7, one card per turn', () => {
    const { shown, profile } = runFight(createNewProfile('Spartacus'), TURNS);
    expect(shown).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(resolveSeenState(profile)).toEqual(seen(...DUEL_BEAT_IDS));
  });

  test('a profile with every D-beat seen produces zero cards', () => {
    const allSeen = DUEL_BEAT_IDS.reduce(
      (profile, id) => markSeen(profile, id) as PlayerProfile,
      createNewProfile('Spartacus')
    );
    const { shown, profile } = runFight(allSeen, TURNS);
    expect(shown).toEqual([]);
    expect(profile).toBe(allSeen);
  });

  test('the same profile also produces no card on the result screen', () => {
    const allSeen = markSeen(createNewProfile('Spartacus'), 'D8') as PlayerProfile;
    expect(evaluateBeats(result({ result: 'loss', losses: 1 }), resolveSeenState(allSeen))).toBeNull();
  });
});

describe('CL-3 §F — the dismissal rules', () => {
  test('each in-fight beat names the action it teaches', () => {
    expect(beatDismissesOn('D1', 'quick_attack')).toBe(true);
    expect(beatDismissesOn('D2', 'advance')).toBe(true);
    expect(beatDismissesOn('D3', 'shield_block')).toBe(true);
    expect(beatDismissesOn('D3', 'taunt')).toBe(true);
    expect(beatDismissesOn('D4', 'power_attack')).toBe(true);
    expect(beatDismissesOn('D5', 'power_attack')).toBe(true);
    expect(beatDismissesOn('D6', 'taunt')).toBe(true);
    expect(beatDismissesOn('D7', 'dodge')).toBe(true);

    // A different action does not dismiss it — the card then waits for its expiry.
    expect(beatDismissesOn('D7', 'quick_attack')).toBe(false);
    expect(beatDismissesOn('D8', 'quick_attack')).toBe(false);
    expect(beatDismissesOn('NOPE', 'dodge')).toBe(false);
    expect(beatDismissesOn(undefined, 'dodge')).toBe(false);
    expect(beatDismissesOn('D7', 3)).toBe(false);
  });

  test('two further actions expire a shown card', () => {
    expect(BEAT_EXPIRY_ACTIONS).toBe(2);
  });
});
