import type { WeaponType } from '../types/game';

/** Player-facing copy for the shared defensive action, keyed by equipped weapon family. */
export interface BracePresentation {
  title: string;
  description: string;
  combatLog: string;
}

export function getBracePresentation(
  weaponType: WeaponType,
  hasShield: boolean = weaponType === 'sword_shield',
): BracePresentation {
  if (weaponType === 'spear') {
    return {
      title: 'Spear Brace',
      description: 'Set the spear shaft across your body to deflect the incoming blow.',
      combatLog: 'braces the spear shaft.',
    };
  }

  if (hasShield) {
    return {
      title: 'Shield Guard',
      description: 'Brace behind your shield to absorb the incoming blow.',
      combatLog: 'braces behind their shield.',
    };
  }

  return {
    title: 'Weapon Brace',
    description: 'Set your weapons to meet and deflect the incoming blow.',
    combatLog: 'sets their weapons to meet the blow.',
  };
}
