import type { ArmaturaId } from '../types/game';
import type { TraitModifierBlock } from '../utils/traitModifiers';

/**
 * ===========================================================================
 * CH-1 — THE ARMATURAE (gladiator classes)
 * ===========================================================================
 * The seven fighting classes, as data.  Each row carries the class's stat
 * template (the shape `PlayerProfile.baseStats` already has), its signature
 * technique (the doctrina), the item ids its kit starts with, and the id of the
 * Forge kit of the same name.
 *
 * DATA ONLY in this slice: nothing here is read by combat, by a screen or by
 * `createNewProfile()`.  The rows are the single source of truth a later slice
 * reads when a class is chosen and when the class's doctrina is applied.
 *
 * Two rules the rows keep:
 *   • every item id is a real `src/data/itemsDB.ts` id — verified by the suite,
 *     so a renamed or removed item fails a test rather than a build;
 *   • a doctrina's effect is split honestly: the part a `TraitModifierBlock` can
 *     express goes in `doctrina.modifiers`, and every condition, stateful flag
 *     or unhooked magnitude the block shape cannot hold is named in
 *     `doctrina.notes`.  No new formula hook is invented here.
 */

/** A class's stat template — the four numbers `PlayerProfile.baseStats` holds. */
export interface ArmaturaStats {
  strength: number;
  agility: number;
  stamina: number;
  defense: number;
}

/** The class's signature technique: always on, no cost. */
export interface Doctrina {
  /** Stable id, snake_case (`fish_scale_wall`). */
  id: string;
  name: string;
  /** One line, player-facing. */
  text: string;
  /**
   * The effect in the shared modifier shape, for the call site that will apply
   * it.  An empty block is the identity — the technique is real, it simply has
   * no part the block can express (see `notes`).
   */
  modifiers: TraitModifierBlock;
  /** What the block shape cannot express — conditions, state, extra hooks. */
  notes: string[];
}

export interface Armatura {
  id: ArmaturaId;
  name: string;
  /** One-line fantasy, exactly as the design states it. */
  fantasy: string;
  stats: ArmaturaStats;
  doctrina: Doctrina;
  /** The kit's primary weapon — the item equipped at the start. */
  startingWeaponId: string;
  /** Extra kit weapons carried in the inventory (empty for most classes). */
  startingInventoryIds: string[];
  /** The Forge kit of the same name (`kit_murmillo` …), a reference only. */
  forgeKit: string;
}

/**
 * The seven classes.  Order is presentation order: the design's own list.
 */
export const ARMATURAE: Armatura[] = [
  {
    id: 'murmillo',
    name: 'Murmillo',
    fantasy: 'The wall that walks.',
    stats: { strength: 12, agility: 8, stamina: 10, defense: 6 },
    doctrina: {
      id: 'fish_scale_wall',
      name: 'Fish-Scale Wall',
      text: 'Whenever you block an attack, you recover 6 stamina.',
      modifiers: { onBlockStamina: 6 },
      notes: [],
    },
    startingWeaponId: 'gladius_standard',
    startingInventoryIds: [],
    forgeKit: 'kit_murmillo',
  },
  {
    id: 'retiarius',
    name: 'Retiarius',
    fantasy: 'Kill from three meters, or not at all.',
    stats: { strength: 9, agility: 13, stamina: 11, defense: 1 },
    doctrina: {
      id: 'cast_the_net',
      name: 'Cast the Net',
      text: 'Once per fight, throw the net to entangle your opponent.',
      modifiers: {},
      notes: [
        'Stateful: once per fight. The net applies an entangle status the block shape cannot express.',
      ],
    },
    // The trident is EQUIPPED; the gladius is the spare carried in the inventory.
    startingWeaponId: 'trident_retarius',
    startingInventoryIds: ['gladius_standard'],
    forgeKit: 'kit_retiarius',
  },
  {
    id: 'secutor',
    name: 'Secutor',
    fantasy: 'Built to hunt the fisherman.',
    stats: { strength: 11, agility: 9, stamina: 11, defense: 5 },
    doctrina: {
      id: 'snag_proof_pursuit',
      name: 'Snag-Proof Pursuit',
      text: 'You are immune to Entangle, and your power attacks cost 15% less stamina.',
      modifiers: { staminaCostMult: 0.85 },
      notes: [
        'Power attacks only — the multiplier is read at the power-attack call site.',
        'Immune to Entangle: entangle immunity is not a field of the block shape.',
      ],
    },
    startingWeaponId: 'gladius_standard',
    startingInventoryIds: [],
    forgeKit: 'kit_secutor',
  },
  {
    id: 'thraex',
    name: 'Thraex',
    fantasy: "The curved blade asks questions shields can't answer.",
    stats: { strength: 10, agility: 12, stamina: 10, defense: 3 },
    doctrina: {
      id: 'hook_the_rim',
      name: 'Hook the Rim',
      text: 'Your attacks against a blocking defender penetrate 40% of their block.',
      modifiers: {},
      notes: [
        'blockPenetration 0.40 — not a TraitModifierBlock field; the call site reads the magnitude from this row.',
      ],
    },
    startingWeaponId: 'shamshir_curved',
    startingInventoryIds: [],
    forgeKit: 'kit_thraex',
  },
  {
    id: 'hoplomachus',
    name: 'Hoplomachus',
    fantasy: 'A spear wall of one.',
    stats: { strength: 11, agility: 9, stamina: 10, defense: 5 },
    doctrina: {
      id: 'spearmans_ground',
      name: "Spearman's Ground",
      text: 'Your damage scales with the distance band you strike from.',
      modifiers: {},
      notes: [
        "Conditional damageDealtMult by distance band — a block carries one flat multiplier, so the band table belongs to the call site.",
      ],
    },
    startingWeaponId: 'hoplite_spear',
    startingInventoryIds: [],
    forgeKit: 'kit_hoplomachus',
  },
  {
    id: 'dimachaerus',
    name: 'Dimachaerus',
    fantasy: 'Two blades, no shield, no brakes.',
    stats: { strength: 10, agility: 13, stamina: 10, defense: 2 },
    doctrina: {
      id: 'twin_fangs',
      name: 'Twin Fangs',
      text: 'Your quick attacks strike twice.',
      modifiers: {},
      notes: [
        'Stateful: the second strike is resolved at the attack call site; a block cannot express a repeated hit.',
      ],
    },
    // Two dual_blades-family items: one equipped, one carried.
    startingWeaponId: 'dual_sicae_daggers',
    startingInventoryIds: ['dagger_pugio'],
    forgeKit: 'kit_dimachaerus',
  },
  {
    id: 'provocator',
    name: 'Provocator',
    fantasy: "The legion's duelist, trained against his own mirror.",
    stats: { strength: 11, agility: 10, stamina: 10, defense: 5 },
    doctrina: {
      id: 'mirror_drill',
      name: 'Mirror Drill',
      text: 'After the first hit of each attack type, you take 8% less damage from that type.',
      modifiers: { damageTakenMult: 0.92 },
      notes: [
        'Per attack type, after its first hit — the block carries one flat multiplier and no per-type ledger.',
      ],
    },
    startingWeaponId: 'gladius_standard',
    startingInventoryIds: [],
    forgeKit: 'kit_provocator',
  },
];

/** Every class id, in catalogue order. */
export const ARMATURA_IDS: ArmaturaId[] = ARMATURAE.map((armatura) => armatura.id);

/** The class a save with no class of its own resolves to. */
export const DEFAULT_ARMATURA_ID: ArmaturaId = 'murmillo';

const ARMATURA_BY_ID: ReadonlyMap<string, Armatura> = new Map(
  ARMATURAE.map((armatura) => [armatura.id, armatura])
);

/** Look a class up by id.  Anything unknown resolves to `undefined`. */
export function getArmatura(id: unknown): Armatura | undefined {
  return typeof id === 'string' ? ARMATURA_BY_ID.get(id) : undefined;
}

/** Narrow an unknown value to a class id. */
export function isArmaturaId(value: unknown): value is ArmaturaId {
  return typeof value === 'string' && ARMATURA_BY_ID.has(value);
}
