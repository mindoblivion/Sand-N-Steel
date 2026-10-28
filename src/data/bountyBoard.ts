/**
 * ===========================================================================
 * STORY-4b — THE DESERTER'S PRICE: the Bounty Hall board's rows
 * ===========================================================================
 * The six opponent ROWS the board posts, appended to `ALL_OPPONENTS` (append-only:
 * every row above them stays byte-identical, so every save's ids still resolve).
 * `utils/bountyLadder.ts` owns the RULES — order, gates, bounties, twists — and
 * reads these rows for the names and for the fight itself; nothing here repeats
 * a rule.
 *
 * EACH ROW IS A `bountyBout`:
 *   • `fightIndex: 0` — "no rung", the same marker the Doctore's Test and the five
 *     Feature Bouts use, so no tier's rung list gains an entry;
 *   • excluded from `LADDER_OPPONENTS` / `PRIMUS_PALUS_LADDER`, so a bounty win is
 *     never a ladder win, never advances `currentTier`, never satisfies a gate;
 *   • `bountyBout: true` — the flag every fence reads (`isLadderBoss`,
 *     `nextBossKills`, `extraPalmaFor`, `isGrudgeBase`, `FEATURE_BOUT_OPPONENTS`,
 *     `TournamentTab`'s ladder list and STORY-4a's mercy roster).
 *
 * ── WHAT IS AUTHORED (flagged where it sits) ──────────────────────────────
 *   • The five RUNG NAMES and their titles are AUTHORED: the brief names no
 *     design source for them, so every one is marked `STORY-4b — authored, not
 *     design-transcribed`.
 *   • The rung STATS (and the armoured build's high-defence/high-stamina profile)
 *     are AUTHORED at Tier-3 scale, anchored to the shipped Tier-3 regulars
 *     (Drusus 21/17 · 138 stamina · def 12 · 260 HP; Kallias 23/16 · 142 · 13 ·
 *     285; the Pale Twins 24/20 · 152 · 12 · 300), and the Deserter's to Valéria's
 *     Tier-3 boss row (25/22 · 160 · def 12 · 320) — anchored, never copied.
 *   • Each row's own `rewardGold`/`rewardFame` is the STANDARD DUEL PURSE (a small,
 *     authored contract fee), NOT the bounty: the posted bounty is paid by
 *     `utils/bountyLadder.ts` on a CLEAR, so a victory that misses its twist pays
 *     the standard purse only (STORY-4b — Director ruling R4).
 */
import type { OpponentConfig } from '../types/game';
import { DEFAULT_STEEL_DELTA } from './boutModes';

/** The standard duel purse every bounty row carries (see the header). */
const CONTRACT_PURSE = { gold: 60, fame: 10, xp: 200 } as const;
/** The Deserter's own contract purse — the final is a bigger fight. */
const DESERTER_PURSE = { gold: 100, fame: 20, xp: 320 } as const;

/**
 * RUNG I — the relentless blocker: the twist is a COMBO COUNT (victory AND
 * `maxCombo >= DOCTORE_TEST_COMBO_TARGET`), so the row is the wall the combo has
 * to be built against.
 */
export const BOUNTY_DECIMUS: OpponentConfig = {
  // STORY-4b — authored, not design-transcribed: name and title.
  id: 'opp_bounty_decimus',
  name: 'Decimus the Rampart',
  title: 'Bounty Rung I — the Relentless Blocker',
  tier: 3,
  fightIndex: 0,
  bountyBout: true,
  difficulty: 'champion',
  weaponType: 'sword_shield',
  personality: 'Defensive',
  recommendedLevel: 6,
  // AUTHORED (STORY-4b, Tier-3 scale): agility below every Tier-3 regular
  // (14 vs Kallias's 16), defence above all of them (16 vs Drusus's 14) and the
  // highest blockChance in the roster — a fight won by pressure, not one blow.
  stats: {
    strength: 21,
    agility: 14,
    staminaMax: 148,
    staminaRegen: 23,
    defense: 16,
    healthMax: 300,
  },
  skinColor: '#b07d62',
  hairColor: '#1c1917',
  tunicColor: '#3f3f46',
  armorColor: '#a8a29e',
  aggression: 0.5,
  blockChance: 0.78,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.18,
  rewardGold: CONTRACT_PURSE.gold,
  rewardFame: CONTRACT_PURSE.fame,
  rewardXp: CONTRACT_PURSE.xp,
  clothingStyle: 'gladiator_sash',
};

/**
 * RUNG II — the left-hander. STORY-4b — Director ruling R5: the twist is a
 * LEFT-HANDED fighter, implemented with the SHIPPED lefty stance rather than an
 * invented modifier — `DuelScene` seeds the opponent's `isLeftyMode` from this
 * flag, so `GladiatorMesh` puts the sword in the left hand and the shield in the
 * right, and the board prints "fights left-handed". No formula reads the flag and
 * this row's stats are an ordinary Tier-3 profile.
 */
export const BOUNTY_SEXTUS: OpponentConfig = {
  // STORY-4b — authored, not design-transcribed: name and title.
  id: 'opp_bounty_sextus',
  name: 'Sextus Sinister',
  title: 'Bounty Rung II — the Left Hand',
  tier: 3,
  fightIndex: 0,
  bountyBout: true,
  leftHanded: true,
  difficulty: 'champion',
  weaponType: 'sword_shield',
  personality: 'Tricky',
  recommendedLevel: 6,
  // AUTHORED (STORY-4b, Tier-3 scale): quicker and looser than Decimus
  // (19 agility / 0.45 dodge against 14 / 0.18) and softer in defence (11), so
  // the unfamiliar side is the puzzle rather than the raw numbers.
  stats: {
    strength: 23,
    agility: 19,
    staminaMax: 145,
    staminaRegen: 23,
    defense: 11,
    healthMax: 290,
  },
  skinColor: '#c68642',
  hairColor: '#3f2d1d',
  tunicColor: '#4c1d95',
  armorColor: '#94a3b8',
  aggression: 0.7,
  blockChance: 0.45,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.45,
  rewardGold: CONTRACT_PURSE.gold,
  rewardFame: CONTRACT_PURSE.fame,
  rewardXp: CONTRACT_PURSE.xp,
  clothingStyle: 'gladiator_sash',
};

/**
 * RUNG III — the armoured man: the STAMINA WAR. Defence 20 and 178 stamina are
 * both above every shipped Tier-3 row (highest: Kallias def 13, Pale Twins 152
 * stamina), so the fight is won by out-lasting him. Victory alone clears it —
 * the twist is the fight, not an extra condition.
 */
export const BOUNTY_GAIUS: OpponentConfig = {
  // STORY-4b — authored, not design-transcribed: name and title.
  id: 'opp_bounty_gaius',
  name: 'Gaius the Ironclad',
  title: 'Bounty Rung III — the Armoured Man',
  tier: 3,
  fightIndex: 0,
  bountyBout: true,
  difficulty: 'champion',
  weaponType: 'sword_shield',
  personality: 'Defensive',
  recommendedLevel: 7,
  // AUTHORED (STORY-4b, Tier-3 scale): the armoured build the stamina-war twist
  // is written against — see the comment above.
  stats: {
    strength: 22,
    agility: 12,
    staminaMax: 178,
    staminaRegen: 28,
    defense: 20,
    healthMax: 330,
  },
  skinColor: '#8b4513',
  hairColor: '#0f172a',
  tunicColor: '#1f2937',
  armorColor: '#64748b',
  aggression: 0.55,
  blockChance: 0.72,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.12,
  rewardGold: CONTRACT_PURSE.gold,
  rewardFame: CONTRACT_PURSE.fame,
  rewardXp: CONTRACT_PURSE.xp,
  clothingStyle: 'centurion_harness',
};

/**
 * RUNG IV — the crowd's darling: the CROWD PUZZLE. Fast and evasive (20 agility,
 * 0.60 dodge) but soft (10 defence, 270 HP), so the work is keeping the stands
 * loud — the twist needs a peak crowd hype at the MAX tier.
 */
export const BOUNTY_PUBLIUS: OpponentConfig = {
  // STORY-4b — authored, not design-transcribed: name and title.
  id: 'opp_bounty_publius',
  name: "Publius the Crowd's Darling",
  title: 'Bounty Rung IV — the Showman',
  tier: 3,
  fightIndex: 0,
  bountyBout: true,
  difficulty: 'champion',
  weaponType: 'dual_blades',
  personality: 'Tricky',
  recommendedLevel: 7,
  // AUTHORED (STORY-4b, Tier-3 scale): see the comment above.
  stats: {
    strength: 20,
    agility: 20,
    staminaMax: 140,
    staminaRegen: 24,
    defense: 10,
    healthMax: 270,
  },
  skinColor: '#e7d8d0',
  hairColor: '#b45309',
  tunicColor: '#7f1d1d',
  armorColor: '#fbbf24',
  aggression: 0.8,
  blockChance: 0.4,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.6,
  rewardGold: CONTRACT_PURSE.gold,
  rewardFame: CONTRACT_PURSE.fame,
  rewardXp: CONTRACT_PURSE.xp,
  clothingStyle: 'champion_mantle',
};

/**
 * RUNG V — the clean fight: the ladder's hardest regular. Strongest and fastest
 * of the five (24/23), above every shipped Tier-3 regular (Pale Twins 24/20) and
 * below Valéria (25/22 … 320 HP). The twist needs the player never to fall below
 * half health.
 */
export const BOUNTY_MANIUS: OpponentConfig = {
  // STORY-4b — authored, not design-transcribed: name and title.
  id: 'opp_bounty_manius',
  name: 'Manius the Unscarred',
  title: 'Bounty Rung V — the Clean Fight',
  tier: 3,
  fightIndex: 0,
  bountyBout: true,
  difficulty: 'champion',
  weaponType: 'spear',
  personality: 'Aggressive',
  recommendedLevel: 8,
  // AUTHORED (STORY-4b, Tier-3 scale): see the comment above.
  stats: {
    strength: 24,
    agility: 23,
    staminaMax: 150,
    staminaRegen: 25,
    defense: 12,
    healthMax: 300,
  },
  skinColor: '#a0522d',
  hairColor: '#000000',
  tunicColor: '#065f46',
  armorColor: '#d6d3d1',
  aggression: 0.85,
  blockChance: 0.5,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.6,
  rewardGold: CONTRACT_PURSE.gold,
  rewardFame: CONTRACT_PURSE.fame,
  rewardXp: CONTRACT_PURSE.xp,
  clothingStyle: 'gladiator_sash',
};

/**
 * THE DESERTER — the ladder's final: a BOSS row and a bounty row at once.
 *
 * `isBoss: true` buys the boss HUD, the boss music/card treatment and CF-6's
 * telegraph presentation — his mechanic is Goliath's `heavy_telegraph`, REUSED:
 * no new mechanic exists in this slice. `bountyBout: true` keeps him out of every
 * ladder consumer, out of `bossKills`, out of `currentTier`, out of grudges, out
 * of extra palmae and out of STORY-4a mercy.
 *
 * There is NO phase data: with no registered ladder `bossPhaseLadderFor` answers
 * null (the HUD shows no phase marker), `bossChainHeavies` answers 1, and
 * `bossTelegraphChance` reads the mechanic's own single-phase rate — he is one
 * phase from first blow to last.
 *
 * STORY-4b — AUTHORED, not design-transcribed: the name, the title and every
 * stat. Anchored to Valéria's Tier-3 boss row (25/22 · 160 stamina/26 regen ·
 * def 12 · 320 HP) and scaled up: he is the ladder's last fight, not a tier
 * champion.
 */
export const BOUNTY_DESERTER: OpponentConfig = {
  id: 'opp_bounty_deserter',
  name: 'Lucius Cassius, called the Oathbreaker',
  title: 'The Deserter — Broken Sacrament',
  tier: 3,
  fightIndex: 0,
  isBoss: true,
  bountyBout: true,
  difficulty: 'champion',
  weaponType: 'sword_shield',
  personality: 'Aggressive',
  recommendedLevel: 8,
  stats: {
    strength: 27,
    agility: 19,
    staminaMax: 172,
    staminaRegen: 27,
    defense: 15,
    healthMax: 350,
  },
  skinColor: '#8d5524',
  hairColor: '#292524',
  tunicColor: '#44403c',
  armorColor: '#a8a29e',
  aggression: 0.88,
  blockChance: 0.58,
  steelDelta: DEFAULT_STEEL_DELTA,
  dodgeChance: 0.45,
  rewardGold: DESERTER_PURSE.gold,
  rewardFame: DESERTER_PURSE.fame,
  rewardXp: DESERTER_PURSE.xp,
  meshScale: 1.12,
  bossMechanic: 'heavy_telegraph',
  characterModel: 'roman_warrior',
  clothingStyle: 'centurion_harness',
};

/** The five rungs, in ladder order (1 … 5). */
export const BOUNTY_RUNG_OPPONENTS: readonly OpponentConfig[] = [
  BOUNTY_DECIMUS,
  BOUNTY_SEXTUS,
  BOUNTY_GAIUS,
  BOUNTY_PUBLIUS,
  BOUNTY_MANIUS,
];

/** Every bounty row, rungs first, the Deserter last — `ALL_OPPONENTS`' append order. */
export const BOUNTY_BOARD_OPPONENTS: readonly OpponentConfig[] = [
  ...BOUNTY_RUNG_OPPONENTS,
  BOUNTY_DESERTER,
];
