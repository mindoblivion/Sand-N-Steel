import type { TraitModifierBlock } from '../utils/traitModifiers';

/**
 * ===========================================================================
 * CH-1 — THE PALMAE (victory palms)
 * ===========================================================================
 * A palma is a victory palm: a trait a gladiator earns and equips (up to
 * three).  It is NOT a Laurel — `laurels` is the separate Triumphs record.
 *
 * Twenty-six rows, as data and nothing else: seventeen the player can earn (the
 * twelve of CH-1 plus D-1's five Feature Bout drops), nine the bosses alone
 * carry (CH-1's four plus D-1's five).  Each row states where it comes from and at which hook
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

  // ── D-1 — the five Feature Bout drops (boss-rosters.md Part A) ───────────
  // Appended to the pool; every row above is byte-identical. Each effect is
  // BLOCK DATA ONLY (design §2.4's stages). Where the design's condition cannot
  // be expressed by the block — a sequence ("first attack after a block"), an
  // attack type ("a power attack"), a defender stance ("against a blocker"), an
  // opponent class ("over bosses") — the magnitude still lands in the shape and
  // the condition is stated in `notes`, with the hook FLAGGED in D-1's report.
  // No plumbing was invented in this slice. `sourceDetail` names the boss whose
  // first defeat drops the palm (the deed `utils/palmaeState.ts` already reads).
  {
    id: 'hunters_patience',
    name: "Hunter's Patience",
    description: 'Deal 10% more damage on your first attack after a successful block.',
    source: 'boss-drop',
    sourceDetail: 'Marcellin',
    hookStages: ['damage'],
    effect: { damageDealtMult: 1.1 },
    notes: [
      'Only the first attack after a successful block — a sequence condition the block cannot express (D-1 hook flagged: the rider needs a post-block counter).',
    ],
  },
  {
    id: 'wards_breath',
    name: "Ward's Breath",
    description: 'Blocking a power attack restores 4 extra stamina.',
    source: 'boss-drop',
    sourceDetail: 'Varro',
    hookStages: ['event'],
    effect: { onBlockStamina: 4 },
    notes: [
      'Only when the blocked attack was a POWER attack — an attack-type filter the block cannot express (D-1 hook flagged: the on-block stage must read the attack type).',
    ],
  },
  {
    id: 'shieldbreaker',
    name: 'Shieldbreaker',
    description: 'Deal 12% more damage against a blocking defender.',
    source: 'boss-drop',
    sourceDetail: 'Gnaeus',
    hookStages: ['damage'],
    effect: { damageDealtMult: 1.12 },
    notes: [
      'Only against a defender who is blocking — a defender-stance condition the block cannot express (D-1 hook flagged: the damage stage must read the defender state).',
    ],
  },
  {
    id: 'the_open_flank',
    name: 'The Open Flank',
    description: 'Your first power attack after a successful dodge gains 20% critical chance.',
    source: 'boss-drop',
    sourceDetail: 'Lucius',
    hookStages: ['hit'],
    effect: { critChanceAdd: 0.2 },
    notes: [
      'Only the first POWER attack after a successful dodge — a sequence and attack-type condition the block cannot express (D-1 hook flagged). The 0.60 crit cap still applies.',
    ],
  },
  {
    id: 'undying_name',
    name: 'Undying Name',
    description: 'Gain 12% more fame from victories over bosses.',
    source: 'boss-drop',
    sourceDetail: 'Hermas',
    hookStages: ['reward'],
    effect: { fameMult: 1.12 },
    notes: [
      'Only victories over BOSSES — the opponent class is not a field of the block (D-1 hook flagged: the reward stage must read the opponent).',
    ],
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

  // ── D-1 — the five Feature Bout CARRIED palms (boss-rosters.md Part A) ───
  // Boss-only, one carrier each, never offered to the player. Their effects are
  // EMPTY blocks on purpose: each magnitude is conditioned on a mechanic that
  // does not exist in the tree yet (`beast_hunt`, `false_telegraph`,
  // `unbroken_panoply`, `yoked_brothers`, `the_long_memory`), so wiring the block
  // would grant it unconditionally — a combat change this slice forbids. The
  // magnitude and its condition live in `notes` and land at the boss's own
  // mechanic site in its D-slice.
  {
    id: 'blood_scent',
    name: 'Blood-Scent',
    description: "After the beast wounds the player, the master's next attack deals 20% more.",
    source: 'boss-drop',
    sourceDetail: 'Marcellin',
    hookStages: ['damage'],
    bossOnly: true,
    effect: {},
    notes: [
      "A next-attack rider (+20%, expiring unused after that attack) conditioned on the beast's wound — no field in the block expresses it. Lands with `beast_hunt`.",
    ],
  },
  {
    id: 'two_faces',
    name: 'Two Faces',
    description: 'After a feint, his next true heavy attack deals 15% more.',
    source: 'boss-drop',
    sourceDetail: 'Varro',
    hookStages: ['damage'],
    bossOnly: true,
    effect: {},
    notes: [
      'Conditional on a feint having just been thrown — a state condition the block cannot express. Lands with `false_telegraph`.',
    ],
  },
  {
    id: 'vainheart',
    name: 'Vainheart',
    description: 'When a pride piece breaks, his next two attacks deal 12% more.',
    source: 'boss-drop',
    sourceDetail: 'Gnaeus',
    hookStages: ['damage'],
    bossOnly: true,
    effect: {},
    notes: [
      'A two-attack rider fired by a pride piece breaking — a counted state condition the block cannot express. Lands with `unbroken_panoply`.',
    ],
  },
  {
    id: 'survivors_oath',
    name: "Survivor's Oath",
    description: 'When one brother falls, the survivor swears an oath — it fires once.',
    source: 'boss-drop',
    sourceDetail: 'Lucius',
    hookStages: ['event'],
    bossOnly: true,
    effect: {},
    notes: [
      'Fires once, on the pair losing a brother — an event and a once-per-fight flag, neither of them a block field. Lands with `yoked_brothers`.',
    ],
  },
  {
    id: 'old_craft',
    name: 'Old Craft',
    description: 'Each adaptation he adopts also grants +5% block chance, once per adoption.',
    source: 'boss-drop',
    sourceDetail: 'Hermas',
    hookStages: ['event'],
    bossOnly: true,
    effect: {},
    notes: [
      'A per-adoption permanent bonus (+0.05 blockChance each time) — a stacking event the block cannot express. Lands with `the_long_memory`.',
    ],
  },
];

/** The seventeen palmae the player can earn — every row that is not boss-only. */
export const PALMAE_PLAYER_POOL: Palma[] = PALMAE.filter((palma) => palma.bossOnly !== true);

/** The nine palmae only a boss carries. */
export const PALMAE_BOSS_ONLY: Palma[] = PALMAE.filter((palma) => palma.bossOnly === true);

const PALMA_BY_ID: ReadonlyMap<string, Palma> = new Map(PALMAE.map((palma) => [palma.id, palma]));

/** Look a palma up by id.  Anything unknown resolves to `undefined`. */
export function getPalma(id: unknown): Palma | undefined {
  return typeof id === 'string' ? PALMA_BY_ID.get(id) : undefined;
}
