/**
 * ===========================================================================
 * D-1 — FEATURE BOUTS: the honesty suite
 * ===========================================================================
 * The slice's own pins, one section per claim boss-rosters.md Part A makes and
 * the Director addendum restates:
 *
 *   §A the roster APPEND — every pre-existing row is byte-identical to the tree
 *      it was appended to (a deep-equal against a generated fixture);
 *   §B the five new mechanics are inert DATA on feature bosses and nowhere else,
 *      and no regular row carries a `bossMechanic` or a boss-only palm;
 *   §C the palms — five carried (boss-only, empty blocks) and five drops (block
 *      data only), the drops resolve through `resolvePalmae`, the carried five
 *      never do, and no boss-only row is in the AI safe subset;
 *   §D the drop deed — a feature boss's first defeat drops its palm, and a
 *      rematch drops nothing twice;
 *   §E the gates — open/close across synthetic profiles (rank short by fame,
 *      rank met but the boss undefeated, all met), plus Gnaeus's tier-only gate;
 *   §F the result flow — beating a feature bout moves NO tier and NO kill, and
 *      never satisfies another bout's boss gate;
 *   §G the surfaces — the tournament tab lists all five with truthful gate text,
 *      the pre-fight card prints the row's card line verbatim, and no gate,
 *      purse or card line is hard-coded in a component;
 *   §H the presentation states — the five names are data, EVERY boss stands in
 *      the standard ambient state this slice, and the AI-4 key map is deferred.
 *
 * Run with: `bun test src/utils/featureBouts.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { BossMechanic, OpponentConfig, PlayerProfile } from '../types/game';
import {
  ALL_OPPONENTS,
  FEATURE_BOUT_OPPONENTS,
  LADDER_OPPONENTS,
  isLadderBoss,
} from '../data/opponents';
import {
  BOSS_PRESENTATION_STATES,
  STANDARD_BOSS_AMBIENT_STATE,
  authoredPresentationState,
  presentationStateInForce,
} from '../data/bossPresentationStates';
import { PALMAE, PALMAE_BOSS_ONLY, PALMAE_PLAYER_POOL, getPalma } from '../data/palmae';
import { PRE_D1_OPPONENTS } from './preD1Opponents';
import {
  featureBoutGateText,
  featureBoutStatuses,
  resolveFeatureBout,
} from './featureBouts';
import { resolveDoorDuelTarget, resolveVictoryTier } from './tierAdvancement';
import { nextBossKills } from './bossKills';
import { deriveRank } from './rank';
import { evaluatePalmaEarns } from './palmaeState';
import { resolvePalmae } from './traitModifiers';
import { buildOpponentModifiers } from './combatModifiers';
import { shouldActivateRage } from './combatCalculations';
import { createNewProfile } from '../services/storage';
import { TournamentTab } from '../components/hub/TournamentTab';
import { PreFightModal } from '../components/hub/PreFightModal';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string): string => readFileSync(repoPath(relative), 'utf8');
/** Comments stripped: prose can neither satisfy nor defeat a check. */
const code = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** React's own text escaping, so a VERBATIM comparison can be made on markup. */
const escaped = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const byId = (id: string): OpponentConfig => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`roster has no ${id}`);
  return found;
};

/** Part A's five bouts, exactly as the addendum quotes them. */
const PART_A = [
  {
    id: 'opp_marcellin_boss',
    name: 'Marcellin the Beastmaster',
    tier: 2,
    mechanic: 'beast_hunt',
    gold: 260,
    fame: 60,
    gateRank: 'Veteran',
    gateBoss: 'opp_ignis_boss',
    carried: 'blood_scent',
    drop: 'hunters_patience',
    presentation: 'dawn',
    cardLine:
      'Marcellin hunts with his lion Ferrum. Every third exchange the beast crouches, then pounces — strike it while it crouches, or block the pounce. Three wounds drive it off.',
  },
  {
    id: 'opp_varro_boss',
    name: 'Varro "The Mirage"',
    tier: 3,
    mechanic: 'false_telegraph',
    gold: 520,
    fame: 165,
    gateRank: 'Champion',
    gateBoss: 'opp_valeria_boss',
    carried: 'two_faces',
    drop: 'wards_breath',
    presentation: 'high-noon',
    cardLine:
      "Varro's wind-ups lie. Watch his feet: a planted stance means the blow is real; a light foot means a feint. When in doubt, block — a feint is only a quick strike.",
  },
  {
    id: 'opp_gnaeus_boss',
    name: 'Gnaeus "The Gilded"',
    tier: 4,
    mechanic: 'unbroken_panoply',
    gold: 800,
    fame: 300,
    gateRank: 'Champion',
    // Gnaeus names NO boss: his gate is the tier condition (Part A, verbatim).
    gateBoss: null,
    gateTierReached: 4,
    carried: 'vainheart',
    drop: 'shieldbreaker',
    presentation: 'gilded',
    cardLine:
      'Gnaeus fights behind three gilt pride-pieces — crest, shield facing, pauldron — each guarding him while it shines. Power attacks crack them even through his block. Strip the gold, and the man shrinks.',
  },
  {
    id: 'opp_cotta_boss',
    name: 'Lucius & Gaius Cotta',
    tier: 2,
    mechanic: 'yoked_brothers',
    gold: 240,
    fame: 55,
    gateRank: 'Veteran',
    gateBoss: 'opp_ignis_boss',
    carried: 'survivors_oath',
    drop: 'the_open_flank',
    presentation: 'brothers',
    cardLine:
      'The Cotta brothers fight as one. Every fourth exchange they cross — one telegraphs, the other circles to your flank. Dodge the crossing. Down one, and the other swears an oath.',
  },
  {
    id: 'opp_hermas_boss',
    name: 'Hermas the Legend Returned',
    tier: 4,
    mechanic: 'the_long_memory',
    gold: 1250,
    fame: 600,
    gateRank: 'Legend',
    gateBoss: 'opp_aurelius_boss',
    carried: 'old_craft',
    drop: 'undying_name',
    presentation: 'dusk',
    cardLine:
      'Hermas took the wooden sword a generation ago. He adapts as you fight: lean on one kind of attack past three-in-five, and he sets himself against it — twice. Fight him whole, or be read.',
  },
] as const;

const FEATURE_MECHANICS: BossMechanic[] = [
  'beast_hunt',
  'false_telegraph',
  'unbroken_panoply',
  'yoked_brothers',
  'the_long_memory',
];

/** A fresh save in the shape `services/storage` writes (no write, no clock). */
function base(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Tester'), ...overrides };
}

// ════════════════════════════════════════════════════════════════════════════
// §A — the append
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §A — the append touched no pre-existing row', () => {
  test('the roster is the twelve pre-D-1 rows followed by exactly five feature bouts', () => {
    expect(PRE_D1_OPPONENTS.length).toBe(12);
    expect(ALL_OPPONENTS.length).toBe(17);
    expect(LADDER_OPPONENTS.length).toBe(12);
    expect(FEATURE_BOUT_OPPONENTS.length).toBe(5);
    // The order is the append: the first twelve ARE the old roster, in order.
    expect(ALL_OPPONENTS.slice(0, 12).map((opponent) => opponent.id)).toEqual(
      (PRE_D1_OPPONENTS as OpponentConfig[]).map((opponent) => opponent.id),
    );
    expect(ALL_OPPONENTS.slice(12).map((opponent) => opponent.id)).toEqual(
      PART_A.map((bout) => bout.id),
    );
  });

  test('every pre-existing row is byte-identical, key order included', () => {
    expect(JSON.stringify(ALL_OPPONENTS.slice(0, 12))).toBe(JSON.stringify(PRE_D1_OPPONENTS));
  });

  test('every id on the roster is unique and still resolves', () => {
    const ids = ALL_OPPONENTS.map((opponent) => opponent.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pre of PRE_D1_OPPONENTS as OpponentConfig[]) expect(byId(pre.id)).toEqual(pre);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the mechanics are inert data, on feature bosses only
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §B — the five mechanics live only on feature bosses', () => {
  test('each of the five appears exactly once, on an isBoss + featureBout row', () => {
    for (const mechanic of FEATURE_MECHANICS) {
      const carriers = ALL_OPPONENTS.filter((opponent) => opponent.bossMechanic === mechanic);
      expect(carriers.length, mechanic).toBe(1);
      expect(carriers[0].isBoss, mechanic).toBe(true);
      expect(carriers[0].featureBout, mechanic).toBe(true);
    }
  });

  test('NO ladder row carries a feature mechanic, and the four ladder mechanics survive', () => {
    for (const opponent of LADDER_OPPONENTS) {
      expect(FEATURE_MECHANICS, opponent.id).not.toContain(opponent.bossMechanic as BossMechanic);
    }
    expect(byId('opp_goliath_boss').bossMechanic).toBe('heavy_telegraph');
    expect(byId('opp_ignis_boss').bossMechanic).toBe('phase_weapon_switch');
    expect(byId('opp_valeria_boss').bossMechanic).toBe('counter_dodge');
    expect(byId('opp_aurelius_boss').bossMechanic).toBe('rage_mode_colossus');
  });

  test('no regular row carries a bossMechanic, a feature flag or a boss-only palm', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) continue;
      expect(opponent.bossMechanic, opponent.id).toBeUndefined();
      expect(opponent.featureBout, opponent.id).toBeUndefined();
      expect(opponent.gate, opponent.id).toBeUndefined();
      expect(opponent.cardLine, opponent.id).toBeUndefined();
      expect(opponent.presentationState, opponent.id).toBeUndefined();
      for (const id of opponent.palmae ?? []) {
        expect(getPalma(id)?.bossOnly, `${opponent.id}: ${id}`).toBeUndefined();
      }
    }
  });

  test('the five rows match Part A exactly: tier, mechanic, purse, gate, palms, state, line', () => {
    for (const bout of PART_A) {
      const row = byId(bout.id);
      expect(row.name, bout.id).toBe(bout.name);
      expect(row.tier, bout.id).toBe(bout.tier);
      expect(row.isBoss, bout.id).toBe(true);
      expect(row.featureBout, bout.id).toBe(true);
      expect(row.fightIndex, bout.id).toBe(0); // "no rung", like the Doctore's Test
      expect(row.bossMechanic, bout.id).toBe(bout.mechanic);
      expect(row.rewardGold, bout.id).toBe(bout.gold);
      expect(row.rewardFame, bout.id).toBe(bout.fame);
      expect(row.rewardXp, bout.id).toBeGreaterThan(0);
      expect(row.cardLine, bout.id).toBe(bout.cardLine);
      expect(row.presentationState, bout.id).toBe(bout.presentation);
      expect(row.gate?.rank, bout.id).toBe(bout.gateRank);
      expect(row.gate?.bossDefeatedId, bout.id).toBe(bout.gateBoss ?? undefined);
      expect(row.gate?.tierReached, bout.id).toBe(
        (bout as { gateTierReached?: number }).gateTierReached
      );
      expect(row.palmae, bout.id).toEqual([bout.carried]);
      // No class: Part A names none of the seven for any of the five.
      expect(row.armatura, bout.id).toBeUndefined();
      expect(row.loadout, bout.id).toBeUndefined();
      // A feature bout is a boss, not a ladder boss.
      expect(isLadderBoss(row), bout.id).toBe(false);
    }
  });

  test('a feature boss presents no presentation MOMENT (its mechanic is inert)', () => {
    // The four moments belong to the four ladder mechanics; a feature mechanic
    // owns none, which is what keeps a feature duel on the standard branches.
    const source = code('src/utils/bossPresentation.ts');
    for (const mechanic of FEATURE_MECHANICS) expect(source).not.toContain(`'${mechanic}'`);
    for (const mechanic of FEATURE_MECHANICS) {
      expect(code('src/components/duel/DuelScene.tsx')).not.toContain(`'${mechanic}'`);
    }
  });


  test('a feature boss enters the duel with the IDENTITY modifier block', () => {
    // Nothing it carries adds a passive term: every carried palm's effect block
    // is empty, so the merged block stays the identity — no combat change.
    for (const bout of FEATURE_BOUT_OPPONENTS) {
      const mods = buildOpponentModifiers(bout);
      expect(mods.block, bout.id).toEqual({});
      expect(mods.doctrina, bout.id).toEqual({});
      expect(mods.palmae.map((palma) => palma.id), bout.id).toEqual(bout.palmae);
    }
  });

  test('the duel’s rage branch ignores a feature mechanic like any other', () => {
    for (const mechanic of FEATURE_MECHANICS) {
      expect(shouldActivateRage(mechanic, 10, 100, false), mechanic).toBe(false);
    }
    // …while the ladder mechanic still fires, so the check is sensitive.
    expect(shouldActivateRage('rage_mode_colossus', 10, 100, false)).toBe(true);
  });
  test('a feature duel is the standard fight: nothing in the duel reads the flag or the gate', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).not.toContain('featureBout');
    expect(duel).not.toContain('cardLine');
    expect(duel).not.toContain('presentationState');
    // …and the centralized damage formula knows nothing about them either.
    const formula = code('src/utils/combatCalculations.ts');
    for (const token of ['featureBout', 'beast_hunt', 'the_long_memory']) {
      expect(formula).not.toContain(token);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — the palms
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §C — five carried palms and five drops', () => {
  test('the pool grew by five and the boss-only set by five', () => {
    expect(PALMAE_PLAYER_POOL).toHaveLength(17);
    expect(PALMAE_BOSS_ONLY).toHaveLength(9);
    expect(PALMAE).toHaveLength(26);
  });

  test('each carried palm is bossOnly, on exactly its own row, and an EMPTY block', () => {
    for (const bout of PART_A) {
      const palm = getPalma(bout.carried);
      expect(palm, bout.carried).toBeDefined();
      expect(palm?.bossOnly, bout.carried).toBe(true);
      expect(palm?.effect, bout.carried).toEqual({});
      expect((palm?.notes?.length ?? 0) > 0, bout.carried).toBe(true);
      // Carried by exactly one row on the whole roster — its own.
      const carriers = ALL_OPPONENTS.filter((opponent) =>
        (opponent.palmae ?? []).includes(bout.carried)
      );
      expect(carriers.map((opponent) => opponent.id), bout.carried).toEqual([bout.id]);
    }
  });

  test('each drop is a player-pool row whose sourceDetail names its boss', () => {
    for (const bout of PART_A) {
      const palm = getPalma(bout.drop);
      expect(palm, bout.drop).toBeDefined();
      expect(palm?.bossOnly, bout.drop).toBeUndefined();
      expect(palm?.source, bout.drop).toBe('boss-drop');
      expect(palm?.sourceDetail, bout.drop).toBe(bout.name.split(' ')[0]);
      expect(PALMAE_PLAYER_POOL.some((row) => row.id === bout.drop), bout.drop).toBe(true);
    }
  });

  test('every drop resolves through resolvePalmae, and no boss-only row can', () => {
    const drops = PART_A.map((bout) => bout.drop);
    const resolved = resolvePalmae({ unlocked: drops, equipped: drops.slice(0, 3) });
    expect(resolved.unlocked).toEqual(drops);
    expect(resolved.equipped).toEqual(drops.slice(0, 3));
    // The boss-only rows are NOT in the AI-safe player pool: they resolve to none.
    for (const carried of PALMAE_BOSS_ONLY) {
      expect(resolvePalmae({ unlocked: [carried.id], equipped: [carried.id] })).toEqual({
        unlocked: [],
        equipped: [],
      });
      expect(PALMAE_PLAYER_POOL.some((row) => row.id === carried.id)).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the drop deed
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §D — a first defeat drops the palm exactly once', () => {
  test('each feature boss names its own palm and no other', () => {
    for (const bout of PART_A) {
      const earned = evaluatePalmaEarns(base({ defeatedOpponentIds: [bout.id] })).map(
        (palma) => palma.id
      );
      expect(earned, bout.id).toEqual([bout.drop]);
    }
  });

  test('a rematch (the id already in the book) unlocks nothing new', () => {
    for (const bout of PART_A) {
      const rematch = evaluatePalmaEarns(
        base({ defeatedOpponentIds: [bout.id], palmae: { unlocked: [bout.drop], equipped: [] } })
      );
      expect(rematch.map((palma) => palma.id), bout.id).toEqual([]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the gates
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §E — the gates open and close truthfully', () => {
  /** A profile that satisfies ONE bout's gate, with `overrides` applied last. */
  const met = (id: string, overrides: Partial<PlayerProfile> = {}): PlayerProfile => {
    const bout = PART_A.find((entry) => entry.id === id)!;
    const threshold =
      bout.gateRank === 'Legend'
        ? { fame: 1500, tier: 4 }
        : bout.gateRank === 'Champion'
        ? { fame: 600, tier: 3 }
        : { fame: 150, tier: 2 };
    const defeated = bout.gateBoss ? [bout.gateBoss] : [];
    return base({
      fame: threshold.fame,
      currentTier: Math.max(threshold.tier, bout.tier),
      bossKills: bout.gateRank === 'Legend' ? 1 : 0,
      defeatedOpponentIds: defeated,
      ...overrides,
    });
  };

  test('the three states, for every bout: fame short, boss undefeated, all met', () => {
    for (const bout of PART_A) {
      const row = byId(bout.id);
      // 1. rank short by fame — everything else already earned.
      const full = met(bout.id);
      const shortFame = resolveFeatureBout(
        row,
        { ...full, fame: Math.max(0, (full.fame ?? 0) - 1) }
      );
      expect(shortFame.open, `${bout.id}: fame short`).toBe(false);
      expect(shortFame.unmet, `${bout.id}: fame short`).toContain('rank');

      // 2. rank met, the gate's boss NOT yet felled.
      if (bout.gateBoss) {
        const undefeated = resolveFeatureBout(row, { ...full, defeatedOpponentIds: [] });
        expect(undefeated.open, `${bout.id}: boss undefeated`).toBe(false);
        expect(undefeated.unmet, `${bout.id}: boss undefeated`).toEqual(['boss']);
      }

      // 3. everything met.
      const open = resolveFeatureBout(row, full);
      expect(open.open, bout.id).toBe(true);
      expect(open.unmet, bout.id).toEqual([]);
      expect(open.defeated, bout.id).toBe(false);
    }
  });

  test("Gnaeus's gate is the TIER condition, not a boss id (Part A, verbatim)", () => {
    const gnaeus = byId('opp_gnaeus_boss');
    expect(gnaeus.gate?.bossDefeatedId).toBeUndefined();
    expect(gnaeus.gate?.tierReached).toBe(4);
    const championTier3 = resolveFeatureBout(gnaeus, base({ fame: 600, currentTier: 3 }));
    expect(championTier3.open).toBe(false);
    expect(championTier3.unmet).toEqual(['tier', 'venue']);
    const championTier4 = resolveFeatureBout(gnaeus, base({ fame: 600, currentTier: 4 }));
    expect(championTier4.open).toBe(true);
    // …and no boss defeat is needed at all: Aurelius may still be standing.
    expect(championTier4.unmet).toEqual([]);
  });

  test('a bout is never open below its VENUE tier, whatever the gate says', () => {
    for (const bout of PART_A) {
      const row = byId(bout.id);
      const belowVenue = resolveFeatureBout(row, {
        ...met(bout.id),
        currentTier: Math.max(1, bout.tier - 1),
      });
      expect(belowVenue.open, `${bout.id} at tier ${bout.tier - 1}`).toBe(false);
      expect(belowVenue.unmet, bout.id).toContain('venue');
    }
  });

  test('a fresh save locks all five, and a Legend-rank save opens all five', () => {
    const fresh = featureBoutStatuses(base());
    expect(fresh).toHaveLength(5);
    for (const status of fresh) {
      expect(status.open, status.opponent.id).toBe(false);
      expect(status.gateText.length).toBeGreaterThan(20);
    }
    const legend = featureBoutStatuses(
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
      })
    );
    expect(legend.every((status) => status.open)).toBe(true);
    expect(legend.map((status) => status.opponent.id)).toEqual(PART_A.map((bout) => bout.id));
  });

  test('the gate text is Part A phrasing, built from the row and the roster', () => {
    expect(featureBoutGateText(byId('opp_varro_boss'))).toBe(
      'Requires: Champion rank — 600 fame and Tier 3 reached — and Valéria defeated.'
    );
    expect(featureBoutGateText(byId('opp_marcellin_boss'))).toBe(
      'Requires: Veteran rank — 150 fame and Tier 2 reached — and Ignis defeated.'
    );
    expect(featureBoutGateText(byId('opp_gnaeus_boss'))).toBe(
      'Requires: Champion rank — 600 fame and Tier 3 reached — and Tier 3 cleared.'
    );
    expect(featureBoutGateText(byId('opp_hermas_boss'))).toBe(
      'Requires: Legend rank — 1500 fame and Tier 4 reached — and Aurelius defeated.'
    );
    // A ladder row declares no gate, so it prints nothing.
    expect(featureBoutGateText(byId('opp_goliath_boss'))).toBe('');
    expect(featureBoutGateText(null)).toBe('');
  });

  test('a feature row with no gate data is CLOSED, never open by accident', () => {
    const gated = byId('opp_marcellin_boss');
    const ungated: OpponentConfig = { ...gated, gate: undefined };
    const status = resolveFeatureBout(ungated, base({ fame: 5000, currentTier: 4 }));
    expect(status.open).toBe(false);
    expect(status.unmet).toEqual(['gate']);
    expect(status.gateText).toBe('');
  });

  test('a malformed profile locks every bout rather than throwing', () => {
    for (const profile of [null, undefined, {}, { fame: Number.NaN, currentTier: -3 }]) {
      const statuses = featureBoutStatuses(profile as never);
      expect(statuses).toHaveLength(5);
      expect(statuses.every((status) => status.open === false)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the result flow
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §F — a feature victory moves no tier and no kill', () => {
  /**
   * The victory write `App.handleMatchComplete` performs, mirrored: append the id
   * if it is new, ask the shipped helper for the tier, and ask the shipped kill
   * rule for the count — exactly the three calls that write makes.
   */
  function victory(profile: PlayerProfile, opponent: OpponentConfig): PlayerProfile {
    const defeatedOpponentIds = profile.defeatedOpponentIds.includes(opponent.id)
      ? profile.defeatedOpponentIds
      : [...profile.defeatedOpponentIds, opponent.id];
    const tier = resolveVictoryTier({
      currentTier: profile.currentTier,
      opponent,
      defeatedOpponentIds: profile.defeatedOpponentIds,
    });
    return {
      ...profile,
      currentTier: tier.currentTier,
      defeatedOpponentIds,
      bossKills: nextBossKills(profile, { defeatedOpponentIds }, opponent),
    };
  }

  test('beating each feature bout records the id, and moves neither tier nor count', () => {
    for (const bout of PART_A) {
      const before = base({
        fame: 1600,
        currentTier: bout.tier,
        bossKills: 2,
        defeatedOpponentIds: [],
      });
      const after = victory(before, byId(bout.id));
      expect(after.currentTier, bout.id).toBe(before.currentTier);
      expect(after.bossKills, bout.id).toBe(before.bossKills);
      expect(after.defeatedOpponentIds, bout.id).toContain(bout.id);
      // …and the tier helper says so in its own words.
      expect(
        resolveVictoryTier({
          currentTier: bout.tier,
          opponent: byId(bout.id),
          defeatedOpponentIds: [],
        })
      ).toEqual({ currentTier: bout.tier, firstDefeat: false, advanced: false });
    }
  });

  test('a tier-2 feature bout does NOT open tier 3 (the pre-fix failure mode)', () => {
    const marcellin = victory(base({ currentTier: 2 }), byId('opp_marcellin_boss'));
    expect(marcellin.currentTier).toBe(2);
    // The ladder's own tier-2 boss still advances, so the rule is live, not dead.
    const ignis = victory(base({ currentTier: 2 }), byId('opp_ignis_boss'));
    expect(ignis.currentTier).toBe(3);
  });

  test('a tier-4 feature victory does not derive Legend on its own', () => {
    // Fame and tier alone are not Legend: the rank also needs the ladder's
    // tier-4 champion, and a feature bout is not that champion.
    const gnaeus = victory(base({ fame: 600, currentTier: 4 }), byId('opp_gnaeus_boss'));
    expect(deriveRank(gnaeus)).toBe('Champion');
    expect(gnaeus.bossKills).toBe(0);
  });

  test('feature victories satisfy NO other bout’s boss gate', () => {
    const allFeatureIds = PART_A.map((bout) => bout.id);
    const swept = base({
      fame: 5000,
      currentTier: 4,
      bossKills: 0,
      defeatedOpponentIds: allFeatureIds,
    });
    // Every bout already won is still listed, and no gate that names a LADDER
    // champion opens because of them.
    for (const status of featureBoutStatuses(swept)) {
      expect(status.defeated, status.opponent.id).toBe(true);
    }
    for (const bout of PART_A) {
      if (!bout.gateBoss) continue;
      const status = resolveFeatureBout(byId(bout.id), swept);
      // Whatever the rank says, the LADDER boss the gate names has not fallen.
      expect(status.open, bout.id).toBe(false);
      expect(status.unmet, bout.id).toContain('boss');
    }
  });

  test('the door never offers a feature bout as a tier ticket', () => {
    // `resolveDoorDuelTarget` asks `isLadderBoss`, so a tier with its champion
    // standing offers the champion; once he is down it falls back to his rematch
    // and never to a feature bout.
    expect(resolveDoorDuelTarget(2, [])?.opponent.id).toBe('opp_ignis_boss');
    expect(resolveDoorDuelTarget(4, [])?.opponent.id).toBe('opp_aurelius_boss');
    const allDown = ['opp_ignis_boss'];
    expect(resolveDoorDuelTarget(2, allDown)).toMatchObject({
      opponent: { id: 'opp_ignis_boss' },
      rematch: true,
    });
    for (const tier of [1, 2, 3, 4]) {
      for (const ids of [[], ['opp_ignis_boss', 'opp_aurelius_boss', 'opp_valeria_boss']]) {
        const target = resolveDoorDuelTarget(tier, ids);
        expect(target?.opponent.featureBout, `tier ${tier}`).toBeUndefined();
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — the surfaces
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §G — the tournament tab and the pre-fight card', () => {
  const legend = base({
    fame: 1600,
    currentTier: 4,
    bossKills: 4,
    level: 12,
    defeatedOpponentIds: [
      'opp_goliath_boss',
      'opp_ignis_boss',
      'opp_valeria_boss',
      'opp_aurelius_boss',
    ],
  });

  test('a Legend-rank profile sees all five listed, all open', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TournamentTab, { profile: legend, onSelectOpponent: () => {} })
    );
    for (const bout of PART_A) {
      expect(markup, bout.id).toContain(`data-feature-bout="${bout.id}"`);
      expect(markup, bout.id).toContain('data-feature-bout-open="true"');
      // React escapes the quotes in a name such as Varro "The Mirage".
      expect(markup, bout.id).toContain(escaped(bout.name));
      expect(markup, bout.id).toContain(`from ${bout.gold} Gold`);
    }
    // The card line is NOT on the arena list (it belongs to the pre-fight card).
    for (const bout of PART_A) expect(markup).not.toContain(bout.cardLine);
  });

  test('a fresh profile sees all five LOCKED with truthful gate text', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TournamentTab, { profile: base(), onSelectOpponent: () => {} })
    );
    for (const bout of PART_A) {
      expect(markup, bout.id).toContain('data-feature-bout-open="false"');
      expect(markup, bout.id).toContain(featureBoutGateText(byId(bout.id)));
    }
    expect(markup).toContain('Feature Bouts');
  });

  test('a feature boss is never listed as a tier rung of the ladder', () => {
    // The tier-2 list must be the LADDER's tier-2 rows only, even though two
    // feature bouts carry venue tier 2.
    const tier2 = renderToStaticMarkup(
      React.createElement(TournamentTab, {
        profile: base({ currentTier: 2, level: 12 }),
        onSelectOpponent: () => {},
      })
    );
    expect(tier2).toContain('data-feature-bout="opp_marcellin_boss"');
    // Exactly one occurrence of each name: the feature section's, not a card's.
    expect(tier2.split('Marcellin the Beastmaster').length - 1).toBe(1);
  });

  test('the pre-fight card prints the row’s card line VERBATIM, at identity depth', () => {
    for (const bout of PART_A) {
      const markup = renderToStaticMarkup(
        React.createElement(PreFightModal, {
          opponent: byId(bout.id),
          onConfirm: () => {},
          onCancel: () => {},
        })
      );
      expect(markup, bout.id).toContain(`data-prefight-card-line="${bout.id}"`);
      // VERBATIM: React escapes the apostrophes and quotes, nothing else.
      expect(markup, bout.id).toContain(escaped(bout.cardLine));
      // The boss's identity is on the card: what he carries is scouted by name.
      expect(markup, bout.id).toContain(`data-scouting-palma="` + bout.carried + `"`);
    }
  });

  test('NO gate, purse or card line is hard-coded in a component', () => {
    for (const path of [
      'src/components/hub/TournamentTab.tsx',
      'src/components/hub/PreFightModal.tsx',
    ]) {
      const source = code(path);
      for (const bout of PART_A) {
        expect(source, `${path}: card line`).not.toContain(bout.cardLine);
        expect(source, `${path}: gate text`).not.toContain(featureBoutGateText(byId(bout.id)));
        expect(source, `${path}: purse`).not.toContain(`${bout.gold} Gold`);
        expect(source, `${path}: fame`).not.toContain(`+${bout.fame} Fame`);
      }
      // The gate's words come from the resolver and the card line from the row.
      expect(source).not.toContain('Requires:');
    }
    expect(code('src/components/hub/TournamentTab.tsx')).toContain('featureBoutStatuses');
    expect(code('src/components/hub/PreFightModal.tsx')).toContain('opponent.cardLine');
  });

  test('the gate text and the card lines live in the DATA, not in a component', () => {
    const opponents = readSource('src/data/opponents.ts');
    for (const bout of PART_A) expect(opponents).toContain(bout.cardLine);
    // The rank names and fame figures are read from `rank.ts`, not retyped.
    expect(code('src/utils/featureBouts.ts')).toContain('RANK_THRESHOLDS');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — presentation states
// ════════════════════════════════════════════════════════════════════════════

describe('D-1 §H — the five state names are data; the AI-4 key map is deferred', () => {
  test('the five authored names exist, once each, and each row carries its own', () => {
    expect(BOSS_PRESENTATION_STATES.map((state) => state.name).sort()).toEqual(
      ['brothers', 'dawn', 'dusk', 'gilded', 'high-noon'].sort()
    );
    expect(new Set(BOSS_PRESENTATION_STATES.map((state) => state.name)).size).toBe(5);
    for (const bout of PART_A) {
      expect(authoredPresentationState(byId(bout.id)), bout.id).toBe(bout.presentation);
      expect(byId(bout.id).presentationState, bout.id).toBe(bout.presentation);
    }
  });

  test('a non-feature opponent has no authored state at all', () => {
    for (const opponent of LADDER_OPPONENTS) {
      expect(authoredPresentationState(opponent), opponent.id).toBeNull();
      expect(opponent.presentationState, opponent.id).toBeUndefined();
    }
    expect(authoredPresentationState(null)).toBeNull();
  });

  test('every boss stands in the STANDARD BOSS ambient state in this slice', () => {
    expect(STANDARD_BOSS_AMBIENT_STATE.id).toBe('standard-boss');
    expect(STANDARD_BOSS_AMBIENT_STATE.brief.length).toBeGreaterThan(20);
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss !== true) {
        expect(presentationStateInForce(opponent), opponent.id).toBeNull();
        continue;
      }
      expect(presentationStateInForce(opponent), opponent.id).toBe(STANDARD_BOSS_AMBIENT_STATE);
    }
    // The key map that would dress an authored name is DEFERRED — nothing in the
    // tree maps a state name to a dressing, and no renderer reads the field.
    for (const path of [
      'src/utils/bossPresentation.ts',
      'src/components/duel/DuelScene.tsx',
      'src/components/hub/TournamentTab.tsx',
    ]) {
      const source = code(path);
      for (const state of BOSS_PRESENTATION_STATES) {
        expect(source, `${path}: ${state.name}`).not.toContain(`'${state.name}'`);
      }
    }
  });
});
