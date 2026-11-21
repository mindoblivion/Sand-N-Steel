/**
 * Phase 2 — Core Gladiator Gameplay Loop regression suite.
 *
 * Covers:
 *   • Multi-level XP progression (`resolveXpProgression`) and malformed input guards.
 *   • Post-bout career milestone visibility (`DuelResultModal`: Level Up, Tier Unlock,
 *     Rank Promotion, unspent stat points CTA, defeat recovery guidance, mercy gating).
 *   • Mobile viewport scroll containment (`max-h-[90dvh]`, `overflow-y-auto`).
 *   • Hub header rank/tier clarity & Stats tab attention cues (`GladiatorSchoolHub`).
 *   • Save & reload persistence across the career loop (`createNewProfile`, `saveProfile`,
 *     `loadSavedProfile`, `resolveVictoryTier`, `resolveInjuryAfterDuel`).
 *   • Google Play anti-gambling compliance (no wagering/betting/chance-loot mechanics).
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';
import {
  DEFAULT_XP_TO_NEXT_LEVEL,
  MAX_LEVEL_STEPS_PER_BOUT,
  STAT_POINTS_PER_LEVEL,
  resolveXpProgression,
  type DuelProgressionSummary,
} from './levelProgression';
import { resolveVictoryTier } from './tierAdvancement';
import { resolveInjuryAfterDuel } from './injury';
import { deriveRank } from './rank';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { PreFightModal } from '../components/hub/PreFightModal';
import { GladiatorSchoolHub } from '../components/hub/GladiatorSchoolHub';
import { WithdrawConfirmModal } from '../components/duel/WithdrawConfirmModal';

const loadSource = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const makeStore = (seed: Record<string, string> = {}) => {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
};

const withStore = <T,>(fn: () => T): T => {
  const store = makeStore();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};

const BASE_STATS: DuelStatistics = {
  damageDealt: 120,
  damageTaken: 45,
  hitsLanded: 9,
  maxCombo: 4,
  perfectBlocks: 2,
  dodgesPerformed: 3,
  crowdHypePeak: 68,
  durationSeconds: 38,
  goldEarned: 120,
  fameEarned: 35,
  xpEarned: 180,
  lowestStaminaFraction: 0.35,
  lowestHealthFraction: 0.55,
};

function makeProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Cassian',
    title: 'The Sandborn Rebel',
    rank: 'Rookie',
    appearance: {
      skinColor: '#c68b59',
      hairColor: '#3e2723',
      tunicColor: '#854d0e',
      crestColor: '#dc2626',
      clothingStyle: 'roman_tunic',
      characterModel: 'roman_warrior',
    },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: {} as PlayerProfile['equipped'],
    inventory: [],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

const goliath = (): OpponentConfig =>
  ALL_OPPONENTS.find((o) => o.id === 'opp_goliath_boss')!;

const cassius = (): OpponentConfig =>
  ALL_OPPONENTS.find((o) => o.id === 'opp_hoplite')!;

describe('Phase 2 §A — multi-level XP progression', () => {
  test('does not level up when XP stays below threshold', () => {
    const input = {
      level: 1,
      xp: 20,
      xpToNextLevel: 100,
      unspentStatPoints: 1,
      xpEarned: 40,
    };
    const res = resolveXpProgression(input);
    expect(res).toEqual({
      levelBefore: 1,
      levelAfter: 1,
      levelsGained: 0,
      statPointsGained: 0,
      xp: 60,
      xpToNextLevel: 100,
      unspentStatPoints: 1,
    });
  });

  test('crosses a single XP threshold cleanly', () => {
    const res = resolveXpProgression({
      level: 1,
      xp: 80,
      xpToNextLevel: 100,
      unspentStatPoints: 0,
      xpEarned: 40,
    });
    expect(res).toEqual({
      levelBefore: 1,
      levelAfter: 2,
      levelsGained: 1,
      statPointsGained: STAT_POINTS_PER_LEVEL,
      xp: 120,
      xpToNextLevel: 150,
      unspentStatPoints: 2,
    });
  });

  test('crosses multiple XP thresholds in one bout and awards 2 stat points per level', () => {
    // 80 + 180 = 260 >= 100 (lvl 2, next 150) >= 150 (lvl 3, next 225) >= 225 (lvl 4, next 338)
    const res = resolveXpProgression({
      level: 1,
      xp: 80,
      xpToNextLevel: 100,
      unspentStatPoints: 1,
      xpEarned: 180,
    });
    expect(res.levelBefore).toBe(1);
    expect(res.levelAfter).toBe(4);
    expect(res.levelsGained).toBe(3);
    expect(res.statPointsGained).toBe(6);
    expect(res.xp).toBe(260);
    expect(res.xpToNextLevel).toBe(338);
    expect(res.unspentStatPoints).toBe(7);
  });

  test('guards against malformed thresholds, negative XP, and runaway iteration', () => {
    const malformed = resolveXpProgression({
      level: 0,
      xp: -10,
      xpToNextLevel: 0,
      unspentStatPoints: -3,
      xpEarned: Number.NaN,
    });
    expect(malformed.levelBefore).toBe(1);
    expect(malformed.levelAfter).toBe(1);
    expect(malformed.xp).toBe(0);
    expect(malformed.xpToNextLevel).toBe(DEFAULT_XP_TO_NEXT_LEVEL);
    expect(malformed.unspentStatPoints).toBe(0);

    const huge = resolveXpProgression({
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      unspentStatPoints: 0,
      xpEarned: 10_000_000_000,
    });
    expect(huge.levelsGained).toBe(MAX_LEVEL_STEPS_PER_BOUT);
    expect(huge.levelAfter).toBe(1 + MAX_LEVEL_STEPS_PER_BOUT);
    expect(huge.statPointsGained).toBe(MAX_LEVEL_STEPS_PER_BOUT * STAT_POINTS_PER_LEVEL);
  });
});

describe('Phase 2 §B — DuelResultModal progression, recovery, gating, and scroll safety', () => {
  const fullProgression: DuelProgressionSummary = {
    levelBefore: 2,
    levelAfter: 4,
    levelsGained: 2,
    statPointsGained: 4,
    unspentStatPointsAfter: 4,
    tierUnlocked: true,
    newTier: 2,
    rankBefore: 'Rookie',
    rankAfter: 'Veteran',
    rankPromoted: true,
  };

  test('victory renders level up, tier unlock, rank promotion, and spend-points Ludus CTA', () => {
    const html = renderToStaticMarkup(
      <DuelResultModal
        didWin
        opponent={goliath()}
        stats={BASE_STATS}
        profile={makeProfile({ level: 4, unspentStatPoints: 4, currentTier: 2, fame: 180 })}
        progression={fullProgression}
        onContinueToHub={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(html).toContain('data-duel-progression="1"');
    expect(html).toContain('data-duel-level-up="4"');
    expect(html).toContain('Level 2 to Level 4 (+4 stat points · 4 unspent)');
    expect(html).toContain('data-duel-tier-unlocked="2"');
    expect(html).toContain('Tier 2 Unlocked');
    expect(html).toContain('data-duel-rank-promoted="Veteran"');
    expect(html).toContain('Rookie to Veteran');
    expect(html).toContain('data-duel-continue-hub="stats"');
    expect(html).toContain('Spend Stat Points (4)');
    expect(html).toContain('Return to Metropolis [Town Gate]');
  });

  test('unanswered mercy still hides both Return to Metropolis and Ludus continuation CTAs', () => {
    const html = renderToStaticMarkup(
      <DuelResultModal
        didWin
        opponent={cassius()}
        stats={BASE_STATS}
        progression={fullProgression}
        mercy={{ rivalId: cassius().id, rivalName: cassius().name, teaching: true }}
        onMercyChoice={() => {}}
        onContinueToHub={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(html).not.toContain('Return to Metropolis');
    expect(html).not.toContain('data-duel-continue-hub');
  });

  test('answered mercy restores Return to Metropolis and Ludus continuation CTA', () => {
    const html = renderToStaticMarkup(
      <DuelResultModal
        didWin
        opponent={cassius()}
        stats={BASE_STATS}
        progression={{ ...fullProgression, unspentStatPointsAfter: 0, levelsGained: 0, tierUnlocked: false }}
        mercy={{ rivalId: cassius().id, rivalName: cassius().name, teaching: false, chosen: 'spare' }}
        onMercyChoice={() => {}}
        onContinueToHub={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(html).toContain('Return to Metropolis');
    expect(html).toContain('data-duel-continue-hub="tournament"');
    expect(html).toContain('Next Bout');
  });

  test('defeat surfaces recovery guidance without leaking stale injury-event strings', () => {
    const html = renderToStaticMarkup(
      <DuelResultModal
        didWin={false}
        opponent={goliath()}
        stats={{ ...BASE_STATS, goldEarned: 0, fameEarned: 0, xpEarned: 0 }}
        injuryEvent={{
          kind: 'inflicted',
          injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 },
        }}
        injury={{ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 }}
        onContinueToHub={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(html).toContain('data-duel-next-steps="defeat"');
    expect(html).toContain('Recovery path:');
    expect(html).toContain('Medical House or Caravanserai Inn');
    expect(html).toContain('data-duel-continue-hub="stats"');
    expect(html).toContain('Recover &amp; Prepare');
    expect(html).not.toContain('Injury healed.');
  });

  test('modals enforce mobile-safe max-h-[90dvh] and overflow-y-auto', () => {
    const resultHtml = renderToStaticMarkup(
      <DuelResultModal
        didWin
        opponent={goliath()}
        stats={BASE_STATS}
        onContinue={() => {}}
      />,
    );
    const preFightHtml = renderToStaticMarkup(
      <PreFightModal opponent={goliath()} onConfirm={() => {}} onCancel={() => {}} />,
    );
    const withdrawHtml = renderToStaticMarkup(
      <WithdrawConfirmModal onStay={() => {}} onConfirm={() => {}} />,
    );
    for (const html of [resultHtml, preFightHtml, withdrawHtml]) {
      expect(html).toContain('max-h-[90dvh]');
      expect(html).toContain('overflow-y-auto');
    }
  });
});

describe('Phase 2 §C — GladiatorSchoolHub career & attention cues', () => {
  test('header shows derived rank and tier; Stats tab surfaces unspent points and injury cues', () => {
    const p = makeProfile({
      level: 4,
      gold: 350,
      fame: 180,
      currentTier: 2,
      unspentStatPoints: 4,
      injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 },
    });
    const html = renderToStaticMarkup(
      <GladiatorSchoolHub
        playerProfile={p}
        activeTab="tournament"
        onTabChange={() => {}}
        libraryPage="road"
        onLibraryPageChange={() => {}}
        onUpdateProfile={() => {}}
        onEnterCity3D={() => {}}
        onSelectOpponent={() => {}}
        onTrainStat={() => {}}
        onBuyItem={() => {}}
        onEquipWeapon={() => {}}
        onEquipArmor={() => {}}
        onAllocateStatPoint={() => {}}
        onOpenDriveSync={() => {}}
        onToggleMute={() => {}}
        isMuted={false}
        onResetGame={() => {}}
      />,
    );
    expect(html).toContain('Veteran');
    expect(html).toContain('Tier 2');
    expect(html).toContain('data-tab-stat-points="4"');
    expect(html).toContain('data-tab-injured="1"');
  });

  test('Stats tab omits unspent and injury cues when 0 points and healthy', () => {
    const html = renderToStaticMarkup(
      <GladiatorSchoolHub
        playerProfile={makeProfile()}
        activeTab="tournament"
        onTabChange={() => {}}
        libraryPage="road"
        onLibraryPageChange={() => {}}
        onUpdateProfile={() => {}}
        onEnterCity3D={() => {}}
        onSelectOpponent={() => {}}
        onTrainStat={() => {}}
        onBuyItem={() => {}}
        onEquipWeapon={() => {}}
        onEquipArmor={() => {}}
        onAllocateStatPoint={() => {}}
        onOpenDriveSync={() => {}}
        onToggleMute={() => {}}
        isMuted={false}
        onResetGame={() => {}}
      />,
    );
    expect(html).not.toContain('data-tab-stat-points');
    expect(html).not.toContain('data-tab-injured');
  });
});

describe('Phase 2 §D — End-to-end career save & reload roundtrip', () => {
  test('creation -> loss injury -> boss victory -> multi-level XP -> tier unlock survives save and reload', () => {
    withStore(() => {
      const created = createNewProfile('Valerius', 'roman_warrior', 'murmillo');
      saveProfile(created);
      const reloadedStart = loadSavedProfile();
      expect(reloadedStart?.name).toBe('Valerius');
      expect(reloadedStart?.level).toBe(1);
      expect(reloadedStart?.currentTier).toBe(1);

      // Defeat inflicts injury
      const loss = resolveInjuryAfterDuel(reloadedStart!, false);
      expect(loss.event?.kind).toBe('inflicted');
      const afterLoss: PlayerProfile = { ...loss.profile, fightsLost: 1 };
      saveProfile(afterLoss);

      // Defeat Tier 1 boss (Goliath) with enough XP to jump multiple levels
      const loadedBeforeWin = loadSavedProfile()!;
      expect(loadedBeforeWin.injury?.fightsRemaining).toBe(2);

      const healStep = resolveInjuryAfterDuel(loadedBeforeWin, true);
      expect(healStep.profile.injury?.fightsRemaining).toBe(1);

      const xpRes = resolveXpProgression({
        level: loadedBeforeWin.level,
        xp: loadedBeforeWin.xp,
        xpToNextLevel: loadedBeforeWin.xpToNextLevel,
        unspentStatPoints: loadedBeforeWin.unspentStatPoints,
        xpEarned: 180,
      });
      const tierRes = resolveVictoryTier({
        currentTier: loadedBeforeWin.currentTier,
        opponent: goliath(),
        defeatedOpponentIds: loadedBeforeWin.defeatedOpponentIds,
      });
      expect(tierRes.advanced).toBe(true);
      expect(tierRes.currentTier).toBe(2);

      const afterWin: PlayerProfile = {
        ...healStep.profile,
        xp: xpRes.xp,
        level: xpRes.levelAfter,
        xpToNextLevel: xpRes.xpToNextLevel,
        unspentStatPoints: xpRes.unspentStatPoints,
        currentTier: tierRes.currentTier,
        defeatedOpponentIds: [goliath().id],
        bossKills: 1,
        gold: loadedBeforeWin.gold + 120,
        fame: loadedBeforeWin.fame + 160,
        fightsWon: 1,
      };
      saveProfile(afterWin);

      const finalLoaded = loadSavedProfile()!;
      expect(finalLoaded.level).toBe(3);
      expect(finalLoaded.xp).toBe(180);
      expect(finalLoaded.xpToNextLevel).toBe(225);
      expect(finalLoaded.unspentStatPoints).toBe(created.unspentStatPoints + 4);
      expect(finalLoaded.currentTier).toBe(2);
      expect(finalLoaded.defeatedOpponentIds).toContain('opp_goliath_boss');
      expect(finalLoaded.injury?.fightsRemaining).toBe(1);
      expect(deriveRank(finalLoaded)).toBe('Veteran');
    });
  });
});

describe('Phase 2 §E — Google Play anti-gambling compliance', () => {
  test('Phase 2 modules contain no betting, wagering, or gambling mechanics', () => {
    const sources = [
      loadSource('./levelProgression.ts'),
      loadSource('../components/hub/DuelResultModal.tsx'),
      loadSource('../components/hub/GladiatorSchoolHub.tsx'),
      loadSource('../components/hub/StatsTab.tsx'),
    ];
    for (const src of sources) {
      expect(src.toLowerCase()).not.toMatch(/\b(wager|gamble|gambling|betting|lootbox|odds)\b/);
    }
  });
});
