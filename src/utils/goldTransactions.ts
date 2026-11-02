/**
 * Shared validation for gold-denominated purchases.
 *
 * A purchase is affordable only when the balance and price are finite,
 * non-negative numbers, the balance covers the price, and a positive debit
 * produces a strictly smaller representable balance. The final condition
 * prevents purchases from becoming free at extreme IEEE-754 magnitudes.
 */
export function canDebitGold(balance: unknown, price: unknown): boolean {
  if (
    typeof balance !== 'number' ||
    !Number.isFinite(balance) ||
    balance < 0 ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    balance < price
  ) {
    return false;
  }

  const remainder = balance - price;
  return (
    Number.isFinite(remainder) &&
    remainder >= 0 &&
    (price === 0 || remainder < balance)
  );
}
