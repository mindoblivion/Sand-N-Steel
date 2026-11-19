import { PlayerProfile, ChariotTeamSize } from '../types/game';
import { canDebitGold } from './goldTransactions';
import { isRacingConfigUnlocked } from './racingProgression';

// BET-1 — the tavern betting system is cut: the Golden Palm Bookmaker, its
// faction odds and its wager settlement are removed, not repaired. The four
// circus factions live on only as race-rival display strings in
// `raceCompetitors.ts`; nothing here prices a wager any more.

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
 * ECON-2 — League milestone prizes
 *
 * The tiers above are points thresholds on the shipped 1v1 race, not the
 * Stage 2 ladder (District → League → Championship) — that program is still
 * unbuilt, and nothing here claims otherwise. What this section wires is the
 * shipped data: a tier's prize pays once, when the player's cumulative
 * league points reach its threshold AND the player owns the tier's team.
 * Points accrue regardless of team; the prize waits for the team.
 *
 * Everything here is pure: no save writes, no UI. The settlement calls the
 * award resolver; the panels call the standing resolver.
 * ────────────────────────────────────────────────────────────────────────── */

/** A League bonus due on a finish: the tier, its gold and its fame. */
export interface LeaguePrizeAward {
  tier: LeagueTier;
  gold: number;
  fame: number;
}

/** The league standing, for display: points, claimed tiers, next tier. */
export interface LeagueStanding {
  points: number;
  claimedTierIds: number[];
  /** Highest tier whose bonus has been claimed, or null when none has. */
  currentTier: LeagueTier | null;
  /** First tier whose bonus is not yet claimed, or null when all are claimed. */
  nextTier: LeagueTier | null;
  /** Points still needed for the next tier; 0 when its threshold is met (or no tier remains). */
  pointsToNextTier: number;
  /** Whether the player owns the next tier's team; true when no tier remains. */
  nextTierTeamOwned: boolean;
}

const LEAGUE_TEAM_NAMES: Record<number, string> = { 2: 'Biga', 3: 'Triga', 4: 'Quadra' };

/**
 * The standing as one display line, shared by the pre-race panel and the
 * workshop so the two surfaces can never disagree. It names the next tier and
 * the points still needed — never a placement, because the 1v1 race has none.
 */
export function leagueStandingLine(standing: LeagueStanding): string {
  if (!standing.nextTier) {
    return `League standing: ${standing.points} points — all ${LEAGUE_TIERS.length} League bonuses claimed.`;
  }
  if (standing.pointsToNextTier === 0) {
    return standing.nextTierTeamOwned
      ? `League standing: ${standing.points} points — ${standing.nextTier.name} reached.`
      : `League standing: ${standing.points} points — ${standing.nextTier.name} reached; own a ${LEAGUE_TEAM_NAMES[standing.nextTier.horsesRequired] ?? 'bigger'} team to claim its ${standing.nextTier.firstPlacePrize}g bonus.`;
  }
  return `League standing: ${standing.points} points — ${standing.nextTier.name} next, ${standing.pointsToNextTier} points to go.`;
}

/** The tier for an id, or undefined when the id names no tier. */
export function getLeagueTier(id: number): LeagueTier | undefined {
  return LEAGUE_TIERS.find((tier) => tier.id === id);
}

/** Claimed tier ids, sanitized: valid tier ids only, deduplicated, ascending. */
export function resolveClaimedLeagueTierIds(
  profile: PlayerProfile | null | undefined,
): number[] {
  const stored = profile?.racing?.leaguePrizesClaimed;
  if (!Array.isArray(stored)) return [];
  const valid = new Set(LEAGUE_TIERS.map((tier) => tier.id));
  const claimed = [...new Set(stored.filter((id) => valid.has(id)))];
  claimed.sort((a, b) => a - b);
  return claimed;
}

/** Cumulative league points, sanitized: a non-negative integer, else 0. */
export function resolveLeaguePoints(
  profile: PlayerProfile | null | undefined,
): number {
  const points = profile?.racing?.leaguePoints;
  return typeof points === 'number' && Number.isSafeInteger(points) && points > 0 ? points : 0;
}

/**
 * The standing for display. Never throws on a legacy or malformed save:
 * missing points read as 0, a missing claim list as empty.
 */
export function resolveLeagueStanding(
  profile: PlayerProfile | null | undefined,
): LeagueStanding {
  const points = resolveLeaguePoints(profile);
  const claimedTierIds = resolveClaimedLeagueTierIds(profile);
  const claimed = new Set(claimedTierIds);
  const currentTier = [...LEAGUE_TIERS].reverse().find((tier) => claimed.has(tier.id)) ?? null;
  const nextTier = LEAGUE_TIERS.find((tier) => !claimed.has(tier.id)) ?? null;
  return {
    points,
    claimedTierIds,
    currentTier,
    nextTier,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.pointsToAdvance - points) : 0,
    nextTierTeamOwned: nextTier ? isRacingConfigUnlocked(profile, nextTier.horsesRequired) : true,
  };
}

/**
 * The bonuses due after a finish that leaves the player at `pointsAfterFinish`.
 * Every tier whose threshold is met, whose bonus is unclaimed, and whose team
 * the player owns pays — in tier order. On the claim-as-you-go path that is at
 * most one tier per finish (thresholds sit 100+ points apart and one finish
 * earns at most 50); a save that already banks points above unclaimed
 * thresholds collects every due bonus on its next finish, never on load.
 */
export function resolveLeaguePrizeAwards(
  profile: PlayerProfile | null | undefined,
  pointsAfterFinish: number,
): LeaguePrizeAward[] {
  const claimed = new Set(resolveClaimedLeagueTierIds(profile));
  const points = typeof pointsAfterFinish === 'number' && Number.isSafeInteger(pointsAfterFinish) && pointsAfterFinish > 0
    ? pointsAfterFinish
    : 0;
  const awards: LeaguePrizeAward[] = [];
  for (const tier of LEAGUE_TIERS) {
    if (claimed.has(tier.id)) continue;
    if (points < tier.pointsToAdvance) continue;
    if (!isRacingConfigUnlocked(profile, tier.horsesRequired)) continue;
    awards.push({ tier, gold: tier.firstPlacePrize, fame: tier.fameReward });
  }
  return awards;
}

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
