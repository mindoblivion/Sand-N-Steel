import React from 'react';
import { Flag, Shield, Skull } from 'lucide-react';

interface WithdrawConfirmModalProps {
  /** Back to the fight. Changes nothing — this is the default, safe answer. */
  onStay: () => void;
  /** The explicit confirmation: the bout is forfeit and counts as a defeat. */
  onConfirm: () => void;
}

/**
 * C-8.80B — the confirmation that stands where the old one-tap Armory exit used to be.
 *
 * Presentational only: it holds no state, settles nothing and decides nothing. Opening
 * it is free and "Stay and Fight" is free; the ONLY thing that forfeits the bout is the
 * confirmed click, which the scene hands to `utils/duelWithdrawal`.
 *
 * The copy states the consequence plainly, in the terms the settlement actually applies:
 * a loss on the record, the wound refreshed (or inflicted), the day spent, and no purse,
 * fame or renown. Both controls are full-width, 56 px tall and stacked, so the safe
 * answer is the easiest one to hit on a phone.
 */
export const WithdrawConfirmModal: React.FC<WithdrawConfirmModalProps> = ({ onStay, onConfirm }) => (
  <div
    className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm withdrawal"
    data-withdraw-dialog="true"
  >
    <div className="w-full max-w-md bg-neutral-900 border-2 border-red-700/80 rounded-3xl shadow-2xl text-amber-100 p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 p-2.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300">
          <Flag className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif font-black text-lg sm:text-xl text-red-200 uppercase tracking-wider">
            Withdraw from the bout?
          </h2>
          <p className="text-xs text-neutral-400 mt-1">The sand does not forgive a forfeit.</p>
        </div>
      </div>

      <p className="text-sm text-neutral-200 leading-relaxed">
        Raising the flag ends the bout here, and it is recorded as a <strong className="text-red-300">defeat</strong>.
        Every normal defeat follows: a loss on your record, your wound renewed, and the day spent. You
        take no purse, no fame and no renown.
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onStay}
          data-withdraw-action="stay"
          className="w-full min-h-[56px] px-4 rounded-2xl bg-amber-500/15 border border-amber-400/70 hover:bg-amber-500/25 text-amber-100 font-serif font-bold uppercase tracking-wider text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Shield className="w-4 h-4 text-amber-300" />
          Stay and Fight
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-withdraw-action="confirm"
          className="w-full min-h-[56px] px-4 rounded-2xl bg-red-600/85 hover:bg-red-600 border border-red-400/80 text-white font-serif font-black uppercase tracking-wider text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Skull className="w-4 h-4" />
          Confirm Withdrawal
        </button>
      </div>

      <p className="text-[11px] text-neutral-500 text-center">Choosing to stay costs you nothing.</p>
    </div>
  </div>
);
