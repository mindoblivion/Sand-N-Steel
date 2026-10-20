/**
 * The Road of Glory — page one of the Records & Lore Library.
 *
 * A read-only rendering of `resolveRoadState`: seven stage nodes laid out as one
 * winding path (sand flats → ludus gate → training yard → fountain plaza → Colosseum
 * forecourt → arena sand → laurel hill).  Reached nodes are lit, the current node is
 * highlighted, and the nodes ahead are dimmed but fully readable — every node prints
 * its own stage name as text, so an icon can accompany the name but never replace it.
 *
 * The **next** node also prints its requirement in words, read from the same
 * `ROAD_STAGES` entry the derivation is built from, and the Champion node always
 * prints the authored champion record line.
 *
 * Nothing here writes anything: the page takes the profile, calls the two pure
 * resolvers once and renders.  It has no state, no effect, no timer and no gesture
 * beyond selecting the page it belongs to (which the Library owns).
 */
import React from 'react';
import {
  Crown,
  Droplets,
  Footprints,
  Leaf,
  Megaphone,
  ScrollText,
  Skull,
} from 'lucide-react';
import { PlayerProfile } from '../../types/game';
import {
  CHAMPION_RECORD_LINE,
  ROAD_STAGES,
  resolveRoadProgress,
  resolveRoadState,
  type RoadStageId,
} from '../../utils/roadOfGlory';

interface RoadOfGloryPageProps {
  profile: PlayerProfile;
}

/** The icon that accompanies each node's name — never a replacement for it. */
const STAGE_ICONS: Record<RoadStageId, React.ComponentType<{ className?: string }>> = {
  nobody: Footprints,
  sworn: ScrollText,
  blooded: Droplets,
  known: Megaphone,
  feared: Skull,
  champion: Crown,
  legend: Leaf,
};

/**
 * The path's horizontal weave, in steps of `WEAVE_STEP_PCT` percent of the column:
 * each node steps out from the left rail and back in again, so the seven stages read
 * as one winding road rather than a list.  Percentages, so the weave scales with the
 * column and cannot overflow a narrow (mobile-landscape) screen.
 */
const ROAD_WEAVE = [0, 1, 2, 3, 2, 1, 0];
const WEAVE_STEP_PCT = 7;

/** Half a node's medallion (w-9 = 36px), so a connector meets its centre exactly. */
const MEDALLION_HALF_PX = 18;

/** The connector between two nodes: down from `from`, across, down into `to`. */
const RoadLink: React.FC<{ from: number; to: number; ahead: boolean }> = ({ from, to, ahead }) => {
  const stroke = ahead ? 'bg-neutral-700' : 'bg-amber-600/50';
  return (
    <div className="relative h-7" aria-hidden="true">
      <span
        className={`absolute top-0 h-3.5 w-0.5 -translate-x-1/2 ${stroke}`}
        style={{ left: `calc(${from}% + ${MEDALLION_HALF_PX}px)` }}
      />
      <span
        className={`absolute top-3.5 h-0.5 ${stroke}`}
        style={{
          left: `calc(${Math.min(from, to)}% + ${MEDALLION_HALF_PX}px)`,
          width: `${Math.abs(to - from)}%`,
        }}
      />
      <span
        className={`absolute top-3.5 h-3.5 w-0.5 -translate-x-1/2 ${stroke}`}
        style={{ left: `calc(${to}% + ${MEDALLION_HALF_PX}px)` }}
      />
    </div>
  );
};

export const RoadOfGloryPage: React.FC<RoadOfGloryPageProps> = ({ profile }) => {
  const stages = resolveRoadState(profile);
  const road = resolveRoadProgress(profile);

  const currentIndex = stages.findIndex((stage) => stage.state === 'current');
  const nextIndex = stages.findIndex((stage) => stage.state === 'ahead');
  const current = ROAD_STAGES[currentIndex] ?? ROAD_STAGES[0];

  return (
    <section className="flex flex-col gap-4 max-w-2xl mx-auto w-full" aria-label="The Road of Glory">
      <header>
        <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase tracking-wider">
          The Road of Glory
        </h3>
        <p className="text-xs font-serif italic text-neutral-400 mt-1">
          Every gladiator walks the same road. The scribes record how far.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-200 uppercase tracking-wider">
            Now: {current.name}
          </span>
          {road.bannerDevice && (
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300">
              Banner: {road.bannerDevice}
            </span>
          )}
        </div>
      </header>

      <ol className="flex flex-col w-full" data-road-stage-count={stages.length}>
        {stages.map((stage, index) => {
          const meta = ROAD_STAGES[index];
          const Icon = STAGE_ICONS[stage.id];
          const isCurrent = index === currentIndex;
          const isNext = index === nextIndex;

          const card =
            stage.state === 'reached'
              ? 'border-amber-500/60 bg-amber-500/10'
              : isCurrent
                ? 'border-amber-300 ring-2 ring-amber-400/60 bg-amber-500/20'
                : 'border-neutral-700 bg-neutral-900/70';
          const medallion =
            stage.state === 'reached'
              ? 'bg-amber-500 text-neutral-950 border-amber-300'
              : isCurrent
                ? 'bg-amber-300 text-neutral-950 border-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.55)]'
                : 'bg-neutral-800 text-neutral-400 border-neutral-600';
          const name = stage.state === 'ahead' ? 'text-neutral-300' : 'text-amber-100';
          const offset = ROAD_WEAVE[index] * WEAVE_STEP_PCT;

          return (
            <li key={stage.id}>
              {index > 0 && (
                <RoadLink
                  from={ROAD_WEAVE[index - 1] * WEAVE_STEP_PCT}
                  to={offset}
                  ahead={stage.state === 'ahead'}
                />
              )}
              <div className="flex items-start gap-3" style={{ marginLeft: `${offset}%` }}>
                <span
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${medallion}`}
                  aria-hidden="true"
                >
                  <Icon className="w-4 h-4" />
                </span>

                <div
                  className={`flex-1 min-w-0 rounded-2xl border px-3 py-2.5 ${card}`}
                  data-road-stage={stage.id}
                  data-road-state={stage.state}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <h4 className={`font-serif font-black text-sm uppercase tracking-wider ${name}`}>
                      {meta.name}
                    </h4>
                    {isCurrent && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                        You stand here
                      </span>
                    )}
                    {stage.state === 'reached' && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500/90">
                        Reached
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] font-serif italic text-neutral-400">{meta.place}</p>

                  {stage.id === 'champion' && (
                    <p className="mt-2 rounded-xl border border-amber-600/60 bg-amber-500/10 px-3 py-2 font-serif text-[11px] leading-relaxed text-amber-200">
                      {CHAMPION_RECORD_LINE}
                    </p>
                  )}

                  {/* The next stage's requirement, in words.  The champion's record line
                      above already IS his requirement, so it is not printed twice. */}
                  {isNext && meta.requirement !== CHAMPION_RECORD_LINE && (
                    <p className="mt-2 font-serif text-xs text-amber-200">
                      To reach it: {meta.requirement}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
