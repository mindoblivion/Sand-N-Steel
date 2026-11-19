/**
 * BRACKET-1 — the tournament bracket: eight display waves over the shipped
 * ladder (`brief-bracket-1-tournament.md`).
 *
 * The bracket is a VIEW, not a new advancement rule. The shipped ladder has
 * four tiers and twelve rungs; the bracket doc counts waves, the ladder counts
 * boss circuits, and the two numberings meet only at the top. So the eight
 * waves are authored from the shipped rungs — a tier's regulars, or one boss —
 * in strictly increasing difficulty, split at each boss so every wave is a
 * real, already-shipped step in climb order:
 *
 *   1 Blooded    T1 regulars: Marcus, Flaccus
 *   2 Proven     T1 boss: Goliath
 *   3 Rising     T2 regulars: Cassius, Brutus, Naija
 *   4 Feared     T2 boss: Ignis
 *   5 Renowned   T3 regulars: Drusus, Kallias, Pale Twins
 *   6 Champion   T3 boss: Valéria
 *   7 Legend     T4 boss: Aurelius
 *   8 Immortal   Epilogue: Scaevola (first card) + Hermas (second card)
 *
 * The wave names are the bracket doc's, kept; the doc's tier GROUPINGS are
 * not (it puts Goliath + Ignis in one tier and Valéria + Aurelius in another,
 * but the shipped ladder fights them one circuit at a time).
 *
 * The module is pure, in the `featureBouts.ts` / `trialOfEndurance.ts`
 * idiom: roster + record in, verdict out — no storage, no clock, no writes.
 * Wave completeness is DERIVED from `defeatedOpponentIds` (a wave is complete
 * when every rung's id is in the record; wave 8 is complete when either
 * epilogue champion is), so a veteran's record already derives their wave
 * progress on first open and a loss can never un-beat a rung. The stored
 * record (`story.bracket`) holds only the per-wave W/L tallies, written by
 * `resolveBracketAfterDuel` at the duel-result write, for ladder bouts only.
 *
 * Nothing here moves a tier, a rank, a purse or a gate. Advancing a tier is
 * still a ladder boss's first defeat (`resolveVictoryTier`); a loss still
 * costs the shipped loss (no purse + the injury) and never demotes — the
 * bracket doc's "lose 2, demoted one tier" / "lose Tier 8, back to Tier 7"
 * rule is replaced, not implemented (brief §3: demoting to Tier 3 would
 * un-earn Legend and re-lock Scaevola's own gate).
 */

import type {
  BracketProgress,
  BracketWaveRecord,
  OpponentConfig,
  PlayerProfile,
} from '../types/game';
import { ALL_OPPONENTS, TOURNAMENT_TIERS } from '../data/opponents';

/** One display wave: its name, its rungs, and the rows its card shows. */
export interface BracketWaveDefinition {
  wave: number;
  name: string;
  /**
   * The ladder rungs whose defeat completes the wave (waves 1–7). Wave 8 has
   * none — the epilogue champions are not rungs, so nothing about them can
   * advance `currentTier` or add a `bossKills` stripe.
   */
  rungs: OpponentConfig[];
  /**
   * The rows the wave's card shows. Waves 1–7 show their rungs; wave 8 shows
   * the two epilogue champions, Scaevola first, Hermas second.
   */
  cards: OpponentConfig[];
}

/**
 * The §1 table as data. Rungs and cards are resolved from `ALL_OPPONENTS` by
 * id — no purse, stat, level or gate is restated here, so the table cannot
 * drift from the roster. A missing id drops out of its wave (and the suite
 * pins the exact rung counts, so a dropped row fails loudly rather than
 * silently shrinking a wave).
 */
const WAVE_TABLE: readonly {
  wave: number;
  name: string;
  rungIds: readonly string[];
  cardIds: readonly string[];
}[] = [
  { wave: 1, name: 'Blooded', rungIds: ['opp_marcus', 'opp_flaccus'], cardIds: ['opp_marcus', 'opp_flaccus'] },
  { wave: 2, name: 'Proven', rungIds: ['opp_goliath_boss'], cardIds: ['opp_goliath_boss'] },
  { wave: 3, name: 'Rising', rungIds: ['opp_hoplite', 'opp_brutus_anvil', 'opp_naija_fisher'], cardIds: ['opp_hoplite', 'opp_brutus_anvil', 'opp_naija_fisher'] },
  { wave: 4, name: 'Feared', rungIds: ['opp_ignis_boss'], cardIds: ['opp_ignis_boss'] },
  { wave: 5, name: 'Renowned', rungIds: ['opp_centurion_drusus', 'opp_kallias_sparta', 'opp_pale_twins'], cardIds: ['opp_centurion_drusus', 'opp_kallias_sparta', 'opp_pale_twins'] },
  { wave: 6, name: 'Champion', rungIds: ['opp_valeria_boss'], cardIds: ['opp_valeria_boss'] },
  { wave: 7, name: 'Legend', rungIds: ['opp_aurelius_boss'], cardIds: ['opp_aurelius_boss'] },
  { wave: 8, name: 'Immortal', rungIds: [], cardIds: ['opp_scaevola_boss', 'opp_hermas_boss'] },
];

function rowById(id: string): OpponentConfig | undefined {
  return ALL_OPPONENTS.find((row) => row.id === id);
}

export const BRACKET_WAVES: readonly BracketWaveDefinition[] = WAVE_TABLE.map((entry) => ({
  wave: entry.wave,
  name: entry.name,
  rungs: entry.rungIds.map(rowById).filter((row): row is OpponentConfig => !!row),
  cards: entry.cardIds.map(rowById).filter((row): row is OpponentConfig => !!row),
}));

/** One wave, resolved for a profile: derived completeness + stored record. */
export interface ResolvedBracketWave {
  wave: number;
  name: string;
  rungs: OpponentConfig[];
  cards: OpponentConfig[];
  /** Every rung defeated (wave 8: either epilogue champion defeated). */
  complete: boolean;
  /** This is the first incomplete wave — where the player stands. */
  current: boolean;
  attempts: number;
  wins: number;
  losses: number;
  /** The wave's gate in plain words, from data — '' when open or complete. */
  gateText: string;
}

export interface ResolvedBracket {
  waves: ResolvedBracketWave[];
  currentWave: number;
}

function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function felledIds(profile: PlayerProfile | null | undefined): string[] {
  const stored = profile?.defeatedOpponentIds;
  return Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === 'string')
    : [];
}

function storedWaves(profile: PlayerProfile | null | undefined): Record<string, unknown> {
  const stored = profile?.story?.bracket?.waves as unknown;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return stored as Record<string, unknown>;
}

function waveComplete(wave: BracketWaveDefinition, felled: string[]): boolean {
  // Wave 8 has no rungs: either epilogue champion's fall completes the
  // summit. A wave with no rungs and no cards would read complete by
  // vacuity — the table has no such wave, and the suite pins all eight.
  if (wave.wave === 8) return wave.cards.some((card) => felled.includes(card.id));
  return wave.rungs.length > 0 && wave.rungs.every((rung) => felled.includes(rung.id));
}

/**
 * A locked wave's gate in plain words, built only from the wave's own rows
 * and the tier table — the `featureBouts.ts` pattern, never a component's
 * opinion. A future tier reads `Requires Tier N — <name>.`; a wave whose
 * unbeaten rungs are all level-locked reads the opponent cards' own
 * `Locked (Requires LVL N)`. A wave in a passed tier with unbeaten rungs has
 * no gate to print (the tier is behind the player; the rung rows say so by
 * showing no fight button), and an open or complete wave prints ''.
 */
export function bracketWaveGateText(
  wave: BracketWaveDefinition,
  profile: PlayerProfile | null | undefined,
): string {
  if (wave.wave === 8) return '';
  const tier = wave.rungs[0]?.tier;
  if (typeof tier === 'number' && countOrZero(profile?.currentTier) < tier) {
    const info = TOURNAMENT_TIERS.find((entry) => entry.tier === tier);
    return `Requires Tier ${tier}${info ? ` — ${info.name}` : ''}.`;
  }
  const felled = felledIds(profile);
  const unbeaten = wave.rungs.filter((rung) => !felled.includes(rung.id));
  const locked = unbeaten.filter((rung) => countOrZero(profile?.level) < rung.recommendedLevel);
  if (unbeaten.length > 0 && locked.length === unbeaten.length) {
    const minLevel = Math.min(...locked.map((rung) => rung.recommendedLevel));
    return `Locked (Requires LVL ${minLevel})`;
  }
  return '';
}

/**
 * The bracket for a profile: every wave's derived completeness, its stored
 * W/L record, and the current wave. A missing, partial or malformed profile
 * resolves to wave 1 with all waves unplayed, never throws — the same
 * contract `resolveTrialOfEndurance` and `resolveRivalryProgress` keep.
 */
export function resolveBracketProgress(
  profile: PlayerProfile | null | undefined,
): ResolvedBracket {
  const felled = felledIds(profile);
  const record = storedWaves(profile);
  const waves: ResolvedBracketWave[] = BRACKET_WAVES.map((wave) => {
    const raw = record[String(wave.wave)];
    const entry =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return {
      wave: wave.wave,
      name: wave.name,
      rungs: wave.rungs,
      cards: wave.cards,
      complete: waveComplete(wave, felled),
      current: false,
      attempts: countOrZero(entry.attempts),
      wins: countOrZero(entry.wins),
      losses: countOrZero(entry.losses),
      gateText: bracketWaveGateText(wave, profile),
    };
  });
  const firstIncomplete = waves.find((entry) => !entry.complete);
  const currentWave = firstIncomplete ? firstIncomplete.wave : 8;
  for (const entry of waves) entry.current = entry.wave === currentWave;
  return { waves, currentWave };
}

/**
 * The wave a ladder row belongs to — or null. Feature bouts, bounty bouts,
 * the Doctore's Test opponent and any generated row (a grudge rematch) answer
 * null: they are not waves, and a win or loss against one must never tally
 * against a ladder wave.
 */
export function waveForOpponent(
  opponent: OpponentConfig | null | undefined,
): number | null {
  if (!opponent) return null;
  const wave = BRACKET_WAVES.find(
    (entry) => entry.wave !== 8 && entry.rungs.some((rung) => rung.id === opponent.id),
  );
  return wave ? wave.wave : null;
}

/** The duel-result write's input: which wave, and whether the bout was won. */
export interface BracketAfterDuelInput {
  wave: number;
  won: boolean;
  rewardSettlementAccepted: boolean;
}

/**
 * BRACKET-1 — the bracket's own W/L record, written in the same result
 * transaction as the duel's ordinary purse. The caller applies the ladder
 * fence (`exhibition || rivalBout || trialBout`) and resolves the wave with
 * `waveForOpponent`; this helper is identity-stable everywhere else: a wave
 * outside 1–7 (wave 8 never tallies — its completeness is derived), a refused
 * victory (no progression is granted), or a malformed input returns the
 * profile unchanged. A loss tallies losses + attempts on the wave — and
 * nothing else: the resolver never writes `currentTier`, a rank, or a gate.
 */
export function resolveBracketAfterDuel(
  profile: PlayerProfile,
  input: BracketAfterDuelInput,
): PlayerProfile {
  const wave = (input as BracketAfterDuelInput | null | undefined)?.wave;
  const won = (input as BracketAfterDuelInput | null | undefined)?.won;
  const accepted = (input as BracketAfterDuelInput | null | undefined)
    ?.rewardSettlementAccepted;
  if (typeof wave !== 'number' || !Number.isSafeInteger(wave) || wave < 1 || wave > 7) return profile;
  if (typeof won !== 'boolean') return profile;
  if (won && accepted !== true) return profile;
  const resolved = resolveBracketProgress(profile);
  const entry = resolved.waves.find((candidate) => candidate.wave === wave);
  if (!entry) return profile;
  const next: BracketWaveRecord = {
    attempts: entry.attempts + 1,
    wins: entry.wins + (won ? 1 : 0),
    losses: entry.losses + (won ? 0 : 1),
  };
  const bracket: BracketProgress = {
    ...(profile.story?.bracket ?? {}),
    waves: {
      ...(profile.story?.bracket?.waves ?? {}),
      [String(wave)]: next,
    },
  };
  return {
    ...profile,
    story: {
      ...(profile.story ?? {}),
      bracket,
    },
  };
}
