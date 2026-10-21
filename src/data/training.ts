/**
 * ===========================================================================
 * SAND & STEEL — TRAINING CATALOGUE
 * ===========================================================================
 * Living City L5 extracted the four drills that used to live inline in
 * `components/hub/TrainingTab.tsx` into this one data module, so the training
 * screen and the authoritative training transaction read the SAME catalogue:
 * the screen can never offer a drill the transaction does not know, and the
 * transaction can never charge a price the screen did not show.
 *
 * Nothing about the drills changed in the move: the same four disciplines, the
 * same one-point stat effect, the same `25 × level` gold cost. Pure data — no
 * React, no storage, no clock.
 */

/** The four stats the Ludus trains. Each drill raises exactly one of them by 1. */
export type TrainingStat = 'strength' | 'agility' | 'stamina' | 'defense';

export interface TrainingAction {
  /** The drill's id — the one base stat it raises. */
  id: TrainingStat;
  name: string;
  description: string;
}

/** The catalogue, in the order the training yard lists its drills. */
export const TRAINING_ACTIONS: readonly TrainingAction[] = [
  {
    id: 'strength',
    name: 'Heavy Log Sleds',
    description: 'Increases light & heavy attack damage.',
  },
  {
    id: 'agility',
    name: 'Reflex Speed Target',
    description: 'Increases movement speed & dodge recovery.',
  },
  {
    id: 'stamina',
    name: 'Sand Endurance Drills',
    description: 'Increases maximum stamina capacity & regen.',
  },
  {
    id: 'defense',
    name: 'Shield Deflection Stance',
    description: 'Reduces damage taken and strengthens block.',
  },
];

/** Gold per training session, per character level — unchanged from the shipped rule. */
export const TRAINING_COST_PER_LEVEL = 25;

/** What one session costs at `level`. The one cost formula the screen and the transaction share. */
export function trainingCost(level: number): number {
  return TRAINING_COST_PER_LEVEL * level;
}

/** The catalogue entry with this id, or `undefined` for an id the Ludus does not train. */
export function getTrainingAction(id: string): TrainingAction | undefined {
  return TRAINING_ACTIONS.find((action) => action.id === id);
}
