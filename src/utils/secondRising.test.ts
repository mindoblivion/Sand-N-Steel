/**
 * ===========================================================================
 * TIER-8 — Scaevola the Twice-Slain: the Second Rising.
 * The slice's pins, one section per brief requirement. The decision lives in
 * the pure helpers (`secondRising.ts`, `bossPhases.ts`); the wiring pins (§X)
 * read the rise branch and the refs out of `DuelScene`, so a disconnect
 * between the helper and the shipped code fails here rather than in a
 * playtest.
 *
 *   §1  the fence           (only the registered row owns the ladder)
 *   §2  the row             (gate, purse, card line, stats, venue)
 *   §3  the rise            (first fatal blow rises, second kills)
 *   §4  Phase 2             (risen → the ladder's 1.00 / 0.55, composed to the
 *                            system's 0.95 ceiling — see the test's own note)
 *   §5  nothing else moves  (numbers, bosses, the frozen chooser, the rival)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/secondRising.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS, LADDER_OPPONENTS } from '../data/opponents';
import {
  BOSS_PHASE_THRESHOLD,
  BOSS_PHASES,
  bossPhaseAt,
  bossPhaseLadderFor,
  bossPhaseProfileFor,
  bossSecondRisingProfileFor,
} from '../data/bossPhases';
import { isLadderBoss } from '../data/opponents';
import {
  SECOND_RISING_BANNER_TEXT,
  SECOND_RISING_TRAUMA,
  bossPresentationMoments,
  bossPresentsMoment,
} from './bossPresentation';
import { authoredPresentationState, bossSceneDeltas } from '../data/bossPresentationStates';
import { featureBoutGateText, featureBoutStatuses, resolveFeatureBout } from './featureBouts';
import { resolveVictoryTier } from './tierAdvancement';
import { nextBossKills } from './bossKills';
import { deriveRank } from './rank';
import { createNewProfile } from '../services/storage';
import type { OpponentConfig, PlayerProfile } from '../types/game';
import { secondRisingHealth, shouldSecondRise, type SecondRisingInput } from './secondRising';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const byId = (id: string) => ALL_OPPONENTS.find((opponent) => opponent.id === id)!;
const SCAEVOLA = byId('opp_scaevola_boss');

/** A fresh save in the shape `services/storage` writes (no write, no clock). */
function base(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Tester'), ...overrides };
}

/** A fatal blow against Scaevola, as the duel computes it. */
const fatal = (overrides: Partial<SecondRisingInput> = {}): SecondRisingInput => ({
  bossMechanic: 'second_rising',
  isBoss: true,
  isActorPlayer: true,
  risen: false,
  fightEnded: true,
  ...overrides,
});

// ── §1 — THE FENCE ───────────────────────────────────────────────────────────

describe('§1 — the fence: only the registered row owns the ladder', () => {
  test('Scaevola owns a ladder, and it is his own', () => {
    const ladder = bossPhaseLadderFor(SCAEVOLA);
    expect(ladder).not.toBeNull();
    expect(ladder!.bossId).toBe('opp_scaevola_boss');
    expect(ladder!.bossName).toBe('Scaevola');
    expect(ladder!.mechanic).toBe('second_rising');
    expect(ladder!.phases.length).toBe(2);
    expect(ladder!.phases[0].phase).toBe(1);
    expect(ladder!.phases[0].atOrBelow).toBe(1);
    expect(ladder!.phases[1].phase).toBe(2);
    expect(ladder!.phases[1].atOrBelow).toBe(BOSS_PHASE_THRESHOLD);
  });

  test('a grudge copy keeps the mechanic string but not the row’s identity', () => {
    expect(bossPhaseLadderFor({ ...SCAEVOLA, id: 'grudge_scaevola' })).toBeNull();
  });

  test('a regular row forced to carry the mechanic is still not a boss', () => {
    expect(
      bossPhaseLadderFor({ ...byId('opp_marcus'), bossMechanic: 'second_rising' }),
    ).toBeNull();
    expect(shouldSecondRise(fatal({ isBoss: false }))).toBe(false);
  });

  test('a feature bout’s mechanic still has no ladder', () => {
    const marcellin = byId('opp_marcellin_boss');
    expect(marcellin.isBoss).toBe(true);
    expect(bossPhaseLadderFor(marcellin)).toBeNull();
  });

  test('the row fence, both ways: no boss row carries a regular behavior', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) {
        expect(opponent.regularBehavior, opponent.id).toBeUndefined();
      } else {
        expect(opponent.bossMechanic, opponent.id).toBeUndefined();
      }
    }
    expect(SCAEVOLA.regularBehavior).toBeUndefined();
  });
});

// ── §2 — THE ROW ─────────────────────────────────────────────────────────────

describe('§2 — the row: Hermas’s slot, the bracket’s purse, the card’s warning', () => {
  test('the row is a feature bout outside the ladder', () => {
    expect(SCAEVOLA.name).toBe('Scaevola the Twice-Slain');
    expect(SCAEVOLA.tier).toBe(4);
    expect(SCAEVOLA.fightIndex).toBe(0);
    expect(SCAEVOLA.isBoss).toBe(true);
    expect(SCAEVOLA.featureBout).toBe(true);
    expect(SCAEVOLA.difficulty).toBe('champion');
    expect(SCAEVOLA.weaponType).toBe('sword_shield');
    expect(SCAEVOLA.personality).toBe('Defensive');
    expect(SCAEVOLA.armatura).toBe('provocator');
    expect(SCAEVOLA.recommendedLevel).toBe(12);
    expect(SCAEVOLA.bossMechanic).toBe('second_rising');
    expect(SCAEVOLA.characterModel).toBe('roman_warrior');
    expect(isLadderBoss(SCAEVOLA)).toBe(false);
  });

  test('the gate is Hermas’s own: Legend rank and Aurelius defeated', () => {
    expect(SCAEVOLA.gate).toEqual({ rank: 'Legend', bossDefeatedId: 'opp_aurelius_boss' });
    expect(featureBoutGateText(SCAEVOLA)).toBe(
      'Requires: Legend rank — 1500 fame and Tier 4 reached — and Aurelius defeated.',
    );
  });

  test('the purse is the bracket doc’s published Tier 8 row', () => {
    expect(SCAEVOLA.rewardGold).toBe(3000);
    expect(SCAEVOLA.rewardFame).toBe(350);
    expect(SCAEVOLA.rewardXp).toBe(1200);
  });

  test('the card line tells the player the rule before the fight', () => {
    expect(SCAEVOLA.cardLine).toContain('twice');
    expect(SCAEVOLA.cardLine).toBe(
      'He has never been counted out. Strike him down twice — and be ready when the sand gives him back.',
    );
  });

  test('the stats are one step above Aurelius, on the brief’s own table', () => {
    expect({ ...SCAEVOLA.stats }).toEqual({
      strength: 36,
      agility: 22,
      staminaMax: 210,
      staminaRegen: 32,
      defense: 18,
      healthMax: 520,
    });
    expect(SCAEVOLA.aggression).toBe(0.95);
    expect(SCAEVOLA.blockChance).toBe(0.6);
    expect(SCAEVOLA.dodgeChance).toBe(0.5);
  });

  test('the state is the new name, data only — no dressing lands in this slice', () => {
    expect(SCAEVOLA.presentationState).toBe('eclipse');
    expect(authoredPresentationState(SCAEVOLA)).toBe('eclipse');
    expect(bossSceneDeltas(SCAEVOLA)).toBeNull();
  });

  test('the gate stays shut until Legend and Aurelius, then opens', () => {
    const fresh = featureBoutStatuses(base());
    expect(fresh).toHaveLength(6);
    const freshScaevola = fresh.find((status) => status.opponent.id === 'opp_scaevola_boss')!;
    expect(freshScaevola.open).toBe(false);
    expect(freshScaevola.unmet).toContain('rank');
    expect(freshScaevola.unmet).toContain('boss');
    const legend = resolveFeatureBout(
      SCAEVOLA,
      base({
        fame: 1600,
        currentTier: 4,
        bossKills: 4,
        defeatedOpponentIds: [
          'opp_goliath_boss',
          'opp_ignis_boss',
          'opp_valeria_boss',
          'opp_aurelius_boss',
        ],
      }),
    );
    expect(legend.open).toBe(true);
    expect(legend.unmet).toEqual([]);
  });

  test('beating him moves no tier, adds no stripe, derives no Legend', () => {
    expect(
      resolveVictoryTier({
        currentTier: 4,
        opponent: SCAEVOLA,
        defeatedOpponentIds: [],
      }),
    ).toEqual({ currentTier: 4, firstDefeat: false, advanced: false });
    expect(
      nextBossKills(
        { bossKills: 2, defeatedOpponentIds: [] },
        { bossKills: 2, defeatedOpponentIds: ['opp_scaevola_boss'] },
        SCAEVOLA,
      ),
    ).toBe(2);
    // Fame and a Scaevola fall are not Legend: the rank needs a tier-4 LADDER
    // boss felled, and a feature bout is not that champion.
    expect(
      deriveRank(
        base({
          fame: 1600,
          currentTier: 4,
          bossKills: 0,
          defeatedOpponentIds: ['opp_scaevola_boss'],
        }),
      ),
    ).toBe('Champion');
  });
});

// ── §3 — THE RISE ────────────────────────────────────────────────────────────

describe('§3 — the rise: the first fatal blow rises, the second kills', () => {
  test('the predicate fires only when every condition holds', () => {
    expect(shouldSecondRise(fatal())).toBe(true);
    expect(shouldSecondRise(fatal({ bossMechanic: 'rage_mode_colossus' }))).toBe(false);
    expect(shouldSecondRise(fatal({ bossMechanic: undefined }))).toBe(false);
    expect(shouldSecondRise(fatal({ isBoss: false }))).toBe(false);
    expect(shouldSecondRise(fatal({ isActorPlayer: false }))).toBe(false);
    expect(shouldSecondRise(fatal({ risen: true }))).toBe(false);
    expect(shouldSecondRise(fatal({ fightEnded: false }))).toBe(false);
  });

  test('the rise lands exactly on the phase line', () => {
    expect(BOSS_PHASE_THRESHOLD).toBe(0.5);
    expect(secondRisingHealth(520)).toBe(260);
    expect(secondRisingHealth(100)).toBe(50);
    expect(secondRisingHealth(0)).toBe(0);
    expect(secondRisingHealth(Number.NaN)).toBe(0);
  });

  test('the banner words and the shake are the module’s own constants', () => {
    expect(SECOND_RISING_BANNER_TEXT).toBe('HE RISES');
    expect(SECOND_RISING_TRAUMA).toBe(0.5);
  });
});

// ── §4 — PHASE 2 ────────────────────────────────────────────────────────────

describe('§4 — Phase 2 is the risen state, and never HP alone', () => {
  test('the ladder’s Phase 1 is the row, Phase 2 the authored 0.05 steps', () => {
    expect(BOSS_PHASES.second_rising.phases[0].params).toEqual({
      aggression: 0.95,
      blockChance: 0.6,
    });
    expect(BOSS_PHASES.second_rising.phases[0].authored).toBe(false);
    expect(BOSS_PHASES.second_rising.phases[1].params).toEqual({
      aggression: 1,
      blockChance: 0.55,
    });
    expect(BOSS_PHASES.second_rising.phases[1].authored).toBe(true);
    expect(BOSS_PHASES.second_rising.whyYouFell).toEqual({
      owner: 'His',
      mechanic: 'second rising',
    });
  });

  test('unrisen he chooses with the row — even below the phase line', () => {
    expect(bossSecondRisingProfileFor(SCAEVOLA, false, 'sand')).toBeNull();
    // At 40 % HP the phase LOOKUP reads 2, but the profile must not follow
    // it: only the rise flips the row.
    expect(bossPhaseAt(SCAEVOLA, 208, 520)).toBe(2);
    expect(bossSecondRisingProfileFor(SCAEVOLA, false, 'sand')).toBeNull();
    // Ignis’s helper never answers for him, risen or not.
    expect(bossPhaseProfileFor(SCAEVOLA, 208, 520, 'sand')).toBeNull();
    expect(bossPhaseProfileFor(SCAEVOLA, 520, 520, 'sand')).toBeNull();
  });

  test('risen he chooses with 0.95 / 0.55 on Sand — the ladder says 1.00, the system caps it', () => {
    // The ladder's Phase-2 row IS 1.00 / 0.55 (pinned above, the brief's own
    // table) — but the profile system caps every composed value at 0.95
    // (`BOUT_PROFILE_CLAMP`), so the risen aggression composes to the
    // ceiling and the live change is the blockChance step (0.60 → 0.55).
    // The rise itself — a second health bar at full stamina — is the real
    // Phase 2; the aggression step is inert by the system's own ceiling, and
    // delivering a literal 1.00 would need a chooser-level bypass the brief
    // forbids (`combatCalculations.ts` is frozen). Pinned as the composed
    // value, not the ladder value, so a future ceiling change fails loudly.
    expect(bossSecondRisingProfileFor(SCAEVOLA, true, 'sand')).toEqual({
      aggression: 0.95,
      blockChance: 0.55,
    });
  });

  test('on Steel the mode’s own clamp caps the aggression at 0.95', () => {
    expect(bossSecondRisingProfileFor(SCAEVOLA, true, 'steel')).toEqual({
      aggression: 0.95,
      blockChance: 0.6,
    });
  });

  test('bossPhaseAt is NOT the risen signal: a killing blow still reads phase 1', () => {
    expect(bossPhaseAt(SCAEVOLA, 0, 520)).toBe(1);
    expect(bossPhaseAt(SCAEVOLA, Number.NaN, 520)).toBe(1);
  });
});

// ── §5 — NOTHING ELSE MOVES ─────────────────────────────────────────────────

describe('§5 — no save change, no boss row changed, the rival untouched', () => {
  test('Aurelius’s row, numbers and ladder are byte-identical', () => {
    const aurelius = byId('opp_aurelius_boss');
    expect({ ...aurelius.stats }).toEqual({
      strength: 34,
      agility: 20,
      staminaMax: 200,
      staminaRegen: 30,
      defense: 20,
      healthMax: 480,
    });
    expect(aurelius.aggression).toBe(0.95);
    expect(aurelius.blockChance).toBe(0.7);
    expect(aurelius.bossMechanic).toBe('rage_mode_colossus');
    expect(BOSS_PHASES.rage_mode_colossus.phases[1].params).toEqual({
      rageChargeThreshold: 0.5,
    });
  });

  test('the frozen chooser knows nothing of the rising', () => {
    expect(code('src/utils/combatCalculations.ts')).not.toContain('second_rising');
    expect(code('src/utils/combatCalculations.ts')).not.toContain('secondRising');
    expect(code('src/utils/combatCalculations.ts')).not.toContain('risen');
  });

  test('no save field is added: the risen state is a ref, never a profile field', () => {
    expect(source('src/types/game.ts')).not.toContain('risen');
    expect(source('src/types/game.ts')).not.toContain('secondRising');
  });

  test('the rival is untouched: no file in this slice names him or his class', () => {
    // The forbidden words are the rival's name, his system and his class.
    // `secutor` is a pre-existing member of the armatura union in game.ts
    // (line 1067, untouched by this slice), so the game.ts check covers the
    // other three words and the Scaevola row covers all four.
    for (const path of [
      'src/data/bossPhases.ts',
      'src/utils/bossPresentation.ts',
      'src/utils/secondRising.ts',
      'src/components/duel/DuelScene.tsx',
      'src/data/opponents.ts',
    ]) {
      const body = source(path);
      expect(body, path).not.toContain('Kaeso');
      expect(body, path).not.toContain('Falco');
      expect(body, path).not.toContain('Aemulus');
    }
    expect(source('src/types/game.ts')).not.toContain('Kaeso');
    expect(source('src/types/game.ts')).not.toContain('Falco');
    expect(source('src/types/game.ts')).not.toContain('Aemulus');
    expect(source('src/data/opponents.ts')).not.toContain('secutor');
    const row = source('src/data/opponents.ts').split("id: 'opp_scaevola_boss'")[1].split('STORY-4b')[0];
    expect(row).not.toContain('Kaeso');
    expect(row).not.toContain('Falco');
    expect(row).not.toContain('Aemulus');
    expect(row).not.toContain('secutor');
  });

  test('the ladder still has exactly twelve rungs and one summit', () => {
    expect(LADDER_OPPONENTS.length).toBe(12);
    expect(FEATURE_BOUT_OPPONENTS.length).toBe(6);
    expect(ALL_OPPONENTS.length).toBe(24);
  });
});

// ── §X — THE WIRING ──────────────────────────────────────────────────────────

describe('§X — the rise is wired where the brief puts it', () => {
  const duel = code('src/components/duel/DuelScene.tsx');

  test('the rise branch exists exactly once, after the twin blades and before the timer', () => {
    expect(duel.split('shouldSecondRise({').length - 1).toBe(1);
    const riseAt = duel.indexOf('shouldSecondRise({');
    // After the Twin Fangs bonus — the last damage source of the dispatch —
    // so a fatal bonus blade rises exactly like a fatal main blow.
    expect(riseAt).toBeGreaterThan(duel.indexOf('second blade whistles past'));
    // …and before section 4's turn-resolution timer: the rise is dispatched
    // in the SAME synchronous call as the killing blow's HP write, so the
    // victory effect — which reads `opp.health` after this commit — can only
    // ever see the risen 50 %, never the 0.
    expect(riseAt).toBeLessThan(duel.indexOf('turnResolutionTimerRef.current = setTimeout'));
  });

  test('the rise writes the risen HP, a full stamina bar and Phase 2', () => {
    // The rise block runs from the predicate call to the miss branch: the
    // `blockAfter` helper cannot delimit it (the call's own object literal
    // opens the first `{`), so the slice is taken directly.
    const riseAt = duel.indexOf('shouldSecondRise({');
    const block = duel.slice(riseAt, duel.indexOf("'MISSED!'", riseAt));
    expect(block).toContain('risenRef.current = true;');
    expect(block).toContain('health: secondRisingHealth(prev.stats.healthMax),');
    expect(block).toContain('stamina: prev.stats.staminaMax,');
    expect(block).toContain('isPhase2: true,');
    // The rise IS the phase change: it latches the announce so the phase
    // effect cannot ALSO announce Phase II for the same crossing.
    expect(block).toContain('phaseAnnouncedRef.current = true;');
    // The signature mechanic landed.
    expect(block).toContain('mechanicLandingsRef.current += 1;');
  });

  test('the rise announces itself under the module’s banner words, once', () => {
    expect(duel).toContain('SECOND_RISING_BANNER_TEXT');
    expect(duel.split('SECOND_RISING_BANNER_TEXT').length - 1).toBe(3);
    // The literal lives in exactly one place — the constant — never as a
    // second literal in the scene.
    expect(duel).not.toContain("'HE RISES'");
    expect(source('src/utils/bossPresentation.ts').split("'HE RISES'").length - 1).toBe(1);
    const riseAt = duel.indexOf('shouldSecondRise({');
    const block = duel.slice(riseAt, duel.indexOf("'MISSED!'", riseAt));
    expect(block).toContain('spawnDamageText(SECOND_RISING_BANNER_TEXT,');
    // CF-6 — the moment gate opens the shake, the swell and the vignette.
    expect(block).toContain("if (bossPresentsMoment(opponent, 'second_rising'))");
    expect(block).toContain('SECOND_RISING_TRAUMA');
    expect(block).toContain('sounds.playCrowdSwell();');
    expect(block).toContain('setBossVignettePulse(Date.now());');
  });

  test('the risen ref resets with the other refs — and only there', () => {
    expect(duel.split('risenRef.current = false').length - 1).toBe(3);
    expect(duel.split('risenRef.current = true').length - 1).toBe(1);
  });

  test('the phase effect never announces Phase II for an unrisen Scaevola', () => {
    expect(duel).toContain("if (opponent.bossMechanic === 'second_rising' && !risenRef.current) return;");
  });

  test('the AI chooses with the risen row only once risen', () => {
    expect(duel).toContain('bossSecondRisingProfileFor(opponent, risenRef.current, boutMode)');
  });

  test('Scaevola owns the fifth presentation moment', () => {
    expect(bossPresentationMoments(SCAEVOLA)).toEqual(['secondRising']);
    expect(bossPresentsMoment(SCAEVOLA, 'second_rising')).toBe(true);
    expect(bossPresentsMoment(SCAEVOLA, 'rage_mode_colossus')).toBe(false);
  });
});
