import { PlayerProfile, ArmaturaId, Trainee } from '../types/game';
import { getFacilityLevel } from './facilityProgression';
import { canDebitGold } from './goldTransactions';

export type { Trainee };

/** Base capacity without stable facility is 2; Imperial Stable Lv 1 gives 4; Lv 2 gives 6. */
export function getTraineeCapacity(profile: PlayerProfile | null | undefined): number {
  const stableLevel = getFacilityLevel(profile, 'stable');
  if (stableLevel >= 2) return 6;
  if (stableLevel >= 1) return 4;
  return 2;
}

export const RECRUIT_TRAINEE_COST = 150;

export function resolveTrainees(profile: PlayerProfile | null | undefined): Trainee[] {
  const stored = profile?.trainees;
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (t): t is Trainee =>
      typeof t === 'object' &&
      t !== null &&
      typeof t.id === 'string' &&
      typeof t.name === 'string' &&
      typeof t.level === 'number' &&
      typeof t.skill === 'number'
  );
}

const TRAINEE_NAMES = [
  'Lucius the Younger',
  'Quintus of Capua',
  'Gaius the Swift',
  'Titus Iron-Arm',
  'Flavius Blood-Eye',
  'Marcus the Bold',
  'Decimus Shadow',
  'Cassius Heavy-Hand',
];

export function getRandomTraineeName(existing: Trainee[]): string {
  const available = TRAINEE_NAMES.filter((n) => !existing.some((t) => t.name === n));
  if (available.length === 0) return `Novice ${existing.length + 1}`;
  return available[Math.floor(Math.random() * available.length)];
}

const TRAINEE_CLASSES: ArmaturaId[] = ['murmillo', 'retiarius', 'dimachaerus', 'hoplomachus', 'thraex'];

export type TraineeRejectionReason =
  | 'no-profile'
  | 'max-capacity'
  | 'insufficient-gold'
  | 'trainee-not-found'
  | 'trainee-busy';

export interface TraineeResult {
  ok: true;
  profile: PlayerProfile;
  message?: string;
}

export interface TraineeError {
  ok: false;
  reason: TraineeRejectionReason;
}

export function describeTraineeRejection(reason: TraineeRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No ludus profile active.';
    case 'max-capacity':
      return 'Your stable is at maximum capacity. Upgrade the Imperial Stable to house more trainees.';
    case 'insufficient-gold':
      return 'Not enough gold to recruit this trainee (150 gold required).';
    case 'trainee-not-found':
      return 'Trainee not found in your ludus.';
    case 'trainee-busy':
      return 'This trainee is currently assigned to a mission or training.';
  }
}

export function recruitTrainee(
  profile: PlayerProfile | null | undefined
): TraineeResult | TraineeError {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const currentTrainees = resolveTrainees(profile);
  const capacity = getTraineeCapacity(profile);
  if (currentTrainees.length >= capacity) {
    return { ok: false, reason: 'max-capacity' };
  }
  if (!canDebitGold(profile.gold, RECRUIT_TRAINEE_COST)) {
    return { ok: false, reason: 'insufficient-gold' };
  }

  const name = getRandomTraineeName(currentTrainees);
  const classType = TRAINEE_CLASSES[Math.floor(Math.random() * TRAINEE_CLASSES.length)];
  const newTrainee: Trainee = {
    id: `trainee_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    classType,
    level: 1,
    skill: Math.floor(Math.random() * 15) + 20, // 20-35 initial skill
    status: 'idle',
    daysRemaining: 0,
  };

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - RECRUIT_TRAINEE_COST,
      trainees: [...currentTrainees, newTrainee],
    },
    message: `Recruited ${name} (${classType}) to your ludus.`,
  };
}

export function assignTraineeActivity(
  profile: PlayerProfile | null | undefined,
  traineeId: string,
  activity: 'sparring' | 'exhibition'
): TraineeResult | TraineeError {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const trainees = resolveTrainees(profile);
  const index = trainees.findIndex((t) => t.id === traineeId);
  if (index === -1) return { ok: false, reason: 'trainee-not-found' };

  const trainee = trainees[index];
  if (trainee.status !== 'idle') return { ok: false, reason: 'trainee-busy' };

  const duration = activity === 'sparring' ? 1 : 3; // 1 day for sparring, 3 days for exhibition tour

  const updatedTrainee: Trainee = {
    ...trainee,
    status: activity,
    daysRemaining: duration,
    assignmentType: activity,
  };

  const newTrainees = [...trainees];
  newTrainees[index] = updatedTrainee;

  return {
    ok: true,
    profile: {
      ...profile,
      trainees: newTrainees,
    },
    message: `${trainee.name} dispatched on ${activity === 'sparring' ? 'sparring drill (1 day)' : 'exhibition tour (3 days)'}.`,
  };
}

export function dismissTrainee(
  profile: PlayerProfile | null | undefined,
  traineeId: string
): TraineeResult | TraineeError {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const trainees = resolveTrainees(profile);
  const index = trainees.findIndex((t) => t.id === traineeId);
  if (index === -1) return { ok: false, reason: 'trainee-not-found' };

  const trainee = trainees[index];
  const newTrainees = trainees.filter((t) => t.id !== traineeId);

  return {
    ok: true,
    profile: {
      ...profile,
      trainees: newTrainees,
    },
    message: `${trainee.name} has been released from your ludus.`,
  };
}

/**
 * Called on time advancement / day rollover: decreases daysRemaining for active trainees,
 * and if a trainee completes their mission, grants gold/fame/XP and returns them to idle.
 */
export function processTraineesDayAdvance(profile: PlayerProfile): { profile: PlayerProfile; reports: string[] } {
  const trainees = resolveTrainees(profile);
  if (trainees.length === 0) return { profile, reports: [] };

  let addedGold = 0;
  let addedFame = 0;
  const reports: string[] = [];

  const updatedTrainees = trainees.map((t) => {
    if (t.status === 'idle') return t;

    const remaining = Math.max(0, t.daysRemaining - 1);
    if (remaining > 0) {
      return { ...t, daysRemaining: remaining };
    }

    // Mission completed!
    if (t.status === 'sparring') {
      const skillGain = Math.floor(Math.random() * 5) + 3;
      reports.push(`${t.name} completed sparring drills! Skill increased by +${skillGain}.`);
      return {
        ...t,
        status: 'idle' as const,
        daysRemaining: 0,
        skill: Math.min(100, t.skill + skillGain),
        level: t.skill + skillGain >= t.level * 30 ? t.level + 1 : t.level,
      };
    } else if (t.status === 'exhibition') {
      const goldEarned = t.level * 60 + Math.floor(Math.random() * 40);
      const fameEarned = t.level * 15 + Math.floor(Math.random() * 10);
      addedGold += goldEarned;
      addedFame += fameEarned;
      reports.push(`${t.name} returned from provincial exhibition tour! Earned ${goldEarned} gold and ${fameEarned} fame.`);
      return {
        ...t,
        status: 'idle' as const,
        daysRemaining: 0,
        skill: Math.min(100, t.skill + 6),
        level: t.skill + 6 >= t.level * 30 ? t.level + 1 : t.level,
      };
    }

    return t;
  });

  if (addedGold === 0 && addedFame === 0 && reports.length === 0) {
    return { profile: { ...profile, trainees: updatedTrainees }, reports: [] };
  }

  return {
    profile: {
      ...profile,
      gold: profile.gold + addedGold,
      fame: profile.fame + addedFame,
      trainees: updatedTrainees,
    },
    reports,
  };
}
