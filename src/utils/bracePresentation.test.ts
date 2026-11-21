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

  test('other weapon families retain the established defensive wording', () => {
    expect(getBracePresentation('dual_blades').title).toBe('Shield Guard');
    expect(getBracePresentation('mace').title).toBe('Shield Guard');
  });
});
