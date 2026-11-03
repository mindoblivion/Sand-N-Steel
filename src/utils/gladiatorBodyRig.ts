import { normalizeGladiatorWeight } from './gladiatorWeight';

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

export function getGladiatorBodyRigProfile(weight: unknown): GladiatorBodyRigProfile {
  const weightLb = normalizeGladiatorWeight(weight);
  if (weightLb <= 180) {
    const progress = (weightLb - 140) / 40;
    return {
      coreScale: 0.985 + progress * 0.015,
      limbScale: 0.975 + progress * 0.025,
    };
  }
  const progress = (weightLb - 180) / 120;
  return {
    coreScale: 1 + progress * 0.035,
    limbScale: 1 + progress * 0.06,
  };
}
