/**
 * The Device Choosing panel — the Veteran ritual's one choice, presented once.
 *
 * The four devices, each with its Latin name and a line of gloss, painted from
 * `src/utils/heraldry.ts` so the panel, the banner row and the gate pole can never
 * disagree.  The panel writes nothing itself: `onChoose` hands the device to the app,
 * whose `chooseBannerDevice` makes the only `road.bannerDevice` write in the build.
 *
 * "Not yet" closes it without a choice; the road offers it again at the next
 * evaluation rather than leaving a Veteran silently deviceless.
 */
import React from 'react';
import { BANNER_DEVICE_SPECS, type BannerDevice } from '../../utils/heraldry';

export interface DeviceChoosingPanelProps {
  onChoose: (device: BannerDevice) => void;
  onDismiss: () => void;
}

export const DeviceChoosingPanel: React.FC<DeviceChoosingPanelProps> = ({
  onChoose,
  onDismiss,
}) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-choice-title"
      className="w-full max-w-lg rounded-lg border border-amber-600/50 bg-neutral-950 p-4 shadow-2xl sm:p-6"
    >
      <h2 id="device-choice-title" className="text-lg font-semibold text-amber-300 sm:text-xl">
        Choose your device
      </h2>
      <p className="mt-1 text-sm text-amber-200/70">
        The herald waits. One device, sworn once — it rides your banner from here.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {BANNER_DEVICE_SPECS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            onClick={() => onChoose(spec.id)}
            className="flex flex-col items-start gap-2 rounded border border-amber-600/40 bg-neutral-900/80 p-3 text-left transition-colors hover:border-amber-400/80 hover:bg-neutral-900"
          >
            <svg viewBox="0 0 100 100" className="h-11 w-11 rounded-sm" aria-hidden="true">
              <rect width="100" height="100" fill={spec.primary} />
              <path d={spec.path} fill={spec.ink} />
            </svg>
            <span className="text-sm text-amber-100">{spec.latin}</span>
            <span className="text-[11px] leading-snug text-amber-200/60">{spec.gloss}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 w-full rounded border border-amber-600/40 py-2 text-[11px] uppercase tracking-[0.2em] text-amber-200/70 hover:bg-amber-500/10"
      >
        Not yet
      </button>
    </div>
  </div>
);
