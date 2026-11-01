export type TrainingStat = 'strength' | 'agility' | 'stamina' | 'defense';
export interface TrainingAction { id: TrainingStat; name: string; description: string; }
export const TRAINING_ACTIONS: readonly TrainingAction[] = [
  { id: 'strength', name: 'Heavy Log Sleds', description: 'Increases light & heavy attack damage.' },
  { id: 'agility', name: 'Reflex Speed Target', description: 'Increases movement speed & dodge recovery.' },
  { id: 'stamina', name: 'Sand Endurance Drills', description: 'Increases maximum stamina capacity & regen.' },
  { id: 'defense', name: 'Shield Deflection Stance', description: 'Reduces damage taken and strengthens block.' },
];
export function getTrainingAction(id: string): TrainingAction | undefined {
  return TRAINING_ACTIONS.find((action) => action.id === id);
}
