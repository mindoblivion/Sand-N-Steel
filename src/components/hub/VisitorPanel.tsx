import React, { useMemo, useState } from 'react';
import { Backpack, Coins, UserRound } from 'lucide-react';
import type { PlayerProfile } from '../../types/game';
import { getItemById } from '../../data/itemsDB';
import { readSeenVisitors, resolveVisitorSchedule } from '../../utils/visitorSchedule';
import { resolveVisitorEncounter } from '../../utils/visitorEncounter';
import {
  purchaseVisitorOffer,
  resolveVisitorBargainPrice,
  type VisitorPurchaseRejectionReason,
  type VisitorPurchaseResult,
} from '../../utils/visitorPurchase';

interface VisitorPanelProps {
  profile: PlayerProfile;
  onEncounter: (visitorId: string) => void;
  onPurchase: (visitorId: string) => VisitorPurchaseResult;
  onClose: () => void;
}

function refusalLine(reason: VisitorPurchaseRejectionReason): string {
  switch (reason) {
    case 'insufficient-gold': return 'You cannot afford this offer.';
    case 'already-completed': return 'This visitor has already completed their trade.';
    case 'not-in-town':
    case 'no-offer': return 'That offer is no longer available.';
    default: return 'The trade could not be completed.';
  }
}

/** The visitor panel is presentation only; App owns both profile writes. */
export const VisitorPanel: React.FC<VisitorPanelProps> = ({
  profile, onEncounter, onPurchase, onClose,
}) => {
  const schedule = useMemo(() => resolveVisitorSchedule(profile), [profile]);
  const seen = useMemo(() => readSeenVisitors(profile), [profile]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selected = selectedId ? resolveVisitorEncounter(profile, selectedId) : null;
  const item = selected ? getItemById(selected.offerItemId) ?? null : null;
  const price = selected && item
    ? resolveVisitorBargainPrice(item, selected.visitor.bargainRate)
    : null;
  const affordable = price !== null &&
    Number.isFinite(profile.gold) &&
    profile.gold >= price;

  const buy = () => {
    if (!selected) return;
    const name = selected.visitor.name;
    const result = onPurchase(selected.visitor.id);
    if (result.ok) {
      setSelectedId(null);
      setFeedback(`${name}: trade complete. The visitor has departed.`);
    } else {
      setFeedback(refusalLine(result.reason));
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/85 backdrop-blur-md p-3">
      <section
        data-testid="visitor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-panel-title"
        className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-3xl border-2 border-amber-500/80 bg-neutral-900 p-4 sm:p-5 text-amber-100 shadow-2xl"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
              City Day {schedule.day}
            </div>
            <h2 id="visitor-panel-title" className="font-serif text-xl font-black uppercase">
              Visitors in the City
            </h2>
            <p className="text-[11px] text-neutral-400">
              Travellers holding at the gate while the season lasts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close visitors"
            className="min-h-12 min-w-12 rounded-xl bg-neutral-800 text-neutral-200"
          >✕</button>
        </header>

        {feedback && (
          <p role="status" className="mb-3 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            {feedback}
          </p>
        )}

        {schedule.arrivals.length === 0 ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            No visitors are in the city today. Their journeys follow their own seasons.
          </p>
        ) : (
          <div className="mb-4 flex flex-col gap-2">
            {schedule.arrivals.map(({ visitor }) => {
              const active = visitor.id === selectedId;
              return (
                <button
                  type="button"
                  key={visitor.id}
                  data-testid={`visitor-row-${visitor.id}`}
                  onClick={() => {
                    setSelectedId(visitor.id);
                    setFeedback(null);
                    onEncounter(visitor.id);
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${active ? 'border-amber-400 bg-amber-500/20' : 'border-neutral-800 bg-neutral-950'}`}
                >
                  <UserRound className="h-5 w-5 shrink-0 text-amber-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-sm font-bold">{visitor.name}</span>
                    <span className="block truncate text-[11px] text-neutral-400">{visitor.title}</span>
                  </span>
                  {seen.includes(visitor.id) && (
                    <span className="rounded border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 text-[9px] uppercase text-emerald-300">Met</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {selected && item && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <h3 className="font-serif text-sm font-black uppercase">{selected.visitor.name}</h3>
            <p className="mb-3 text-xs text-neutral-400">{selected.visitor.description}</p>
            <div className="flex items-start gap-2 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3">
              <Backpack className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-amber-400">Brought to trade</div>
                <div className="font-serif text-sm font-bold">{item.name}</div>
                <p className="text-[11px] text-neutral-400">{item.description}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-200">
                  <Coins className="h-3.5 w-3.5" />
                  {price === null ? 'Price unavailable' : `${price} gold`}
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="visitor-buy-button"
              onClick={buy}
              disabled={!affordable}
              className="mt-3 min-h-12 w-full rounded-xl border border-amber-300 bg-amber-500 px-4 py-2 font-serif text-sm font-black uppercase text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {price === null ? 'Unavailable' : `Buy for ${price} Gold`}
            </button>
          </div>
        )}

        <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-xl border border-neutral-700 bg-neutral-800 font-serif text-xs font-bold uppercase text-neutral-200">
          Return to the City
        </button>
      </section>
    </div>
  );
};
