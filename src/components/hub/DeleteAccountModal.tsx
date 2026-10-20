import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Trash2, X } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { CLOSE_BUTTON_CLASS } from '../ui/controlStyles';
import {
  accountCanDeleteDriveSave,
  deletionErrorMessage,
  reauthMethodForProviderIds,
  reauthProviderLabel,
  type DeletionOutcome,
  type SignedInUserSummary,
} from '../../services/accountDeletion';
import { deleteSignedInAccount } from '../../services/accountDeletionFirebase';

interface DeleteAccountModalProps {
  isOpen: boolean;
  /** The signed-in account this dialog deletes. */
  user: SignedInUserSummary;
  /** Dismissed without deleting anything (Cancel, ✕ or Esc). */
  onClose: () => void;
  /**
   * The account is gone: `App` clears its own profile state and returns to the
   * title.  `outcome` says exactly what was removed, so the closing frame can state
   * it and nothing more.
   */
  onDeleted: (outcome: DeletionOutcome | null) => void;
}

/** The three frames of the flow. */
type DeleteStep = 'confirm' | 'deleting' | 'done';

/**
 * The in-app account-deletion confirmation.
 *
 * Google Play requires an app that creates accounts to let the player delete the
 * account inside the app; this dialog is that flow's whole surface.  It states
 * plainly what deletion removes, takes the player's re-confirmation (Firebase
 * re-authentication — a password for an email account, the provider's own popup for
 * an OAuth account), and offers the Google Drive cloud save as an explicit
 * **opt-in**, because that file lives in the player's own Drive.
 *
 * The provider work itself is `services/accountDeletionFirebase.ts` and the order is
 * `services/accountDeletion.ts`; this file only shows it and never decides what is
 * deleted.  It is reachable from the settings panel's Game section, in MENU contexts
 * only (the same rule Reset save follows), and never during a duel or a race.
 */
export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ isOpen, user, onClose, onDeleted }) => {
  const [step, setStep] = useState<DeleteStep>('confirm');
  const [password, setPassword] = useState('');
  const [deleteDriveSave, setDeleteDriveSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DeletionOutcome | null>(null);

  const method = reauthMethodForProviderIds(user.providerIds);
  const providerLabel = reauthProviderLabel(user.providerIds);
  const offersDriveSave = accountCanDeleteDriveSave(user.providerIds);

  // Opening it always starts clean: no prefilled password, no armed checkbox.
  useEffect(() => {
    if (!isOpen) return;
    setStep('confirm');
    setPassword('');
    setDeleteDriveSave(false);
    setError(null);
    setOutcome(null);
  }, [isOpen]);

  const handleDismiss = useCallback(() => {
    sounds.playClick();
    if (step === 'done') {
      onDeleted(outcome);
      return;
    }
    onClose();
  }, [step, outcome, onDeleted, onClose]);

  // Esc leaves the dialog, exactly like its Cancel button — but never while the
  // deletion itself is running.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || step === 'deleting') return;
      event.preventDefault();
      handleDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, step, handleDismiss]);

  if (!isOpen) return null;

  const handleDelete = async () => {
    sounds.playClick();
    setError(null);
    setStep('deleting');
    try {
      const result = await deleteSignedInAccount({ password, deleteDriveSave });
      setOutcome(result);
      setStep('done');
    } catch (e) {
      // Plain words, never a raw code — and nothing was deleted.
      setError(deletionErrorMessage(e));
      setStep('confirm');
    }
  };

  const canDelete = method === 'password' ? password.length > 0 : true;

  return (
    <div
      /* UI-1 (S-4) — the wrapper carries its own safe-area gutter, so the panel's
         clearance does not rest on the centring arithmetic alone. */
      className="fixed inset-0 z-[60] bg-neutral-950/90 backdrop-blur-md flex items-center justify-center px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pr-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] select-none"
      data-delete-account-step={step}
    >
      <div
        className="w-full bg-neutral-900 border-2 border-red-800/80 rounded-3xl shadow-2xl text-amber-100 flex flex-col max-h-[94dvh]"
        style={{ width: 'min(560px, 94vw)' }}
        role="dialog"
        aria-label="Delete account"
      >
        <div className="h-1.5 shrink-0 rounded-t-3xl bg-gradient-to-r from-red-800 via-red-500 to-red-800" />

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 p-2.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300">
                <Trash2 className="w-6 h-6" />
              </span>
              <h2 className="font-serif font-black text-lg sm:text-xl text-red-200 uppercase tracking-wider">
                {step === 'done' ? 'Account deleted' : 'Delete account'}
              </h2>
            </div>
            {step !== 'deleting' && (
              <button
                type="button"
                onClick={handleDismiss}
                aria-label={step === 'done' ? 'Done' : 'Cancel'}
                className={CLOSE_BUTTON_CLASS}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {step === 'confirm' && (
            <>
              <p className="text-sm text-neutral-300 leading-relaxed">
                This cannot be undone. Deleting your account removes:
              </p>

              <ul className="flex flex-col gap-2">
                <li className="flex gap-3 text-sm text-neutral-200 leading-relaxed">
                  <span aria-hidden="true" className="shrink-0 text-red-400">•</span>
                  <span className="min-w-0">
                    Your sign-in account — {user.email ?? 'this account'}'s email address and the sign-in
                    details behind it.
                  </span>
                </li>
                <li className="flex gap-3 text-sm text-neutral-200 leading-relaxed">
                  <span aria-hidden="true" className="shrink-0 text-red-400">•</span>
                  <span className="min-w-0">Every gladiator saved on this device.</span>
                </li>
              </ul>

              {offersDriveSave && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={deleteDriveSave}
                  onClick={() => {
                    sounds.playClick();
                    setDeleteDriveSave((on) => !on);
                  }}
                  className={`w-full min-h-[56px] text-left rounded-2xl border px-4 py-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    deleteDriveSave
                      ? 'bg-red-500/15 border-red-400/70'
                      : 'bg-neutral-950/90 border-neutral-700 hover:border-red-600/50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-serif font-bold text-sm text-amber-100">
                      Also delete my cloud save in Google Drive
                    </span>
                    <span className="block text-xs text-neutral-400 mt-0.5">
                      The backup file lives in your own Google Drive. Tick this to remove it as well.
                      Leave it unticked to keep the file.
                    </span>
                  </span>
                  <span
                    className={`shrink-0 min-w-[64px] min-h-[40px] flex items-center justify-center rounded-xl border font-serif font-bold text-xs uppercase tracking-wider ${
                      deleteDriveSave
                        ? 'bg-red-600 text-neutral-950 border-red-300'
                        : 'bg-neutral-800 text-neutral-300 border-neutral-600'
                    }`}
                  >
                    {deleteDriveSave ? 'Yes' : 'No'}
                  </span>
                </button>
              )}

              <div className="rounded-2xl bg-neutral-950/90 border border-neutral-700 px-4 py-3 flex flex-col gap-3">
                <p className="text-sm text-amber-100 leading-relaxed">
                  Sign in again to confirm it&apos;s you.
                </p>
                {method === 'password' ? (
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="current-password"
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-amber-50 placeholder-neutral-500 text-sm focus:outline-none focus:border-red-600/60 transition-colors"
                  />
                ) : (
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    We&apos;ll open {providerLabel}&apos;s sign-in window so {providerLabel} can confirm
                    it&apos;s you before anything is deleted.
                  </p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-red-300 leading-relaxed rounded-2xl bg-red-950/50 border border-red-700/60 px-4 py-3"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="min-w-0">{error}</span>
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex-1 min-h-[52px] rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-serif font-bold text-sm uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete}
                  className="flex-1 min-h-[52px] rounded-2xl bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-50 font-serif font-black text-sm uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Delete my account
                </button>
              </div>
            </>
          )}

          {step === 'deleting' && (
            <p className="text-sm text-neutral-300 leading-relaxed" role="status">
              Deleting your account… please wait, and don&apos;t close the game.
            </p>
          )}

          {step === 'done' && (
            <>
              <p className="flex items-start gap-2 text-sm text-emerald-200 leading-relaxed">
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  Done. The sign-in account is gone, and the gladiators saved on this device were erased.
                </span>
              </p>

              {outcome?.driveSaveDeleted && (
                <p className="text-sm text-neutral-300 leading-relaxed">
                  Your cloud save was deleted from your own Google Drive as well.
                </p>
              )}

              {!outcome?.driveSaveDeleted && offersDriveSave && (
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Your Google Drive backup was left where it is. You can delete it from Drive at any
                  time.
                </p>
              )}

              <button
                type="button"
                onClick={handleDismiss}
                className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-sm uppercase tracking-wider shadow-xl cursor-pointer active:scale-95 transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
