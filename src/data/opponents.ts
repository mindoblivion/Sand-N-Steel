import { OpponentConfig } from '../types/game';

/**
 * D-1 — is this opponent a boss OF THE TIER LADDER?
 *
 * A Feature Bout is a boss (`isBoss`) but not a rung: it is fought outside the
 * tier ladder, so it must never advance `currentTier`, never add a `bossKills`
 * stripe and never satisfy a rank or campaign gate that means "the ladder's
 * champion of tier N fell". Every ladder consumer asks this predicate rather
 * than `isBoss` alone:
 *
 *   • `resolveVictoryTier` / `resolveDoorDuelTarget`  — `utils/tierAdvancement.ts`
 *   • `nextBossKills`                                — `utils/bossKills.ts`
 *   • `deriveRank`'s tier-4 condition                — `utils/rank.ts`
 *
 * The predicate is total: a missing opponent, or one with neither flag, is not
 * a ladder boss.
 */
export function isLadderBoss(
  opponent: Pick<OpponentConfig, 'isBoss' | 'featureBout'> | null | undefined
): boolean {
  return opponent?.isBoss === true && opponent.featureBout !== true;
}

export const TOURNAMENT_TIERS = [
  {
    tier: 1,
    name: 'Village Sand Trenches',
    subtitle: 'Outskirts Slave Pit',
    description: 'Crude dirt arena where rookie fighters battle for copper and scraps of bread.',
    minLevel: 1,
  },
  {
    tier: 2,
    name: 'Metropolis Arena of Nineveh',
    subtitle: 'Provincial Championships',
    description: 'Surrounded by monumental stone archways and roaring merchants.',
    minLevel: 3,
  },
  {
    tier: 3,
    name: 'Imperial Grand Amphitheater',
    subtitle: 'Regional Coliseum',
    description: 'Grand marble arena with elite praetorian guards and high stakes.',
    minLevel: 6,
  },
  {
    tier: 4,
    name: 'The Pantheon Colosseum of Rome',
    subtitle: 'Emperor Grand Tournament',
    description: 'The pinnacle of mortal combat. The winner earns freedom and immortality.',
    minLevel: 9,
  },
];

/**
 * STORY-2 — the Doctore's yard champion: the ONE opponent the Doctore's Test is
 * fought against.
 *
 * He is deliberately **not** in `ALL_OPPONENTS` and not on the ladder:
 *   • `TOURNAMENT_TIERS` / `TournamentTab` list the tier ladder only, and he is not
 *     one of its rungs — `fightIndex: 0` marks that ("no rung");
 *   • `tierAdvancement` advances on a tier BOSS's first defeat and `bossKills` /
 *     the banner's stripes read `isBoss`, so a non-boss outside the roster cannot
 *     move a tier, a kill count or a stripe;
 *   • his win still records his id in `defeatedOpponentIds` (the ordinary victory
 *     write does that for every opponent), which is exactly the evidence the
 *     campaign's `doctore-test` gate needs.
 *
 * Tier-1 band stats: a veteran who is a step above the Tier 1 named fighters
 * (Flaccus 10/12, 90 stamina, 105 HP) and well below the Tier 1 boss (Goliath
 * 16/7, 120 stamina, 170 HP). He is the yard's measure, not a champion.
 */
export const DOCTORE_TEST_OPPONENT: OpponentConfig = {
  id: 'opp_doctore_sextus',
  name: 'Sextus the Yard Measure',
  title: 'Veteran of the Ludus (the Doctore’s Test)',
  tier: 1,
  fightIndex: 0,
  difficulty: 'veteran',
  weaponType: 'sword_shield',
  personality: 'Defensive',
  recommendedLevel: 2,
  stats: {
    strength: 12,
    agility: 10,
    staminaMax: 95,
    staminaRegen: 16,
    defense: 5,
    healthMax: 120,
  },
  skinColor: '#b07d62',
  hairColor: '#3f2d1d',
  tunicColor: '#3f3f46',
  armorColor: '#a8a29e',
  aggression: 0.45,
  blockChance: 0.5,
  dodgeChance: 0.2,
  rewardGold: 45,
  rewardFame: 12,
  rewardXp: 60,
  clothingStyle: 'gladiator_sash',
};

export const ALL_OPPONENTS: OpponentConfig[] = [
  // TIER 1
  {
    id: 'opp_marcus',
    name: 'Marcus the Rookie',
    title: 'Recruit of the Ludus',
    tier: 1,
    fightIndex: 1,
    difficulty: 'rookie',
    weaponType: 'sword_shield',
    personality: 'Aggressive',
    armatura: 'murmillo',
    recommendedLevel: 1,
    stats: {
      strength: 8,
      agility: 8,
      staminaMax: 80,
      staminaRegen: 14,
      defense: 2,
      healthMax: 90,
    },
    skinColor: '#d4a373',
    hairColor: '#4a2c11',
    tunicColor: '#854d0e',
    armorColor: '#a16207',
    aggression: 0.5,
    blockChance: 0.25,
    dodgeChance: 0.15,
    rewardGold: 35,
    rewardFame: 10,
    rewardXp: 40,
    clothingStyle: 'gladiator_sash',
  },
  {
    id: 'opp_flaccus',
    name: 'Flaccus the Nimble',
    title: 'Thracian Skirmisher',
    tier: 1,
    fightIndex: 2,
    difficulty: 'rookie',
    weaponType: 'dual_blades',
    personality: 'Tricky',
    armatura: 'thraex',
    palmae: ['sand_sprinter'],
    recommendedLevel: 2,
    stats: {
      strength: 10,
      agility: 12,
      staminaMax: 90,
      staminaRegen: 18,
      defense: 3,
      healthMax: 105,
    },
    skinColor: '#c68b59',
    hairColor: '#1c1917',
    tunicColor: '#1e3a8a',
    armorColor: '#3b82f6',
    aggression: 0.6,
    blockChance: 0.2,
    dodgeChance: 0.45,
    rewardGold: 50,
    rewardFame: 15,
    rewardXp: 60,
    clothingStyle: 'roman_tunic',
  },
  {
    id: 'opp_goliath_boss',
    name: 'Goliath the Pit Behemoth',
    title: 'Champion of the Sand Trenches (BOSS)',
    tier: 1,
    fightIndex: 3,
    isBoss: true,
    difficulty: 'veteran',
    weaponType: 'mace',
    personality: 'Berserker',
    armatura: 'provocator',
    palmae: ['pit_bellower'],
    recommendedLevel: 3,
    stats: {
      strength: 16,
      agility: 7,
      staminaMax: 120,
      staminaRegen: 16,
      defense: 6,
      healthMax: 170,
    },
    skinColor: '#8d5b4c',
    hairColor: '#0f172a',
    tunicColor: '#7f1d1d',
    armorColor: '#991b1b',
    aggression: 0.75,
    blockChance: 0.35,
    dodgeChance: 0.1,
    rewardGold: 120,
    rewardFame: 35,
    rewardXp: 120,
    meshScale: 1.15,
    bossMechanic: 'heavy_telegraph',
    characterModel: 'roman_warrior',
  },

  // TIER 2
  {
    id: 'opp_hoplite',
    name: 'Cassius the Phalanx',
    title: 'Veteran Spearman',
    tier: 2,
    fightIndex: 1,
    difficulty: 'veteran',
    weaponType: 'spear',
    personality: 'Defensive',
    armatura: 'hoplomachus',
    palmae: ['shieldwall_discipline'],
    recommendedLevel: 3,
    stats: {
      strength: 13,
      agility: 11,
      staminaMax: 100,
      staminaRegen: 18,
      defense: 7,
      healthMax: 135,
    },
    skinColor: '#b07d62',
    hairColor: '#713f12',
    tunicColor: '#065f46',
    armorColor: '#059669',
    aggression: 0.45,
    blockChance: 0.65,
    dodgeChance: 0.25,
    rewardGold: 90,
    rewardFame: 25,
    rewardXp: 95,
  },
  // CH-4 — new rivals, appended within their tier so the roster stays tier-then-
  // rung ordered (the order `intelTargets` and `PRIMUS_PALUS_LADDER` read).
  // Tier 2 ladder: Cassius (1), Brutus (2), Naija (3), Ignis (4).
  {
    id: 'opp_brutus_anvil',
    name: 'Brutus "The Anvil"',
    title: 'Provocator of the Nineveh Sands',
    tier: 2,
    fightIndex: 2,
    difficulty: 'veteran',
    weaponType: 'sword_shield',
    personality: 'Defensive',
    // CH-4 — the provocator doctrina IS his identity: Mirror Drill (the first hit
    // of each attack type at full damage, later ones 8% softer) arrives from his
    // class, so no separate mechanic is declared.
    armatura: 'provocator',
    recommendedLevel: 3,
    stats: {
      strength: 14,
      agility: 12,
      staminaMax: 108,
      staminaRegen: 19,
      defense: 8,
      healthMax: 160,
    },
    skinColor: '#8d5b4c',
    hairColor: '#3f2d1d',
    tunicColor: '#1e293b',
    armorColor: '#94a3b8',
    aggression: 0.5,
    blockChance: 0.7,
    dodgeChance: 0.2,
    rewardGold: 125,
    rewardFame: 35,
    rewardXp: 120,
    clothingStyle: 'gladiator_sash',
  },
  {
    id: 'opp_naija_fisher',
    name: 'Naija the Fisher',
    title: 'Net-Fighter of the River Docks',
    tier: 2,
    fightIndex: 3,
    difficulty: 'veteran',
    // The trident is the spear family's weapon; `getWeaponByType('spear')`
    // resolves it, exactly as it does for Cassius and Valéria.
    weaponType: 'spear',
    personality: 'Tricky',
    // CH-4 — the retiarius class carries the one-shot net (CH-3b's cast_net).
    armatura: 'retiarius',
    recommendedLevel: 4,
    stats: {
      strength: 15,
      agility: 16,
      staminaMax: 120,
      staminaRegen: 21,
      defense: 7,
      healthMax: 180,
    },
    skinColor: '#6b4423',
    hairColor: '#0f172a',
    tunicColor: '#0e7490',
    armorColor: '#22d3ee',
    aggression: 0.7,
    blockChance: 0.4,
    dodgeChance: 0.6,
    rewardGold: 165,
    rewardFame: 50,
    rewardXp: 160,
    clothingStyle: 'gladiator_sash',
  },
  {
    id: 'opp_ignis_boss',
    name: 'Ignis the Pyre Champion',
    title: 'Nineveh Arena Master (BOSS)',
    tier: 2,
    // CH-4 Director ruling — the ladder is the design's intent and tier
    // advancement keys on boss IDENTITY (`isBoss` + `defeatedOpponentIds`), so
    // `fightIndex` is ordering/display only and moves 2 → 4 to seat Brutus (2)
    // and Naija (3) ahead of him.
    fightIndex: 4,
    isBoss: true,
    difficulty: 'champion',
    weaponType: 'dual_blades',
    personality: 'Tricky',
    armatura: 'dimachaerus',
    palmae: ['pyre_brand'],
    recommendedLevel: 5,
    stats: {
      strength: 18,
      agility: 17,
      staminaMax: 140,
      staminaRegen: 22,
      defense: 8,
      healthMax: 230,
    },
    skinColor: '#c68642',
    hairColor: '#991b1b',
    tunicColor: '#b91c1c',
    armorColor: '#f59e0b',
    aggression: 0.85,
    blockChance: 0.45,
    dodgeChance: 0.6,
    rewardGold: 220,
    rewardFame: 70,
    rewardXp: 220,
    meshScale: 1.08,
    bossMechanic: 'phase_weapon_switch',
    phase2WeaponType: 'mace',
    characterModel: 'roman_warrior',
  },

  // TIER 3
  {
    id: 'opp_centurion_drusus',
    name: 'Centurion Drusus',
    title: 'Praetorian Guard',
    tier: 3,
    fightIndex: 1,
    difficulty: 'champion',
    weaponType: 'sword_shield',
    personality: 'Defensive',
    armatura: 'murmillo',
    palmae: ['iron_lungs'],
    recommendedLevel: 6,
    stats: {
      strength: 22,
      agility: 14,
      staminaMax: 130,
      staminaRegen: 20,
      defense: 14,
      healthMax: 260,
    },
    skinColor: '#d4a373',
    hairColor: '#1c1917',
    tunicColor: '#991b1b',
    armorColor: '#cbd5e1',
    aggression: 0.6,
    blockChance: 0.75,
    dodgeChance: 0.35,
    rewardGold: 260,
    rewardFame: 90,
    rewardXp: 260,
    clothingStyle: 'centurion_harness',
  },
  // CH-4 — new rivals, appended within their tier. Tier 3 ladder:
  // Drusus (1), Kallias (2), the Pale Twins (3), Valéria (4).
  {
    id: 'opp_kallias_sparta',
    name: 'Kallias of Sparta',
    title: 'Spartan Hoplite of the Grand Amphitheater',
    tier: 3,
    fightIndex: 2,
    difficulty: 'champion',
    weaponType: 'spear',
    personality: 'Defensive',
    // CH-4 — Spearman's Ground arrives with the hoplomachus doctrina: the outer
    // third of his reach deals +15%, inside half reach −10%.
    armatura: 'hoplomachus',
    recommendedLevel: 6,
    stats: {
      strength: 23,
      agility: 16,
      staminaMax: 142,
      staminaRegen: 22,
      // Between Drusus (14) and Valéria (12): a hoplite's shield, below the
      // praetorian's tower shield and above the net-fighter's.
      defense: 13,
      healthMax: 285,
    },
    skinColor: '#c68642',
    hairColor: '#1c1917',
    tunicColor: '#065f46',
    armorColor: '#10b981',
    aggression: 0.55,
    blockChance: 0.7,
    dodgeChance: 0.3,
    rewardGold: 310,
    rewardFame: 105,
    rewardXp: 310,
    clothingStyle: 'gladiator_sash',
  },
  {
    id: 'opp_pale_twins',
    name: 'The Pale Twins',
    title: 'Twin Blades of the Imperial Sand',
    tier: 3,
    fightIndex: 3,
    difficulty: 'champion',
    weaponType: 'dual_blades',
    personality: 'Berserker',
    // CH-4 — one config for the pair: the dimachaerus model with the class's
    // twin-strike doctrina, fought as a single opponent.
    armatura: 'dimachaerus',
    recommendedLevel: 7,
    stats: {
      strength: 24,
      agility: 20,
      staminaMax: 152,
      staminaRegen: 24,
      defense: 12,
      healthMax: 300,
    },
    skinColor: '#e7d8d0',
    hairColor: '#f8fafc',
    tunicColor: '#334155',
    armorColor: '#94a3b8',
    aggression: 0.85,
    blockChance: 0.35,
    dodgeChance: 0.65,
    rewardGold: 380,
    rewardFame: 122,
    rewardXp: 380,
    characterModel: 'dimachaerus',
  },
  {
    id: 'opp_valeria_boss',
    name: 'Valéria the Viper Queen',
    title: 'Coliseum Grand Champion (BOSS)',
    tier: 3,
    // CH-4 Director ruling — ordering/display only (see Ignis above): 2 → 4 so
    // Kallias (2) and the Pale Twins (3) take their rungs ahead of her.
    fightIndex: 4,
    isBoss: true,
    difficulty: 'champion',
    weaponType: 'spear',
    personality: 'Tricky',
    armatura: 'retiarius',
    palmae: ['vipers_patience'],
    recommendedLevel: 8,
    stats: {
      strength: 25,
      agility: 22,
      staminaMax: 160,
      staminaRegen: 26,
      defense: 12,
      healthMax: 320,
    },
    skinColor: '#a0522d',
    hairColor: '#000000',
    tunicColor: '#4c1d95',
    armorColor: '#eab308',
    aggression: 0.9,
    blockChance: 0.55,
    dodgeChance: 0.75,
    rewardGold: 450,
    rewardFame: 140,
    rewardXp: 450,
    meshScale: 1.1,
    bossMechanic: 'counter_dodge',
    characterModel: 'roman_warrior',
  },

  // TIER 4 - GRAND FINAL
  {
    id: 'opp_aurelius_boss',
    name: 'Aurelius the Invincible Titan',
    title: 'Emperor Undefeated Colossus (FINAL BOSS)',
    tier: 4,
    fightIndex: 1,
    isBoss: true,
    difficulty: 'champion',
    weaponType: 'mace',
    personality: 'Berserker',
    armatura: 'murmillo',
    palmae: ['colossus_hide'],
    recommendedLevel: 10,
    stats: {
      strength: 34,
      agility: 20,
      staminaMax: 200,
      staminaRegen: 30,
      defense: 20,
      healthMax: 480,
    },
    skinColor: '#8b4513',
    hairColor: '#ffffff',
    tunicColor: '#78350f',
    armorColor: '#ffd700',
    aggression: 0.95,
    blockChance: 0.7,
    dodgeChance: 0.5,
    rewardGold: 1000,
    rewardFame: 500,
    rewardXp: 1000,
    meshScale: 1.25,
    bossMechanic: 'rage_mode_colossus',
    characterModel: 'roman_warrior',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // D-1 — FEATURE BOUTS (boss-rosters.md Part A). APPENDED ONLY: every row above
  // this line is byte-identical, so every save's ids still resolve. A feature
  // bout is a BOSS faced OUTSIDE the tier ladder:
  //
  //   • `fightIndex: 0` — "no rung", the same marker `DOCTORE_TEST_OPPONENT`
  //     uses, so no tier's rung list gains an entry;
  //   • `isBoss: true` — it keeps the boss music, HUD and card treatment, and the
  //     boss-only palm fence still holds;
  //   • `featureBout: true` + `isLadderBoss()` — it never advances `currentTier`,
  //     never adds a `bossKills` stripe and never satisfies a rank/campaign gate;
  //   • `gate` — the availability rule as DATA (`utils/featureBouts.ts` reads it
  //     and builds the words the tournament tab prints);
  //   • `cardLine` — the boss card's line, verbatim from Part A;
  //   • `presentationState` — the authored state NAME. AI-4's key map is not in
  //     the tree, so the name is data only and the AI-4 extension is DEFERRED;
  //     in this slice every feature boss uses the standard boss loge dressing.
  //
  // Their mechanics (`beast_hunt`, `false_telegraph`, `unbroken_panoply`,
  // `yoked_brothers`, `the_long_memory`) are INERT here: no branch in the duel
  // reads them, so a feature bout plays as a clean standard boss-tier fight until
  // each boss's own D-slice wires its mechanic. Their carried boss-only palm has
  // an EMPTY effect block for the same reason — the magnitude lives in `notes`
  // until the mechanic site exists.
  //
  // No `armatura`: Part A names no one of the seven classes for any of the five
  // (Marcellin's is a Bestiarius spear kit), and a wrong class is worse than no
  // class — the Director addendum's armatura rule.
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'opp_marcellin_boss',
    name: 'Marcellin the Beastmaster',
    title: 'Beastmaster of Nineveh (Feature Bout)',
    tier: 2,
    fightIndex: 0,
    isBoss: true,
    featureBout: true,
    difficulty: 'champion',
    weaponType: 'spear',
    personality: 'Tricky',
    recommendedLevel: 4,
    gate: { rank: 'Veteran', bossDefeatedId: 'opp_ignis_boss' },
    cardLine:
      'Marcellin hunts with his lion Ferrum. Every third exchange the beast crouches, then pounces — strike it while it crouches, or block the pounce. Three wounds drive it off.',
    presentationState: 'dawn',
    palmae: ['blood_scent'],
    // Anchored between Brutus (14/12, 108/19, def 8, 160 HP) and the tier's boss
    // Ignis (18/17, 140/22, def 8, 230 HP): a veteran huntsman above the rung
    // rivals, below the champion — and a spear's reach on top of the beast.
    stats: {
      strength: 15,
      agility: 16,
      staminaMax: 118,
      staminaRegen: 20,
      defense: 8,
      healthMax: 200,
    },
    skinColor: '#b07d62',
    hairColor: '#27272a',
    tunicColor: '#78350f',
    armorColor: '#a16207',
    aggression: 0.6,
    blockChance: 0.4,
    dodgeChance: 0.45,
    rewardGold: 260,
    rewardFame: 60,
    rewardXp: 180,
    meshScale: 1.04,
    bossMechanic: 'beast_hunt',
    characterModel: 'roman_warrior',
  },
  {
    id: 'opp_varro_boss',
    name: 'Varro "The Mirage"',
    title: 'Feint-Master of the Grand Amphitheater (Feature Bout)',
    tier: 3,
    fightIndex: 0,
    isBoss: true,
    featureBout: true,
    difficulty: 'champion',
    weaponType: 'dual_blades',
    personality: 'Tricky',
    recommendedLevel: 7,
    gate: { rank: 'Champion', bossDefeatedId: 'opp_valeria_boss' },
    cardLine:
      "Varro's wind-ups lie. Watch his feet: a planted stance means the blow is real; a light foot means a feint. When in doubt, block — a feint is only a quick strike.",
    presentationState: 'high-noon',
    palmae: ['two_faces'],
    // Anchored inside the tier-3 band: Drusus (22/14, 130/20, def 14, 260 HP),
    // Kallias (23/16, 142/22, def 13, 285), the Pale Twins (24/20, 152/24, def 12,
    // 300), Valéria (25/22, 160/26, def 12, 320). Varro is the fast, lightly
    // armoured liar of the tier: agility at the rival band's top, defence below it.
    stats: {
      strength: 21,
      agility: 23,
      staminaMax: 150,
      staminaRegen: 24,
      defense: 10,
      healthMax: 300,
    },
    skinColor: '#c68642',
    hairColor: '#0f172a',
    tunicColor: '#312e81',
    armorColor: '#94a3b8',
    aggression: 0.65,
    blockChance: 0.4,
    dodgeChance: 0.6,
    rewardGold: 520,
    rewardFame: 165,
    rewardXp: 330,
    meshScale: 1.02,
    bossMechanic: 'false_telegraph',
    characterModel: 'roman_warrior',
  },
  {
    id: 'opp_gnaeus_boss',
    name: 'Gnaeus "The Gilded"',
    title: 'Undercard of the Pantheon (Feature Bout)',
    tier: 4,
    fightIndex: 0,
    isBoss: true,
    featureBout: true,
    difficulty: 'champion',
    weaponType: 'sword_shield',
    personality: 'Defensive',
    recommendedLevel: 10,
    // Part A: "Champion (deriveRank) ∧ Tier 3 cleared (currentTier 4 reached) —
    // NOT a boss-defeat id". Encoded exactly as the tier condition.
    gate: { rank: 'Champion', tierReached: 4 },
    cardLine:
      'Gnaeus fights behind three gilt pride-pieces — crest, shield facing, pauldron — each guarding him while it shines. Power attacks crack them even through his block. Strip the gold, and the man shrinks.',
    presentationState: 'gilded',
    palmae: ['vainheart'],
    // Anchored below the summit Aurelius (34/20, 200/30, def 20, 480 HP) and above
    // the tier-3 champions: a heavy, shield-first man whose pride is his armour.
    stats: {
      strength: 28,
      agility: 18,
      staminaMax: 180,
      staminaRegen: 27,
      defense: 19,
      healthMax: 390,
    },
    skinColor: '#d4a373',
    hairColor: '#a16207',
    tunicColor: '#78350f',
    armorColor: '#eab308',
    aggression: 0.6,
    blockChance: 0.75,
    dodgeChance: 0.25,
    rewardGold: 800,
    rewardFame: 300,
    rewardXp: 520,
    meshScale: 1.1,
    bossMechanic: 'unbroken_panoply',
    characterModel: 'roman_warrior',
  },
  {
    id: 'opp_cotta_boss',
    name: 'Lucius & Gaius Cotta',
    title: 'The Yoked Brothers (Feature Bout)',
    tier: 2,
    fightIndex: 0,
    isBoss: true,
    featureBout: true,
    difficulty: 'champion',
    weaponType: 'dual_blades',
    personality: 'Aggressive',
    recommendedLevel: 4,
    gate: { rank: 'Veteran', bossDefeatedId: 'opp_ignis_boss' },
    cardLine:
      'The Cotta brothers fight as one. Every fourth exchange they cross — one telegraphs, the other circles to your flank. Dodge the crossing. Down one, and the other swears an oath.',
    presentationState: 'brothers',
    // Carried by the pair's ONE row, as Part A states ("carried by the pair's
    // row, fires once").
    palmae: ["survivors_oath"],
    // One config for the pair, exactly as the Pale Twins are one config: the duo
    // model, two blades, and stats just under Marcellin's (the tier's other
    // feature bout) and well under Ignis (18/17, 140/22, def 8, 230 HP).
    stats: {
      strength: 14,
      agility: 15,
      staminaMax: 110,
      staminaRegen: 19,
      defense: 6,
      healthMax: 195,
    },
    skinColor: '#8d5b4c',
    hairColor: '#1c1917',
    tunicColor: '#7f1d1d',
    armorColor: '#b91c1c',
    aggression: 0.8,
    blockChance: 0.35,
    dodgeChance: 0.5,
    rewardGold: 240,
    rewardFame: 55,
    rewardXp: 170,
    bossMechanic: 'yoked_brothers',
    characterModel: 'dimachaerus',
  },
  {
    id: 'opp_hermas_boss',
    name: 'Hermas the Legend Returned',
    title: 'Epilogue Champion (Feature Bout)',
    tier: 4,
    fightIndex: 0,
    isBoss: true,
    featureBout: true,
    difficulty: 'champion',
    weaponType: 'sword_shield',
    personality: 'Defensive',
    recommendedLevel: 10,
    // Part A: Legend rank AND "Tier-4 boss defeated — i.e., Aurelius defeated".
    gate: { rank: 'Legend', bossDefeatedId: 'opp_aurelius_boss' },
    cardLine:
      'Hermas took the wooden sword a generation ago. He adapts as you fight: lean on one kind of attack past three-in-five, and he sets himself against it — twice. Fight him whole, or be read.',
    presentationState: 'dusk',
    palmae: ['old_craft'],
    // An EPILOGUE, not a new summit: the last bout stands above Aurelius' rivals
    // but below the Titan himself (34/20, 200/30, def 20, 480 HP) — a veteran's
    // patience rather than a Titan's mass.
    stats: {
      strength: 31,
      agility: 24,
      staminaMax: 195,
      staminaRegen: 30,
      defense: 17,
      healthMax: 450,
    },
    skinColor: '#a0522d',
    hairColor: '#e7e5e4',
    tunicColor: '#3f3f46',
    armorColor: '#d6d3d1',
    aggression: 0.7,
    blockChance: 0.65,
    dodgeChance: 0.5,
    rewardGold: 1250,
    rewardFame: 600,
    rewardXp: 700,
    meshScale: 1.05,
    bossMechanic: 'the_long_memory',
    characterModel: 'roman_warrior',
  },
];

/**
 * The ladder proper — every opponent that is a rung or a tier's boss. The
 * feature bouts are NOT here: they are their own list, and `fightIndex: 0` keeps
 * them out of any tier's rung order.
 */
export const LADDER_OPPONENTS: OpponentConfig[] = ALL_OPPONENTS.filter(
  (opponent) => opponent.featureBout !== true
);

/** D-1 — the five Feature Bouts, in the order Part A presents them. */
export const FEATURE_BOUT_OPPONENTS: OpponentConfig[] = ALL_OPPONENTS.filter(
  (opponent) => opponent.featureBout === true
);

/**
 * The Primus Palus ladder in ladder order — tier first, then fight
 * (`src/data/opponents.ts` is the cast of record). Includes the bosses.
 *
 * D-1 — the FEATURE BOUTS are excluded: the plaque is the ladder's hundred-year
 * list, and a feature bout is not a rung of it.
 */
export const PRIMUS_PALUS_LADDER: OpponentConfig[] = [...LADDER_OPPONENTS].sort(
  (a, b) => a.tier - b.tier || a.fightIndex - b.fightIndex
);
