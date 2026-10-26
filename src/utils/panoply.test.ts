/**
 * ===========================================================================
 * D-3 — GNAEUS'S UNBROKEN PANOPLY: the pride suite
 * ===========================================================================
 *   §A the fence + the row's own data (three pieces, crack order, the values);
 *   §B cracks accrue on LANDED PLAYER POWER attacks only — hit or blocked, and
 *      never on a quick;
 *   §C the crack order strips facing → crest → pauldron, two cracks apiece;
 *   §D each break removes exactly its benefit, in the stated order;
 *   §E Humiliated matches the data and is announced once;
 *   §F Vainheart arms his next two attacks and is spent;
 *   §G the fence against string copies and every non-boss row;
 *   §H the presentation — the gilded/high-noon deltas, the banner swap and the
 *      crack pips beside the boss name.
 *
 * Run with: `bun test src/utils/panoply.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { BOSS_PRESENTATION_DELTAS, bossSceneDeltas } from '../data/bossPresentationStates';
import {
  PANOPLY_HUMILIATED_WORDS,
  consumeVainheartAttack,
  crackPanoply,
  createPanoplyState,
  panoplyAggression,
  panoplyBlockChance,
  panoplyConfigFor,
  panoplyDamageTakenMult,
  panoplyBreakWords,
  type PanoplyState,
} from './panoply';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string): string => readFileSync(repoPath(relative), 'utf8');
const code = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const DUEL_SCENE = readSource('src/components/duel/DuelScene.tsx');
const HUD = readSource('src/components/ui/CombatHUD.tsx');
const PANEL = readSource('src/components/ui/TurnActionPanel.tsx');
const ARENA = readSource('src/components/3d/DuelArena.tsx');

const gnaeus = (): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_gnaeus_boss');
  if (!row) throw new Error('Gnaeus is not in the roster');
  return row;
};
const cfg = () => {
  const config = panoplyConfigFor(gnaeus());
  if (!config) throw new Error('Gnaeus wears no panoply');
  return config;
};
const fresh = (): PanoplyState => createPanoplyState(cfg());
/** Apply `count` landing power attacks. */
const cracks = (count: number, from: PanoplyState = fresh()) => {
  let state = from;
  const breaks: (string | null)[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = crackPanoply(state, cfg());
    state = result.state;
    breaks.push(result.broken);
  }
  return { state, breaks };
};

// ── §A — the fence and the data ──────────────────────────────────────────────
describe('D-3 §A — the panoply is data, and only Gnaeus wears one', () => {
  test('exactly one carrier, and it is Gnaeus', () => {
    const carriers = ALL_OPPONENTS.filter((opponent) => panoplyConfigFor(opponent) !== null);
    expect(carriers).toHaveLength(1);
    expect(carriers[0].id).toBe('opp_gnaeus_boss');
    expect(carriers[0].isBoss).toBe(true);
    expect(carriers[0].featureBout).toBe(true);
    expect(carriers[0].bossMechanic).toBe('unbroken_panoply');
  });

  test('three pieces, in the row’s crack order, two cracks apiece', () => {
    expect(cfg().pieces.map((piece) => piece.id)).toEqual(['facing', 'crest', 'pauldron']);
    expect(cfg().pieces.map((piece) => piece.name)).toEqual(['shield facing', 'crest', 'pauldron']);
    expect(cfg().pieces.every((piece) => piece.breakAt === 2)).toBe(true);
    expect(createPanoplyState(cfg()).pieces.map((piece) => piece.cracks)).toEqual([0, 0, 0]);
    expect(createPanoplyState(cfg()).humiliated).toBe(false);
  });

  test('the row’s own magnitudes', () => {
    expect(cfg().crestAggressionBonus).toBe(0.1);
    expect(cfg().facingBlockChanceBonus).toBe(0.1);
    expect(cfg().pauldronDamageTakenMult).toBe(0.9);
    expect(cfg().breakHype).toBe(15);
    expect(cfg().vainheartAttacks).toBe(2);
    expect(cfg().vainheartDamageMult).toBe(1.12);
    expect(cfg().humiliated).toEqual({ blockChanceDelta: -0.1, aggressionDelta: 0.1 });
    expect(gnaeus().palmae).toEqual(['vainheart']);
    expect(gnaeus().presentationState).toBe('gilded');
  });
});

// ── §B — power attacks only, blocked or not ─────────────────────────────────
describe('D-3 §B — only a landed player POWER attack cracks a piece', () => {
  test('the rule sits inside the landed branch, which covers hit AND block', () => {
    // The crack block is between the hit/block resolution and the stat tracking,
    // i.e. inside `roll <= hitPct` where `isBlocked` is already decided.
    const landed = DUEL_SCENE.indexOf('} else if (roll <= hitPct) {');
    const crack = DUEL_SCENE.indexOf('const cracked = crackPanoply(');
    const stats = DUEL_SCENE.indexOf('// Track stats', crack);
    expect(landed).toBeGreaterThan(-1);
    expect(crack).toBeGreaterThan(landed);
    expect(crack).toBeLessThan(stats);
    // The damage branch above treats a blocked power attack as landed, so both
    // outcomes reach it.
    expect(DUEL_SCENE).toContain('const isBlocked = defender.isBlocking;');
  });

  test('the call is gated on the PLAYER and a POWER attack', () => {
    expect(DUEL_SCENE).toContain(
      "if (panoplyCfg && isActorPlayer && actionType === 'power_attack') {"
    );
    // No second crack call anywhere.
    expect((DUEL_SCENE.match(/crackPanoply\(/g) ?? []).length).toBe(1);
    // A quick attack resolves through the same branch and is excluded by the
    // action test, which the source above pins.
    expect(DUEL_SCENE).not.toContain("actionType === 'quick_attack' && panoplyCfg");
  });

  test('a miss, an evade and an out-of-range swing never reach the crack', () => {
    const miss = DUEL_SCENE.indexOf("EVADED ${attackerLabel}'s strike!");
    const outOfRange = DUEL_SCENE.indexOf('OUT OF RANGE!');
    const crack = DUEL_SCENE.indexOf('const cracked = crackPanoply(');
    expect(miss).toBeGreaterThan(-1);
    expect(outOfRange).toBeGreaterThan(-1);
    expect(crack).toBeGreaterThan(miss);
    expect(crack).toBeGreaterThan(outOfRange);
  });

  test('the pure rule adds exactly one crack per call and never more', () => {
    const once = cracks(1).state;
    expect(once.pieces.map((piece) => piece.cracks)).toEqual([1, 0, 0]);
  });
});

// ── §C — the order ──────────────────────────────────────────────────────────
describe('D-3 §C — cracks strip facing → crest → pauldron', () => {
  test('six power attacks break all three, in order', () => {
    const { state, breaks } = cracks(6);
    expect(breaks).toEqual([null, 'facing', null, 'crest', null, 'pauldron']);
    expect(state.pieces.map((piece) => piece.cracks)).toEqual([2, 2, 2]);
    expect(state.pieces.every((piece) => piece.broken)).toBe(true);
    expect(state.humiliated).toBe(true);
  });

  test('a seventh crack invents nothing', () => {
    const stripped = cracks(6).state;
    const again = crackPanoply(stripped, cfg());
    expect(again.state).toBe(stripped);
    expect(again.broken).toBeNull();
    expect(again.words).toBe('');
    expect(again.humiliatedNow).toBe(false);
  });

  test('the break lines name the piece, in Part A’s words', () => {
    const { breaks } = cracks(6);
    expect(breaks.filter(Boolean)).toEqual(['facing', 'crest', 'pauldron']);
    expect(panoplyBreakWords('shield facing')).toBe('His shield facing splits — the crowd loves it.');
    expect(panoplyBreakWords('crest')).toBe('His crest splits — the crowd loves it.');
    expect(panoplyBreakWords('pauldron')).toBe('His pauldron splits — the crowd loves it.');
    // The scene speaks it once per break, and pays the crowd each time.
    expect(DUEL_SCENE).toContain('addLog(cracked.words, ');
    expect(DUEL_SCENE).toContain('panoplyCfg.breakHype');
  });
});

// ── §D — the benefits leave, in order ───────────────────────────────────────
describe('D-3 §D — each break removes exactly its own benefit', () => {
  test('the live profile while the panoply shines', () => {
    const state = fresh();
    expect(panoplyAggression(gnaeus().aggression, cfg(), state)).toBeCloseTo(0.7, 10);
    expect(panoplyBlockChance(gnaeus().blockChance, cfg(), state)).toBeCloseTo(0.85, 10);
    expect(panoplyDamageTakenMult(cfg(), state)).toBeCloseTo(0.9, 10);
  });

  test('the facing breaks first and only the block falls', () => {
    const state = cracks(2).state;
    expect(panoplyBlockChance(gnaeus().blockChance, cfg(), state)).toBeCloseTo(0.75, 10);
    expect(panoplyAggression(gnaeus().aggression, cfg(), state)).toBeCloseTo(0.7, 10);
    expect(panoplyDamageTakenMult(cfg(), state)).toBeCloseTo(0.9, 10);
  });

  test('the crest follows and only the aggression falls', () => {
    const state = cracks(4).state;
    expect(panoplyBlockChance(gnaeus().blockChance, cfg(), state)).toBeCloseTo(0.75, 10);
    expect(panoplyAggression(gnaeus().aggression, cfg(), state)).toBeCloseTo(0.6, 10);
    expect(panoplyDamageTakenMult(cfg(), state)).toBeCloseTo(0.9, 10);
  });

  test('the pauldron last returns the damage taken to 1.0, then Humiliated bites', () => {
    const state = cracks(6).state;
    expect(panoplyDamageTakenMult(cfg(), state)).toBe(1);
    expect(panoplyBlockChance(gnaeus().blockChance, cfg(), state)).toBeCloseTo(0.65, 10);
    expect(panoplyAggression(gnaeus().aggression, cfg(), state)).toBeCloseTo(0.7, 10);
  });

  test('the AI reads the live values rather than the row', () => {
    expect(DUEL_SCENE).toContain('panoplyAggression(opponent.aggression, panoplyCfg, panoplyRef.current)');
    expect(DUEL_SCENE).toContain('panoplyBlockChance(opponent.blockChance, panoplyCfg, panoplyRef.current)');
    expect(DUEL_SCENE).toContain('panoplyDamageTakenMult(panoplyCfg, panoplyRef.current)');
  });
});

// ── §E — Humiliated ─────────────────────────────────────────────────────────
describe('D-3 §E — Humiliated matches the data, announced once', () => {
  test('it is the row’s own shift, permanent for the duel', () => {
    expect(cfg().humiliated).toEqual({ blockChanceDelta: -0.1, aggressionDelta: 0.1 });
    const stripped = cracks(6).state;
    // Still in force after further cracks — nothing clears it.
    const later = crackPanoply(stripped, cfg()).state;
    expect(later.humiliated).toBe(true);
  });

  test('it is announced on the third break and never again', () => {
    // Of the six cracks, exactly three BREAK a piece — and the panoply is
    // Humiliated only after the last of them.
    const perCrack = [1, 2, 3, 4, 5, 6].map((n) => cracks(n));
    expect(perCrack.filter((result) => result.state.humiliated)).toHaveLength(1);
    expect(perCrack[4].breaks.filter(Boolean)).toHaveLength(2);
    expect(perCrack[5].breaks.filter(Boolean)).toHaveLength(3);
    expect(crackPanoply(cracks(5).state, cfg()).humiliatedNow).toBe(true);
    expect(perCrack[5].state.humiliated).toBe(true);
    expect(PANOPLY_HUMILIATED_WORDS).toContain('humiliated');
    // One WRITER (the import line also names it, so the log call is what counts).
    expect((DUEL_SCENE.match(/addLog\(PANOPLY_HUMILIATED_WORDS/g) ?? []).length).toBe(1);
  });
});

// ── §F — Vainheart ──────────────────────────────────────────────────────────
describe('D-3 §F — Vainheart arms two attacks per break', () => {
  test('a break arms two, in the data’s own count', () => {
    expect(cracks(1).state.vainheartArmedAttacks).toBe(0);
    expect(cracks(2).state.vainheartArmedAttacks).toBe(2);
  });

  test('the armed attacks are spent one at a time', () => {
    let state = cracks(2).state;
    const first = consumeVainheartAttack(state);
    expect(first.armed).toBe(true);
    state = first.state;
    const second = consumeVainheartAttack(state);
    expect(second.armed).toBe(true);
    state = second.state;
    const third = consumeVainheartAttack(state);
    expect(third.armed).toBe(false);
    expect(third.state).toBe(state);
  });

  test('the scene spends one per attack and applies the palma’s multiplier', () => {
    expect(DUEL_SCENE).toContain('consumeVainheartAttack(panoplyRef.current).state');
    expect(DUEL_SCENE).toContain('panoplyCfg.vainheartDamageMult');
    expect(cfg().vainheartDamageMult).toBe(1.12);
  });
});

// ── §G — the fence against copies ───────────────────────────────────────────
describe('D-3 §G — the mechanic string alone never makes a panoply', () => {
  test('each clause is load-bearing', () => {
    const copy = (over: Partial<OpponentConfig>): OpponentConfig => ({ ...gnaeus(), ...over });
    expect(panoplyConfigFor(copy({ isBoss: false }))).toBeNull();
    expect(panoplyConfigFor(copy({ featureBout: undefined }))).toBeNull();
    expect(panoplyConfigFor(copy({ bossMechanic: 'false_telegraph' }))).toBeNull();
    expect(panoplyConfigFor(copy({ panoply: undefined }))).toBeNull();
    expect(
      panoplyConfigFor(
        copy({
          panoply: { ...cfg(), pieces: [{ ...cfg().pieces[0], breakAt: 0 }] },
        })
      )
    ).toBeNull();
    expect(panoplyConfigFor(null)).toBeNull();
  });

  test('no other row in the game can crack', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.id === 'opp_gnaeus_boss') continue;
      expect(panoplyConfigFor(opponent), opponent.id).toBeNull();
    }
  });
});

// ── §H — presentation ───────────────────────────────────────────────────────
describe('D-3 §H — the presentation is property-only', () => {
  test('high-noon and gilded exist, with the rig’s own keys only', () => {
    const keys = ['ambientColor', 'ambientIntensity', 'fogColor', 'sunColor', 'sunIntensity'];
    expect(Object.keys(BOSS_PRESENTATION_DELTAS['high-noon'] ?? {}).sort()).toEqual(keys.sort());
    expect(Object.keys(BOSS_PRESENTATION_DELTAS.gilded ?? {}).sort()).toEqual(keys.sort());
    expect(bossSceneDeltas(gnaeus())).toEqual(BOSS_PRESENTATION_DELTAS.gilded!);
    const varro = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_varro_boss');
    expect(bossSceneDeltas(varro)).toEqual(BOSS_PRESENTATION_DELTAS['high-noon']!);
    // The scene still names no presentation STATE (it reads the deltas through
    // the one resolver) and adds nothing to the scene. `'gilded'` does appear in
    // the scene, but as the BANNER's allegiance value, never as a state name.
    expect(DUEL_SCENE).toContain('bossSceneDeltas(opponent)');
    expect(DUEL_SCENE).not.toContain("'high-noon'");
    expect(DUEL_SCENE).not.toContain('presentationState');
  });

  test('the third break swaps the loge’s cloth — one material property', () => {
    expect(ARENA).toContain("color={bannerAllegiance === 'gilded' ? '#eab308' : '#881337'}");
    expect(DUEL_SCENE).toContain("panoply.humiliated ? 'player' : 'gilded'");
    // No new mesh or material was introduced by the swap.
    const canopy = ARENA.slice(ARENA.indexOf('Velarium'), ARENA.indexOf('Gold Trim'));
    expect((canopy.match(/<mesh /g) ?? []).length).toBe(1);
  });

  test('the crack pips live beside the boss name, in the D-2 pip language', () => {
    expect(HUD).toContain('data-panoply-pips=');
    expect(HUD).toContain('data-panoply-humiliated=');
    expect(HUD).toContain('w-1 h-1 rounded-[1px]');
    // They are in the vital card, not in the action panel, so they cannot crowd it.
    expect(PANEL).not.toContain('data-panoply-pips');
    expect(DUEL_SCENE).toContain('panoply={');
    expect(DUEL_SCENE).toContain('pieces: panoply.pieces.map((piece) => ({');
  });

  test('the duel state never reaches a save', () => {
    for (const path of ['src/services/storage.ts', 'src/services/googleDrive.ts']) {
      expect(code(path).includes('panoply'), path).toBe(false);
      expect(code(path).includes('falseTelegraph'), path).toBe(false);
    }
    expect(DUEL_SCENE).not.toContain('saveProfile');
  });
});
