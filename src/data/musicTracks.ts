export type MusicCategory = 'ambient' | 'combat' | 'ui';

export interface MusicTrack {
  id: string;
  displayName: string;
  category: MusicCategory;
  src: string;
  loop: boolean;
}

export const MUSIC_TRACKS: Record<string, MusicTrack> = {
  title_main: { id: 'title_main', displayName: 'Title Theme', category: 'ambient', src: '/music/title_main.ogg', loop: true },
  city_explore: { id: 'city_explore', displayName: 'City Exploration', category: 'ambient', src: '/music/city_explore.ogg', loop: true },
  ludus_train: { id: 'ludus_train', displayName: 'Training Yard', category: 'ambient', src: '/music/ludus_train.ogg', loop: true },
  arena_combat: { id: 'arena_combat', displayName: 'Arena Combat', category: 'combat', src: '/music/arena_combat.ogg', loop: true },
  boss_final: { id: 'boss_final', displayName: 'Final Boss', category: 'combat', src: '/music/boss_final.ogg', loop: true },
  victory_cue: { id: 'victory_cue', displayName: 'Victory', category: 'ui', src: '/music/victory_cue.ogg', loop: false },
  defeat_cue: { id: 'defeat_cue', displayName: 'Defeat', category: 'ui', src: '/music/defeat_cue.ogg', loop: false },
};
