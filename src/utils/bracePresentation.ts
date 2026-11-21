import type { WeaponType } from '../types/game';

/** Player-facing copy for the shared defensive action, keyed by equipped weapon family. */
export interface BracePresentation {
  title: string;
  description: string;
  combatLog: string;
}

export function getBracePresentation(weaponType: WeaponType): BracePresentation {
  if (weaponType === 'spear') {
    return {
      title: 'Spear Brace',
      description: 'Set the spear shaft across your body to deflect the incoming blow.',
      combatLog: 'braces the spear shaft.',
    };
  }

  return {
    title: 'Shield Guard',
    description: 'Brace behind your shield to absorb the incoming blow.',
    combatLog: 'braces behind their shield.',
  };
}
