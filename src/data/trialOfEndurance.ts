import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS } from './opponents';

/**
 * Trial of Endurance — isolated arena-only copies of existing, familiar combat
 * archetypes. These rows are deliberately NOT appended to ALL_OPPONENTS.
 * Their new IDs are session challenge identities, not ladder identities.
 */
function trialOpponent(
  sourceId: string,
  id: string,
  name: string,
  title: string,
  tier: number,
  fightIndex: number,
  healthBonus: number,
  strengthBonus: number,
): OpponentConfig {
  const source = ALL_OPPONENTS.find((row) => row.id === sourceId);
  if (!source) throw new Error(`Trial of Endurance source opponent missing: ${sourceId}`);
  const { featureBout: _featureBout, bountyBout: _bountyBout, ...base } = source;
  return {
    ...base,
    id,
    name,
    title,
    tier,
    fightIndex,
    isBoss: false,
    grudge: undefined,
    bossMechanic: undefined,
    falseTelegraph: undefined,
    panoply: undefined,
    beast: undefined,
    brothers: undefined,
    longMemory: undefined,
    stats: {
      ...source.stats,
      strength: source.stats.strength + strengthBonus,
      healthMax: source.stats.healthMax + healthBonus,
    },
    rewardGold: source.rewardGold + 35,
    rewardFame: source.rewardFame + 10,
    rewardXp: source.rewardXp + 25,
  };
}

export const TRIAL_OF_ENDURANCE_OPPONENTS: readonly OpponentConfig[] = [
  trialOpponent(
    'opp_flaccus',
    'trial_endurance_round_1',
    'Flaccus, the Endurance Test',
    'Trial of Endurance — First Round',
    5,
    1,
    20,
    2,
  ),
  trialOpponent(
    'opp_brutus_anvil',
    'trial_endurance_round_2',
    'Brutus, the Iron Wall',
    'Trial of Endurance — Second Round',
    5,
    2,
    35,
    3,
  ),
  trialOpponent(
    'opp_varro_boss',
    'Varro, the Final Measure',
    'Trial of Endurance — Final Round',
    'Trial of Endurance — Final Round',
    5,
    3,
    50,
    4,
  ),
];

export const TRIAL_OF_ENDURANCE_ROUNDS = 3;
