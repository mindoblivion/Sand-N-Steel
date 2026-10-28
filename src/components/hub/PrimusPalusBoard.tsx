import React from 'react';
import { PlayerProfile } from '../../types/game';
import { ALL_OPPONENTS, PRIMUS_PALUS_LADDER } from '../../data/opponents';
import { bannerDeviceSpec } from '../../utils/heraldry';
// STORY-4a — the grudge cards (Pitch A9 §5).  Every rival with a LIVE grudge gets
// one: base -> adjusted from the C-A helpers and the C-TRAIT palma by name.  The
// card is read, never computed, here — `grudgeBouts` stays the only place a shift,
// a cap or a grant is decided.
import { boardGrudgeCards } from '../../utils/mercyBouts';

interface PrimusPalusBoardProps {
  profile: PlayerProfile;
}

/**
 * STORY-2 — THE PRIMUS PALUS BOARD, in the Colosseum hub beside the tournament
 * card.
 *
 * The board is the city's own record of the champions' ladder, painted over the
 * cast of record (`src/data/opponents.ts`): Aurelius's plaque on top, the
 * challengers' row in ladder order, and — only after the player's FIRST WIN (the
 * Chalking) — the player's own line at the bottom, with the banner device if one
 * has been sworn. Before that first win the line is an UNCHALKED BLANK: the
 * board does not claim a name it has not earned.
 *
 * It derives everything from the profile and the roster. It has no state, reads
 * no storage and adds no save field — `fightsWon` is the Chalking's evidence and
 * `road.bannerDevice` is the device.
 *
 * STORY-4a — a challenger carrying a LIVE grudge also carries a GRUDGE CARD: the
 * rival's profile shifts printed base -> adjusted through `grudgeProfileLine`
 * (the published ±0.15 caps and the [0.05, 0.95] clamp live in `grudgeBouts.ts`,
 * never here) and the palma C-TRAIT granted, by name.  The card names the
 * GENERATED bout row it belongs to (`grudge_<baseId>`, the row a grudge bout is
 * started with) exactly as the entry names its roster row — the board has no
 * click target and this adds no navigation system.
 */
export const PRIMUS_PALUS_BOARD_EPIGRAPH =
  'The laurel lists run a hundred years. The current name has held four. Aurelius.';

/** The plaque's own attribution for the epigraph above. */
export const PRIMUS_PALUS_EPIGRAPH_SPEAKER = 'Dionysios';

/** The champion the plaque carries: the roster's final boss, by data not by id. */
export function primusPalusChampion() {
  return ALL_OPPONENTS.find((opponent) => opponent.isBoss === true && opponent.tier === 4);
}

/** The ladder's challengers in ladder order, the champion's plaque excluded. */
export function primusPalusChallengers() {
  const champion = primusPalusChampion();
  return PRIMUS_PALUS_LADDER.filter((opponent) => opponent.id !== champion?.id);
}

/** The short name a plaque prints — the epithet stays in the roster. */
const shortName = (name: string): string => name.split(' the ')[0].trim() || name;

export const PrimusPalusBoard: React.FC<PrimusPalusBoardProps> = ({ profile }) => {
  const champion = primusPalusChampion();
  const challengers = primusPalusChallengers();
  const chalked = typeof profile.fightsWon === 'number' && profile.fightsWon >= 1;
  const device = bannerDeviceSpec(profile.road?.bannerDevice);
  // STORY-4a — one card per rival with a live grudge, keyed by the base roster id
  // so it rides that rival's own entry.
  const grudgeCards = new Map(
    boardGrudgeCards(profile).map((card) => [card.rivalId, card] as const)
  );

  return (
    <section
      data-primus-palus-board
      data-board-chalked={chalked ? 'true' : 'false'}
      className="rounded-3xl border-2 border-amber-700/60 bg-gradient-to-b from-stone-900 via-neutral-950 to-stone-900 p-5 sm:p-6 shadow-2xl"
    >
      <div className="text-center">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-500/80">
          The Colosseum
        </div>
        <h3 className="font-serif font-black text-xl sm:text-2xl uppercase tracking-[0.15em] text-amber-200 mt-1">
          Primus Palus
        </h3>
        <p className="font-serif italic text-[11px] sm:text-xs text-amber-100/70 mt-2 leading-relaxed">
          “{PRIMUS_PALUS_BOARD_EPIGRAPH}”
          <span className="not-italic text-amber-500/80"> — {PRIMUS_PALUS_EPIGRAPH_SPEAKER}</span>
        </p>
      </div>

      {/* THE CURRENT NAME — the plaque the rest of the board is measured against. */}
      {champion && (
        <div
          data-board-champion={champion.id}
          className="mt-4 rounded-2xl border border-amber-400/70 bg-amber-950/30 px-4 py-3 text-center shadow-inner"
        >
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400">
            The name the sand has held
          </div>
          <div className="font-serif font-black text-lg sm:text-xl text-amber-100 uppercase tracking-wide">
            {shortName(champion.name)}
          </div>
          <div className="font-serif italic text-[11px] text-amber-200/70">{champion.title}</div>
        </div>
      )}

      {/* THE CHALLENGERS' ROW — the ladder's bosses and named fighters, in order. */}
      <ol className="mt-4 flex flex-col gap-1.5" data-board-challengers={challengers.length}>
        {challengers.map((opponent) => {
          const card = grudgeCards.get(opponent.id);
          return (
            <li
              key={opponent.id}
              data-board-entry={opponent.id}
              className="border-b border-neutral-800/80 pb-1.5 font-serif"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-amber-100/90 truncate">{opponent.name}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 shrink-0">
                  {opponent.isBoss ? 'Champion' : `Tier ${opponent.tier} · Rung ${opponent.fightIndex}`}
                </span>
              </div>
              {/* STORY-4a — THE GRUDGE CARD.  Present only for a rival whose grudge
                  is live (a settled grudge is gone from the board).  Numbers and
                  the granted palma are read from the grudge helpers; the card
                  names the generated bout row, never a new route. */}
              {card && (
                <div
                  data-board-grudge={card.rivalId}
                  data-board-grudge-bout={card.boutId}
                  data-board-grudge-open={card.open ? 'true' : 'false'}
                  data-board-grudge-palma={card.palmaName || undefined}
                  className="mt-1.5 rounded-lg border border-rose-800/70 bg-rose-950/30 px-2.5 py-1.5"
                >
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-rose-300">
                    Grudge · Tier {card.grudgeTier}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-200 leading-relaxed">
                    {card.shifts}
                  </div>
                  {card.trait && (
                    <div className="text-[10px] font-mono text-amber-200 leading-relaxed">
                      {card.trait}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* THE PLAYER'S LINE — chalked only after the first win. */}
      <div className="mt-4 pt-3 border-t border-amber-700/40">
        {chalked ? (
          <div
            data-board-player={profile.name}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="font-serif font-bold text-sm text-amber-200">{profile.name}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500/80">
              {device ? device.latin : 'No device sworn'}
            </span>
          </div>
        ) : (
          <div
            data-board-player="unchalked"
            aria-label="An unchalked line"
            className="h-5 border-b border-dashed border-neutral-700"
          />
        )}
      </div>
    </section>
  );
};
