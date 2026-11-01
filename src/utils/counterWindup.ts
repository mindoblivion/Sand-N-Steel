/**
 * C-8.75C — the queued counter has one explicit announce step before it lands.
 * This tiny state resolver keeps the boss's existing quick-attack resolution intact.
 */
export type CounterWindupStep = 'none' | 'announce' | 'resolve';

export function nextCounterWindupStep(
  counterQueued: boolean,
  windupAnnounced: boolean,
): CounterWindupStep {
  if (!counterQueued) return 'none';
  return windupAnnounced ? 'resolve' : 'announce';
}
