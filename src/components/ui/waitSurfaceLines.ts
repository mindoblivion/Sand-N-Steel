/**
 * START-1 — the WaitSurface line pool.
 *
 * The waits between screens are part of the sequence, not dead time: they name where
 * the player is going in the fiction (plus a plain gloss of what is actually happening)
 * and they carry a line from the Acta — the keeper's record of the games — in the
 * voice the rest of the game writes in.
 *
 * Pure data plus two small helpers, so the surface's wording can be pinned without a
 * renderer.
 */

export type WaitDestinationId = 'city_hub' | 'arena' | 'circus';

export interface WaitDestination {
  /** Where the player is going, in the fiction. */
  line: string;
  /** The plain gloss: what the wait is actually doing. No jargon, no percentages. */
  gloss: string;
}

export const WAIT_DESTINATIONS: Record<WaitDestinationId, WaitDestination> = {
  city_hub: {
    line: 'The Ishtar Gate opens onto the Via Mercatoria.',
    gloss: 'Loading the city',
  },
  arena: {
    line: 'The sand is raked smooth and the crowd has taken its seats.',
    gloss: 'Entering the arena',
  },
  circus: {
    line: 'The carceres stand open and the teams are at the line.',
    gloss: 'Entering the circus',
  },
};

/**
 * The keeper's Acta lines. Written for a wait of a few seconds: short enough to read
 * in one glance, and about the world rather than about the machine.
 */
export const KEEPER_LINES: readonly string[] = [
  'The keeper inks another name into the Acta; the sand decides the rest.',
  'A lanista\u2019s note: the crowd forgives a slow start, never a still blade.',
  'The Acta records that the morning light reached the arena wall before the crowd did.',
  'Keeper\u2019s tally: the last bout lasted nine breaths, and the crowd counted each one.',
  'They are raking yesterday\u2019s scars out of the sand. It will look untroubled by first light.',
  'An old hand\u2019s advice, kept in the margin: watch the feet, not the sword.',
  'The Acta notes the wind off the eastern gate. It favours one fighter over the other.',
];

/**
 * The Acta line at an index, wrapping in both directions so a tap-to-cycle control can
 * run the index up forever and a negative index is still answerable. A non-finite or
 * missing index resolves to the first line rather than throwing.
 */
export function keeperLineAt(index: number): string {
  if (!Number.isFinite(index)) return KEEPER_LINES[0];
  const size = KEEPER_LINES.length;
  const wrapped = ((Math.trunc(index) % size) + size) % size;
  return KEEPER_LINES[wrapped];
}

/** The next index, wrapping. */
export function nextKeeperIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return (Math.trunc(index) + 1) % KEEPER_LINES.length;
}

/** Where the player is going; unknown ids fall back to the first destination. */
export function waitDestination(id: WaitDestinationId): WaitDestination {
  return WAIT_DESTINATIONS[id] ?? WAIT_DESTINATIONS.city_hub;
}
