// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import {
  ALL_OPPONENTS,
  DOCTORE_TEST_OPPONENT,
  FEATURE_BOUT_OPPONENTS,
  LADDER_OPPONENTS,
  TOURNAMENT_TIERS,
} from '../data/opponents';
import { BOUNTY_BOARD_OPPONENTS } from '../data/bountyBoard';
import { TRIAL_OF_ENDURANCE_OPPONENTS } from '../data/trialOfEndurance';
import { RIVAL_SCHOOL_OPPONENT } from '../data/rivalSchools';
import {
  BRACKET_WAVES,
  bracketWaveGateText,
  resolveBracketAfterDuel,
  resolveBracketProgress,
  waveForOpponent,
} from './bracket';
import { resolveVictoryTier } from './tierAdvancement';
import { deriveRank } from './rank';
import { nextBossKills } from './bossKills';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));

const fresh = (): PlayerProfile => createNewProfile('Bracket Test');

const withDefeated = (profile: PlayerProfile, ids: string[]): PlayerProfile => ({
  ...profile,
  defeatedOpponentIds: ids,
});

const LADDER_IDS = LADDER_OPPONENTS.map((row) => row.id);
const rowById = (id: string) => ALL_OPPONENTS.find((row) => row.id === id)!;

// ── §1 The wave table ─────────────────────────────────────────────────────
describe('BRACKET-1 §1 — the wave table', () => {
  test('exactly eight waves, in climb order, with the doc’s names', () => {
    expect(BRACKET_WAVES.map((wave) => wave.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(BRACKET_WAVES.map((wave) => wave.name)).toEqual([
      'Blooded',
      'Proven',
      'Rising',
      'Feared',
      'Renowned',
      'Champion',
      'Legend',
      'Immortal',
    ]);
  });

  test('every ladder rung belongs to exactly one wave, in roster order', () => {
    const rungIds = BRACKET_WAVES.flatMap((wave) => wave.rungs.map((row) => row.id));
    expect(rungIds).toEqual(LADDER_IDS);
    expect(new Set(rungIds).size).toBe(12);
    expect(BRACKET_WAVES.map((wave) => wave.rungs.length)).toEqual([2, 1, 3, 1, 3, 1, 1, 0]);
  });

  test('wave 8 holds the two epilogue champions, Scaevola first', () => {
    const immortal = BRACKET_WAVES[7];
    expect(immortal.cards.map((row) => row.id)).toEqual([
      'opp_scaevola_boss',
      'opp_hermas_boss',
    ]);
    expect(immortal.rungs).toEqual([]);
  });

  test('waveForOpponent answers the wave for ladder rows and null for everything else', () => {
    expect(LADDER_OPPONENTS.map((row) => waveForOpponent(row))).toEqual([
      1, 1, 2, 3, 3, 3, 4, 5, 5, 5, 6, 7,
    ]);
    for (const row of FEATURE_BOUT_OPPONENTS) expect(waveForOpponent(row)).toBeNull();
    for (const row of BOUNTY_BOARD_OPPONENTS) expect(waveForOpponent(row)).toBeNull();
    expect(waveForOpponent(DOCTORE_TEST_OPPONENT)).toBeNull();
    expect(waveForOpponent(TRIAL_OF_ENDURANCE_OPPONENTS[0])).toBeNull();
    expect(waveForOpponent(RIVAL_SCHOOL_OPPONENT)).toBeNull();
    expect(waveForOpponent(null)).toBeNull();
    expect(waveForOpponent(undefined)).toBeNull();
  });

  test('a wave’s purse is the sum of its rows’ purses, computed from the rows', () => {
    for (const wave of BRACKET_WAVES) {
      const shown = wave.cards;
      const gold = shown.reduce((sum, row) => sum + row.rewardGold, 0);
      const fame = shown.reduce((sum, row) => sum + row.rewardFame, 0);
      // The same rows, looked up independently by id — a wrong id in the
      // table changes the sum, so this pins the table to the roster.
      const lookedUp = wave.cards.map((row) => rowById(row.id));
      expect(gold).toBe(lookedUp.reduce((sum, row) => sum + row.rewardGold, 0));
      expect(fame).toBe(lookedUp.reduce((sum, row) => sum + row.rewardFame, 0));
    }
    // The summit out-pays every ladder wave — ordering sanity, no literals.
    const purses = BRACKET_WAVES.map((wave) =>
      wave.cards.reduce((sum, row) => sum + row.rewardGold, 0),
    );
    expect(purses[7]).toBeGreaterThan(Math.max(...purses.slice(0, 7)));
  });
});

// ── §2 Derivation from the record ──────────────────────────────────────────
describe('BRACKET-1 §2 — derivation from defeatedOpponentIds', () => {
  test('a fresh profile reads wave 1, all waves unplayed, never throws', () => {
    const resolved = resolveBracketProgress(fresh());
    expect(resolved.currentWave).toBe(1);
    expect(resolved.waves.every((wave) => !wave.complete)).toBe(true);
    expect(resolved.waves.every((wave) => wave.attempts === 0 && wave.wins === 0 && wave.losses === 0)).toBe(true);
    expect(resolveBracketProgress(null).currentWave).toBe(1);
    expect(resolveBracketProgress(undefined).currentWave).toBe(1);
    expect(resolveBracketProgress({} as PlayerProfile).currentWave).toBe(1);
  });

  test('a legacy profile with no story field derives its waves from the record alone', () => {
    const legacy = withDefeated(fresh(), ['opp_marcus', 'opp_flaccus', 'opp_goliath_boss']);
    delete (legacy as Partial<PlayerProfile>).story;
    const resolved = resolveBracketProgress(legacy);
    expect(resolved.waves[0].complete).toBe(true);
    expect(resolved.waves[1].complete).toBe(true);
    expect(resolved.currentWave).toBe(3);
  });

  test('wave completeness is exactly “every rung id in the record”', () => {
    const profile = withDefeated(fresh(), ['opp_marcus']);
    const resolved = resolveBracketProgress(profile);
    expect(resolved.waves[0].complete).toBe(false);
    expect(resolved.currentWave).toBe(1);
    const done = resolveBracketProgress(withDefeated(fresh(), ['opp_marcus', 'opp_flaccus']));
    expect(done.waves[0].complete).toBe(true);
    expect(done.currentWave).toBe(2);
  });

  test('all twelve ladder ids defeated reads current wave 8, wave 8 still open', () => {
    const resolved = resolveBracketProgress(withDefeated(fresh(), LADDER_IDS));
    expect(resolved.waves.slice(0, 7).every((wave) => wave.complete)).toBe(true);
    expect(resolved.waves[7].complete).toBe(false);
    expect(resolved.currentWave).toBe(8);
  });

  test('either epilogue champion completes wave 8; current wave stays 8', () => {
    const scaevola = resolveBracketProgress(withDefeated(fresh(), [...LADDER_IDS, 'opp_scaevola_boss']));
    expect(scaevola.waves[7].complete).toBe(true);
    expect(scaevola.currentWave).toBe(8);
    const hermas = resolveBracketProgress(withDefeated(fresh(), [...LADDER_IDS, 'opp_hermas_boss']));
    expect(hermas.waves[7].complete).toBe(true);
    expect(hermas.currentWave).toBe(8);
  });

  test('a malformed bracket record reads as unplayed, never throws', () => {
    const junk = fresh();
    (junk as unknown as Record<string, unknown>).story = {
      bracket: { waves: { '1': { attempts: 'three', wins: -2, losses: null } } },
    };
    const resolved = resolveBracketProgress(junk);
    expect(resolved.waves[0].attempts).toBe(0);
    expect(resolved.waves[0].wins).toBe(0);
    expect(resolved.waves[0].losses).toBe(0);
    const stringy = fresh();
    (stringy as unknown as Record<string, unknown>).story = { bracket: 'junk' };
    expect(resolveBracketProgress(stringy).currentWave).toBe(1);
  });

  test('locked waves print their gate from data', () => {
    // A future tier names the tier and its venue — computed from the tier
    // table, never restated.
    const early = { ...fresh(), level: 1, currentTier: 1 };
    const rising = BRACKET_WAVES[2];
    const tier = rising.rungs[0]!.tier;
    const info = TOURNAMENT_TIERS.find((entry) => entry.tier === tier)!;
    expect(bracketWaveGateText(rising, early)).toBe(`Requires Tier ${tier} — ${info.name}.`);
    // A wave in reach but level-locked on every unbeaten rung reads the
    // opponent cards' own lock line, with the minimum level from the rows.
    const underlevelled = { ...fresh(), level: 1, currentTier: 3 };
    const renowned = BRACKET_WAVES[4];
    const minLevel = Math.min(...renowned.rungs.map((row) => row.recommendedLevel));
    expect(bracketWaveGateText(renowned, underlevelled)).toBe(`Locked (Requires LVL ${minLevel})`);
    // An open wave prints nothing.
    expect(bracketWaveGateText(BRACKET_WAVES[0], early)).toBe('');
    // Wave 8 carries no wave-level gate — its cards carry their own.
    expect(bracketWaveGateText(BRACKET_WAVES[7], early)).toBe('');
  });
});

// ── §3 The record ──────────────────────────────────────────────────────────
describe('BRACKET-1 §3 — the W/L record', () => {
  test('a win tallies wins + attempts on the bout’s wave and nothing else', () => {
    const settled = resolveBracketAfterDuel(fresh(), { wave: 2, won: true, rewardSettlementAccepted: true });
    expect(settled.story?.bracket?.waves?.['2']).toEqual({ attempts: 1, wins: 1, losses: 0 });
    expect(settled.story?.bracket?.waves?.['1']).toBeUndefined();
    expect(settled.currentTier).toBe(fresh().currentTier);
  });

  test('a loss tallies losses + attempts, and tallies accumulate', () => {
    const once = resolveBracketAfterDuel(fresh(), { wave: 3, won: false, rewardSettlementAccepted: true });
    expect(once.story?.bracket?.waves?.['3']).toEqual({ attempts: 1, wins: 0, losses: 1 });
    const twice = resolveBracketAfterDuel(once, { wave: 3, won: true, rewardSettlementAccepted: true });
    expect(twice.story?.bracket?.waves?.['3']).toEqual({ attempts: 2, wins: 1, losses: 1 });
  });

  test('a refused victory tallies nothing — the profile is returned unchanged', () => {
    const profile = fresh();
    const settled = resolveBracketAfterDuel(profile, { wave: 2, won: true, rewardSettlementAccepted: false });
    expect(settled).toBe(profile);
  });

  test('wave 8 never tallies — its completeness is derived, not recorded', () => {
    const profile = fresh();
    expect(resolveBracketAfterDuel(profile, { wave: 8, won: true, rewardSettlementAccepted: true })).toBe(profile);
    expect(resolveBracketAfterDuel(profile, { wave: 8, won: false, rewardSettlementAccepted: true })).toBe(profile);
  });

  test('an out-of-range wave or a malformed input tallies nothing', () => {
    const profile = fresh();
    expect(resolveBracketAfterDuel(profile, { wave: 0, won: true, rewardSettlementAccepted: true })).toBe(profile);
    expect(resolveBracketAfterDuel(profile, { wave: 9, won: true, rewardSettlementAccepted: true })).toBe(profile);
    expect(
      resolveBracketAfterDuel(profile, { wave: 2, won: 'yes' as unknown as boolean, rewardSettlementAccepted: true }),
    ).toBe(profile);
  });

  test('the record round-trips through the resolver', () => {
    const settled = resolveBracketAfterDuel(fresh(), { wave: 4, won: false, rewardSettlementAccepted: true });
    const resolved = resolveBracketProgress(settled);
    expect(resolved.waves[3].attempts).toBe(1);
    expect(resolved.waves[3].losses).toBe(1);
    expect(resolved.currentWave).toBe(1);
  });
});

// ── §4 Loss semantics ──────────────────────────────────────────────────────
describe('BRACKET-1 §4 — loss semantics (no demotion)', () => {
  test('a loss at any wave leaves currentTier and the felled record unchanged', () => {
    const profile = { ...fresh(), level: 7, currentTier: 3 };
    const settled = resolveBracketAfterDuel(profile, { wave: 3, won: false, rewardSettlementAccepted: true });
    expect(settled.currentTier).toBe(3);
    expect(settled.defeatedOpponentIds).toEqual(profile.defeatedOpponentIds);
    // The injury for the loss is the shipped one — asserted by
    // injury.test.ts, referenced here not re-pinned.
  });

  test('a Scaevola loss leaves the gate satisfied — Legend still derived, Aurelius still felled', () => {
    const legend = {
      ...fresh(),
      fame: 1500,
      level: 12,
      currentTier: 4,
      defeatedOpponentIds: ['opp_aurelius_boss'],
    };
    expect(deriveRank(legend)).toBe('Legend');
    // Scaevola is not a wave, so the loss tallies nothing anywhere.
    expect(waveForOpponent(rowById('opp_scaevola_boss'))).toBeNull();
    const settled = resolveBracketAfterDuel(legend, { wave: 8, won: false, rewardSettlementAccepted: true });
    expect(settled).toBe(legend);
    expect(deriveRank(settled)).toBe('Legend');
    expect(settled.defeatedOpponentIds).toContain('opp_aurelius_boss');
  });
});

// ── §5 Nothing else moves ──────────────────────────────────────────────────
describe('BRACKET-1 §5 — nothing else moves', () => {
  test('§J still pins exactly 29 top-level optional fields, and bracket is not one', () => {
    // The same scan saveCorpus.test.ts §J runs, asserted here without
    // copying its 29-name list: the count and the absence are the pin.
    const types = readFileSync(join(SRC_DIR, 'types/game.ts'), 'utf8');
    const start = types.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = types.indexOf('{', start); i < types.length; i += 1) {
      if (types[i] === '{') depth += 1;
      if (types[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = types.slice(start, end);
    const optional = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
    expect(optional.length).toBe(29);
    expect(optional).not.toContain('bracket');
    expect(optional).toContain('story');
  });

  test('combatCalculations.ts contains no bracket', () => {
    const combat = readFileSync(join(SRC_DIR, 'utils/combatCalculations.ts'), 'utf8');
    expect(combat.toLowerCase()).not.toContain('bracket');
  });

  test('resolveVictoryTier, deriveRank and nextBossKills behave as shipped', () => {
    const goliath = rowById('opp_goliath_boss');
    const first = resolveVictoryTier({ currentTier: 1, opponent: goliath, defeatedOpponentIds: [] });
    expect(first).toEqual({ currentTier: 2, firstDefeat: true, advanced: true });
    const rematch = resolveVictoryTier({
      currentTier: 2,
      opponent: goliath,
      defeatedOpponentIds: ['opp_goliath_boss'],
    });
    expect(rematch.advanced).toBe(false);
    expect(deriveRank({ fame: 1500, currentTier: 4, bossKills: 1 })).toBe('Legend');
    expect(deriveRank({ fame: 0, currentTier: 1 })).toBe('Rookie');
    const before = { bossKills: 0, defeatedOpponentIds: [] as string[] };
    const after = { bossKills: 0, defeatedOpponentIds: ['opp_goliath_boss'] };
    expect(nextBossKills(before, after, goliath)).toBe(1);
    expect(nextBossKills(before, after, rowById('opp_scaevola_boss'))).toBe(0);
  });
});

// ── §X The wiring, read out of the sources ────────────────────────────────
describe('BRACKET-1 §X — the wiring', () => {
  test('the bracket write exists in App.tsx’s duel-result path exactly once, inside the ladder fence', () => {
    const app = readFileSync(join(SRC_DIR, 'App.tsx'), 'utf8');
    expect(app.match(/resolveBracketAfterDuel\(/g)?.length).toBe(1);
    expect(app.match(/waveForOpponent\(/g)?.length).toBe(1);
    const fence = 'if (!exhibition && !rivalBout && !trialBout) {';
    expect(app).toContain(fence);
    // The write sits inside the fence — the call follows the fence text.
    expect(app.indexOf('resolveBracketAfterDuel(')).toBeGreaterThan(app.indexOf(fence));
  });

  test('the bracket section exists in TournamentTab.tsx above the Tier Header', () => {
    const tab = readFileSync(join(SRC_DIR, 'components/hub/TournamentTab.tsx'), 'utf8');
    expect(tab).toContain('data-tournament-bracket');
    expect(tab.indexOf('data-tournament-bracket')).toBeLessThan(tab.indexOf('TIER HEADER'));
    // The existing surfaces are still there, in place.
    expect(tab).toContain('<PrimusPalusBoard profile={profile} />');
    expect(tab).toContain('Tournament Division');
    expect(tab).toContain('data-feature-bout');
  });
});
