import { describe, expect, test } from 'bun:test';
import { canDebitGold } from './goldTransactions';

describe('shared gold debit validation', () => {
  test('allows exact, partial, and zero-cost debits', () => {
    expect(canDebitGold(100, 40)).toBe(true);
    expect(canDebitGold(40, 40)).toBe(true);
    expect(canDebitGold(100, 0)).toBe(true);
  });

  test('rejects malformed, negative, non-finite, and unaffordable values', () => {
    for (const balance of [undefined, null, '100', Number.NaN, Infinity, -1]) {
      expect(canDebitGold(balance, 10)).toBe(false);
    }
    for (const price of [undefined, null, '10', Number.NaN, Infinity, -1]) {
      expect(canDebitGold(100, price)).toBe(false);
    }
    expect(canDebitGold(9, 10)).toBe(false);
  });

  test('rejects a positive debit that disappears at extreme balance magnitudes', () => {
    expect(canDebitGold(Number.MAX_VALUE, 1)).toBe(false);
    expect(canDebitGold(Number.MAX_VALUE, 300)).toBe(false);
    expect(canDebitGold(Number.MAX_VALUE / 2, 900)).toBe(false);
  });
});
