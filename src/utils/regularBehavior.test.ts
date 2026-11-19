/**
 * ===========================================================================
 * REGULARS-1 + REGULARS-2 — Named regulars fight distinctly (phase-2 loop
 * audit, beat 6). The slices' pins, one section per brief requirement. The
 * decision logic lives in the pure helper (`regularBehavior.ts`); the wiring
 * pins (§X) read the hook call and the refs out of `DuelScene`, so a
 * disconnect between the helper and the shipped code fails here rather than
 * in a playtest.
 *
 *   §1  the fence           (absent/unknown/boss → null; the row fence both ways)
 *   §2  Marcus eager        (player blocking → power 0.80 / taunt 0.10 / block 0.10)
 *   §3  Flaccus hit_and_run (after a LANDED quick → retreat, ring to retreat into)
 *   §4  Brutus anvil_answers (after blocking → power 0.65 / quick 0.20 / block 0.15)
 *   §5  Naija fishers_press (entangled → aggression 1.00, never defensive)
 *   §6  Twins twin_tempo    (quick → power, power → quick; the action counts)
 *   §7  the stamina guard   (a choice the fighter cannot afford is null, never downgraded)
 *   §8  nothing else moves  (numbers, boss rows and the frozen chooser untouched)
 *   §9  Cassius wall_closes (after a clean hit lands on him → brace, deterministic)
 *   §10 Drusus measured_guard (middle stamina band → block, never a tired quick)
 *   §11 Kallias hold_the_tip (inside half reach → retreat, unless he just did)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/regularBehavior.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import type { RegularBehavior } from '../types/game';
import {
  ANVIL_TABLE,
  EAGER_TABLE,
  HIT_AND_RUN_REAR_BOUND_M,
  HIT_AND_RUN_RETREAT_M,
  TIP_INNER_RATIO,
  TWIN_AFTER_POWER_TABLE,
  TWIN_AFTER_QUICK_TABLE,
  applyRegularBehavior,
  type RegularBehaviorInput,
} from './regularBehavior';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const byId = (id: string) => ALL_OPPONENTS.find((opponent) => opponent.id === id)!;

/** A well-fed, in-range, non-boss regular with no fight state yet. The
 * distance (2.0 m at a 3.1 m reach, ratio 0.645) sits in the neutral band,
 * so the default input triggers no guard behavior. */
const base = (overrides: Partial<RegularBehaviorInput> = {}): RegularBehaviorInput => ({
  behavior: 'eager',
  isBoss: false,
  playerBlocking: false,
  playerEntangled: false,
  inRange: true,
  oppPositionZ: -3.5,
  lastAction: null,
  blockedPlayerAttack: false,
  distanceM: 2.0,
  reachM: 3.1,
  tookCleanHit: false,
  stamina: 100,
  lightCost: 10,
  heavyCost: 22,
  aggression: 0.5,
  blockChance: 0.25,
  ...overrides,
});

// ── §1 — THE FENCE ───────────────────────────────────────────────────────────

describe('§1 — the fence: absent, unknown or boss behavior keeps the ladder’s choice', () => {
  test('no behavior on the row → null', () => {
    expect(applyRegularBehavior(base({ behavior: undefined }))).toBeNull();
  });

  test('an unknown behavior string → null, never a crash', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'not_a_behavior' as RegularBehavior })),
    ).toBeNull();
  });

  test('a boss row carrying a behavior → null', () => {
    expect(applyRegularBehavior(base({ isBoss: true, playerBlocking: true, rng: 0.5 }))).toBeNull();
  });

  test('the row fence, both ways, over the whole roster', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) {
        expect(opponent.regularBehavior, opponent.id).toBeUndefined();
      } else {
        expect(opponent.bossMechanic, opponent.id).toBeUndefined();
      }
    }
    expect(DOCTORE_TEST_OPPONENT.regularBehavior).toBeUndefined();
    expect(DOCTORE_TEST_OPPONENT.bossMechanic).toBeUndefined();
  });

  test('the eight rows carry exactly their briefed behavior', () => {
    expect(byId('opp_marcus').regularBehavior).toBe('eager');
    expect(byId('opp_flaccus').regularBehavior).toBe('hit_and_run');
    expect(byId('opp_brutus_anvil').regularBehavior).toBe('anvil_answers');
    expect(byId('opp_naija_fisher').regularBehavior).toBe('fishers_press');
    expect(byId('opp_pale_twins').regularBehavior).toBe('twin_tempo');
    expect(byId('opp_hoplite').regularBehavior).toBe('wall_closes');
    expect(byId('opp_centurion_drusus').regularBehavior).toBe('measured_guard');
    expect(byId('opp_kallias_sparta').regularBehavior).toBe('hold_the_tip');
  });
});

// ── §2 — MARCUS EAGER ────────────────────────────────────────────────────────

describe('§2 — Marcus eager: he smashes the shield', () => {
  test('the pinned table is the brief’s own', () => {
    expect(EAGER_TABLE.powerCutoff).toBe(0.8);
    expect(EAGER_TABLE.tauntCutoff).toBe(0.9);
  });

  test('player blocking → power 0.80 / taunt 0.10 / block 0.10', () => {
    expect(applyRegularBehavior(base({ playerBlocking: true, rng: 0.79 }))).toBe('power_attack');
    expect(applyRegularBehavior(base({ playerBlocking: true, rng: 0.85 }))).toBe('taunt');
    expect(applyRegularBehavior(base({ playerBlocking: true, rng: 0.95 }))).toBe('shield_block');
  });

  test('player not blocking → null, the ladder runs', () => {
    expect(applyRegularBehavior(base({ playerBlocking: false, rng: 0.5 }))).toBeNull();
  });
});

// ── §3 — FLACCUS HIT AND RUN ─────────────────────────────────────────────────

describe('§3 — Flaccus hit_and_run: strike, step back', () => {
  const afterLandedQuick = { lastAction: { action: 'quick_attack' as const, landed: true } };

  test('the pinned step and bound are the retreat branch’s own', () => {
    expect(HIT_AND_RUN_RETREAT_M).toBe(1.8);
    expect(HIT_AND_RUN_REAR_BOUND_M).toBe(-7.5);
  });

  test('after a landed quick → retreat', () => {
    expect(applyRegularBehavior(base({ behavior: 'hit_and_run', ...afterLandedQuick }))).toBe(
      'retreat',
    );
  });

  test('after a missed or blocked quick → null', () => {
    expect(
      applyRegularBehavior(
        base({
          behavior: 'hit_and_run',
          lastAction: { action: 'quick_attack', landed: false },
        }),
      ),
    ).toBeNull();
  });

  test('after a landed power, or after a block → null', () => {
    expect(
      applyRegularBehavior(
        base({
          behavior: 'hit_and_run',
          lastAction: { action: 'power_attack', landed: true },
        }),
      ),
    ).toBeNull();
    expect(
      applyRegularBehavior(
        base({
          behavior: 'hit_and_run',
          lastAction: { action: 'shield_block', landed: false },
        }),
      ),
    ).toBeNull();
  });

  test('at the rear bound there is no ring to retreat into → null', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hit_and_run', ...afterLandedQuick, oppPositionZ: -5.7 })),
    ).toBeNull();
    expect(
      applyRegularBehavior(base({ behavior: 'hit_and_run', ...afterLandedQuick, oppPositionZ: -7.5 })),
    ).toBeNull();
  });

  test('one step short of the bound the retreat still fires', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hit_and_run', ...afterLandedQuick, oppPositionZ: -5.6 })),
    ).toBe('retreat');
  });

  test('out of range → null, the advance/taunt branch stands', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hit_and_run', ...afterLandedQuick, inRange: false })),
    ).toBeNull();
  });
});

// ── §4 — BRUTUS ANVIL ANSWERS ────────────────────────────────────────────────

describe('§4 — Brutus anvil_answers: the shield answers', () => {
  test('the pinned table is the brief’s own', () => {
    expect(ANVIL_TABLE.powerCutoff).toBe(0.65);
    expect(ANVIL_TABLE.quickCutoff).toBe(0.85);
  });

  test('after blocking a player attack → power 0.65 / quick 0.20 / block 0.15', () => {
    expect(applyRegularBehavior(base({ behavior: 'anvil_answers', blockedPlayerAttack: true, rng: 0.64 }))).toBe(
      'power_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'anvil_answers', blockedPlayerAttack: true, rng: 0.7 }))).toBe(
      'quick_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'anvil_answers', blockedPlayerAttack: true, rng: 0.9 }))).toBe(
      'shield_block',
    );
  });

  test('no block since his last slot → null', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'anvil_answers', blockedPlayerAttack: false, rng: 0.5 })),
    ).toBeNull();
  });
});

// ── §5 — NAIJA FISHERS PRESS ─────────────────────────────────────────────────

describe('§5 — Naija fishers_press: the net is her moment', () => {
  test('while the player is entangled the re-roll never returns a defensive action', () => {
    for (let i = 0; i < 100; i += 1) {
      const action = applyRegularBehavior(
        base({ behavior: 'fishers_press', playerEntangled: true, rng: i / 100 }),
      );
      expect(action === 'quick_attack' || action === 'power_attack', `rng ${i / 100}`).toBe(true);
    }
  });

  test('the forced aggression keeps the frozen chooser’s 46:26 split', () => {
    // Aggression 1.00: quick below 46/72, power above it — the same draw the
    // ladder makes, with the defensive half of the table unreachable.
    expect(applyRegularBehavior(base({ behavior: 'fishers_press', playerEntangled: true, rng: 0.5 }))).toBe(
      'quick_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'fishers_press', playerEntangled: true, rng: 0.8 }))).toBe(
      'power_attack',
    );
  });

  test('net not holding → null, the ladder runs exactly as today', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'fishers_press', playerEntangled: false, rng: 0.5 })),
    ).toBeNull();
  });
});

// ── §6 — TWINS TWIN TEMPO ────────────────────────────────────────────────────

describe('§6 — Twins twin_tempo: the blades alternate', () => {
  test('the pinned tables are the brief’s own', () => {
    expect(TWIN_AFTER_QUICK_TABLE.powerCutoff).toBe(0.8);
    expect(TWIN_AFTER_QUICK_TABLE.quickCutoff).toBe(0.9);
    expect(TWIN_AFTER_POWER_TABLE.quickCutoff).toBe(0.7);
    expect(TWIN_AFTER_POWER_TABLE.powerCutoff).toBe(0.85);
  });

  test('after a quick action → power 0.80 / quick 0.10 / block 0.10', () => {
    const afterQuick = { lastAction: { action: 'quick_attack' as const, landed: true } };
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterQuick, rng: 0.79 }))).toBe(
      'power_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterQuick, rng: 0.85 }))).toBe(
      'quick_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterQuick, rng: 0.95 }))).toBe(
      'shield_block',
    );
  });

  test('after a power action → quick 0.70 / power 0.15 / block 0.15', () => {
    const afterPower = { lastAction: { action: 'power_attack' as const, landed: true } };
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterPower, rng: 0.69 }))).toBe(
      'quick_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterPower, rng: 0.75 }))).toBe(
      'power_attack',
    );
    expect(applyRegularBehavior(base({ behavior: 'twin_tempo', ...afterPower, rng: 0.9 }))).toBe(
      'shield_block',
    );
  });

  test('after a block or a taunt → null, the ladder runs', () => {
    expect(
      applyRegularBehavior(
        base({ behavior: 'twin_tempo', lastAction: { action: 'shield_block', landed: false } }),
      ),
    ).toBeNull();
    expect(
      applyRegularBehavior(
        base({ behavior: 'twin_tempo', lastAction: { action: 'taunt', landed: false } }),
      ),
    ).toBeNull();
  });

  test('a missed quick still counts — the action, not the outcome', () => {
    expect(
      applyRegularBehavior(
        base({
          behavior: 'twin_tempo',
          lastAction: { action: 'quick_attack', landed: false },
          rng: 0.5,
        }),
      ),
    ).toBe('power_attack');
  });
});

// ── §7 — THE STAMINA GUARD ───────────────────────────────────────────────────

describe('§7 — the stamina guard: a choice the fighter cannot afford is null', () => {
  test('forced power with stamina below the heavy cost → null', () => {
    expect(
      applyRegularBehavior(base({ playerBlocking: true, rng: 0.5, stamina: 10, heavyCost: 22 })),
    ).toBeNull();
  });

  test('forced quick with stamina below the light cost → null', () => {
    expect(
      applyRegularBehavior(
        base({ behavior: 'anvil_answers', blockedPlayerAttack: true, rng: 0.7, stamina: 5, lightCost: 10 }),
      ),
    ).toBeNull();
  });

  test('a pressed fisher with no stamina to strike → null', () => {
    expect(
      applyRegularBehavior(
        base({ behavior: 'fishers_press', playerEntangled: true, rng: 0.5, stamina: 5, lightCost: 10 }),
      ),
    ).toBeNull();
  });

  test('a free action still fires on low stamina — the guard only prices attacks', () => {
    expect(
      applyRegularBehavior(base({ playerBlocking: true, rng: 0.85, stamina: 5, heavyCost: 22 })),
    ).toBe('taunt');
  });
});

// ── §8 — NOTHING ELSE MOVES ──────────────────────────────────────────────────

describe('§8 — no save change, no boss row changed, the eight rows’ numbers untouched', () => {
  test('the five rows keep their published numbers', () => {
    const expected = [
      ['opp_marcus', 0.5, 0.25, { strength: 8, agility: 8, staminaMax: 80, staminaRegen: 14, defense: 2, healthMax: 90 }],
      ['opp_flaccus', 0.6, 0.2, { strength: 10, agility: 12, staminaMax: 90, staminaRegen: 18, defense: 3, healthMax: 105 }],
      ['opp_brutus_anvil', 0.5, 0.7, { strength: 14, agility: 12, staminaMax: 108, staminaRegen: 19, defense: 8, healthMax: 160 }],
      ['opp_naija_fisher', 0.7, 0.4, { strength: 15, agility: 16, staminaMax: 120, staminaRegen: 21, defense: 7, healthMax: 180 }],
      ['opp_pale_twins', 0.85, 0.35, { strength: 24, agility: 20, staminaMax: 152, staminaRegen: 24, defense: 12, healthMax: 300 }],
    ] as const;
    for (const [id, aggression, blockChance, stats] of expected) {
      const row = byId(id);
      expect(row.aggression, id).toBe(aggression);
      expect(row.blockChance, id).toBe(blockChance);
      expect({ ...row.stats }, id).toEqual(stats);
    }
  });

  test('the three guards keep their published numbers', () => {
    const expected = [
      ['opp_hoplite', 0.45, 0.65, { strength: 13, agility: 11, staminaMax: 100, staminaRegen: 18, defense: 7, healthMax: 135 }],
      ['opp_centurion_drusus', 0.6, 0.75, { strength: 22, agility: 14, staminaMax: 130, staminaRegen: 20, defense: 14, healthMax: 260 }],
      ['opp_kallias_sparta', 0.55, 0.7, { strength: 23, agility: 16, staminaMax: 142, staminaRegen: 22, defense: 13, healthMax: 285 }],
    ] as const;
    for (const [id, aggression, blockChance, stats] of expected) {
      const row = byId(id);
      expect(row.aggression, id).toBe(aggression);
      expect(row.blockChance, id).toBe(blockChance);
      expect({ ...row.stats }, id).toEqual(stats);
    }
  });

  test('the four ladder bosses keep their mechanics and gain no behavior', () => {
    expect(byId('opp_goliath_boss').bossMechanic).toBe('heavy_telegraph');
    expect(byId('opp_ignis_boss').bossMechanic).toBe('phase_weapon_switch');
    expect(byId('opp_valeria_boss').bossMechanic).toBe('counter_dodge');
    expect(byId('opp_aurelius_boss').bossMechanic).toBe('rage_mode_colossus');
  });

  test('the frozen chooser knows nothing of regular behavior', () => {
    expect(code('src/utils/combatCalculations.ts')).not.toContain('regularBehavior');
    expect(code('src/utils/combatCalculations.ts')).not.toContain('RegularBehavior');
  });

  test('no save field is added: the type carries no new profile field', () => {
    expect(source('src/types/game.ts')).not.toContain('regularBehaviorStreak');
    expect(source('src/types/game.ts')).not.toContain('lastRegularAction');
  });
});

// ── §9 — CASSIUS WALL CLOSES ───────────────────────────────────────────────

describe('§9 — Cassius wall_closes: the wall closes ranks', () => {
  test('after a clean hit lands on him → shield_block, deterministically', () => {
    expect(applyRegularBehavior(base({ behavior: 'wall_closes', tookCleanHit: true, rng: 0 }))).toBe(
      'shield_block',
    );
    expect(applyRegularBehavior(base({ behavior: 'wall_closes', tookCleanHit: true, rng: 0.5 }))).toBe(
      'shield_block',
    );
    expect(applyRegularBehavior(base({ behavior: 'wall_closes', tookCleanHit: true, rng: 0.99 }))).toBe(
      'shield_block',
    );
  });

  test('no clean hit since his last slot → null', () => {
    expect(applyRegularBehavior(base({ behavior: 'wall_closes', tookCleanHit: false }))).toBeNull();
  });
});

// ── §10 — DRUSUS MEASURED GUARD ────────────────────────────────────────────

describe('§10 — Drusus measured_guard: the veteran measures his breath', () => {
  // The gladius's own costs: a quick for 10, a power for 24.
  const band = (stamina: number) =>
    base({ behavior: 'measured_guard', stamina, lightCost: 10, heavyCost: 24 });

  test('stamina in [lightCost, heavyCost) → shield_block', () => {
    expect(applyRegularBehavior(band(10))).toBe('shield_block');
    expect(applyRegularBehavior(band(23))).toBe('shield_block');
  });

  test('at exactly heavyCost he can afford the power → null', () => {
    expect(applyRegularBehavior(band(24))).toBeNull();
  });

  test('below lightCost → null, the ladder’s low-stamina branch owns that band', () => {
    expect(applyRegularBehavior(band(9))).toBeNull();
  });

  test('above heavyCost → null', () => {
    expect(applyRegularBehavior(band(100))).toBeNull();
  });
});

// ── §11 — KALLIAS HOLD THE TIP ─────────────────────────────────────────────

describe('§11 — Kallias hold_the_tip: he keeps you at the spear’s tip', () => {
  test('the pinned inner ratio is Spearman’s Ground’s own', () => {
    expect(TIP_INNER_RATIO).toBe(0.5);
  });

  test('inside half reach → retreat', () => {
    expect(applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 1.2, reachM: 3.1 }))).toBe(
      'retreat',
    );
  });

  test('at exactly half reach → null', () => {
    expect(applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 1.55, reachM: 3.1 }))).toBeNull();
  });

  test('at the tip and beyond → null', () => {
    expect(applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 2.1, reachM: 3.1 }))).toBeNull();
    expect(applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 3.0, reachM: 3.1 }))).toBeNull();
  });

  test('after a retreat → null, even inside half reach', () => {
    expect(
      applyRegularBehavior(
        base({
          behavior: 'hold_the_tip',
          distanceM: 1.2,
          reachM: 3.1,
          lastAction: { action: 'retreat', landed: false },
        }),
      ),
    ).toBeNull();
  });

  test('at the rear bound there is no ring to retreat into → null', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 1.2, reachM: 3.1, oppPositionZ: -5.7 })),
    ).toBeNull();
  });

  test('one step short of the bound the retreat still fires', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 1.2, reachM: 3.1, oppPositionZ: -5.6 })),
    ).toBe('retreat');
  });

  test('out of range → null, the advance/taunt branch stands', () => {
    expect(
      applyRegularBehavior(base({ behavior: 'hold_the_tip', distanceM: 1.2, reachM: 3.1, inRange: false })),
    ).toBeNull();
  });
});

// ── §X — THE WIRING ──────────────────────────────────────────────────────────

describe('§X — the hook is wired where the brief puts it', () => {
  const duel = code('src/components/duel/DuelScene.tsx');

  test('the hook is imported from the pure module', () => {
    expect(duel).toContain("from '../../utils/regularBehavior'");
    expect(duel).toContain('applyRegularBehavior');
  });

  test('the hook is called exactly once, after the ladder and before the telegraph overrides', () => {
    expect(duel.split('applyRegularBehavior({').length - 1).toBe(1);
    const hookAt = duel.indexOf('applyRegularBehavior({');
    // After the ladder's last standard draw…
    expect(hookAt).toBeGreaterThan(duel.lastIndexOf('chooseAIStandardAction('));
    // …and before the regular announce that converts a chosen power.
    expect(hookAt).toBeLessThan(duel.indexOf('shouldAnnounceRegularPower({'));
  });

  test('the three runtime-only refs exist and reset with the other refs', () => {
    expect(duel).toContain('oppLastActionRef');
    expect(duel).toContain('oppBlockedPlayerAttackRef');
    expect(duel).toContain('oppTookCleanHitRef');
    expect(duel.split('oppLastActionRef.current = null').length - 1).toBe(3);
    // Four, not three: the three resets above, plus the hook's own read-and-
    // clear at the call site, where the AI slot consumes the marker.
    expect(duel.split('oppBlockedPlayerAttackRef.current = false').length - 1).toBe(4);
    // The same four for the Wall's marker: three resets plus the call-site clear.
    expect(duel.split('oppTookCleanHitRef.current = false').length - 1).toBe(4);
  });

  test('the resolution records the last action and its clean landing', () => {
    expect(duel.split('oppLastActionRef.current = {').length - 1).toBe(2);
    expect(duel).toContain('oppBlockedPlayerAttackRef.current = true');
    expect(duel).toContain('oppTookCleanHitRef.current = true');
    // The Wall's marker is set only on a clean landing: the player's attack,
    // not blocked, in the hit branch the evades and sidesteps never reach.
    expect(duel).toContain('isActorPlayer && !isBlocked');
  });
});
