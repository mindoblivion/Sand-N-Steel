import type { PlayerInjury } from '../types/game';

export type BodyDamageStage = 'clear' | 'bruised' | 'swollen';

export interface BodyDamageProfile {
  /** Darkened contusion overlays; 0–0.85. */
  bruiseIntensity: number;
  /** Raised, skin-toned swelling overlays; 0–0.65. */
  swellingIntensity: number;
  stage: BodyDamageStage;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Translate live bout health and the profile's active injury into body-visible
 * damage. No HP bar or persistence is needed for this read: health damage is
 * visible during the bout; the existing two-fight injury keeps marks after a loss.
 */
export function getBodyDamageProfile(
  health: unknown,
  maxHealth: unknown,
  injury?: PlayerInjury | null,
): BodyDamageProfile {
  const validHealth = typeof health === 'number' && Number.isFinite(health);
  const validMax = typeof maxHealth === 'number' && Number.isFinite(maxHealth) && maxHealth > 0;
  const ratio = validHealth && validMax ? clamp(health / maxHealth, 0, 1) : 1;

  const bruiseFromDamage = ratio <= 0.75
    ? clamp(((0.75 - ratio) / 0.55) * 0.85, 0, 0.85)
    : 0;
  const swellingFromDamage = ratio <= 0.45
    ? clamp(((0.45 - ratio) / 0.35) * 0.65, 0, 0.65)
    : 0;
  const hasActiveInjury =
    injury != null &&
    typeof injury.fightsRemaining === 'number' &&
    Number.isFinite(injury.fightsRemaining) &&
    injury.fightsRemaining > 0;

  const bruiseIntensity = Math.max(bruiseFromDamage, hasActiveInjury ? 0.55 : 0);
  const swellingIntensity = Math.max(swellingFromDamage, hasActiveInjury ? 0.25 : 0);
  const stage: BodyDamageStage = swellingIntensity > 0.25
    ? 'swollen'
    : bruiseIntensity > 0
      ? 'bruised'
      : 'clear';

  return { bruiseIntensity, swellingIntensity, stage };
}
