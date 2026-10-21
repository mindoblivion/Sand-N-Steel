import React, { useMemo, useState } from 'react';
import { UserRound, Coins, Backpack } from 'lucide-react';
import type { PlayerProfile } from '../../types/game';
import { readSeenVisitors, resolveVisitorSchedule } from '../../utils/visitorSchedule';
import { resolveVisitorEncounter } from '../../utils/visitorEncounter';
import type {
  VisitorPurchaseRejectionReason,
  VisitorPurchaseResult,
} from '../../utils/visitorPurchase';

interface VisitorPanelProps {
  /** The newest committed profile — the panel renders what it says, never a copy. */
  profile: PlayerProfile;
  /**
   * L11 — the ONE encounter path. `App.handleVisitorEncounter` records the meeting
   * through `utils/visitorEncounter` and saves once; this panel only says WHO the
   * player selected, and never writes history itself.
   */
  onEncounter: (visitorId: string) => void;
  /**
   * L12 — the ONE purchase path. `App.handleVisitorPurchase` re-resolves today's
   * offer against the newest profile, charges the canonical price, grants the item
   * and completes the visitor in one save. The panel sends only the visitor id and
   * renders the result it gets back.
   */
  onPurchase: (visitorId: string) => VisitorPurchaseResult;
  onClose: () => void;
}

/** Plain-language refusal, so the player is never told "the trade failed" and nothing else. */
function refusalLine(reason: VisitorPurchaseRejectionReason): string {
  switch (reason) {
    case 'insufficient-gold':
      return 'You cannot afford this.';
    case 'already-completed':
      return 'This visitor has already finished their trade with you.';
    case 'not-in-town':
    case 'no-offer':
      return 'That offer is no longer on the cart.';
    default:
      return 'The trade could not be completed.';
  }
}

/**
 * Living City L11/L12 — the city's visitor panel: who is in town today, what each
 * brought, and the one trade each will make.
 *
 * The list is `resolveVisitorSchedule(profile)` — the L10 resolver, unfiltered and
 * unimitated — so a visitor appears here exactly when the schedule says they are in
 * the city, and a completed visitor never appears at all. Selecting a visitor is the
 * meaningful encounter that records `seenVisitors`; buying the day's offer is the
 * L12 purchase, which charges the canonical `ITEMS_DB` price and completes that
 * visitor permanently. The panel itself writes nothing: it calls the two App
 * transactions and renders what the newest profile says, so "MET" still means met,
 * and only a completed trade removes the row.
 *
 * Follows the existing city panel conventions (`PreFightModal`, `PreRacePanel`):
 * a fixed overlay above the hub, one card, a single close control, and a scrollable
 * body so the whole list fits a landscape phone.
 */
export const VisitorPanel: React.FC<VisitorPanelProps> = ({
  profile,
  onEncounter,
  onPurchase,
  onClose,
}) => {
  const arrivals = useMemo(() => resolveVisitorSchedule(profile).arrivals, [profile]);
  const seen = useMemo(() => readSeenVisitors(profile), [profile]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // The day the panel is showing, read back from the resolver so the header cannot
  // claim a different day from the list beneath it.
  const day = useMemo(() => resolveVisitorSchedule(profile).day, [profile]);
  const selected = selectedId ? resolveVisitorEncounter(profile, selectedId) : null;
  const price = selected?.item ? selected.item.price : null;
  const affordable =
    price !== null &&
    typeof price === 'number' &&
    Number.isFinite(price) &&
    Number.isFinite(profile.gold) &&
    profile.gold >= price;

  const handleBuy = () => {
    if (!selected) return;
    const visitorName = selected.visitor.name;
    const result = onPurchase(selected.visitor.id);
    if (result.ok) {
      // The visitor is completed, so the schedule no longer lists them: clear the
      // selection and say plainly that the opportunity is gone.
      setSelectedId(null);
      setFeedback(`${visitorName} has departed — the trade is complete.`);
      return;
    }
    setFeedback(refusalLine(result.reason));
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div
        data-testid="visitor-panel"
        className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-fadeIn text-amber-100"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-serif uppercase tracking-widest text-amber-400 font-bold">
              City Day {day}
            </span>
            <h3 className="font-serif font-black text-xl text-amber-100 uppercase">
              Visitors in the City
            </h3>
            <p className="text-[11px] font-mono text-neutral-400">
              Travellers holding at the gate while the season lasts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm cursor-pointer"
            title="Close the visitor panel"
          >
            ✕
          </button>
        </div>

        {feedback && (
          <p
            data-testid="visitor-purchase-message"
            role="status"
            className="text-[11px] font-mono leading-relaxed text-amber-200 bg-amber-950/30 border border-amber-800/50 rounded-xl px-3 py-2 mb-3"
          >
            {feedback}
          </p>
        )}

        {arrivals.length === 0 ? (
          <p className="text-xs font-mono text-neutral-400 leading-relaxed">
            No visitors are in the city today. They follow their own seasons, not yours.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 mb-4">
            {arrivals.map(({ visitor }) => {
              const met = seen.includes(visitor.id);
              const active = visitor.id === selectedId;
              return (
                <li key={visitor.id}>
                  <button
                    data-testid={`visitor-row-${visitor.id}`}
                    onClick={() => {
                      setSelectedId(visitor.id);
                      setFeedback(null);
                      // The encounter: an explicit selection, once per visitor.
                      onEncounter(visitor.id);
                    }}
                    className={`w-full min-h-[48px] text-left rounded-2xl border px-3 py-2.5 flex items-center gap-3 transition-all active:scale-[0.99] cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 border-amber-400/80'
                        : 'bg-neutral-950 border-neutral-800 hover:border-amber-600/60'
                    }`}
                  >
                    <UserRound className="w-5 h-5 shrink-0 text-amber-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif font-bold text-sm text-amber-100 truncate">
                        {visitor.name}
                      </span>
                      <span className="block text-[11px] font-serif text-neutral-400 truncate">
                        {visitor.title}
                      </span>
                    </span>
                    {met && (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-300 bg-emerald-950/70 border border-emerald-700/60 px-1.5 py-0.5 rounded">
                        Met
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3.5">
            <div className="font-serif font-black text-sm text-amber-100 uppercase tracking-wide">
              {selected.visitor.name}
            </div>
            <div className="text-[11px] font-serif italic text-neutral-400 mb-2">
              {selected.visitor.title}
            </div>
            <p className="text-[11px] font-sans leading-relaxed text-neutral-300 mb-3">
              {selected.visitor.description}
            </p>

            <div className="flex items-start gap-2 rounded-xl border border-amber-800/50 bg-amber-950/20 p-2.5">
              <Backpack className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
                  Brought to trade
                </div>
                <div className="font-serif font-bold text-xs text-amber-100 truncate">
                  {selected.item ? selected.item.name : selected.visitor.offer.summary}
                </div>
                {selected.item && (
                  <p className="text-[10px] font-sans leading-snug text-neutral-400 mt-0.5">
                    {selected.item.description}
                  </p>
                )}
                <p className="text-[10px] font-mono text-neutral-300 mt-1 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-400" />
                  {price !== null && Number.isFinite(price)
                    ? `${price} gold`
                    : 'Price unavailable'}
                </p>
              </div>
            </div>

            <button
              data-testid="visitor-buy-button"
              onClick={handleBuy}
              disabled={!selected.item || price === null || !affordable}
              className="mt-3 w-full min-h-[48px] py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-serif font-bold text-xs uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {affordable
                ? `Buy for ${price} gold`
                : selected.item
                  ? 'Not enough gold'
                  : 'Nothing to buy'}
            </button>
            {!affordable && selected.item && (
              <p className="text-[10px] font-mono text-neutral-400 mt-2">
                You carry {profile.gold} gold.
              </p>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full min-h-[48px] py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-serif font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
        >
          Leave
        </button>
      </div>
    </div>
  );
};
