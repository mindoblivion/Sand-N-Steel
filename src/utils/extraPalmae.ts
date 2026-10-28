/**
 * ===========================================================================
 * C-TRAIT — THE ONE EXTRA PALMA (design C3b, one resolver for both paths)
 * ===========================================================================
 * The Oct 19 QA amendment (design reconciliation C3) RETIRES the null fallback
 * the Grudge Bout evolved-trait slot and the Steel/Invictus grant shipped with.
 * There is no trait pool to wait for: the extra palma is the palmae ladder —
 * but only ever the four SAFE-SUBSET rows, so a generated rival can never be
 * handed an effect the design did not price.
 *
 *   C3b — "the next entry, cyclically, in the safe-subset order
 *   Sand Sprinter -> Shieldwall Discipline -> Iron Lungs -> Blood Price that the
 *   rival does not already carry."
 *
 * ONE pure resolver (`extraPalmaFor`) and ONE appender (`withExtraPalma`), read
 * by BOTH the grudge generation (`utils/grudgeBouts.ts`) and the mode
 * application (`data/boutModes.ts`). Neither path builds a second trait system:
 * the appended id is an ordinary `Palma.id` on the row's own `palmae` array, so
 * it resolves through the EXISTING `mergeModifiers` block in
 * `utils/combatModifiers.ts` (`buildOpponentModifiers` reads `opponent.palmae`).
 * All four safe-subset rows already carry live effect rows in `data/palmae.ts`.
 *
 * BOSSES NEVER RECEIVE EXTRAS. The fence lives here, in the resolver, so both
 * grant paths are covered by one check: an `isBoss` row and a Feature Bout row
 * resolve to `null`, and `withExtraPalma` then returns the row untouched.
 */
import { getPalma } from '../data/palmae';

/**
 * The safe-subset order, exactly as C3b publishes it. This is the ONLY order
 * the cycle walks — a palma outside it is never granted by either path.
 */
export const SAFE_SUBSET_PALMAE_ORDER = [
  'sand_sprinter',
  'shieldwall_discipline',
  'iron_lungs',
  'blood_price',
] as const;

export type SafeSubsetPalmaId = (typeof SAFE_SUBSET_PALMAE_ORDER)[number];

/** The fields the resolver reads — a roster row, a generated row, or a stub. */
export interface PalmaCarrier {
  palmae?: string[];
  isBoss?: boolean;
  featureBout?: boolean;
}

/**
 * C3b — the extra palma for one row: the first entry of the safe-subset order
 * that the rival does not already carry, wrapping back to Sand Sprinter once all
 * four are carried.
 *
 * The fence is here and nowhere else: a boss or a Feature Bout resolves to
 * `null` (no extras, ever). An absent/empty `palmae` array reads as "carries
 * none", so the first entry is granted — the Marcus/Brutus/Naija/Kallias/Pale
 * Twins case.
 */
export function extraPalmaFor(
  row: PalmaCarrier | null | undefined
): SafeSubsetPalmaId | null {
  if (!row) return null;
  if (row.isBoss === true || row.featureBout === true) return null;
  const carried = new Set(
    Array.isArray(row.palmae) ? row.palmae.filter((id): id is string => typeof id === 'string') : []
  );

  // "The NEXT entry, cyclically": the cycle starts after the palma he already
  // holds furthest along the order (Flaccus -> Shieldwall, Cassius -> Iron Lungs,
  // Drusus -> Blood Price). A rival carrying none starts AT the first entry.
  let start = 0;
  SAFE_SUBSET_PALMAE_ORDER.forEach((id, index) => {
    if (carried.has(id)) start = index + 1;
  });

  for (let step = 0; step < SAFE_SUBSET_PALMAE_ORDER.length; step += 1) {
    const id = SAFE_SUBSET_PALMAE_ORDER[(start + step) % SAFE_SUBSET_PALMAE_ORDER.length];
    if (!carried.has(id)) return id;
  }
  // Every safe-subset row is already carried: the cycle wraps to its first entry.
  return SAFE_SUBSET_PALMAE_ORDER[0];
}

/**
 * The row with its extra palma APPENDED — a new array, the row itself never
 * mutated. Returns the SAME row when there is nothing to grant (a boss, a
 * Feature Bout, or a rival already carrying all four), so an unconditional
 * call is safe on every row.
 */
export function withExtraPalma<T extends PalmaCarrier>(row: T): T {
  const extra = extraPalmaFor(row);
  if (!extra) return row;
  const palmae = Array.isArray(row.palmae) ? row.palmae : [];
  if (palmae.includes(extra)) return row;
  return { ...row, palmae: [...palmae, extra] };
}

/**
 * The granted palma in plain language — "Sand Sprinter — Gain 1 effective
 * agility in hit-chance calculations only." The name and the effect are read
 * from the palma's own row (`data/palmae.ts`), so a card can never drift from
 * the effect the duel applies. Unknown/absent ids resolve to the empty string.
 */
export function extraPalmaLine(id: string | null | undefined): string {
  const palma = getPalma(id ?? undefined);
  return palma ? `${palma.name} — ${palma.description}` : '';
}
