// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { VISITORS } from '../data/visitors';
import { purchaseVisitorOffer } from './visitorPurchase';
import { CHARIOT_PARTS, chariotPartsBySlot, getChariotPart, getChariotPartByFinish } from '../data/chariotParts';
import {
  describeChariotRejection,
  equipChariotPart,
  getChariotEquipEligibility,
  getChariotPurchaseEligibility,
  ownsChariotPart,
  purchaseChariotPart,
} from './chariotLoadout';

describe('Living City L16B — Ventive visitor livery', () => {
  test('the finish is a real cosmetic catalogue part, but not workshop stock', () => {
    const part = getChariotPart('finish_ventive');
    expect(part).toBeDefined();
    expect(part?.slot).toBe('finish');
    expect(part?.finish).toBe('ventive');
    expect(part?.partClass).toBe('cosmetic');
    expect(part?.price).toBe(900);
    expect(part?.visitorOnly).toBe(true);
    expect(getChariotPartByFinish('ventive')).toBe(part);
    expect(chariotPartsBySlot('finish').some((entry) => entry.id === part?.id)).toBe(false);
    expect(chariotPartsBySlot('finish', true).some((entry) => entry.id === part?.id)).toBe(true);
    expect(CHARIOT_PARTS[CHARIOT_PARTS.length - 1].id).toBe('finish_triumph_banners');
  });

  test('workshop purchase and equip fail closed until the visitor grants ownership', () => {
    const profile = createNewProfile('Visitor livery test');
    expect(getChariotPurchaseEligibility(profile, 'finish_ventive')).toEqual({
      ok: false, reason: 'visitor-only',
    });
    expect(purchaseChariotPart(profile, 'finish_ventive')).toEqual({
      ok: false, reason: 'visitor-only',
    });
    expect(describeChariotRejection('visitor-only')).toContain('travelling visitors');
    expect(getChariotEquipEligibility(profile, 'finish_ventive')).toEqual({
      ok: false, reason: 'not-owned',
    });
    expect(equipChariotPart(profile, 'finish_ventive', 'finish')).toEqual({
      ok: false, reason: 'not-owned',
    });
    expect(ownsChariotPart(profile, 'finish_ventive')).toBe(false);
  });
  test('a completed bladesmith trade grants the finish and it can then be equipped', () => {
    const base = createNewProfile('Ventive equip test');
    const profile = { ...base, gold: 1000, time: { total: 4 * 7 } };
    const result = purchaseVisitorOffer(profile, VISITORS[0].id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.kind).toBe('part');
    const equipped = equipChariotPart(result.profile, 'finish_ventive', 'finish');
    expect(equipped.ok).toBe(true);
    if (equipped.ok) {
      expect(ownsChariotPart(equipped.profile, 'finish_ventive')).toBe(true);
      expect(equipped.profile.chariot?.equipped.finish).toBe('finish_ventive');
    }
  });

});
