/**
 * The ludus banner row — the gladiator's own banner, once a device is sworn.
 *
 * A read of `resolveBanner` (`src/utils/heraldry.ts`): the field and the device paint
 * from the chosen spec, one dark stripe per boss kill, and the row says when the banner
 * has moved to the Colosseum gate.  Nothing here writes; the choose button only hands
 * the request to the app, which owns the one-time write.
 */
import React from 'react';
import type { PlayerProfile } from '../../types/game';
import { resolveRoadState } from '../../utils/roadOfGlory';
import { BANNER_STRIPE_COLOR, resolveBanner } from '../../utils/heraldry';

export interface BannerRowProps {
  playerProfile: PlayerProfile;
  /** Opens the Device Choosing panel; absent leaves the row read-only. */
  onChooseDevice?: () => void;
}

export const BannerRow: React.FC<BannerRowProps> = ({ playerProfile, onChooseDevice }) => {
  const banner = resolveBanner(playerProfile);

  // Below Veteran there is no banner to speak of yet: the row is not drawn at all.
  const pastVeteran = resolveRoadState(playerProfile).some(
    (stage) => stage.id === 'known' && stage.state !== 'ahead'
  );
  if (!banner && !pastVeteran) return null;

  return (
    <div className="flex w-full items-center gap-3 border-b border-amber-600/30 bg-neutral-900/70 px-3 py-2 sm:px-4">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-amber-600/80">
        Banner
      </span>

      {banner ? (
        <>
          <svg
            viewBox="0 0 100 140"
            className="h-14 w-10 shrink-0 rounded-sm shadow-md"
            role="img"
            aria-label={`Banner of the ${banner.device.latin}`}
          >
            <rect width="100" height="140" fill={banner.device.primary} />
            <g transform="translate(10 12) scale(0.8)">
              <path d={banner.device.path} fill={banner.device.ink} />
            </g>
            {Array.from({ length: banner.stripes }, (_, stripe) => (
              <rect
                key={stripe}
                x="8"
                y={132 - stripe * 8}
                width="84"
                height="5"
                fill={BANNER_STRIPE_COLOR}
              />
            ))}
          </svg>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-amber-100">{banner.device.latin}</p>
            <p className="truncate text-[11px] text-amber-200/60">
              {banner.stripes === 0
                ? 'No boss stripe yet'
                : `${banner.stripes} boss stripe${banner.stripes === 1 ? '' : 's'}`}
              {banner.atGate ? ' · Raised at the Colosseum gate' : ''}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="h-14 w-10 shrink-0 rounded-sm border border-dashed border-amber-600/40" />
          <p className="min-w-0 flex-1 text-xs text-amber-200/60">
            Your banner awaits a device.
          </p>
          {onChooseDevice && (
            <button
              type="button"
              onClick={onChooseDevice}
              className="shrink-0 rounded border border-amber-500/60 px-3 py-1.5 text-[11px] uppercase tracking-wider text-amber-200 hover:bg-amber-500/10"
            >
              Choose device
            </button>
          )}
        </>
      )}
    </div>
  );
};
