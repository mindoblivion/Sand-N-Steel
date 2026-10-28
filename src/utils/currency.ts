/**
 * The one reader of the player's gold.
 *
 * WHY THIS EXISTS (Gold/NaN). Gold used to be trusted wherever it was read. A saved
 * profile whose `gold` is missing or unusable — an older schema, a hand-edited file, a
 * cloud save written by another build — reached the duel settlement as `undefined`, and
 * `base.gold + stats.goldEarned` answered `NaN`. That `NaN` was written into the profile
 * and persisted, so from then on every gold readout printed "NaN": the hub header, the
 * shop, the workshop, and the result screen's "Purse Now" row after each fight.
 *
 * `normalizeGold` is deliberately the ONLY place that decides what an unusable purse
 * reads as, in the same spirit as `normalizeInjury` for the injury slot. A finite number
 * is returned unchanged (gold is never re-rounded here); anything else — `NaN`,
 * `Infinity`, a missing field, a string, `null` — reads as `0`, and a negative purse
 * (which no rule in the game can produce) is floored at `0` so a corrupt save can never
 * pay out a debt.
 */
export function normalizeGold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}
