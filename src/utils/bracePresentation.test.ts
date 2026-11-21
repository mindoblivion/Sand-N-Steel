// @ts-ignore - bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { getBracePresentation } from './bracePresentation';

describe('weapon-aware defensive stance presentation', () => {
  test('two-handed spear uses spear brace language', () => {
    expect(getBracePresentation('spear')).toEqual({
      title: 'Spear Brace',
      description: 'Set the spear shaft across your body to deflect the incoming blow.',
      combatLog: 'braces the spear shaft.',
    });
  });

  test('sword and shield retain shield guard language', () => {
    expect(getBracePresentation('sword_shield').title).toBe('Shield Guard');
    expect(getBracePresentation('sword_shield').combatLog).toBe('braces behind their shield.');
  });

  test('a mace with an independent shield uses shield guard language', () => {
    expect(getBracePresentation('mace', true).title).toBe('Shield Guard');
  });

  test('weapon-only families do not claim the fighter has a shield', () => {
    expect(getBracePresentation('dual_blades').title).toBe('Weapon Brace');
    expect(getBracePresentation('mace').combatLog).toBe('sets their weapons to meet the blow.');
  });
});
