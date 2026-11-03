import { normalizeGladiatorWeight } from './gladiatorWeight';
import { resolvePhysicalDevelopment } from './physicalDevelopment';

/**
 * Conservative, transverse-only body-shape multipliers for the shipped
 * 66-joint humanoid rig. The model has no morph targets and its clips contain
 * no scale tracks, so the existing skeleton can safely carry this profile.
 *
 * Length axes are never scaled: pelvis/spine and limb bones retain their
 * authored segment lengths, weapon grip frames and animation timing.
 */
export interface GladiatorBodyRigProfile {
  coreScale: number;
  limbScale: number;
}

export function getGladiatorBodyRigProfile(
  weight: unknown,
  development?: unknown,
): GladiatorBodyRigProfile {
  const weightLb = normalizeGladiatorWeight(weight);
  const physique = resolvePhysicalDevelopment(development);
  const strengthWork = Math.min(physique.strengthSessions / 60, 1);
  const staminaWork = Math.min(physique.staminaSessions / 60, 1);
  const defenseWork = Math.min(physique.defenseSessions / 60, 1);
  const consistency = Math.min(physique.trainingStreak / 14, 1);
  const accumulatedTraining = Math.min(physique.trainingDays / 60, 1);
  const recovery = Math.min(physique.recoveryDays / 30, 1);

  const coreDevelopment =
    staminaWork * 0.02 +
    defenseWork * 0.01 +
    accumulatedTraining * 0.01 +
    consistency * 0.005 +
    recovery * 0.005;
  const limbDevelopment =
    strengthWork * 0.04 +
    staminaWork * 0.015 +
    accumulatedTraining * 0.01 +
    consistency * 0.005 +
    recovery * 0.005;

  if (weightLb <= 180) {
    const progress = (weightLb - 140) / 40;
    return {
      coreScale: 0.985 + progress * 0.015 + coreDevelopment,
      limbScale: 0.975 + progress * 0.025 + limbDevelopment,
    };
  }
  const progress = (weightLb - 180) / 120;
  return {
    coreScale: 1 + progress * 0.035 + coreDevelopment,
    limbScale: 1 + progress * 0.06 + limbDevelopment,
  };
}
