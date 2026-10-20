import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import type { StoredProfileSummary } from '../../services/storage';
import { OVERWRITE_ARM_WINDOW_MS, overwriteArmIsLive } from '../../utils/overwriteArm';

interface NewCharacterOverwriteModalProps {
  /** The gladiator already stored on this device — whatever could be read of it. */
  existing: StoredProfileSummary;
  /** Dismissed without choosing (Cancel or ✕). Nothing changes. */
  onCancel: () => void;
  /** The arm landed: continue into creation exactly as it did before this dialog. */
  onConfirm: () => void;
}

/**
 * The in-app confirmation the New Character flow shows when a gladiator is already
 * stored on this device.
 *
 * Starting a new character replaces the stored one when creation completes, so the
 * player is told what would be lost — the existing gladiator's name, rank and fame
 * when the save can be read — and has to arm the erase deliberately: the first tap
 * arms, the second one within `OVERWRITE_ARM_WINDOW_MS` proceeds, and an arm that
 * lapses (or is cancelled) leaves everything exactly as it was.  Nothing here writes
 * or erases a save: it only decides whether creation may start.
 *
 * It follows the game's own dialog language — the same card, accent bar, ✕, ≥48dp
 * controls and serif headings `DeleteAccountModal` uses — and never `window.confirm`.
 */
export const NewCharacterOverwriteModal: React.FC<NewCharacterOverwriteModalProps> = ({
  existing,
  onCancel,
  onConfirm,
}) => {
  const [armedAt, setArmedAt] = useState<number | null>(null);

  // The arm lapses on its own; lapsing only disarms, it never proceeds and never closes.
  useEffect(() => {
    if (armedAt === null) return;
    const timer = setTimeout(() => setArmedAt(null), OVERWRITE_ARM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armedAt]);

  // Esc leaves the dialog, exactly like its Cancel button.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const armed = overwriteArmIsLive(armedAt, Date.now());
  const name = existing.name;

  const handleCancel = useCallback(() => {
    sounds.playClick();
    onCancel();
  }, [onCancel]);

  const handleConfirmTap = () => {
    sounds.playClick();
    // A window that was throttled (a backgrounded tab) can leave an arm looking set;
    // the clock, not the timer, decides whether it is still live.
    if (!overwriteArmIsLive(armedAt, Date.now())) {
      setArmedAt(Date.now());
      return;
    }
    onConfirm();
  };

  // What is lost, in plain words — named when the stored save could be read.
  const lossSentence = name
    ? `This erases ${name} for good${
        existing.rank || existing.fame !== null
          ? ` — ${[existing.rank, existing.fame !== null ? `${existing.fame} fame` : null]
              .filter(Boolean)
              .join(', ')} —`
          : ''
      } and everything they have earned on this device.`
    : 'A gladiator is already saved on this device, and their record could not be read. Starting over replaces them — and everything they earned — for good.';

  return (
    <div
      className="fixed inset-0 z-[65] bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none"
      data-overwrite-confirm="1"
      data-overwrite-armed={armed ? '1' : '0'}
    >
      <div
        className="w-full bg-neutral-900 border-2 border-red-800/80 rounded-3xl shadow-2xl text-amber-100 flex flex-col max-h-[94dvh]"
        style={{ width: 'min(520px, 94vw)' }}
        role="dialog"
        aria-label="Start over"
      >
        <div className="h-1.5 shrink-0 rounded-t-3xl bg-gradient-to-r from-red-800 via-red-500 to-red-800" />

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 p-2.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300">
                <AlertTriangle className="w-6 h-6" />
              </span>
              <h2 className="font-serif font-black text-lg sm:text-xl text-red-200 uppercase tracking-wider">
                Start over?
              </h2>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Cancel"
              className="shrink-0 w-11 h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-amber-200 flex items-center justify-center font-bold text-base cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-neutral-200 leading-relaxed">{lossSentence}</p>

          <p className="text-xs text-neutral-400 leading-relaxed">
            Starting over is a fresh gladiator at the town gate, with a rookie's purse and no
            history. Nothing is erased until you choose to go on.
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleCancel}
              data-overwrite-action="cancel"
              className="flex-1 min-h-[52px] rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-serif font-bold text-sm uppercase tracking-wider cursor-pointer transition-colors"
            >
              Keep my gladiator
            </button>
            <button
              type="button"
              onClick={handleConfirmTap}
              data-overwrite-action="confirm"
              className={`flex-1 min-h-[52px] px-3 rounded-2xl font-serif font-black text-sm uppercase tracking-wider cursor-pointer transition-colors ${
                armed
                  ? 'bg-red-600 hover:bg-red-500 text-neutral-950'
                  : 'bg-red-900/70 hover:bg-red-800 text-red-100 border border-red-500/60'
              }`}
            >
              {armed
                ? `Tap again to erase ${name ?? 'this gladiator'} and start over`
                : 'Start over'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { OVERWRITE_ARM_WINDOW_MS };
