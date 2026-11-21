/**
 * THE GLADIATOR'S FATE — authored level-up card catalogue.
 *
 * Cards are earned only through ordinary XP progression. They are not purchased,
 * wagered on, or sold. Effects are data contracts; combat/economy consumers are
 * wired in the integration slice.
 */
export type FateCardCategory =
  | 'combat'
  | 'mobility'
  | 'survival'
  | 'wealth'
  | 'fame'
  | 'mastery';

export type FateCardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type FateCardEffect =
  | { kind: 'damage_pct'; value: number }
  | { kind: 'movement_speed_pct'; value: number }
  | { kind: 'attack_recovery_pct'; value: number }
  | { kind: 'stamina_cost_pct'; value: number }
  | { kind: 'stamina_max_flat'; value: number }
  | { kind: 'dodge_distance_pct'; value: number }
  | { kind: 'damage_taken_pct'; value: number }
  | { kind: 'stamina_recovery_pct'; value: number }
  | { kind: 'gold_flat'; value: number }
  | { kind: 'gold_reward_pct'; value: number }
  | { kind: 'fame_reward_pct'; value: number }
  | { kind: 'crowd_hype_pct'; value: number }
  | { kind: 'conditional_damage_pct'; condition: 'enemy_below_25_percent' | 'player_below_30_percent' | 'after_successful_dodge' | 'after_opponent_misses'; value: number }
  | { kind: 'weapon_mastery_pct'; weapon: 'sword_shield' | 'spear' | 'dual_blades' | 'mace'; value: number }
  | { kind: 'unlock_technique'; techniqueId: string }
  | { kind: 'once_per_bout_survival' };

export interface FateCard {
  id: string;
  name: string;
  category: FateCardCategory;
  rarity: FateCardRarity;
  tagline: string;
  description: string;
  effect: FateCardEffect;
  unlockLevel: number;
  maxStacks: number;
}

export const FATE_CARDS: readonly FateCard[] = [
  { id: 'fleet_footed', name: 'Fleet Footed', category: 'mobility', rarity: 'common', tagline: 'The sand barely knows your step.', description: 'Movement speed increased by 4%.', effect: { kind: 'movement_speed_pct', value: 0.04 }, unlockLevel: 2, maxStacks: 3 },
  { id: 'brutal_force', name: 'Brutal Force', category: 'combat', rarity: 'common', tagline: 'Make every opening count.', description: 'Deal 3% more melee damage.', effect: { kind: 'damage_pct', value: 0.03 }, unlockLevel: 2, maxStacks: 4 },
  { id: 'iron_lungs', name: 'Iron Lungs', category: 'survival', rarity: 'common', tagline: 'The fight is not over until you stop.', description: 'Maximum stamina increased by 6.', effect: { kind: 'stamina_max_flat', value: 6 }, unlockLevel: 2, maxStacks: 3 },
  { id: 'quick_recovery', name: 'Quick Recovery', category: 'mobility', rarity: 'uncommon', tagline: 'Return to the fight before they can.', description: 'Recover from attacks 4% faster.', effect: { kind: 'attack_recovery_pct', value: 0.04 }, unlockLevel: 3, maxStacks: 3 },
  { id: 'shield_savant', name: 'Shield Savant', category: 'survival', rarity: 'uncommon', tagline: 'A good defence is a weapon.', description: 'Reduce incoming damage by 2%.', effect: { kind: 'damage_taken_pct', value: -0.02 }, unlockLevel: 3, maxStacks: 3 },
  { id: 'arena_runner', name: 'Arena Runner', category: 'mobility', rarity: 'uncommon', tagline: 'Spend less strength crossing the sand.', description: 'Movement stamina costs reduced by 8%.', effect: { kind: 'stamina_cost_pct', value: -0.08 }, unlockLevel: 3, maxStacks: 2 },
  { id: 'crowd_favourite', name: 'Crowd Favourite', category: 'fame', rarity: 'common', tagline: 'The people remember your name.', description: 'Earn 5% more fame from victories.', effect: { kind: 'fame_reward_pct', value: 0.05 }, unlockLevel: 2, maxStacks: 3 },
  { id: 'fortunes_favour', name: "Fortune's Favour", category: 'wealth', rarity: 'common', tagline: 'A little gold changes a hard day.', description: 'Receive 50 gold immediately.', effect: { kind: 'gold_flat', value: 50 }, unlockLevel: 2, maxStacks: 1 },
  { id: 'blood_money', name: 'Blood Money', category: 'wealth', rarity: 'uncommon', tagline: 'A stronger rival, a richer purse.', description: 'Earn 6% more gold from arena victories.', effect: { kind: 'gold_reward_pct', value: 0.06 }, unlockLevel: 4, maxStacks: 3 },
  { id: 'showman', name: 'Showman', category: 'fame', rarity: 'uncommon', tagline: 'Give the crowd a moment worth retelling.', description: 'Crowd hype gained from combat actions increased by 8%.', effect: { kind: 'crowd_hype_pct', value: 0.08 }, unlockLevel: 4, maxStacks: 2 },
  { id: 'deep_wounds', name: 'Deep Wounds', category: 'combat', rarity: 'uncommon', tagline: 'A wound can decide the next exchange.', description: 'Bleeding effects you inflict last 1 additional turn.', effect: { kind: 'unlock_technique', techniqueId: 'deep_wounds' }, unlockLevel: 4, maxStacks: 1 },
  { id: 'opening_strike', name: 'Opening Strike', category: 'combat', rarity: 'rare', tagline: 'Punish a careless opponent.', description: 'Deal 8% more damage to an opponent immediately after they miss.', effect: { kind: 'conditional_damage_pct', condition: 'after_opponent_misses', value: 0.08 }, unlockLevel: 5, maxStacks: 2 },
  { id: 'evasive_instinct', name: 'Evasive Instinct', category: 'mobility', rarity: 'rare', tagline: 'Be somewhere else when the blade arrives.', description: 'Dodge distance increased by 8%.', effect: { kind: 'dodge_distance_pct', value: 0.08 }, unlockLevel: 5, maxStacks: 2 },
  { id: 'second_wind', name: 'Second Wind', category: 'survival', rarity: 'rare', tagline: 'Find strength when the lungs burn.', description: 'Stamina recovery increased by 8%.', effect: { kind: 'stamina_recovery_pct', value: 0.08 }, unlockLevel: 5, maxStacks: 2 },
  { id: 'gladius_doctrine', name: 'Gladius Doctrine', category: 'mastery', rarity: 'uncommon', tagline: 'Short steel. Perfect timing.', description: 'Deal 5% more damage with sword-and-shield weapons.', effect: { kind: 'weapon_mastery_pct', weapon: 'sword_shield', value: 0.05 }, unlockLevel: 3, maxStacks: 3 },
  { id: 'spear_dancer', name: 'Spear Dancer', category: 'mastery', rarity: 'uncommon', tagline: 'Own the distance between you.', description: 'Deal 5% more damage with spears.', effect: { kind: 'weapon_mastery_pct', weapon: 'spear', value: 0.05 }, unlockLevel: 3, maxStacks: 3 },
  { id: 'twin_blade_flow', name: 'Twin Blade Flow', category: 'mastery', rarity: 'rare', tagline: 'Two blades, one unbroken rhythm.', description: 'Deal 5% more damage with dual blades.', effect: { kind: 'weapon_mastery_pct', weapon: 'dual_blades', value: 0.05 }, unlockLevel: 5, maxStacks: 3 },
  { id: 'executioner', name: 'Executioner', category: 'combat', rarity: 'epic', tagline: 'End the bout when the moment comes.', description: 'Deal 12% more damage to opponents below 25% health.', effect: { kind: 'conditional_damage_pct', condition: 'enemy_below_25_percent', value: 0.12 }, unlockLevel: 8, maxStacks: 1 },
  { id: 'adrenaline_surge', name: 'Adrenaline Surge', category: 'mobility', rarity: 'epic', tagline: 'Turn a clean escape into an attack.', description: 'After a successful dodge, your next attack deals 10% more damage.', effect: { kind: 'conditional_damage_pct', condition: 'after_successful_dodge', value: 0.10 }, unlockLevel: 8, maxStacks: 1 },
  { id: 'blood_of_the_colossus', name: 'Blood of the Colossus', category: 'survival', rarity: 'epic', tagline: 'The closer to defeat, the harder you strike.', description: 'Below 30% health, deal 10% more damage.', effect: { kind: 'conditional_damage_pct', condition: 'player_below_30_percent', value: 0.10 }, unlockLevel: 10, maxStacks: 1 },
  { id: 'death_defier', name: 'Death Defier', category: 'survival', rarity: 'legendary', tagline: 'The sand will not claim you today.', description: 'Once per arena bout, survive an otherwise fatal blow with a sliver of health.', effect: { kind: 'once_per_bout_survival' }, unlockLevel: 15, maxStacks: 1 },
  { id: 'master_of_arms', name: 'Master of Arms', category: 'mastery', rarity: 'legendary', tagline: 'Every weapon has a language. You speak them all.', description: 'Deal 3% more damage with every weapon type.', effect: { kind: 'damage_pct', value: 0.03 }, unlockLevel: 15, maxStacks: 1 },
] as const;

export function getFateCard(id: string): FateCard | undefined {
  return FATE_CARDS.find((card) => card.id === id);
}
