import React from 'react';
import {
  canShareVictoryCard,
  victoryCardFileName,
  type VictoryCardData,
} from '../../utils/victoryCard';
import {
  paintVictoryCard,
  VICTORY_CARD_HEIGHT,
  VICTORY_CARD_WIDTH,
} from '../../utils/victoryCardPainter';

export interface VictoryPosterProps {
  /** The composed card — pure data, no save field behind it. */
  data: VictoryCardData;
  /**
   * PITCH A6 — Director ruling R-TEST: the share-availability check is
   * injectable so the button's rule can be proved in a test, without a browser
   * share sheet.  In the app it is omitted and the shipped guard answers.
   */
  canShareFiles?: (files: File[]) => boolean;
}

/**
 * PITCH A6 — THE VICTORY CARD'S POSTER SECTION.
 *
 * The rendered poster (a canvas painted from the fixed 1080x1350 template) plus
 * a Share button.  The button renders ONLY when the OS share sheet is available
 * for FILES — `navigator.canShare({ files })` true — so a device with no share
 * sheet shows the poster and no dead button.
 *
 * R-SCOPE (Director ruling): the poster is available on EVERY duel result,
 * exhibitions included, and it renders independently of the mercy Spare/Finish
 * choice state — it is a display of the bout just fought, not a result effect.
 *
 * Nothing here writes: no text entry, no backend, no upload.  The only thing
 * that can leave the device is the file the player chooses to share.
 */
export const VictoryPoster: React.FC<VictoryPosterProps> = ({ data, canShareFiles }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [shareFile, setShareFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    // The painter is import-safe and returns null when there is no canvas or no
    // 2D context; the poster element simply stays empty in that case.
    const painted = paintVictoryCard(data, { canvas: canvasRef.current });
    if (!painted || typeof painted.toBlob !== 'function') {
      setShareFile(null);
      return;
    }
    let cancelled = false;
    painted.toBlob((blob) => {
      if (cancelled) return;
      let file: File | null = null;
      if (blob && typeof File === 'function') {
        try {
          file = new File([blob], victoryCardFileName(data.frame), { type: 'image/png' });
        } catch {
          file = null;
        }
      }
      const available = file
        ? canShareFiles
          ? canShareFiles([file])
          : canShareVictoryCard([file])
        : false;
      setShareFile(available ? file : null);
    }, 'image/png');
    return () => {
      cancelled = true;
    };
  }, [data, canShareFiles]);

  const handleShare = React.useCallback(async () => {
    if (!shareFile) return;
    const nav = typeof navigator === 'undefined' ? null : navigator;
    if (!nav || typeof nav.share !== 'function') return;
    try {
      // canvas -> blob -> File -> the OS share sheet.  Nothing else is touched.
      await nav.share({ files: [shareFile], title: 'Sand & Steel' });
    } catch {
      // Dismissed (or refused): nothing left the device, so nothing to report.
    }
  }, [shareFile]);

  return (
    <div
      data-victory-card={data.frame}
      className="mb-6 flex flex-col items-center gap-3"
    >
      <canvas
        ref={canvasRef}
        data-victory-card-poster={data.frame}
        width={VICTORY_CARD_WIDTH}
        height={VICTORY_CARD_HEIGHT}
        aria-label={`Result card: ${data.playerName}, ${data.result} against ${data.opponentName}`}
        className="w-full max-w-[260px] sm:max-w-[300px] rounded-2xl border border-amber-700/60 shadow-2xl bg-neutral-950"
      />
      {shareFile && (
        <button
          type="button"
          data-victory-card-share={data.frame}
          onClick={handleShare}
          className="btn-press min-h-[44px] px-5 py-2 rounded-2xl font-serif font-black text-xs uppercase tracking-wider cursor-pointer border border-amber-500/70 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60 active:scale-95 transition-all"
        >
          Share
        </button>
      )}
    </div>
  );
};
