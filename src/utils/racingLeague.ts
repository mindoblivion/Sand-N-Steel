import { PlayerProfile, ChariotTeamSize } from '../types/game';
import { canDebitGold } from './goldTransactions';

export type StableFactionId = 'red_russata' | 'blue_veneta' | 'green_prasina' | 'white_albata';

export interface StableFaction {
  id: StableFactionId;
  name: string;
  color: string;
  bannerBg: string;
  motto: string;
  driverName: string;
  specialty: string;
  baseOdds: number; // e.g. 2.5
}

export const STABLE_FACTIONS: StableFaction[] = [
  {
    id: 'red_russata',
    name: 'Russata (Red Stable)',
    color: '#ef4444',
    bannerBg: 'bg-red-950 border-red-600/80 text-red-200',
    motto: 'Lightning over the Sand',
    driverName: 'Scorpus of Hispania',
    specialty: 'High top speed & aggressive whips',
    baseOdds: 2.2,
  },
  {
    id: 'blue_veneta',
    name: 'Veneta (Blue Stable)',
    color: '#3b82f6',
    bannerBg: 'bg-blue-950 border-blue-600/80 text-blue-200',
    motto: 'Iron Axles, Unshaken',
    driverName: 'Diocles of Lusitania',
    specialty: 'Unbreakable axles & heavy chassis',
    baseOdds: 3.5,
  },
  {
    id: 'green_prasina',
    name: 'Prasina (Green Stable)',
    color: '#22c55e',
    bannerBg: 'bg-green-950 border-green-600/80 text-green-200',
    motto: 'Crown of the Emperor',
    driverName: 'Hierocles the Young',
    specialty: 'Tight cornering & precision rein control',
    baseOdds: 1.8,
  },
  {
    id: 'white_albata',
    name: 'Albata (White Stable)',
    color: '#f8fafc',
    bannerBg: 'bg-slate-900 border-slate-400/80 text-slate-200',
    motto: 'Endurance Untamed',
    driverName: 'Porphyrius the Old',
    specialty: 'Relentless horse stamina & long boost recovery',
    baseOdds: 5.0,
  },
];

export interface LeagueTier {
  id: number;
  name: string;
  horsesRequired: ChariotTeamSize;
  description: string;
  firstPlacePrize: number;
  fameReward: number;
  pointsToAdvance: number;
}

export const LEAGUE_TIERS: LeagueTier[] = [
  {
    id: 1,
    name: 'Provincial Track Circuit',
    horsesRequired: 2, // Biga
    description: 'Local 2-horse Biga trials held across regional arenas.',
    firstPlacePrize: 250,
    fameReward: 20,
    pointsToAdvance: 100,
  },
  {
    id: 2,
    name: 'Circus Metropolis Cup',
    horsesRequired: 3, // Triga
    description: '3-horse Triga championship for acclaimed faction drivers.',
    firstPlacePrize: 600,
    fameReward: 50,
    pointsToAdvance: 250,
  },
  {
    id: 3,
    name: 'Circus Maximus Grand Prix',
    horsesRequired: 4, // Quadra
    description: 'Pinnacle 4-horse Quadra spectacle in Imperial Rome before 150,000 citizens.',
    firstPlacePrize: 1500,
    fameReward: 120,
    pointsToAdvance: 500,
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Advanced Chariot Tuning Model
 * ────────────────────────────────────────────────────────────────────────── */

export interface ChariotTuning {
  reinStrength: number; // 0..5
  axleDurability: number; // 0..5
  wheelSpikes: number; // 0..5
  staminaConditioning: number; // 0..5
}

export const MAX_TUNING_LEVEL = 5;

export const TUNING_COSTS: Record<number, number> = {
  1: 200,
  2: 400,
  3: 750,
  4: 1200,
  5: 2000,
};

export function defaultChariotTuning(): ChariotTuning {
  return {
    reinStrength: 0,
    axleDurability: 0,
    wheelSpikes: 0,
    staminaConditioning: 0,
  };
}

export function resolveChariotTuning(profile: PlayerProfile | null | undefined): ChariotTuning {
  const stored = profile?.racingTuning;
  if (!stored || typeof stored !== 'object') return defaultChariotTuning();
  return {
    reinStrength: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.reinStrength || 0)),
    axleDurability: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.axleDurability || 0)),
    wheelSpikes: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.wheelSpikes || 0)),
    staminaConditioning: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.staminaConditioning || 0)),
  };
}

export function getTuningUpgradeCost(currentLevel: number): number {
  if (currentLevel >= MAX_TUNING_LEVEL) return 0;
  return TUNING_COSTS[currentLevel + 1] || 1000;
}

export function purchaseTuningUpgrade(
  profile: PlayerProfile | null | undefined,
  stat: keyof ChariotTuning
): { ok: true; profile: PlayerProfile } | { ok: false; reason: string } {
  if (!profile) return { ok: false, reason: 'No profile' };
  const currentTuning = resolveChariotTuning(profile);
  const currentLevel = currentTuning[stat];
  if (currentLevel >= MAX_TUNING_LEVEL) {
    return { ok: false, reason: 'Stat is already at maximum tuning level.' };
  }
  const cost = getTuningUpgradeCost(currentLevel);
  if (!canDebitGold(profile.gold, cost)) {
    return { ok: false, reason: `Not enough gold (${cost} required).` };
  }

  const updatedTuning: ChariotTuning = {
    ...currentTuning,
    [stat]: currentLevel + 1,
  };

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - cost,
      racingTuning: updatedTuning,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Tavern Betting System
 * ────────────────────────────────────────────────────────────────────────── */

export interface ActiveBet {
  factionId: StableFactionId;
  wagerAmount: number;
  oddsMultiplier: number;
  potentialPayout: number;
}

export interface TavernBetResult {
  won: boolean;
  payout: number;
  factionName: string;
}

export function placeTavernBet(
  profile: PlayerProfile | null | undefined,
  factionId: StableFactionId,
  wagerAmount: number
): { ok: true; profile: PlayerProfile } | { ok: false; reason: string } {
  if (!profile) return { ok: false, reason: 'No active profile.' };
  if (wagerAmount <= 0) return { ok: false, reason: 'Invalid wager amount.' };
  if (!canDebitGold(profile.gold, wagerAmount)) {
    return { ok: false, reason: 'Not enough gold to place this wager.' };
  }

  const faction = STABLE_FACTIONS.find((f) => f.id === factionId);
  if (!faction) return { ok: false, reason: 'Unknown stable faction.' };

  const activeBet: ActiveBet = {
    factionId,
    wagerAmount,
    oddsMultiplier: faction.baseOdds,
    potentialPayout: Math.floor(wagerAmount * faction.baseOdds),
  };

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - wagerAmount,
      activeRaceBet: activeBet,
    },
  };
}

export function resolveTavernBet(
  profile: PlayerProfile,
  winningFactionId: StableFactionId
): { profile: PlayerProfile; betResult: TavernBetResult | null } {
  const bet = profile.activeRaceBet;
  if (!bet) return { profile, betResult: null };

  const faction = STABLE_FACTIONS.find((f) => f.id === bet.factionId);
  const factionName = faction ? faction.name : 'Selected Stable';
  const won = bet.factionId === winningFactionId;
  const payout = won ? bet.potentialPayout : 0;

  const updatedProfile: PlayerProfile = {
    ...profile,
    gold: profile.gold + payout,
    activeRaceBet: undefined, // Clear processed bet
  };

  return {
    profile: updatedProfile,
    betResult: {
      won,
      payout,
      factionName,
    },
  };
}
