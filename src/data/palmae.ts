import type { TraitModifierBlock } from '../utils/traitModifiers';

/**
 * ===========================================================================
 * CH-1 — THE PALMAE (victory palms)
 * ===========================================================================
 * A palma is a victory palm: a trait a gladiator earns and equips (up to
 * three).  It is NOT a Laurel — `laurels` is the separate Triumphs record.
 *
 * Sixteen rows, as data and nothing else: twelve the player can earn, four the
 * bosses alone carry.  Each row states where it comes from and at which hook
 * stage its effect lands, and carries its effect in the shared
 * `TraitModifierBlock` shape.  A condition the block cannot express (a health
 * threshold, a stance, an attack type, a once-per-fight flag) is named in
 * `notes` rather than invented as a new formula hook in this slice.
 *
 * `bossOnly` is the one structural rule: those four rows are NEVER in
 * `PALMAE_PLAYER_POOL`, and the suite enforces it.
 */

/** Where a palma is earned. */
export type PalmaSource =
  | 'boss-drop'
  | 'tier-clear'
  | 'rank'
  | 'doctore-training'
  | 'fights-won'
  | 'crowd-hype';

/** The stage of a fight/profile read at which the effect is applied. */
export type PalmaHookStage = 'damage' | 'weapon' | 'evasion' | 'stat' | 'event' | 'hit' | 'reward';

export interface Palma {
  /** snake_case id, derived from the name. */
  id: string;
  name: string;
  /** One line, player-facing. */
  description: string;
  source: PalmaSource;
  /** The specific drop, rank, tier, price or threshold the source names. */
  sourceDetail: string;
  /** The hook stage(s) the effect applies at; the first is the primary one. */
  hookStages: PalmaHookStage[];
  /** Boss-only palmae are never offered to the player. */
  bossOnly?: true;
  /**
   * CH-5 — what the Doctore charges for this palma, in gold.  Only a
   * `doctore-training` row carries one: every other palma is EARNED, never bought,
   * so its price is not data at all.  The Doctore's stall reads this field and
   * nothing else, so a price can never drift from the row it belongs to.
   */
  price?: number;
  /** The effect in the shared modifier shape; an empty block is the identity. */
  effect: TraitModifierBlock;
  /** What the block shape cannot express — conditions and unhooked magnitudes. */
  notes?: string[];
}

export const PALMAE: Palma[] = [
  // ── the player pool (12) ────────────────────────────────────────────────
  {
    id: 'executioner',
    name: 'Executioner',
    description: 'Deal 10% more damage to opponents below 25% health.',
    source: 'boss-drop',
    sourceDetail: 'Goliath',
    hookStages: ['damage'],
    effect: { damageDealtMult: 1.1 },
    notes: ['Opponents below 25% HP — a health threshold the block cannot express.'],
  },
  {
    id: 'shieldwall_discipline',
    name: 'Shieldwall Discipline',
    description: 'Gain 6 points of block reduction; the total is capped at 90%.',
    source: 'tier-clear',
    sourceDetail: 'Tier 2 — Ignis falls',
    hookStages: ['weapon'],
    effect: { blockReductionAdd: 0.06 },
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Gain 4% passive evade while you are not in a dodge stance.',
    source: 'boss-drop',
    sourceDetail: 'Valéria',
    hookStages: ['evasion'],
    effect: { passiveEvadeAdd: 0.04 },
    notes: ['Only while NOT dodge-stanced — a stance condition the block cannot express.'],
  },
  {
    id: 'colossus_bane',
    name: 'Colossus Bane',
    description: 'Deal 12% more damage to bosses.',
    source: 'boss-drop',
    sourceDetail: 'Ignis',
    hookStages: ['damage'],
    effect: { damageDealtMult: 1.12 },
    notes: ['Bosses only — the opponent class is not a field of the block.'],
  },
  {
    id: 'blood_price',
    name: 'Blood Price',
    description: 'Deal 8% more damage while you are below 40% health.',
    source: 'rank',
    sourceDetail: 'Reach Veteran rank',
    hookStages: ['damage'],
    effect: { damageDealtMult: 1.08 },
    notes: ['Only while below 40% HP — a health threshold the block cannot express.'],
  },
  {
    id: 'iron_lungs',
    name: 'Iron Lungs',
    description: 'Increase maximum stamina by 12 and stamina regeneration by 2.',
    source: 'doctore-training',
    sourceDetail: 'Doctore training, 250g',
    price: 250,
    hookStages: ['stat'],
    effect: { staminaMaxAdd: 12, staminaRegenAdd: 2 },
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    description: 'Rest restores 15 extra stamina (40 -> 55).',
    source: 'doctore-training',
    sourceDetail: 'Doctore training, 300g',
    price: 300,
    hookStages: ['event'],
    effect: { restStaminaAdd: 15 },
  },
  {
    id: 'sand_sprinter',
    name: 'Sand Sprinter',
    description: 'Gain 1 effective agility in hit-chance calculations only.',
    source: 'fights-won',
    sourceDetail: 'Win 10 fights',
    hookStages: ['hit'],
    effect: { hitAgiAdd: 1 },
  },
  {
    id: 'heavy_hand',
    name: 'Heavy Hand',
    description: 'Power attacks cost 10% less stamina but deal 5% less damage.',
    source: 'rank',
    sourceDetail: 'Reach Champion rank',
    hookStages: ['weapon', 'damage'],
    effect: { staminaCostMult: 0.9, damageDealtMult: 0.95 },
    notes: ['Power attacks only — the block carries one flat pair of multipliers.'],
  },
  {
    id: 'first_palm_of_the_crowd',
    name: 'First Palm of the Crowd',
    description: 'Taunts and critical hits grant 4 extra crowd hype.',
    source: 'crowd-hype',
    sourceDetail: 'Peak crowd hype 50',
    hookStages: ['event'],
    effect: { hypeAdd: 4 },
    notes: ['Taunts and crits only — an event filter, not a field of the block.'],
  },
  {
    id: 'phoenix_nerves',
    name: 'Phoenix Nerves',
    description: 'Once per fight, a miss does not reset your combo.',
    source: 'crowd-hype',
    sourceDetail: 'Peak crowd hype 85',
    hookStages: ['event'],
    effect: { comboShield: true },
  },
  {
    id: 'golden_laurel',
    name: 'Golden Laurel',
    description: 'Gain 10% more gold and fame from victories, but 5% less experience.',
    source: 'rank',
    sourceDetail: 'Reach Legend rank',
    hookStages: ['reward'],
    effect: { goldMult: 1.1, fameMult: 1.1, xpMult: 0.95 },
  },

  // ── boss-only (4) — never in the player pool ────────────────────────────
  {
    id: 'colossus_hide',
    name: 'Colossus Hide',
    description: 'Take 8% less damage from quick attacks.',
    source: 'boss-drop',
    sourceDetail: 'Aurelius',
    hookStages: ['damage'],
    bossOnly: true,
    effect: { damageTakenMult: 0.92 },
    notes: ['Quick attacks only — an attack-type filter, not a field of the block.'],
  },
  {
    id: 'vipers_patience',
    name: "Viper's Patience",
    description: 'After her counter triggers, her next attack deals 20% more damage.',
    source: 'boss-drop',
    sourceDetail: 'Valéria',
    hookStages: ['damage'],
    bossOnly: true,
    effect: { damageDealtMult: 1.2 },
    notes: ['Only the attack following a triggered counter — a state condition the block cannot express.'],
  },
  {
    id: 'pyre_brand',
    name: 'Pyre Brand',
    description: 'On a phase switch, heal 10% of maximum health, once.',
    source: 'boss-drop',
    sourceDetail: 'Ignis',
    hookStages: ['event'],
    bossOnly: true,
    effect: {},
    notes: [
      'Heals 10% of max HP on a phase switch, once per fight. Neither healing nor the phase event is expressible as a block field.',
    ],
  },
  {
    id: 'pit_bellower',
    name: 'Pit Bellower',
    description: "His telegraph turn also drains 8 of the player's stamina.",
    source: 'boss-drop',
    sourceDetail: 'Goliath',
    hookStages: ['event'],
    bossOnly: true,
    effect: {},
    notes: [
      'Drains 8 player stamina on his telegraph turn. A stamina drain has no field in the block shape.',
    ],
  },
];

/** The twelve palmae the player can earn — every row that is not boss-only. */
export const PALMAE_PLAYER_POOL: Palma[] = PALMAE.filter((palma) => palma.bossOnly !== true);

/** The four palmae only a boss carries. */
export const PALMAE_BOSS_ONLY: Palma[] = PALMAE.filter((palma) => palma.bossOnly === true);

const PALMA_BY_ID: ReadonlyMap<string, Palma> = new Map(PALMAE.map((palma) => [palma.id, palma]));

/** Look a palma up by id.  Anything unknown resolves to `undefined`. */
export function getPalma(id: unknown): Palma | undefined {
  return typeof id === 'string' ? PALMA_BY_ID.get(id) : undefined;
}
