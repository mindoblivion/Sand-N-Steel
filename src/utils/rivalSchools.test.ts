// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { RIVAL_SCHOOL_OPPONENT } from '../data/rivalSchools';
import {
  isRivalSchoolChallengeWon,
  rivalSchoolChallengeState,
  resolveRivalryProgress,
  settleRivalSchoolBout,
} from './rivalSchools';
import { resolveChapterGates, resolveStoryState } from './storyState';
import { ALL_OPPONENTS } from '../data/opponents';

const fresh = (): PlayerProfile => createNewProfile('Rival Test');
const validStats = (): DuelStatistics => ({
  damageDealt: 60,
  damageTaken: 45,
  hitsLanded: 6,
  perfectBlocks: 1,
  dodgesPerformed: 2,
  maxCombo: 3,
  lowestStaminaFraction: 0.35,
  crowdHypePeak: 28,
  durationSeconds: 75,
  goldEarned: 70,
  fameEarned: 20,
  xpEarned: 90,
});
const inChapterTwo = (): PlayerProfile => {
  const profile = fresh();
  return {
    ...profile,
    fightsWon: 2,
    defeatedOpponentIds: [...profile.defeatedOpponentIds, 'opp_doctore_sextus'],
    story: { doctoreTestPassed: true },
  };
};
const goliathId = ALL_OPPONENTS.find((opponent) => opponent.tier === 1 && opponent.isBoss)?.id ?? '';
const withGoliathAndOmen = (): PlayerProfile => {
  const profile = inChapterTwo();
  return {
    ...profile,
    defeatedOpponentIds: [...profile.defeatedOpponentIds, goliathId],
    omen: { kind: 'kind', expiresAtBout: 4 },
  };
};

describe('Rival Schools — first challenge record', () => {
  test('fresh profiles resolve to an available challenge without writing story data', () => {
    const profile = fresh();
    expect(rivalSchoolChallengeState(profile)).toBe('available');
    expect(resolveRivalryProgress(profile).completed).toBe(false);
    expect(profile.story).toBeUndefined();
  });

  test('legacy saves without story remain valid and available', () => {
    const { story: _story, ...legacy } = fresh();
    expect(rivalSchoolChallengeState(legacy)).toBe('available');
    expect(isRivalSchoolChallengeWon(legacy)).toBe(false);
  });

  test('partial rivalry data normalizes defensively without inventing a win', () => {
    const profile = { ...fresh(), story: { rivalry: { attempts: 2, losses: 1 } } } as PlayerProfile;
    const progress = resolveRivalryProgress(profile);
    expect(progress.attempts).toBe(2);
    expect(progress.losses).toBe(1);
    expect(progress.completed).toBe(false);
    expect(rivalSchoolChallengeState(profile)).toBe('awaiting_retry');
  });

  test('malformed rivalry data is treated as no evidence and never throws', () => {
    for (const rivalry of [null, 'won', 42, [], { completed: true }]) {
      const profile = { ...fresh(), story: { rivalry } } as unknown as PlayerProfile;
      expect(isRivalSchoolChallengeWon(profile)).toBe(false);
      expect(rivalSchoolChallengeState(profile)).toBe('available');
    }
    const incompleteWin = { ...fresh(), story: { rivalry: { wins: 1 } } } as unknown as PlayerProfile;
    expect(isRivalSchoolChallengeWon(incompleteWin)).toBe(false);
    expect(rivalSchoolChallengeState(incompleteWin)).toBe('awaiting_retry');
  });

  test('a genuine loss is recorded and leaves the challenge retryable', () => {
    const profile = fresh();
    const next = settleRivalSchoolBout(profile, RIVAL_SCHOOL_OPPONENT, false, true, validStats());
    expect(resolveRivalryProgress(next)).toMatchObject({ attempts: 1, wins: 0, losses: 1, completed: false });
    expect(rivalSchoolChallengeState(next)).toBe('awaiting_retry');
  });

  test('a loss followed by a valid victory completes the challenge exactly once', () => {
    const loss = settleRivalSchoolBout(fresh(), RIVAL_SCHOOL_OPPONENT, false, true, validStats());
    const win = settleRivalSchoolBout(loss, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(resolveRivalryProgress(win)).toMatchObject({ attempts: 2, wins: 1, losses: 1, completed: true });
    expect(rivalSchoolChallengeState(win)).toBe('completed');
  });

  test('a valid first victory completes the challenge', () => {
    const next = settleRivalSchoolBout(fresh(), RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(isRivalSchoolChallengeWon(next)).toBe(true);
  });

  test('repeated victory delivery after completion is identity-stable', () => {
    const won = settleRivalSchoolBout(fresh(), RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    const repeated = settleRivalSchoolBout(won, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(repeated).toBe(won);
    expect(resolveRivalryProgress(repeated).attempts).toBe(1);
  });

  test('a victory whose purse was rejected does not record an attempt or completion', () => {
    const profile = fresh();
    const next = settleRivalSchoolBout(profile, RIVAL_SCHOOL_OPPONENT, true, false, validStats());
    expect(next).toBe(profile);
    expect(isRivalSchoolChallengeWon(next)).toBe(false);
  });

  test('exhibition results are excluded', () => {
    const profile = fresh();
    const next = settleRivalSchoolBout(profile, RIVAL_SCHOOL_OPPONENT, false, true, validStats(), { exhibition: true });
    expect(next).toBe(profile);
  });

  test('grudge rows are excluded', () => {
    const profile = fresh();
    const grudge = { ...RIVAL_SCHOOL_OPPONENT, grudge: {} } as OpponentConfig;
    const next = settleRivalSchoolBout(profile, grudge, false, true, validStats(), { grudge: true });
    expect(next).toBe(profile);
  });

  test('rival victories do not add the rival to defeatedOpponentIds', () => {
    const profile = fresh();
    const next = settleRivalSchoolBout(profile, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(next.defeatedOpponentIds).toEqual(profile.defeatedOpponentIds);
  });

  test('rival victories do not advance currentTier or bossKills', () => {
    const profile = { ...fresh(), currentTier: 1, bossKills: 4 };
    const next = settleRivalSchoolBout(profile, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(next.currentTier).toBe(profile.currentTier);
    expect(next.bossKills).toBe(profile.bossKills);
  });

  test('Chapter 2 stays open until Goliath, the rival and the omen are all settled', () => {
    const beforeRival = withGoliathAndOmen();
    expect(resolveStoryState(beforeRival).chapter).toBe(2);
    expect(resolveChapterGates(beforeRival, 2).map((gate) => gate.state)).toEqual(['met', 'unmet', 'met']);
    const afterRival = settleRivalSchoolBout(beforeRival, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    expect(resolveStoryState(afterRival).chapter).toBe(3);
  });

  test('later pending gates remain non-blocking after Chapter 2 closes', () => {
    const base = withGoliathAndOmen();
    const won = settleRivalSchoolBout(base, RIVAL_SCHOOL_OPPONENT, true, true, validStats());
    const chapterThree = resolveChapterGates(won, 3);
    expect(chapterThree.some((gate) => gate.state === 'pending')).toBe(true);
    const tierTwoBoss = ALL_OPPONENTS.find((opponent) => opponent.tier === 2 && opponent.isBoss)?.id ?? '';
    const allAvailableChapterThreeEvidence = {
      ...won,
      fame: 200,
      currentTier: 2,
      defeatedOpponentIds: [...won.defeatedOpponentIds, tierTwoBoss],
      story: { ...(won.story ?? {}), librarySeen: true },
    };
    expect(resolveStoryState(allAvailableChapterThreeEvidence).chapter).toBe(4);
  });

  test('withdrawal is a recorded loss; malformed statistics are ignored', () => {
    const withdrawn = { ...validStats(), outcome: 'withdrawn' as const };
    const loss = settleRivalSchoolBout(fresh(), RIVAL_SCHOOL_OPPONENT, false, true, withdrawn);
    expect(resolveRivalryProgress(loss).losses).toBe(1);
    const malformed = settleRivalSchoolBout(
      fresh(),
      RIVAL_SCHOOL_OPPONENT,
      false,
      true,
      { ...validStats(), goldEarned: Number.NaN }
    );
    expect(malformed.story).toBeUndefined();
  });
});
